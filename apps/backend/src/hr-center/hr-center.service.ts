import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import type { PersonnelBudgetAnalysisVarianceRow } from "../platform/hr-data.store";
import { encryptUserPiiString, loadUserPiiKeyFromEnv } from "@payday/user-pii-crypto";
import type { User } from "@payday/domain";
import type { AuthContext } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiOpenAiRefinementService, type OpenAiRefineFailure } from "../ai-hr/ai-openai-refinement.service";
import { HrContractsService } from "../hr-contracts/hr-contracts.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import {
  buildOfflineHrCenterAnalyticsReport,
  type HrCenterAnalyticsFacts
} from "./hr-center-analytics-report";
import type { HrCenterAnalyticsRunDto } from "./hr-center-analytics-run.dto";
import type { HrCenterPersonnelBudgetAiDto } from "./hr-center-personnel-budget-ai.dto";
import type { HrCenterRecapBodyDto } from "./hr-center-recap-body.dto";

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
    employeeOptions?: Array<{ id: string; label: string }>;
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
      const employeeOptions = baseUsers
        .map((u) => ({ id: u.id, label: (u.fullName ?? "").trim() || u.id }))
        .sort((a, b) => a.label.localeCompare(b.label, "it"));
      return { canAccess: true, llmActive, scopeMode: s.mode, costCenterOptions, teamOptions, employeeOptions };
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

  private async resolveRecapSubjects(
    auth: AuthContext,
    scope: HrCenterScope,
    baseUsers: User[],
    body: HrCenterRecapBodyDto
  ): Promise<User[]> {
    const uidPick = new Set(
      [...(body.userIds ?? []), ...(body.targetUserId ? [body.targetUserId] : [])]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
    );
    const ccPick = new Set((body.costCenterIds ?? []).map((x) => String(x).trim()).filter(Boolean));
    const teamPick = new Set((body.teamIds ?? []).map((x) => String(x).trim()).filter(Boolean));

    if (!uidPick.size && !ccPick.size && !teamPick.size) {
      const self = await this.store.getUser(auth.userId);
      if (self.companyId !== scope.companyId) {
        throw new ForbiddenException("Dipendente non appartenente alla tua azienda.");
      }
      if (scope.allowedUserIds && !scope.allowedUserIds.has(self.id)) {
        throw new ForbiddenException("Non puoi richiedere il recap per questo profilo.");
      }
      return [self];
    }

    let cand = baseUsers;
    if (ccPick.size) {
      cand = cand.filter((u) => u.costCenterId && ccPick.has(String(u.costCenterId).trim()));
    }
    if (teamPick.size) {
      cand = cand.filter((u) => u.teamId && teamPick.has(String(u.teamId).trim()));
    }
    if (uidPick.size) {
      cand = cand.filter((u) => uidPick.has(u.id));
    }
    if (cand.length === 0) {
      throw new BadRequestException("Nessun dipendente corrisponde ai criteri nel perimetro autorizzato.");
    }
    return cand;
  }

  private stripBudgetVariances(
    rows: PersonnelBudgetAnalysisVarianceRow[],
    max: number
  ): Array<{
    category: string;
    actual: number;
    budget: number;
    forecast: number;
    varianceBf: number;
    variancePct: number | null;
  }> {
    return rows.slice(0, max).map((r) => ({
      category: r.category,
      actual: r.actual,
      budget: r.budget,
      forecast: r.forecast,
      varianceBf: r.varianceBf,
      variancePct: r.variancePct
    }));
  }

  private async assertPersonnelBudgetReportAccess(auth: AuthContext): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const me = await this.store.getUser(auth.userId);
    const ext = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    if (!ext) {
      throw new ForbiddenException("Report budget personale riservato a HR esteso o superuser.");
    }
    const ok = await this.permissions.userHasAll(auth.userId, ["nexa.personnel_budget:read"]);
    if (!ok) {
      throw new ForbiddenException("Permesso budget personale (lettura) richiesto.");
    }
  }

  private async companyIdForAuthUser(auth: AuthContext): Promise<string> {
    const me = await this.store.getUser(auth.userId);
    const cid = me.companyId?.trim();
    if (!cid) {
      throw new ForbiddenException("Azienda non associata");
    }
    return cid;
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
    llm: { active: boolean; refineApplied: boolean; refineFailure?: OpenAiRefineFailure };
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
    let refineFailure: OpenAiRefineFailure | undefined;
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
        if (refined.ok) {
          modelJson = refined.data;
          refineApplied = true;
        } else if (refined.failure !== "inactive") {
          refineFailure = refined.failure;
        }
      }
      const report = await this.gateway.fromModelResponse(sessionId, modelJson);
      await this.appendAudit(scope.companyId, auth.userId, "analytics", pseudo.pseudonymized, report);
      return {
        dataset: facts,
        report,
        llm: { active: this.openAi.isActive(), refineApplied, refineFailure },
        privacy: { schemaVersion: pseudo.schemaVersion, tokenCount: pseudo.tokenCount }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async runContractDraft(auth: AuthContext): Promise<{
    facts: Record<string, unknown>;
    narrative: unknown;
    llm: { active: boolean; refineApplied: boolean; refineFailure?: OpenAiRefineFailure };
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
    let refineFailure: OpenAiRefineFailure | undefined;
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
        if (refined.ok) {
          modelJson = refined.data;
          refineApplied = true;
        } else if (refined.failure !== "inactive") {
          refineFailure = refined.failure;
        }
      }
      const narrative = await this.gateway.fromModelResponse(sessionId, modelJson);
      await this.appendAudit(scope.companyId, auth.userId, "contract", pseudo.pseudonymized, narrative);
      return {
        facts,
        narrative,
        llm: { active: this.openAi.isActive(), refineApplied, refineFailure },
        privacy: { schemaVersion: pseudo.schemaVersion, tokenCount: pseudo.tokenCount }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async runRecap(auth: AuthContext, body: HrCenterRecapBodyDto): Promise<{
    facts: Record<string, unknown>;
    narrative: unknown;
    llm: { active: boolean; refineApplied: boolean; refineFailure?: OpenAiRefineFailure };
    privacy: { schemaVersion: string; tokenCount: number };
  }> {
    const scope = await this.resolveScope(auth);
    const baseUsers = await this.filterUsers(scope.companyId, scope.allowedUserIds);
    const subjects = await this.resolveRecapSubjects(auth, scope, baseUsers, body);
    for (const subject of subjects) {
      if (subject.companyId !== scope.companyId) {
        throw new ForbiddenException("Dipendente non appartenente alla tua azienda.");
      }
      if (scope.allowedUserIds && !scope.allowedUserIds.has(subject.id)) {
        throw new ForbiddenException("Non puoi richiedere il recap per questo dipendente.");
      }
    }

    const skillCodeSet = new Set<string>();
    for (const su of subjects) {
      const s = await this.fetchUserSkillCodes(su.id);
      for (const c of s) {
        skillCodeSet.add(c);
      }
    }
    const skillCodesSample = [...skillCodeSet].slice(0, 12);

    const contractMix: Record<string, number> = {};
    for (const su of subjects) {
      const k = su.contractType?.trim() || "—";
      contractMix[k] = (contractMix[k] ?? 0) + 1;
    }

    const facts: Record<string, unknown> =
      subjects.length === 1
        ? {
            scope: scope.mode,
            recapMode: "single",
            subjectUserId: subjects[0]!.id,
            contractType: subjects[0]!.contractType ?? null,
            hireDate: subjects[0]!.hireDate ?? null,
            contractEndDate: subjects[0]!.contractEndDate ?? null,
            weeklyHours: subjects[0]!.weeklyContractHours ?? null,
            skillCount: (await this.fetchUserSkillCodes(subjects[0]!.id)).length,
            skillCodesSample: (await this.fetchUserSkillCodes(subjects[0]!.id)).slice(0, 8),
            suggestedActions: [
              { id: "open_contracts", label: "Apri Contratti standard", href: "/contracts" },
              { id: "open_settings", label: "Profilo e formazione (impostazioni)", href: "/settings" },
              { id: "open_workflow", label: "Approvazioni team", href: "/workflow/approvals" }
            ],
            disclaimer:
              "Suggerimenti informativi: verificare sempre stato contrattuale e anagrafica in fonti ufficiali."
          }
        : {
            scope: scope.mode,
            recapMode: "aggregate",
            subjectCount: subjects.length,
            contractTypeMix: contractMix,
            hireDateSample: subjects.slice(0, 6).map((u) => u.hireDate ?? null),
            weeklyHoursAvg:
              subjects.reduce((a, u) => a + (Number(u.weeklyContractHours) || 0), 0) /
              Math.max(subjects.length, 1),
            skillCountDistinct: skillCodeSet.size,
            skillCodesSample,
            suggestedActions: [
              { id: "open_settings", label: "Profilo e formazione (impostazioni)", href: "/settings" },
              { id: "open_workflow", label: "Workflow richieste", href: "/workflow" }
            ],
            disclaimer:
              "Suggerimenti informativi su gruppo selezionato: verificare sempre stato contrattuale e anagrafica in fonti ufficiali."
          };

    const narrativeSeed =
      subjects.length === 1
        ? "Recap HR per il dipendente: priorità su contratto, skills, formazione. Italiano operativo; max 5 bullet azioni; niente promesse legali."
        : `Recap HR aggregato su ${subjects.length} dipendenti nel perimetro selezionato: evidenzia pattern su tipi contratto, competenze comuni, leve di formazione e rischi operativi. Italiano operativo; max 7 bullet; niente promesse legali; non inventare numeri non presenti nei fatti.`;

    const sessionId = (await this.gateway.beginSession(scope.companyId, auth.userId)).sessionId;
    let refineApplied = false;
    let refineFailure: OpenAiRefineFailure | undefined;
    try {
      const payload = {
        envelope: {
          facts,
          narrativeSeed
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, "ai_narrative_aggregate_v1");
      let modelJson: unknown = pseudo.pseudonymized;
      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_narrative_aggregate_v1");
        if (refined.ok) {
          modelJson = refined.data;
          refineApplied = true;
        } else if (refined.failure !== "inactive") {
          refineFailure = refined.failure;
        }
      }
      const narrative = await this.gateway.fromModelResponse(sessionId, modelJson);
      await this.appendAudit(scope.companyId, auth.userId, "recap", pseudo.pseudonymized, narrative);
      return {
        facts,
        narrative,
        llm: { active: this.openAi.isActive(), refineApplied, refineFailure },
        privacy: { schemaVersion: pseudo.schemaVersion, tokenCount: pseudo.tokenCount }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async runPersonnelBudgetAiReport(
    auth: AuthContext,
    dto: HrCenterPersonnelBudgetAiDto
  ): Promise<{
    facts: Record<string, unknown>;
    narrative: unknown;
    export: {
      mode: "two_periods" | "abc";
      sheets: Array<{ name: string; rows: string[][] }>;
    };
    llm: { active: boolean; refineApplied: boolean; refineFailure?: OpenAiRefineFailure };
    privacy: { schemaVersion: string; tokenCount: number };
  }> {
    await this.assertPersonnelBudgetReportAccess(auth);
    const companyId = await this.companyIdForAuthUser(auth);
    const scope = await this.resolveScope(auth);
    if (dto.mode === "two_periods") {
      if (
        dto.yearA == null ||
        dto.monthA == null ||
        dto.yearB == null ||
        dto.monthB == null
      ) {
        throw new BadRequestException("Per il confronto tra periodi indicare anno/mese per entrambe le finestre.");
      }
      const a = await this.store.getPersonnelBudgetAnalysis(companyId, dto.yearA, dto.monthA, 5, 500);
      const b = await this.store.getPersonnelBudgetAnalysis(companyId, dto.yearB, dto.monthB, 5, 500);
      const periodA = `${dto.yearA}-${String(dto.monthA).padStart(2, "0")}`;
      const periodB = `${dto.yearB}-${String(dto.monthB).padStart(2, "0")}`;
      const facts: Record<string, unknown> = {
        scope: scope.mode,
        comparison: "two_periods",
        periodA,
        periodB,
        totalsA: a.totals,
        totalsB: b.totals,
        variancesTopA: this.stripBudgetVariances(a.variances, 14),
        variancesTopB: this.stripBudgetVariances(b.variances, 14),
        notesCountA: a.notes.length,
        notesCountB: b.notes.length,
        disclaimer:
          "Dati aggregati e varianze senza nominativi nel payload verso il modello. Verificare sempre sui sistemi ufficiali payroll / HR."
      };
      const exportSheets = this.buildBudgetExportSheetsTwoPeriods(periodA, periodB, a, b);
      return await this.finishPersonnelBudgetNarrative(scope.companyId, auth.userId, facts, exportSheets, dto.mode);
    }
    if (dto.year == null || dto.month == null) {
      throw new BadRequestException("Anno e mese obbligatori per analisi Actual / Budget / Forecast.");
    }
    const snap = await this.store.getPersonnelBudgetAnalysis(companyId, dto.year, dto.month, 5, 500);
    const period = `${dto.year}-${String(dto.month).padStart(2, "0")}`;
    const facts: Record<string, unknown> = {
      scope: scope.mode,
      comparison: "actual_budget_forecast",
      period,
      totals: snap.totals,
      variancesTop: this.stripBudgetVariances(snap.variances, 20),
      notesCount: snap.notes.length,
      disclaimer:
        "Analisi strutturale su consuntivo, budget e forecast: correlazioni suggerite sono ipotesi da validare su fonti HR e mediche ufficiali."
    };
    const exportSheets = this.buildBudgetExportSheetAbc(period, snap);
    return await this.finishPersonnelBudgetNarrative(scope.companyId, auth.userId, facts, exportSheets, dto.mode);
  }

  private buildBudgetExportSheetsTwoPeriods(
    periodA: string,
    periodB: string,
    a: Awaited<ReturnType<HrDataStore["getPersonnelBudgetAnalysis"]>>,
    b: Awaited<ReturnType<HrDataStore["getPersonnelBudgetAnalysis"]>>
  ): { mode: "two_periods" | "abc"; sheets: Array<{ name: string; rows: string[][] }> } {
    const cats = ["ral", "overtime", "travel", "inps", "inail", "tfr", "totalCompanyCost"] as const;
    const header = ["Voce", `Actual ${periodA}`, `Budget ${periodA}`, `Forecast ${periodA}`, `Actual ${periodB}`, `Budget ${periodB}`, `Forecast ${periodB}`];
    const rows: string[][] = [header];
    for (const c of cats) {
      rows.push([
        c,
        String((a.totals.actual as Record<string, number>)[c] ?? ""),
        String((a.totals.budget as Record<string, number>)[c] ?? ""),
        String((a.totals.forecast as Record<string, number>)[c] ?? ""),
        String((b.totals.actual as Record<string, number>)[c] ?? ""),
        String((b.totals.budget as Record<string, number>)[c] ?? ""),
        String((b.totals.forecast as Record<string, number>)[c] ?? "")
      ]);
    }
    return { mode: "two_periods", sheets: [{ name: "Confronto periodi", rows }] };
  }

  private buildBudgetExportSheetAbc(
    period: string,
    snap: Awaited<ReturnType<HrDataStore["getPersonnelBudgetAnalysis"]>>
  ): { mode: "two_periods" | "abc"; sheets: Array<{ name: string; rows: string[][] }> } {
    const cats = ["ral", "overtime", "travel", "inps", "inail", "tfr", "totalCompanyCost"] as const;
    const rows: string[][] = [["Voce", "Actual", "Budget", "Forecast"]];
    for (const c of cats) {
      rows.push([
        c,
        String((snap.totals.actual as Record<string, number>)[c] ?? ""),
        String((snap.totals.budget as Record<string, number>)[c] ?? ""),
        String((snap.totals.forecast as Record<string, number>)[c] ?? "")
      ]);
    }
    const varRows: string[][] = [
      ["Categoria", "Actual", "Budget", "Forecast", "Var BF", "Var %"]
    ];
    for (const v of snap.variances.slice(0, 40)) {
      varRows.push([
        v.category,
        String(v.actual),
        String(v.budget),
        String(v.forecast),
        String(v.varianceBf),
        v.variancePct == null ? "" : String(v.variancePct)
      ]);
    }
    return {
      mode: "abc",
      sheets: [
        { name: `Totali ${period}`, rows },
        { name: `Varianze ${period}`, rows: varRows }
      ]
    };
  }

  private async finishPersonnelBudgetNarrative(
    companyId: string,
    userId: string,
    facts: Record<string, unknown>,
    exportSheets: { mode: "two_periods" | "abc"; sheets: Array<{ name: string; rows: string[][] }> },
    mode: "two_periods" | "abc"
  ): Promise<{
    facts: Record<string, unknown>;
    narrative: unknown;
    export: typeof exportSheets;
    llm: { active: boolean; refineApplied: boolean; refineFailure?: OpenAiRefineFailure };
    privacy: { schemaVersion: string; tokenCount: number };
  }> {
    const sessionId = (await this.gateway.beginSession(companyId, userId)).sessionId;
    let refineApplied = false;
    let refineFailure: OpenAiRefineFailure | undefined;
    try {
      const narrativeSeed =
        mode === "two_periods"
          ? "Report mensile sostitutivo (HR): confronta due periodi su costo del personale. Cerca correlazioni strutturali (straordinari, viaggi, oneri, TFR) e ipotesi su assenze/malattia o turnover solo come domande da verificare, senza diagnosi. Italiano professionale; sezioni: sintesi esecutiva, driver delle differenze, rischi, azioni consigliate. Max 900 parole."
          : "Report mensile sostitutivo (HR): analizza Actual vs Budget vs Forecast sul periodo. Evidenzia scostamenti, anomalie strutturali, possibili correlazioni (bonus, assenze, straordinari) come ipotesi verificabili. Italiano professionale; sezioni: sintesi, driver, rischi, piano azioni. Max 900 parole.";
      const payload = {
        envelope: {
          facts,
          narrativeSeed
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, "ai_narrative_aggregate_v1");
      let modelJson: unknown = pseudo.pseudonymized;
      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_narrative_aggregate_v1");
        if (refined.ok) {
          modelJson = refined.data;
          refineApplied = true;
        } else if (refined.failure !== "inactive") {
          refineFailure = refined.failure;
        }
      }
      let narrative = await this.gateway.fromModelResponse(sessionId, modelJson);
      const env = (narrative as { envelope?: { bullets?: unknown[] } })?.envelope;
      const bullets = Array.isArray(env?.bullets)
        ? env!.bullets!.filter((x): x is string => typeof x === "string")
        : [];
      const thinNarrative = bullets.length === 0 || bullets.every((line) => !/\d/.test(line));
      if (!refineApplied || refineFailure || thinNarrative) {
        narrative = {
          envelope: this.buildPersonnelBudgetNarrativeEnvelopeFromFacts(facts, mode)
        };
      }
      await this.appendAudit(companyId, userId, "analytics", pseudo.pseudonymized, narrative);
      const periodLabel =
        mode === "abc"
          ? String(facts.period ?? "")
          : `${String(facts.periodA ?? "")} vs ${String(facts.periodB ?? "")}`;
      await this.store.notifyUserInApp({
        userId,
        title: "Report budget personale pronto",
        body: periodLabel ? `Periodo: ${periodLabel}` : undefined,
        kind: "hr_center_budget_report",
        actionPath: "/hr-center/budget-report"
      });
      return {
        facts,
        narrative,
        export: exportSheets,
        llm: { active: this.openAi.isActive(), refineApplied, refineFailure },
        privacy: { schemaVersion: pseudo.schemaVersion, tokenCount: pseudo.tokenCount }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private buildPersonnelBudgetNarrativeEnvelopeFromFacts(
    facts: Record<string, unknown>,
    mode: "two_periods" | "abc"
  ): { title: string; bullets: string[]; summary: string } {
    const fmt = (n: unknown): string => {
      const x = typeof n === "number" ? n : Number(n);
      if (!Number.isFinite(x)) {
        return "—";
      }
      return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(x);
    };
    const catLabel: Record<string, string> = {
      ral: "RAL e fissi",
      overtime: "Straordinari",
      travel: "Trasferte",
      inps: "INPS azienda",
      inail: "INAIL",
      tfr: "TFR",
      totalCompanyCost: "Costo azienda totale"
    };
    const keys = ["ral", "overtime", "travel", "inps", "inail", "tfr", "totalCompanyCost"] as const;
    if (mode === "abc") {
      const period = String(facts.period ?? "");
      const totals = facts.totals as
        | { actual?: Record<string, number>; budget?: Record<string, number>; forecast?: Record<string, number> }
        | undefined;
      const a = totals?.actual ?? {};
      const b = totals?.budget ?? {};
      const f = totals?.forecast ?? {};
      const bullets: string[] = keys.map((k) => {
        const lab = catLabel[k] ?? k;
        return `${lab}: Actual ${fmt(a[k])}, Budget ${fmt(b[k])}, Forecast ${fmt(f[k])}.`;
      });
      const variances = (facts.variancesTop as Array<{ category: string; varianceBf?: number; variancePct?: number | null }>) ?? [];
      for (const v of variances.slice(0, 4)) {
        const lab = catLabel[v.category] ?? v.category;
        const pct =
          v.variancePct == null || !Number.isFinite(Number(v.variancePct))
            ? "n.d."
            : `${Number(v.variancePct).toFixed(1)}%`;
        bullets.push(`Varianza ${lab}: scostamento forecast vs budget ${fmt(v.varianceBf)} (${pct} sul budget).`);
      }
      const summary =
        `Periodo ${period} — sintesi su dati aggregati (nessun nominativo). Costo azienda totale: Actual ${fmt(
          a.totalCompanyCost
        )}, Budget ${fmt(b.totalCompanyCost)}, Forecast ${fmt(f.totalCompanyCost)}. ` +
        `Le voci sopra sono tratte dal motore budget personale Nexa; verificare sempre payroll e contabilità prima di decisioni ufficiali.`;
      return {
        title: `Analisi mensile costo personale — ${period}`,
        bullets,
        summary
      };
    }
    const periodA = String(facts.periodA ?? "");
    const periodB = String(facts.periodB ?? "");
    const ta = (facts.totalsA as { actual?: Record<string, number> } | undefined)?.actual ?? {};
    const tb = (facts.totalsB as { actual?: Record<string, number> } | undefined)?.actual ?? {};
    const bullets: string[] = keys.map((k) => {
      const lab = catLabel[k] ?? k;
      return `${lab}: Actual ${periodA} ${fmt(ta[k])} vs Actual ${periodB} ${fmt(tb[k])}.`;
    });
    const summary =
      `Confronto ${periodA} vs ${periodB} su costi aggregati del personale. Evidenziare driver di variazione su straordinari, oneri e TFR; validare su fonti HR/payroll.`;
    return {
      title: `Confronto budget personale — ${periodA} vs ${periodB}`,
      bullets,
      summary
    };
  }
}
