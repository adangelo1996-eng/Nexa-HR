import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import type { AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { AiAuditService } from "./ai-audit.service";
import { NEXA_HR_PLATFORM_NAV } from "./ai-hr-agent";
import { assertHebbUserMessageAllowed } from "./ai-hr-message-policy";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";
import {
  parseHrCopilotFromEnvelope,
  type HrCopilotPanel,
  type HrCopilotStructured
} from "./hr-copilot-structured";

const SCHEMA_HR_COPILOT = "ai_hr_copilot_v1";

export type HrCopilotTurn = { role: "user" | "assistant"; content: string };

type HrCopilotScope = "org" | "manager";

type HrCopilotSignals = {
  scope: HrCopilotScope;
  generatedAt: string;
  headcount: number;
  pendingApprovals: number;
  pendingByType: Record<string, number>;
  openHrAlerts: number;
  skillsGapCount: number;
  roleCoverageGapHeadcount: number;
  retentionHighRiskCount: number;
  retentionAvgScore: number | null;
  openPositionsCount: number;
  openPositionTitles: string[];
  trainingOverdueCount: number;
  budgetVariancePct: number | null;
  budgetActualEur: number | null;
  budgetBudgetEur: number | null;
  teamHeadcount: number | null;
  teamPendingApprovals: number | null;
  highRiskPseudonyms: Array<{ label: string; score: number; roleHint: string | null }>;
};

function turnoverBands(items: Array<{ score: number }>): { low: number; mid: number; high: number } {
  const bands = { low: 0, mid: 0, high: 0 };
  for (const it of items) {
    const s = Number(it.score);
    if (!Number.isFinite(s)) {
      continue;
    }
    if (s < 34) {
      bands.low += 1;
    } else if (s < 67) {
      bands.mid += 1;
    } else {
      bands.high += 1;
    }
  }
  return bands;
}

function eur(n: number): string {
  return Number.isFinite(n)
    ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
    : "—";
}

@Injectable()
export class HrCopilotService {
  private readonly logger = new Logger(HrCopilotService.name);

  constructor(
    private readonly store: HrDataStore,
    private readonly gateway: AiPrivacyGateway,
    private readonly audit: AiAuditService,
    private readonly permissions: PermissionsService,
    private readonly openAi: AiOpenAiRefinementService
  ) {}

  async assertAccess(auth: { userId: string; role: AuthRole }): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const me = await this.store.getUser(auth.userId);
    const hrExtended = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email ?? "");
    if (hrExtended) {
      return;
    }
    if (await this.permissions.userHasAll(auth.userId, ["nexa.reports_hr:read"])) {
      return;
    }
    const hasApprovals = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:read"]);
    const leadIds = await this.store.listWorkTeamIdsWhereUserIsLead(auth.userId);
    const directs = await this.store.listUsersByManager(auth.userId);
    if (!hasApprovals && leadIds.length === 0 && directs.length === 0) {
      throw new ForbiddenException(
        "HEBB AI for HR: serve console HR estesa, permesso report HR, oppure ruolo manager con team/approvazioni."
      );
    }
  }

  private async resolveScope(auth: { userId: string; role: AuthRole }): Promise<HrCopilotScope> {
    const me = await this.store.getUser(auth.userId);
    const hrExtended = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email ?? "");
    if (hrExtended || (await this.permissions.userHasAll(auth.userId, ["nexa.reports_hr:read"]))) {
      return "org";
    }
    return "manager";
  }

  private async countOpenPositions(companyId: string): Promise<{ openCount: number; titles: string[] }> {
    const sb = this.store.getServiceRoleClient();
    if (!sb) {
      return { openCount: 0, titles: [] };
    }
    const { data, error } = await sb
      .from("recruit_positions")
      .select("title, status")
      .eq("company_id", companyId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) {
      this.logger.warn(`recruit_positions read: ${error.message}`);
      return { openCount: 0, titles: [] };
    }
    const rows = (data ?? []) as Array<{ title?: string }>;
    return {
      openCount: rows.length,
      titles: rows.map((r) => String(r.title ?? "Posizione aperta").slice(0, 80))
    };
  }

  private async countTrainingOverdue(companyId: string): Promise<number> {
    const sb = this.store.getServiceRoleClient();
    if (!sb) {
      return 0;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { count, error } = await sb
      .from("training_assignments")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .neq("status", "completed")
      .lt("due_date", today);
    if (error) {
      this.logger.warn(`training_assignments overdue: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  }

  async buildSignals(auth: { userId: string; role: AuthRole }): Promise<HrCopilotSignals> {
    const me = await this.store.getUser(auth.userId);
    const companyId = (me.companyId || "").trim();
    const scope = await this.resolveScope(auth);
    const now = new Date();
    const includeBudget =
      auth.role === "superuser" ||
      (await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email ?? "")) ||
      (await this.permissions.userHasAll(auth.userId, ["nexa.personnel_budget:read"]));

    const [
      dashSummary,
      headcountRecap,
      pending,
      skillsGaps,
      coverageGaps,
      alerts,
      turnoverRows,
      openPositions,
      trainingOverdue
    ] = await Promise.all([
      this.store.getHrDashboardSummary(),
      companyId ? this.store.getHrRecapHeadcount(companyId) : Promise.resolve({ active: 0, total: 0 }),
      this.store.listApprovalsForUser(auth.userId, "pending"),
      companyId ? this.store.getSkillsGapReport(companyId) : Promise.resolve([]),
      companyId ? this.store.listRoleCoverageGaps(companyId) : Promise.resolve([]),
      companyId ? this.store.listHrAlerts(companyId, "open") : Promise.resolve([]),
      companyId ? this.store.getLatestTurnoverRetention(companyId) : Promise.resolve([]),
      companyId ? this.countOpenPositions(companyId) : Promise.resolve({ openCount: 0, titles: [] }),
      companyId ? this.countTrainingOverdue(companyId) : Promise.resolve(0)
    ]);

    const pendingByType: Record<string, number> = {};
    for (const p of pending) {
      pendingByType[p.type] = (pendingByType[p.type] ?? 0) + 1;
    }

    const gapRows = skillsGaps.filter((g) => g.gap > 0);
    const coverageHeadcount = coverageGaps.reduce((s, g) => s + (g.headcountGap ?? 0), 0);

    let retentionItems = turnoverRows.map((r) => ({ score: r.score, userId: r.userId }));
    let teamHeadcount: number | null = null;
    let teamPending: number | null = null;

    if (scope === "manager") {
      const team = await this.store.listUsersByManager(auth.userId);
      const teamIds = new Set(team.map((u) => u.id));
      retentionItems = turnoverRows.filter((r) => teamIds.has(r.userId)).map((r) => ({ score: r.score, userId: r.userId }));
      teamHeadcount = team.length;
      teamPending = pending.filter((p) => teamIds.has(p.requestedBy)).length;
    }

    const bands = turnoverBands(retentionItems);
    const avgScore =
      retentionItems.length > 0
        ? Math.round((retentionItems.reduce((a, b) => a + b.score, 0) / retentionItems.length) * 10) / 10
        : null;

    const highRisk = [...retentionItems]
      .filter((r) => r.score >= 67)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r, i) => ({
        label: `Collaboratore ${String.fromCharCode(65 + i)}`,
        score: r.score,
        roleHint: scope === "org" ? "Profilo organizzazione" : "Report diretto"
      }));

    let budgetVariancePct: number | null = null;
    let budgetActualEur: number | null = null;
    let budgetBudgetEur: number | null = null;
    if (includeBudget && companyId) {
      try {
        const analysis = await this.store.getPersonnelBudgetAnalysis(
          companyId,
          now.getFullYear(),
          now.getMonth() + 1,
          5,
          500
        );
        const act = analysis.totals.actual.totalCompanyCost ?? 0;
        const bud = analysis.totals.budget.totalCompanyCost ?? 0;
        budgetActualEur = Math.round(act);
        budgetBudgetEur = Math.round(bud);
        budgetVariancePct = bud > 0 ? Math.round(((act - bud) / bud) * 1000) / 10 : null;
      } catch (e) {
        this.logger.warn(`budget analysis skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      scope,
      generatedAt: now.toISOString(),
      headcount: headcountRecap.active || dashSummary.headcount,
      pendingApprovals: pending.length,
      pendingByType,
      openHrAlerts: alerts.length,
      skillsGapCount: gapRows.length,
      roleCoverageGapHeadcount: coverageHeadcount,
      retentionHighRiskCount: bands.high,
      retentionAvgScore: avgScore,
      openPositionsCount: openPositions.openCount,
      openPositionTitles: openPositions.titles,
      trainingOverdueCount: trainingOverdue,
      budgetVariancePct,
      budgetActualEur,
      budgetBudgetEur,
      teamHeadcount,
      teamPendingApprovals: teamPending,
      highRiskPseudonyms: highRisk
    };
  }

  buildTemplateBrief(signals: HrCopilotSignals): HrCopilotStructured {
    const panels: HrCopilotPanel[] = [];

    const todayActions = [];
    if (signals.pendingApprovals > 0) {
      todayActions.push({
        label: "Smaltire approvazioni in sospeso",
        rationale: "Riduce il backlog operativo e migliora l’esperienza del team.",
        evidence: `${signals.pendingApprovals} richieste in attesa`,
        href: "/workflow/approvals"
      });
    }
    if (signals.trainingOverdueCount > 0) {
      todayActions.push({
        label: "Sollecitare formazione scaduta",
        rationale: "Mantenere la conformità su corsi obbligatori e onboarding.",
        evidence: `${signals.trainingOverdueCount} assegnazioni oltre scadenza`,
        href: "/hr/formazione"
      });
    }
    if (signals.openHrAlerts > 0) {
      todayActions.push({
        label: "Rivedere alert HR aperti",
        rationale: "Gli alert segnalano anomalie metriche già calcolate dal sistema.",
        evidence: `${signals.openHrAlerts} alert aperti`,
        href: "/hr/dashboard"
      });
    }
    if (todayActions.length === 0) {
      todayActions.push({
        label: "Verificare briefing operativo",
        rationale: "Nessun backlog critico rilevato: utile un controllo su analytics operativo.",
        evidence: "Approvazioni e alert sotto soglia",
        href: "/analytics/operativo"
      });
    }
    panels.push({
      id: "today",
      title: "Cosa fare oggi",
      priority: signals.pendingApprovals >= 5 ? "high" : "medium",
      summary: `Priorità del giorno su ${signals.scope === "org" ? "organizzazione" : "team diretto"}: ${signals.pendingApprovals} approvazioni e ${signals.trainingOverdueCount} formazioni in ritardo.`,
      actions: todayActions.slice(0, 4)
    });

    panels.push({
      id: "people_risk",
      title: "Rischi persone",
      priority: signals.retentionHighRiskCount >= 3 ? "high" : signals.retentionHighRiskCount > 0 ? "medium" : "low",
      summary:
        signals.retentionHighRiskCount > 0
          ? `${signals.retentionHighRiskCount} profili con score retention elevato${signals.retentionAvgScore != null ? ` (media ${signals.retentionAvgScore})` : ""}.`
          : "Nessun profilo ad alto score retention nel tuo ambito.",
      actions: [
        {
          label: "Approfondire retention aggregata",
          rationale: "Analizza trend e fasce di rischio senza nominativi nel modello AI.",
          evidence: `${signals.retentionHighRiskCount} profili ad alto rischio`,
          href: "/analytics/advanced/retention"
        },
        ...(signals.highRiskPseudonyms.slice(0, 2).map((p) => ({
          label: `Pianificare check-in con ${p.label}`,
          rationale: "Colloquio strutturato su carico, percorso e aspettative — senza decisioni automatiche.",
          evidence: `Score ${p.score} (${p.roleHint ?? "ambito"})`
        })) ?? [])
      ].slice(0, 4)
    });

    panels.push({
      id: "hiring",
      title: "Assunzioni",
      priority: signals.roleCoverageGapHeadcount > 0 || signals.openPositionsCount > 0 ? "medium" : "low",
      summary: `${signals.openPositionsCount} posizioni aperte, ${signals.skillsGapCount} gap competenze e ${signals.roleCoverageGapHeadcount} persone mancanti su ruoli monitorati.`,
      actions: [
        {
          label: "Allineare recruiting e gap ruolo",
          rationale: "Incrocia posizioni aperte con copertura organica e competenze critiche.",
          evidence: `${signals.openPositionsCount} posizioni · ${signals.skillsGapCount} gap skill`,
          href: "/recruiting"
        },
        {
          label: "Mappare gap competenze",
          rationale: "Prioritizza upskilling vs hiring sulle competenze con gap più ampio.",
          evidence: `${signals.skillsGapCount} righe gap nel report`,
          href: "/analytics/competenze"
        }
      ]
    });

    const budgetHigh =
      signals.budgetVariancePct != null && Math.abs(signals.budgetVariancePct) >= 5;
    panels.push({
      id: "budget_alert",
      title: "Budget alert",
      priority: budgetHigh ? "high" : "low",
      summary:
        signals.budgetVariancePct != null
          ? `Varianza actual vs budget mese corrente: ${signals.budgetVariancePct > 0 ? "+" : ""}${signals.budgetVariancePct}%.`
          : "Dati budget non disponibili per il tuo profilo o periodo corrente.",
      actions:
        signals.budgetVariancePct != null
          ? [
              {
                label: "Analizzare scostamento economico",
                rationale: "Verifica actual, forecast e centri di costo prima di rettifiche.",
                evidence: `Actual ${eur(signals.budgetActualEur ?? 0)} vs budget ${eur(signals.budgetBudgetEur ?? 0)}`,
                href: "/analytics/advanced/economico"
              },
              {
                label: "Aprire report budget personale",
                rationale: "Sintesi LLM su aggregati per controller HR.",
                evidence: `Varianza ${signals.budgetVariancePct}%`,
                href: "/hr-center/budget-report"
              }
            ]
          : [
              {
                label: "Verificare permessi budget",
                rationale: "Serve accesso budget personale o console HR estesa.",
                evidence: "Varianza non calcolata",
                href: "/personnel-budget"
              }
            ]
    });

    const intro =
      signals.scope === "org"
        ? `Brief HR per l’organizzazione (${signals.headcount} persone attive): ecco le azioni prioritarie basate su segnali pseudonimizzati.`
        : `Brief HR per il tuo team (${signals.teamHeadcount ?? 0} report diretti): focus operativo e rischi people nel tuo scope.`;

    return { intro, panels };
  }

  private async refineWithLlm(
    auth: { userId: string; role: AuthRole },
    payload: {
      message?: string;
      history?: HrCopilotTurn[];
      signals: HrCopilotSignals;
      seed: HrCopilotStructured;
    }
  ): Promise<{ structured: HrCopilotStructured; refineApplied: boolean; sessionId: string | null; tokenCount: number }> {
    const me = await this.store.getUser(auth.userId);
    if (!this.openAi.isActive()) {
      return { structured: payload.seed, refineApplied: false, sessionId: null, tokenCount: 0 };
    }

    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const envelopePayload = {
        envelope: {
          message: payload.message ?? "",
          history: (payload.history ?? []).slice(-8),
          signals: payload.signals,
          seed: payload.seed,
          platformCapabilities: NEXA_HR_PLATFORM_NAV.map((n) => ({ path: n.path, labelIt: n.labelIt }))
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, envelopePayload, SCHEMA_HR_COPILOT);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_HR_COPILOT);
      if (refined.ok && refined.data) {
        const parsed = parseHrCopilotFromEnvelope(refined.data);
        if (parsed) {
          return {
            structured: parsed,
            refineApplied: true,
            sessionId,
            tokenCount: pseudo.tokenCount
          };
        }
      }
      return { structured: payload.seed, refineApplied: false, sessionId, tokenCount: pseudo.tokenCount };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async generateBrief(auth: { userId: string; role: AuthRole }): Promise<{
    structured: HrCopilotStructured;
    signals: HrCopilotSignals;
    llm: { configured: boolean; refineApplied: boolean };
    privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
  }> {
    await this.assertAccess(auth);
    const signals = await this.buildSignals(auth);
    const seed = this.buildTemplateBrief(signals);
    const { structured, refineApplied, sessionId, tokenCount } = await this.refineWithLlm(auth, { signals, seed });
    const me = await this.store.getUser(auth.userId);
    await this.audit.append({
      companyId: me.companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "hr_copilot",
      schemaVersion: SCHEMA_HR_COPILOT,
      sessionId,
      inputForFingerprint: { mode: "brief", scope: signals.scope, headcount: signals.headcount },
      dataSources: ["hr_signals", "approvals", "retention", "skills_gap", "recruiting", "training", "personnel_budget"],
      responseSizeBytes: Buffer.byteLength(JSON.stringify(structured), "utf8"),
      outcome: refineApplied ? "llm" : "template"
    });
    return {
      structured,
      signals,
      llm: { configured: this.openAi.isActive(), refineApplied },
      privacy: { pseudonymizedTokenCount: tokenCount, schemaVersion: SCHEMA_HR_COPILOT }
    };
  }

  async chat(
    auth: { userId: string; role: AuthRole },
    body: { message: string; history?: HrCopilotTurn[] }
  ): Promise<{
    reply: string;
    structured: HrCopilotStructured | null;
    llm: { configured: boolean; refineApplied: boolean };
    privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
  }> {
    await this.assertAccess(auth);
    const me = await this.store.getUser(auth.userId);
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);
    assertHebbUserMessageAllowed(body.message, companyUsers);

    const signals = await this.buildSignals(auth);
    const seed = this.buildTemplateBrief(signals);
    const history = (body.history ?? [])
      .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-10);
    for (const turn of history) {
      if (turn.role === "user") {
        assertHebbUserMessageAllowed(turn.content, companyUsers);
      }
    }

    const { structured, refineApplied, sessionId, tokenCount } = await this.refineWithLlm(auth, {
      message: body.message,
      history,
      signals,
      seed
    });

    const reply =
      structured.reply?.trim() ||
      `${structured.intro}\n\nPer approfondire, usa i pannelli aggiornati con evidenze numeriche (nessun nominativo nel modello).`;

    await this.audit.append({
      companyId: me.companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "hr_copilot",
      schemaVersion: SCHEMA_HR_COPILOT,
      sessionId,
      inputForFingerprint: { mode: "chat", messageLen: body.message.length, historyLen: history.length },
      dataSources: ["hr_signals", "hr_copilot_chat"],
      responseSizeBytes: Buffer.byteLength(reply, "utf8"),
      outcome: refineApplied ? "llm" : "template"
    });

    return {
      reply,
      structured,
      llm: { configured: this.openAi.isActive(), refineApplied },
      privacy: { pseudonymizedTokenCount: tokenCount, schemaVersion: SCHEMA_HR_COPILOT }
    };
  }
}
