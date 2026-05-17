import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { HrDataStore } from "../platform/hr-data.store";
import { NarrativeAnalyticsService } from "./narrative-analytics.service";

export type AnalyticsHubCard = {
  id: string;
  titleIt: string;
  blurbIt: string;
  href: string;
  topic: string;
  llmCapable: boolean;
};

export type AnalyticsKpi = { id: string; labelIt: string; value: string; hintIt?: string };

export type StructuredAnalyticsInsight = {
  title: string;
  situazione: string;
  correlazioni: string[];
  rischi: string[];
  azioni7giorni: string[];
  llmApplied: boolean;
  templateOnly: boolean;
};

const HUB_CARDS: AnalyticsHubCard[] = [
  {
    id: "economico",
    titleIt: "Controllo economico workforce",
    blurbIt:
      "Budget vs actual vs forecast per centro di costo, driver di varianza e trend costo FTE. Narrativa per controller HR.",
    href: "/analytics/economico",
    topic: "workforce_economic_control",
    llmCapable: true
  },
  {
    id: "retention",
    titleIt: "Retention e flight risk",
    blurbIt:
      "Segnali turnover, assenze e tenure su aggregati per fascia e centro di costo. Playbook retention prioritario.",
    href: "/analytics/retention",
    topic: "retention_flight_risk",
    llmCapable: true
  },
  {
    id: "competenze",
    titleIt: "Competenze e copertura ruoli",
    blurbIt: "Gap competenze vs fabbisogno per ruolo. Matrice raccomandazioni hiring vs formazione.",
    href: "/analytics/competenze",
    topic: "skills_role_coverage",
    llmCapable: true
  },
  {
    id: "operativo",
    titleIt: "Sintesi operativa HR",
    blurbIt:
      "Approvazioni in sospeso, onboarding/offboarding, delta organico e backlog spese. Briefing giornaliero HRBP.",
    href: "/analytics/operativo",
    topic: "hr_operational_briefing",
    llmCapable: true
  }
];

function turnoverAggregateForLlm(
  items: Array<{ score: number; costCenterId: string | null }>,
  trend: Array<{ weekStart: string; avgScore: number; sampleSize: number }>,
  modelVersion: string,
  costCenters: Array<{ id: string; label: string }>
): Record<string, unknown> {
  const bands = { low: 0, mid: 0, high: 0 };
  for (const it of items) {
    const s = Number(it.score);
    if (!Number.isFinite(s)) continue;
    if (s < 34) bands.low += 1;
    else if (s < 67) bands.mid += 1;
    else bands.high += 1;
  }
  const byCc = new Map<string, { label: string; sum: number; n: number }>();
  for (const it of items) {
    const key = it.costCenterId ?? "__none__";
    const hit = it.costCenterId ? costCenters.find((c) => c.id === it.costCenterId) : undefined;
    const label = hit?.label ?? (it.costCenterId ? it.costCenterId : "Senza centro di costo");
    const cur = byCc.get(key) ?? { label, sum: 0, n: 0 };
    cur.sum += Number(it.score) || 0;
    cur.n += 1;
    byCc.set(key, cur);
  }
  const byCostCenter = [...byCc.values()].map((v) => ({
    label: v.label,
    count: v.n,
    avgScore: v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0
  }));
  return {
    modelVersion,
    trend,
    itemsCount: items.length,
    scoreBands: bands,
    byCostCenter
  };
}

function eur(n: number): string {
  return Number.isFinite(n)
    ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
    : "—";
}

@Injectable()
export class AnalyticsOrchestratorService {
  constructor(
    private readonly store: HrDataStore,
    private readonly narrative: NarrativeAnalyticsService,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService
  ) {}

  listHubCards(): AnalyticsHubCard[] {
    return [...HUB_CARDS];
  }

  resolveCard(analysisId: string): AnalyticsHubCard {
    const card = HUB_CARDS.find((c) => c.id === analysisId.trim().toLowerCase());
    if (!card) {
      throw new ForbiddenException("Analisi non riconosciuta");
    }
    return card;
  }

  private async companyIdForAuth(auth: AuthContext): Promise<string> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile");
    }
    return companyId;
  }

  async getAnalysisKpis(auth: AuthContext, analysisId: string): Promise<{ analysisId: string; kpis: AnalyticsKpi[] }> {
    const card = this.resolveCard(analysisId);
    const companyId = await this.companyIdForAuth(auth);
    const kpis = await this.buildKpis(card.id, companyId, auth.userId);
    return { analysisId: card.id, kpis };
  }

  async runHubAnalysis(
    auth: AuthContext,
    analysisId: string,
    options?: { useLlm?: boolean }
  ): Promise<{
    analysisId: string;
    payload: Record<string, unknown>;
    narrative: Awaited<ReturnType<NarrativeAnalyticsService["generate"]>>;
    llmActive: boolean;
  }> {
    const card = this.resolveCard(analysisId);
    const companyId = await this.companyIdForAuth(auth);
    const payload = await this.buildPayload(card.id, companyId, auth.userId);
    const narrative = await this.narrative.generate(auth, {
      topic: card.topic,
      payload,
      useLlm: options?.useLlm === true
    });
    return {
      analysisId: card.id,
      payload,
      narrative,
      llmActive: this.openAi.isActive()
    };
  }

  async generateStructuredInsight(
    auth: AuthContext,
    analysisId: string,
    options?: { useLlm?: boolean }
  ): Promise<StructuredAnalyticsInsight & { analysisId: string; llmActive: boolean }> {
    const card = this.resolveCard(analysisId);
    const companyId = await this.companyIdForAuth(auth);
    const payload = await this.buildPayload(card.id, companyId, auth.userId);
    const seed = this.buildStructuredSeed(card, payload);
    let out: StructuredAnalyticsInsight = { ...seed, llmApplied: false, templateOnly: true };

    if (options?.useLlm === true && this.openAi.isActive()) {
      const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
      try {
        const envelopePayload = {
          envelope: {
            analysisId: card.id,
            topic: card.topic,
            facts: payload,
            insightSeed: seed
          }
        };
        const pseudo = await this.gateway.toModelPayload(sessionId, envelopePayload, "ai_advanced_analytics_v1");
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_advanced_analytics_v1");
        if (refined.ok && refined.data && typeof refined.data === "object") {
          const env = (
            refined.data as {
              envelope?: {
                title?: string;
                situazione?: string;
                correlazioni?: unknown;
                rischi?: unknown;
                azioni7giorni?: unknown;
              };
            }
          ).envelope;
          if (env?.situazione) {
            out = {
              title: typeof env.title === "string" && env.title.trim() ? env.title.trim() : seed.title,
              situazione: env.situazione.trim(),
              correlazioni: Array.isArray(env.correlazioni)
                ? env.correlazioni.filter((x): x is string => typeof x === "string").slice(0, 6)
                : seed.correlazioni,
              rischi: Array.isArray(env.rischi)
                ? env.rischi.filter((x): x is string => typeof x === "string").slice(0, 6)
                : seed.rischi,
              azioni7giorni: Array.isArray(env.azioni7giorni)
                ? env.azioni7giorni.filter((x): x is string => typeof x === "string").slice(0, 5)
                : seed.azioni7giorni,
              llmApplied: true,
              templateOnly: false
            };
          }
        }
      } finally {
        await this.gateway.endSession(sessionId);
      }
    }

    return { analysisId: card.id, ...out, llmActive: this.openAi.isActive() };
  }

  async chatWithAnalyst(
    auth: AuthContext,
    analysisId: string,
    body: { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> }
  ): Promise<{ reply: string; llmApplied: boolean; llmActive: boolean }> {
    const card = this.resolveCard(analysisId);
    const companyId = await this.companyIdForAuth(auth);
    const message = body.message.trim().slice(0, 2000);
    if (!message) {
      throw new ForbiddenException("Messaggio vuoto");
    }
    const payload = await this.buildPayload(card.id, companyId, auth.userId);
    const history = (body.history ?? [])
      .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-8)
      .map((t) => ({ role: t.role, content: t.content.trim().slice(0, 1500) }));

    const draft = this.buildAnalystReplyDraft(card, message, payload, history);
    if (!this.openAi.isActive()) {
      return { reply: draft, llmApplied: false, llmActive: false };
    }

    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const envelopePayload = {
        envelope: {
          analysisId: card.id,
          topic: card.topic,
          facts: payload,
          message,
          history,
          replySeed: draft
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, envelopePayload, "ai_advanced_analytics_chat_v1");
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_advanced_analytics_chat_v1");
      if (refined.ok && refined.data && typeof refined.data === "object") {
        const reply = (refined.data as { envelope?: { reply?: string } }).envelope?.reply;
        if (typeof reply === "string" && reply.trim()) {
          return { reply: reply.trim(), llmApplied: true, llmActive: true };
        }
      }
      return { reply: draft, llmApplied: false, llmActive: true };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private buildStructuredSeed(card: AnalyticsHubCard, payload: Record<string, unknown>): StructuredAnalyticsInsight {
    const narrativeTopic =
      card.topic === "workforce_economic_control"
        ? "personnel_cost_radar"
        : card.topic === "retention_flight_risk"
          ? "turnover_insights_deep"
          : card.topic === "skills_role_coverage"
            ? "skills_gap"
            : "executive_recap";
    const tpl = this.narrativeSeedFromPayload(narrativeTopic, payload);
    return {
      title: tpl.title,
      situazione: tpl.summary,
      correlazioni: tpl.bullets.slice(0, 4),
      rischi: ["Verificare i dati in app prima di decisioni su singole persone.", "I segnali AI non sostituiscono controlli formali payroll o legali."],
      azioni7giorni: [
        "Aprire la pagina analisi dedicata e validare i KPI con HR controller.",
        "Allineare manager sui cluster a rischio più elevato (solo aggregati).",
        "Pianificare un checkpoint entro 7 giorni su varianze o gap prioritari."
      ],
      llmApplied: false,
      templateOnly: true
    };
  }

  private narrativeSeedFromPayload(
    topic: string,
    payload: Record<string, unknown>
  ): { title: string; bullets: string[]; summary: string } {
    if (topic === "turnover_insights_deep") {
      const bands = payload.scoreBands as { low?: number; mid?: number; high?: number } | undefined;
      return {
        title: "Retention e flight risk",
        bullets: [
          `Profili ad alto score: ${bands?.high ?? 0} (aggregato).`,
          `Profili a medio rischio: ${bands?.mid ?? 0}.`,
          `Campione analizzato: ${payload.itemsCount ?? "n/d"} profili.`
        ],
        summary:
          "Priorità su fasce e centri di costo con score medio-alto; colloqui mirati senza esporre nominativi al modello."
      };
    }
    if (topic === "skills_gap") {
      const count = Number(payload.itemCount ?? (Array.isArray(payload.items) ? payload.items.length : 0));
      return {
        title: "Competenze e copertura ruoli",
        bullets: [`Righe gap nel report: ${count}.`, "Confrontare fabbisogno ruolo con livelli mappati in anagrafica."],
        summary: "Valutare hiring vs formazione sulle competenze con gap più ampi."
      };
    }
    const summary = payload.summary as { headcount?: number; budgetEur?: number; pendingExpenseCount?: number } | undefined;
    const budget = payload.budgetAnalysis as { totals?: { variancePct?: number | null } } | undefined;
    return {
      title: topic === "personnel_cost_radar" ? "Controllo economico workforce" : "Sintesi operativa HR",
      bullets: [
        summary?.headcount != null ? `Headcount: ${summary.headcount}.` : "",
        summary?.budgetEur != null ? `Massa retributiva indicativa: ${eur(summary.budgetEur)}.` : "",
        budget?.totals?.variancePct != null ? `Varianza budget/actual: ${budget.totals.variancePct}% (periodo corrente).` : "",
        summary?.pendingExpenseCount != null ? `Spese in attesa: ${summary.pendingExpenseCount}.` : ""
      ].filter(Boolean),
      summary:
        topic === "personnel_cost_radar"
          ? "Confronto budget, consuntivo e forecast su aggregati per centro di costo."
          : "Quadro operativo giornaliero: approvazioni, lifecycle e backlog da smaltire."
    };
  }

  private buildAnalystReplyDraft(
    card: AnalyticsHubCard,
    message: string,
    payload: Record<string, unknown>,
    history: Array<{ role: string; content: string }>
  ): string {
    const histNote = history.length ? ` (contesto: ${history.length} messaggi precedenti)` : "";
    return (
      `Analisi «${card.titleIt}»${histNote}: ho ricevuto la tua domanda «${message.slice(0, 120)}». ` +
      `I dati disponibili coprono ${Object.keys(payload).length} blocchi aggregati (nessun nominativo). ` +
      "Per approfondire, usa «Genera insight AI» o apri i KPI in pagina; se OpenAI non è attivo, attivalo dalle impostazioni aziendali."
    );
  }

  private async buildKpis(analysisId: string, companyId: string, actorUserId: string): Promise<AnalyticsKpi[]> {
    switch (analysisId) {
      case "economico": {
        const now = new Date();
        const analysis = await this.store.getPersonnelBudgetAnalysis(companyId, now.getFullYear(), now.getMonth() + 1, 5, 500);
        const t = analysis.totals;
        const act = t.actual.totalCompanyCost ?? 0;
        const bud = t.budget.totalCompanyCost ?? 0;
        const fct = t.forecast.totalCompanyCost ?? 0;
        const varPct = bud > 0 ? Math.round(((act - bud) / bud) * 1000) / 10 : null;
        const breakdown = await this.store.payrollForecastCostBreakdown(companyId, 3);
        return [
          {
            id: "actual",
            labelIt: "Actual mese",
            value: eur(act),
            hintIt: `${analysis.year}-${String(analysis.month).padStart(2, "0")}`
          },
          { id: "budget", labelIt: "Budget mese", value: eur(bud) },
          { id: "forecast", labelIt: "Forecast mese", value: eur(fct) },
          {
            id: "variance",
            labelIt: "Varianza vs budget",
            value: varPct != null ? `${varPct > 0 ? "+" : ""}${varPct}%` : "—"
          },
          {
            id: "cc",
            labelIt: "Centri di costo",
            value: String(breakdown.byCostCenter.length),
            hintIt: "Nel breakdown forecast"
          }
        ];
      }
      case "retention": {
        const items = await this.store.getLatestTurnoverRetention(companyId);
        const trend = await this.store.getTurnoverRetentionTrend(companyId, 8);
        const agg = turnoverAggregateForLlm(
          items.map((r) => ({ score: r.score, costCenterId: r.costCenterId })),
          trend,
          "rule-v1",
          await this.store.listCostCentersForTurnoverFilter(companyId)
        );
        const bands = agg.scoreBands as { low: number; mid: number; high: number };
        const last = trend.length ? trend[trend.length - 1] : undefined;
        return [
          { id: "sample", labelIt: "Profili analizzati", value: String(agg.itemsCount ?? items.length) },
          { id: "high", labelIt: "Score alto (rischio)", value: String(bands.high) },
          { id: "mid", labelIt: "Score medio", value: String(bands.mid) },
          {
            id: "trend",
            labelIt: "Media score (ultima sett.)",
            value: last?.avgScore != null ? String(last.avgScore) : "—",
            hintIt: last?.weekStart
          }
        ];
      }
      case "competenze": {
        const items = await this.store.getSkillsGapReport(companyId);
        const gaps = items.filter((r) => r.gap > 0);
        const roles = new Set(gaps.map((g) => g.roleId));
        return [
          { id: "gaps", labelIt: "Gap rilevati", value: String(gaps.length) },
          { id: "roles", labelIt: "Ruoli coinvolti", value: String(roles.size) },
          {
            id: "top",
            labelIt: "Gap massimo",
            value: gaps.length ? String(Math.max(...gaps.map((g) => g.gap))) : "0"
          },
          { id: "rows", labelIt: "Righe report", value: String(items.length) }
        ];
      }
      case "operativo": {
        const [summary, headcount, pending] = await Promise.all([
          this.store.getHrDashboardSummary(),
          this.store.getHrRecapHeadcount(companyId),
          this.store.listApprovalsForUser(actorUserId, "pending")
        ]);
        return [
          { id: "pending", labelIt: "Approvazioni in coda", value: String(pending.length) },
          { id: "onb", labelIt: "In onboarding HR", value: String(headcount.hrOnboarding) },
          { id: "off", labelIt: "In offboarding", value: String(headcount.offboarding) },
          { id: "hc", labelIt: "Organico attivo", value: String(headcount.active) },
          { id: "exp", labelIt: "Spese in attesa", value: String(summary.pendingExpenseCount) }
        ];
      }
      default:
        return [];
    }
  }

  private async buildPayload(analysisId: string, companyId: string, actorUserId: string): Promise<Record<string, unknown>> {
    const now = new Date();
    switch (analysisId) {
      case "economico": {
        const [summary, analysis, breakdown, cockpit] = await Promise.all([
          this.store.getHrDashboardSummary(),
          this.store.getPersonnelBudgetAnalysis(companyId, now.getFullYear(), now.getMonth() + 1, 5, 500),
          this.store.payrollForecastCostBreakdown(companyId, 6),
          this.store.getWorkforceCockpit("base", 6)
        ]);
        const byCc = breakdown.byCostCenter.slice(0, 12).map((c) => ({
          label: c.label,
          headcount: c.headcount,
          monthlyTotalEur: c.monthlyTotalEur,
          monthlyRalMassEur: c.monthlyRalMassEur
        }));
        const topVariances = analysis.variances
          .filter((v) => v.exceedsThreshold)
          .slice(0, 8)
          .map((v) => ({
            category: v.category,
            varianceBf: v.varianceBf,
            variancePct: v.variancePct,
            exceedsThreshold: v.exceedsThreshold
          }));
        return {
          summary,
          budgetAnalysis: {
            year: analysis.year,
            month: analysis.month,
            totals: {
              actual: analysis.totals.actual.totalCompanyCost,
              budget: analysis.totals.budget.totalCompanyCost,
              forecast: analysis.totals.forecast.totalCompanyCost,
              varianceBf:
                (analysis.totals.actual.totalCompanyCost ?? 0) - (analysis.totals.budget.totalCompanyCost ?? 0),
              variancePct:
                analysis.totals.budget.totalCompanyCost && analysis.totals.budget.totalCompanyCost > 0
                  ? Math.round(
                      (((analysis.totals.actual.totalCompanyCost ?? 0) - analysis.totals.budget.totalCompanyCost) /
                        analysis.totals.budget.totalCompanyCost) *
                        1000
                    ) / 10
                  : null
            },
            topVariances
          },
          byCostCenter: byCc,
          forecastSeries: breakdown.series,
          workforceSeries: cockpit.series
        };
      }
      case "retention": {
        const [rawItems, trend, costCenters] = await Promise.all([
          this.store.getLatestTurnoverRetention(companyId),
          this.store.getTurnoverRetentionTrend(companyId, 8),
          this.store.listCostCentersForTurnoverFilter(companyId)
        ]);
        return turnoverAggregateForLlm(
          rawItems.map((r) => ({ score: r.score, costCenterId: r.costCenterId })),
          trend,
          "rule-v1",
          costCenters
        );
      }
      case "competenze": {
        const items = await this.store.getSkillsGapReport(companyId);
        const gapRows = items
          .filter((r) => r.gap > 0)
          .sort((a, b) => b.gap - a.gap)
          .slice(0, 20)
          .map((r) => ({
            roleName: r.roleName,
            skillName: r.skillName,
            gap: r.gap,
            headcountInRole: r.headcountInRole,
            minLevel: r.minLevel,
            avgUserLevel: r.avgUserLevel
          }));
        return { items: gapRows, itemCount: items.length, gapCount: gapRows.length };
      }
      case "operativo": {
        const [summary, headcount, pending, alerts, cycles] = await Promise.all([
          this.store.getHrDashboardSummary(),
          this.store.getHrRecapHeadcount(companyId),
          this.store.listApprovalsForUser(actorUserId, "pending"),
          this.store.listHrAlerts(companyId, "open"),
          this.store.getProcessCycleMetrics(companyId)
        ]);
        return {
          summary,
          headcount,
          pendingApprovalsCount: pending.length,
          pendingApprovalTypes: pending.reduce<Record<string, number>>((acc, a) => {
            const k = String(a.type ?? "other");
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
          }, {}),
          openAlertsCount: alerts.length,
          processCycles: cycles
        };
      }
      default:
        return {};
    }
  }
}
