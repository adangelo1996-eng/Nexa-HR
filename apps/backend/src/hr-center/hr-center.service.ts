import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { encryptUserPiiString, loadUserPiiKeyFromEnv } from "@payday/user-pii-crypto";
import type { User } from "@payday/domain";
import type { AuthContext } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { HrContractsService } from "../hr-contracts/hr-contracts.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import {
  buildOfflineHrCenterAnalyticsReport,
  type HrCenterAnalyticsFacts
} from "./hr-center-analytics-report";
import type { HrCenterAnalyticsRunDto } from "./hr-center-analytics-run.dto";

type HrCenterAuditKind = "analytics" | "contract" | "recap";

interface HrCenterScope {
  companyId: string;
  mode: "company" | "team";
  /** Se non null, solo questi user id (scope team / report). */
  allowedUserIds: Set<string> | null;
}

@Injectable()
export class HrCenterService {
  private readonly logger = new Logger(HrCenterService.name);

  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly hrContracts: HrContractsService
  ) {}

  private async resolveScope(auth: AuthContext): Promise<HrCenterScope> {
    const me = await this.store.getUser(auth.userId);
    const companyId = (me.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    if (auth.role === "superuser") {
      return { companyId, mode: "company", allowedUserIds: null };
    }
    const hrExtended = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    const reportsHr = await this.permissions.userHasAll(auth.userId, ["nexa.reports_hr:read"]);
    const aiAss = await this.permissions.userHasAll(auth.userId, ["nexa.ai_assistant:read"]);
    if (hrExtended || reportsHr || aiAss) {
      return { companyId, mode: "company", allowedUserIds: null };
    }
    const leadTeamIds = await this.store.listWorkTeamIdsWhereUserIsLead(auth.userId);
    const directs = await this.store.listUsersByManager(auth.userId);
    const allowed = new Set<string>();
    for (const u of directs) {
      allowed.add(u.id);
    }
    for (const tid of leadTeamIds) {
      try {
        const members = await this.store.listUsersByTeam(tid);
        for (const u of members) {
          allowed.add(u.id);
        }
      } catch {
        /* team assente */
      }
    }
    if (allowed.size === 0) {
      throw new ForbiddenException("Centro HR: accesso riservato a HR o a responsabili di team / con report diretti.");
    }
    return { companyId, mode: "team", allowedUserIds: allowed };
  }

  async getMeta(auth: AuthContext): Promise<{
    canAccess: boolean;
    llmActive: boolean;
    scopeMode?: "company" | "team";
    costCenterOptions?: Array<{ id: string; label: string }>;
    teamOptions?: Array<{ id: string; label: string; costCenterId: string }>;
  }> {
    const llmActive = this.openAi.isActive();
    try {
      const s = await this.resolveScope(auth);
      const baseUsers = await this.filterUsers(s.companyId, s.allowedUserIds);
      const allCc = await this.store.listCostCenters();
      const centersInTenant = allCc.filter((c) => !c.companyId || c.companyId === s.companyId);
      const costCenterOptionsAll = centersInTenant
        .map((c) => ({ id: c.id, label: [c.code, c.name].filter(Boolean).join(" · ") || c.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "it"));
      const teamOptionsAll: Array<{ id: string; label: string; costCenterId: string }> = [];
      for (const cc of centersInTenant) {
        try {
          const teams = await this.store.listWorkTeamsByCostCenter(cc.id);
          const pref = [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name;
          for (const tm of teams) {
            teamOptionsAll.push({ id: tm.id, label: `${pref} — ${tm.name}`, costCenterId: cc.id });
          }
        } catch {
          /* work_teams assente */
        }
      }
      teamOptionsAll.sort((a, b) => a.label.localeCompare(b.label, "it"));
      const costCenterOptions =
        s.mode === "team"
          ? costCenterOptionsAll.filter((cc) =>
              baseUsers.some((u) => (u.costCenterId ?? "").trim() === cc.id)
            )
          : costCenterOptionsAll;
      const teamOptions =
        s.mode === "team"
          ? teamOptionsAll.filter((t) => baseUsers.some((u) => (u.teamId ?? "").trim() === t.id))
          : teamOptionsAll;
      return { canAccess: true, llmActive, scopeMode: s.mode, costCenterOptions, teamOptions };
    } catch {
      return { canAccess: false, llmActive };
    }
  }

  private async applyAnalyticsUserFocus(
    scope: HrCenterScope,
    baseUsers: User[],
    dto: HrCenterAnalyticsRunDto
  ): Promise<{
    users: User[];
    analysisFocus: "company" | "cost_center" | "team" | "employee";
    analysisLabel: string;
  }> {
    const focus = dto.focus ?? "company";
    if (focus === "company") {
      return {
        users: baseUsers,
        analysisFocus: "company",
        analysisLabel: "Perimetro completo (tutti i dipendenti consentiti)"
      };
    }
    if (focus === "cost_center") {
      const id = (dto.costCenterId ?? "").trim();
      if (!id) {
        throw new BadRequestException("costCenterId obbligatorio per focus cost_center");
      }
      const cc = await this.store.getCostCenterById(id);
      if (!cc) {
        throw new BadRequestException("Centro di costo non trovato");
      }
      if (cc.companyId && cc.companyId !== scope.companyId) {
        throw new ForbiddenException("Centro di costo non valido per la tua azienda");
      }
      const users = baseUsers.filter((u) => (u.costCenterId ?? "").trim() === id);
      const label = [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name;
      return { users, analysisFocus: "cost_center", analysisLabel: `Centro di costo: ${label}` };
    }
    if (focus === "team") {
      const tid = (dto.teamId ?? "").trim();
      if (!tid) {
        throw new BadRequestException("teamId obbligatorio per focus team");
      }
      const team = await this.store.getWorkTeam(tid);
      if (!team) {
        throw new BadRequestException("Team non trovato");
      }
      const members = await this.store.listUsersByTeam(tid);
      const memberIds = new Set(members.map((m) => m.id));
      const users = baseUsers.filter((u) => memberIds.has(u.id));
      const cc = await this.store.getCostCenterById(team.costCenterId);
      const ccPart = cc ? [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name : team.costCenterId;
      return { users, analysisFocus: "team", analysisLabel: `Team «${team.name}» (${ccPart})` };
    }
    if (focus === "employee") {
      const uid = (dto.userId ?? "").trim();
      if (!uid) {
        throw new BadRequestException("userId obbligatorio per focus employee");
      }
      const u = baseUsers.find((x) => x.id === uid);
      if (!u) {
        throw new BadRequestException("Dipendente non disponibile nel perimetro autorizzato");
      }
      return {
        users: [u],
        analysisFocus: "employee",
        analysisLabel: "Dipendente singolo (dettaglio sul suo centro di costo)"
      };
    }
    throw new BadRequestException("focus non valido");
  }

  private async filterUsers(companyId: string, allowed: Set<string> | null): Promise<User[]> {
    const all = await this.store.listUsers();
    const list = all.filter((u) => u.companyId === companyId);
    return allowed ? list.filter((u) => allowed.has(u.id)) : list;
  }

  private async fetchUserSkillCodes(userId: string): Promise<string[]> {
    try {
      const sb = this.store.getServiceRoleClient();
      const { data: rows, error } = await sb.from("hr_user_skills").select("skill_id").eq("user_id", userId);
      if (error || !rows?.length) {
        return [];
      }
      const ids = [...new Set((rows as { skill_id: string }[]).map((r) => r.skill_id))];
      const { data: skills, error: e2 } = await sb.from("hr_skills").select("code").in("id", ids);
      if (e2) {
        return [];
      }
      return ((skills ?? []) as { code: string }[]).map((s) => s.code).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async appendAudit(
    companyId: string,
    actorUserId: string,
    kind: HrCenterAuditKind,
    promptObj: unknown,
    responseObj: unknown
  ): Promise<void> {
    const key = loadUserPiiKeyFromEnv();
    const promptStr = JSON.stringify(promptObj ?? null);
    const responseStr = JSON.stringify(responseObj ?? null);
    const prompt_cipher = key ? encryptUserPiiString(promptStr, key) : `plain:${promptStr.slice(0, 50_000)}`;
    const response_cipher = key ? encryptUserPiiString(responseStr, key) : `plain:${responseStr.slice(0, 50_000)}`;
    const purgeAfter = new Date(Date.now() + 90 * 86_400_000).toISOString();
    const model = process.env.NEXA_OPENAI_MODEL?.trim() || "gpt-4o-mini";
    try {
      const { error } = await this.store.getServiceRoleClient().from("hr_center_llm_audit").insert({
        company_id: companyId,
        actor_user_id: actorUserId,
        kind,
        prompt_cipher,
        response_cipher,
        model,
        purge_after: purgeAfter
      });
      if (error) {
        this.logger.warn(`[hr-center] audit insert: ${error.message}`);
      }
    } catch (e) {
      this.logger.warn(`[hr-center] audit insert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async runAnalytics(
    auth: AuthContext,
    dto: HrCenterAnalyticsRunDto = {}
  ): Promise<{
    /** Dati aggregati per grafici/tabelle (non mostrare come JSON grezzo in UI). */
    dataset: HrCenterAnalyticsFacts;
    /** Report strutturato (LLM o fallback locale), pronto per rendering testuale. */
    report: unknown;
    llm: { active: boolean; refineApplied: boolean };
    privacy: { schemaVersion: string; tokenCount: number };
  }> {
    const scope = await this.resolveScope(auth);
    const baseUsers = await this.filterUsers(scope.companyId, scope.allowedUserIds);
    const { users, analysisFocus, analysisLabel } = await this.applyAnalyticsUserFocus(scope, baseUsers, dto);
    if (users.length === 0) {
      throw new BadRequestException("Nessun dipendente nel perimetro per l'analisi richiesta.");
    }
    const deepRaw = (dto.deepDive ?? "none").trim();
    const analysisDeepDive =
      deepRaw === "master_data" || deepRaw === "budget_turnover"
        ? (deepRaw as "master_data" | "budget_turnover")
        : undefined;

    const allCc = await this.store.listCostCenters();
    const labelForCcId = (id: string): string | undefined => {
      if (id === "—") {
        return "Non assegnato / non valorizzato";
      }
      const c = allCc.find((x) => x.id === id);
      if (!c) {
        return undefined;
      }
      return [c.code, c.name].filter(Boolean).join(" · ") || c.name;
    };

    const byCc = new Map<string, { headcount: number; monthlyGrossSum: number }>();
    for (const u of users) {
      const cc = (u.costCenterId || "—").trim() || "—";
      const cur = byCc.get(cc) ?? { headcount: 0, monthlyGrossSum: 0 };
      cur.headcount += 1;
      cur.monthlyGrossSum += Number(u.baseSalaryMonthly ?? 0);
      byCc.set(cc, cur);
    }
    const weeklyHours = users.map((u) => Number(u.weeklyContractHours ?? 40));
    const avgWeekly =
      weeklyHours.length > 0 ? Math.round((weeklyHours.reduce((a, b) => a + b, 0) / weeklyHours.length) * 10) / 10 : 0;
    const facts: HrCenterAnalyticsFacts = {
      scope: scope.mode,
      analysisFocus,
      analysisLabel,
      ...(analysisDeepDive ? { analysisDeepDive } : {}),
      byCostCenter: [...byCc.entries()].map(([costCenterId, v]) => {
        const nm = labelForCcId(costCenterId);
        return {
          costCenterId,
          ...(nm ? { costCenterName: nm } : {}),
          headcount: v.headcount,
          monthlyGrossSum: Math.round(v.monthlyGrossSum * 100) / 100
        };
      }),
      totals: {
        headcount: users.length,
        monthlyGrossSum: Math.round(users.reduce((a, u) => a + Number(u.baseSalaryMonthly ?? 0), 0) * 100) / 100,
        avgWeeklyContractHours: avgWeekly
      },
      disclaimer:
        "Dati aggregati per centro di costo. Costo orario a consuntivo/previsto è indicativo (RAL mensile / ore contrattuali mensili teoriche)."
    };
    const sessionId = (await this.gateway.beginSession(scope.companyId, auth.userId)).sessionId;
    let refineApplied = false;
    try {
      let analystMission =
        "Produci un'analisi HR completa e da consulente esperto: costi del personale, concentrazione per centro di costo, rischi di organico, " +
        "azioni prioritarie per HR e linee, limiti metodologici. Italiano professionale. " +
        `Perimetro analitico richiesto: ${analysisLabel}. Usa envelope.facts.analysisFocus e analysisLabel per contestualizzare linguaggio e priorità.`;
      if (analysisDeepDive === "master_data") {
        analystMission +=
          " APPROFONDIMENTO «dati anagrafici»: enfatizza controllo qualità CDC/RAL/codici, campione sui dipendenti dei TOP 2 centri per competenze mensili; " +
          "restituisci nextStep misurabili (checklist HR, campioni, owner). Non citare nomi di persone.";
      } else if (analysisDeepDive === "budget_turnover") {
        analystMission +=
          " APPROFONDIMENTO «budget e turnover»: collega costo personale a leve di organico e pianificazione; " +
          "invita a usare Workforce planning e Turnover/retention sullo stesso perimetro; non inventare conteggi di assunzioni/uscite se assenti dai facts.";
      }
      const payload = {
        envelope: {
          facts,
          analystMission
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, "ai_hr_center_analytics_v1");
      let modelJson: unknown = buildOfflineHrCenterAnalyticsReport(facts);
      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_hr_center_analytics_v1");
        if (refined != null) {
          modelJson = refined;
          refineApplied = true;
        }
      }
      const report = await this.gateway.fromModelResponse(sessionId, modelJson);
      await this.appendAudit(scope.companyId, auth.userId, "analytics", pseudo.pseudonymized, report);
      return {
        dataset: facts,
        report,
        llm: { active: this.openAi.isActive(), refineApplied },
        privacy: { schemaVersion: pseudo.schemaVersion, tokenCount: pseudo.tokenCount }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async runContractDraft(auth: AuthContext): Promise<{
    facts: Record<string, unknown>;
    narrative: unknown;
    llm: { active: boolean; refineApplied: boolean };
    privacy: { schemaVersion: string; tokenCount: number };
  }> {
    const scope = await this.resolveScope(auth);
    const users = await this.filterUsers(scope.companyId, scope.allowedUserIds);
    const templates = await this.hrContracts.listForCompany(scope.companyId).catch(() => []);
    const facts = {
      scope: scope.mode,
      templateCount: Array.isArray(templates) ? templates.length : 0,
      templateTitles: (Array.isArray(templates) ? templates : []).map((t) => String(t?.title ?? "")),
      sampleHeadcount: Math.min(users.length, 12),
      disclaimer:
        "Bozza assistita: il documento deve essere verificato da HR/legal prima della firma. Nessun testo legale vincolante generato automaticamente."
    };
    const sessionId = (await this.gateway.beginSession(scope.companyId, auth.userId)).sessionId;
    let refineApplied = false;
    try {
      const payload = {
        envelope: {
          facts,
          narrativeSeed:
            "Genera una bozza strutturata (sezioni) per un contratto standard HR, tono formale italiano, con checklist di verifica per HR."
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, "ai_narrative_aggregate_v1");
      let modelJson: unknown = pseudo.pseudonymized;
      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_narrative_aggregate_v1");
        if (refined != null) {
          modelJson = refined;
          refineApplied = true;
        }
      }
      const narrative = await this.gateway.fromModelResponse(sessionId, modelJson);
      await this.appendAudit(scope.companyId, auth.userId, "contract", pseudo.pseudonymized, narrative);
      return {
        facts,
        narrative,
        llm: { active: this.openAi.isActive(), refineApplied },
        privacy: { schemaVersion: pseudo.schemaVersion, tokenCount: pseudo.tokenCount }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async runRecap(auth: AuthContext, targetUserId?: string): Promise<{
    facts: Record<string, unknown>;
    narrative: unknown;
    llm: { active: boolean; refineApplied: boolean };
    privacy: { schemaVersion: string; tokenCount: number };
  }> {
    const scope = await this.resolveScope(auth);
    const tid = (targetUserId ?? "").trim();
    const subject = tid ? await this.store.getUser(tid) : await this.store.getUser(auth.userId);
    if (subject.companyId !== scope.companyId) {
      throw new ForbiddenException("Dipendente non appartenente alla tua azienda.");
    }
    if (scope.allowedUserIds && !scope.allowedUserIds.has(subject.id)) {
      throw new ForbiddenException("Non puoi richiedere il recap per questo dipendente.");
    }
    const skillCodes = await this.fetchUserSkillCodes(subject.id);
    const facts = {
      scope: scope.mode,
      subjectUserId: subject.id,
      contractType: subject.contractType ?? null,
      hireDate: subject.hireDate ?? null,
      contractEndDate: subject.contractEndDate ?? null,
      weeklyHours: subject.weeklyContractHours ?? null,
      skillCount: skillCodes.length,
      skillCodesSample: skillCodes.slice(0, 8),
      suggestedActions: [
        { id: "open_contracts", label: "Apri Contratti standard", href: "/contracts" },
        { id: "open_settings", label: "Profilo e formazione (impostazioni)", href: "/settings" },
        { id: "open_workflow", label: "Approvazioni team", href: "/workflow/approvals" }
      ],
      disclaimer: "Suggerimenti informativi: verificare sempre stato contrattuale e anagrafica in fonti ufficiali."
    };
    const sessionId = (await this.gateway.beginSession(scope.companyId, auth.userId)).sessionId;
    let refineApplied = false;
    try {
      const payload = {
        envelope: {
          facts,
          narrativeSeed:
            "Recap HR per il dipendente: priorità su contratto, skills, formazione. Italiano operativo; max 5 bullet azioni; niente promesse legali."
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, "ai_narrative_aggregate_v1");
      let modelJson: unknown = pseudo.pseudonymized;
      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_narrative_aggregate_v1");
        if (refined != null) {
          modelJson = refined;
          refineApplied = true;
        }
      }
      const narrative = await this.gateway.fromModelResponse(sessionId, modelJson);
      await this.appendAudit(scope.companyId, auth.userId, "recap", pseudo.pseudonymized, narrative);
      return {
        facts,
        narrative,
        llm: { active: this.openAi.isActive(), refineApplied },
        privacy: { schemaVersion: pseudo.schemaVersion, tokenCount: pseudo.tokenCount }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }
}
