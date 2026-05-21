import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthContext, AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { assertHebbUserMessageAllowed } from "../ai-hr/ai-hr-message-policy";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { isDeepenRequest, NexaPlatformAgentService } from "../ai-hr/nexa-platform-agent.service";
import { HrDataStore } from "../platform/hr-data.store";
import {
  applyHebbPageContextToRecord,
  normalizeHebbPageContext,
  type HebbPageContextDto
} from "../ai-hr/hebb-page-context";
import { NarrativeAnalyticsService } from "./narrative-analytics.service";
import {
  ADVANCED_ANALYSIS_PROFILES,
  insightFocusPromptHint,
  resolveAdvancedProfile,
  type AdvancedAnalysisId,
  type AnalyticsScopeFilters
} from "./advanced-analysis-profiles";

export type AnalyticsHubCard = {
  id: string;
  titleIt: string;
  blurbIt: string;
  href: string;
  topic: string;
  llmCapable: boolean;
  iconKey: string;
  accentKey: string;
};

export type AnalyticsKpi = {
  id: string;
  labelIt: string;
  value: string;
  hintIt?: string;
  chartType?: "line" | "bar";
};

export type AnalyticsKpiFilters = {
  costCenterId?: string;
  teamId?: string;
  yearMonth?: string;
};

export type StructuredAnalyticsInsight = {
  title: string;
  situazione: string;
  correlazioni: string[];
  rischi: string[];
  azioni7giorni: string[];
  raccomandazioniHr: string[];
  llmApplied: boolean;
  templateOnly: boolean;
};

const CORE_BASE = "/analytics";
const ADVANCED_BASE = "/analytics/advanced";

function hubCard(
  id: AdvancedAnalysisId,
  titleIt: string,
  blurbIt: string,
  href: string,
  topic: string
): AnalyticsHubCard {
  const profile = ADVANCED_ANALYSIS_PROFILES[id];
  return {
    id,
    titleIt,
    blurbIt,
    href,
    topic,
    llmCapable: true,
    iconKey: profile.iconKey,
    accentKey: profile.accentKey
  };
}

const ADVANCED_HUB_CARDS: AnalyticsHubCard[] = [
  hubCard(
    "economico",
    "Controllo economico workforce",
    "Leve CFO: budget vs actual vs forecast, driver di varianza per centro di costo e checkpoint controller.",
    `${ADVANCED_BASE}/economico`,
    "workforce_economic_control"
  ),
  hubCard(
    "retention",
    "Retention e flight risk",
    "Playbook colloqui su cluster a rischio, trend score e priorità per centro di costo — senza nominativi.",
    `${ADVANCED_BASE}/retention`,
    "retention_flight_risk"
  ),
  hubCard(
    "competenze",
    "Gap competenze",
    "Matrice hiring vs formazione per ruolo: gap skill, headcount coinvolto e priorità L&D.",
    `${ADVANCED_BASE}/competenze`,
    "skills_role_coverage"
  ),
  hubCard(
    "operativo",
    "Sintesi operativa HR",
    "Briefing giornaliero HRBP: approvazioni, onboarding/offboarding, alert e backlog spese da smaltire.",
    `${ADVANCED_BASE}/operativo`,
    "hr_operational_briefing"
  ),
  hubCard(
    "produttivita",
    "Produttività e assenteismo",
    "Ore, straordinari e assenze su aggregati; correlazioni indicative con retention e costo FTE.",
    `${ADVANCED_BASE}/produttivita`,
    "productivity_absenteeism"
  ),
  hubCard(
    "equita",
    "Equità retributiva interna",
    "Spread per ruolo e mediana globale: segnali disparità interna da validare con policy retributive.",
    `${ADVANCED_BASE}/equita-retributiva`,
    "internal_pay_equity"
  ),
  hubCard(
    "carico_manager",
    "Carico manager e colli di bottiglia",
    "Span of control, SLA approvazioni e cluster manager sovraccarichi — azioni di delega prioritizzate.",
    `${ADVANCED_BASE}/carico-manager`,
    "manager_load_bottlenecks"
  ),
  hubCard(
    "what_if",
    "Scenario what-if organico",
    "Confronto scenari base, crescita e freeze su headcount e costo — collegato al workforce planning.",
    `${ADVANCED_BASE}/what-if`,
    "workforce_what_if"
  )
];

/** Quattro analisi core mostrate nell'hub principale `/analytics`. */
const CORE_HUB_CARDS: AnalyticsHubCard[] = [
  hubCard(
    "economico",
    "Controllo economico workforce",
    "Leve CFO: budget vs actual vs forecast, driver di varianza per centro di costo e checkpoint controller.",
    `${CORE_BASE}/economico`,
    "workforce_economic_control"
  ),
  hubCard(
    "retention",
    "Retention e flight risk",
    "Playbook colloqui su cluster a rischio, trend score e priorità per centro di costo — senza nominativi.",
    `${CORE_BASE}/retention`,
    "retention_flight_risk"
  ),
  hubCard(
    "competenze",
    "Gap competenze",
    "Matrice hiring vs formazione per ruolo: gap skill, headcount coinvolto e priorità L&D.",
    `${CORE_BASE}/competenze`,
    "skills_role_coverage"
  ),
  hubCard(
    "operativo",
    "Sintesi operativa HR",
    "Briefing giornaliero HRBP: approvazioni, onboarding/offboarding, alert e backlog spese da smaltire.",
    `${CORE_BASE}/operativo`,
    "hr_operational_briefing"
  )
];

/** Quattro analisi solo avanzate (non duplicate nell'hub core). */
const ADVANCED_ONLY_HUB_CARDS: AnalyticsHubCard[] = ADVANCED_HUB_CARDS.slice(4);

/** Alias richiesti da HEBB AI for HR (chip budget / turnover / path legacy). */
const ANALYSIS_ID_ALIASES: Record<string, string> = {
  budget: "economico",
  turnover: "retention",
  equita_retributiva: "equita",
  "carico-manager": "carico_manager",
  whatif: "what_if"
};

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
    private readonly openAi: AiOpenAiRefinementService,
    private readonly platformAgent: NexaPlatformAgentService
  ) {}

  listHubCards(): AnalyticsHubCard[] {
    return [...CORE_HUB_CARDS];
  }

  listAdvancedHubCards(): AnalyticsHubCard[] {
    return [...ADVANCED_ONLY_HUB_CARDS];
  }

  listCoreHubCards(): AnalyticsHubCard[] {
    return [...CORE_HUB_CARDS];
  }

  resolveCard(analysisId: string): AnalyticsHubCard {
    const raw = analysisId.trim().toLowerCase().replace(/-/g, "_");
    const resolved = ANALYSIS_ID_ALIASES[raw] ?? raw;
    const card = ADVANCED_HUB_CARDS.find((c) => c.id === resolved);
    if (!card) {
      throw new ForbiddenException("Analisi non riconosciuta");
    }
    return card;
  }

  async companyIdForAuth(auth: AuthContext): Promise<string> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile");
    }
    return companyId;
  }

  async getAnalysisFilterOptions(auth: AuthContext): Promise<{
    costCenters: Array<{ id: string; label: string }>;
    teams: Array<{ id: string; label: string; costCenterId: string }>;
    defaultPeriod: string;
  }> {
    const companyId = await this.companyIdForAuth(auth);
    const opts = await this.store.listAnalyticsFilterOptions(companyId);
    return {
      ...opts,
      defaultPeriod: new Date().toISOString().slice(0, 7)
    };
  }

  async getAnalysisKpis(
    auth: AuthContext,
    analysisId: string,
    filters?: AnalyticsKpiFilters
  ): Promise<{ analysisId: string; kpis: AnalyticsKpi[] }> {
    const card = this.resolveCard(analysisId);
    const companyId = await this.companyIdForAuth(auth);
    const scope = this.scopeFromKpiFilters(filters);
    const kpis = await this.buildKpis(card.id, companyId, auth.userId, scope);
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
    options?: {
      useLlm?: boolean;
      pageContext?: HebbPageContextDto | null;
      insightFocus?: string;
    }
  ): Promise<StructuredAnalyticsInsight & { analysisId: string; llmActive: boolean }> {
    const card = this.resolveCard(analysisId);
    const profile = resolveAdvancedProfile(card.id);
    const companyId = await this.companyIdForAuth(auth);
    const scope = this.scopeFromOptions(options);
    const payload = await this.buildPayload(card.id, companyId, auth.userId, scope);
    const seed = this.buildStructuredSeed(card, payload, scope.insightFocus);
    let out: StructuredAnalyticsInsight = { ...seed, llmApplied: false, templateOnly: true };

    if (options?.useLlm === true && this.openAi.isActive()) {
      const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
      try {
        const focusHint = insightFocusPromptHint(scope.insightFocus);
        const envelope: Record<string, unknown> = {
          analysisId: card.id,
          topic: card.topic,
          facts: payload,
          insightSeed: seed,
          insightFocus: scope.insightFocus ?? null,
          analysisProfile: profile
            ? {
                llmPromptHint: profile.llmPromptHint,
                sectionLabels: profile.sectionLabels,
                focusHint: focusHint ?? null
              }
            : null
        };
        applyHebbPageContextToRecord(envelope, normalizeHebbPageContext(options?.pageContext));
        const envelopePayload = { envelope };
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
                raccomandazioniHr?: unknown;
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
              raccomandazioniHr: Array.isArray(env.raccomandazioniHr)
                ? env.raccomandazioniHr.filter((x): x is string => typeof x === "string").slice(0, 5)
                : seed.raccomandazioniHr,
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
    body: {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      pageContext?: HebbPageContextDto | null;
      deepen?: boolean;
      insightFocus?: string;
    }
  ): Promise<{ reply: string; llmApplied: boolean; llmActive: boolean }> {
    const card = this.resolveCard(analysisId);
    const companyId = await this.companyIdForAuth(auth);
    const message = body.message.trim().slice(0, 2000);
    if (!message) {
      throw new ForbiddenException("Messaggio vuoto");
    }
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === companyId);
    assertHebbUserMessageAllowed(message, companyUsers);
    const pageContext = normalizeHebbPageContext(body.pageContext);
    const scope = this.scopeFromPageContext(pageContext, body.insightFocus);
    const payload = await this.buildPayload(card.id, companyId, auth.userId, scope);
    const profile = resolveAdvancedProfile(card.id);
    const history = (body.history ?? [])
      .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-8)
      .map((t) => ({ role: t.role, content: t.content.trim().slice(0, 1500) }));
    for (const turn of history) {
      if (turn.role === "user") {
        assertHebbUserMessageAllowed(turn.content, companyUsers);
      }
    }

    const deepen = isDeepenRequest(message, body.deepen);
    let multiSourceFacts = null;
    if (deepen) {
      const ms = await this.platformAgent.buildMultiSourceFacts(
        { userId: auth.userId, role: auth.role as AuthRole },
        companyId,
        undefined,
        pageContext,
        { expand: true }
      );
      multiSourceFacts = ms.facts;
    }

    const draft = this.buildAnalystReplyDraft(card, message, payload, history, profile?.chatPersona);
    if (!this.openAi.isActive()) {
      return { reply: draft, llmApplied: false, llmActive: false };
    }

    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const envelope: Record<string, unknown> = {
        analysisId: card.id,
        topic: card.topic,
        facts: payload,
        message,
        history,
        replySeed: draft,
        deepenMode: deepen,
        analysisProfile: profile
          ? { llmPromptHint: profile.llmPromptHint, chatPersona: profile.chatPersona }
          : null
      };
      if (multiSourceFacts) {
        envelope.multiSourceFacts = multiSourceFacts;
      }
      applyHebbPageContextToRecord(envelope, pageContext);
      const envelopePayload = { envelope };
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

  private scopeFromKpiFilters(filters?: AnalyticsKpiFilters): AnalyticsScopeFilters {
    return {
      costCenterScope: filters?.costCenterId?.trim() || undefined,
      teamScope: filters?.teamId?.trim() || undefined,
      periodScope: filters?.yearMonth?.trim() || undefined
    };
  }

  private resolvePeriodFromScope(scope?: AnalyticsScopeFilters): { year: number; month: number; yearMonth: string } {
    const raw = scope?.periodScope?.trim();
    if (raw && /^\d{4}-\d{2}$/.test(raw)) {
      const [y, m] = raw.split("-").map(Number);
      if (m >= 1 && m <= 12) {
        return { year: y, month: m, yearMonth: raw };
      }
    }
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      yearMonth: now.toISOString().slice(0, 7)
    };
  }

  private scopeFromOptions(options?: {
    pageContext?: HebbPageContextDto | null;
    insightFocus?: string;
  }): AnalyticsScopeFilters {
    return this.scopeFromPageContext(normalizeHebbPageContext(options?.pageContext), options?.insightFocus);
  }

  private scopeFromPageContext(
    pageContext: ReturnType<typeof normalizeHebbPageContext>,
    insightFocus?: string
  ): AnalyticsScopeFilters {
    return {
      costCenterScope: pageContext?.costCenterScope,
      teamScope: pageContext?.teamScope,
      periodScope: pageContext?.periodScope,
      insightFocus: insightFocus?.trim() || undefined
    };
  }

  private buildStructuredSeed(
    card: AnalyticsHubCard,
    payload: Record<string, unknown>,
    insightFocus?: string
  ): StructuredAnalyticsInsight {
    const narrativeTopic = card.topic;
    const tpl = this.narrativeSeedFromPayload(narrativeTopic, payload, insightFocus);
    const seedExtras = this.analysisSpecificSeedExtras(card.id, payload, insightFocus);
    return {
      title: tpl.title,
      situazione: tpl.summary,
      correlazioni: tpl.bullets.slice(0, 4),
      rischi: seedExtras.rischi,
      azioni7giorni: seedExtras.azioni7giorni,
      raccomandazioniHr: seedExtras.raccomandazioniHr,
      llmApplied: false,
      templateOnly: true
    };
  }

  private analysisSpecificSeedExtras(
    analysisId: string,
    payload: Record<string, unknown>,
    insightFocus?: string
  ): Pick<StructuredAnalyticsInsight, "rischi" | "azioni7giorni" | "raccomandazioniHr"> {
    const focus = insightFocus?.trim();
    const baseDisclaimer = [
      "Verificare i dati in app prima di decisioni su singole persone.",
      "I segnali AI non sostituiscono controlli formali payroll o legali."
    ];
    switch (analysisId) {
      case "economico": {
        const varPct = (payload.budgetAnalysis as { totals?: { variancePct?: number | null } } | undefined)?.totals
          ?.variancePct;
        return {
          rischi: [
            varPct != null && Math.abs(varPct) > 5
              ? `Varianza budget ${varPct}% oltre soglia operativa — rischio sforamento massa costo.`
              : "Monitorare centri di costo con varianza oltre soglia nel mese corrente.",
            "Forecast non allineato al consuntivo può distorcere pianificazione trimestrale.",
            ...baseDisclaimer.slice(0, 1)
          ],
          azioni7giorni: focus === "actions_this_week"
            ? [
                "Condividere varianze CC con controller entro mercoledì.",
                "Validare driver di varianza sulle categorie oltre soglia.",
                "Allineare forecast mese con HRBP entro venerdì.",
                "Pianificare checkpoint budget con CFO la prossima settimana.",
                "Documentare ipotesi di rettifica forecast."
              ]
            : [
                "Aprire analisi budget personale e filtrare per centro di costo prioritario.",
                "Confrontare actual vs budget vs forecast sul mese corrente.",
                "Escalation varianze oltre soglia al controller HR.",
                "Allineare HRBP sui CC con maggiore scostamento.",
                "Aggiornare forecast se necessario entro 7 giorni."
              ],
          raccomandazioniHr: [
            "Governance mensile budget personale con controller e HRBP.",
            "Documentare leve di rettifica (FTE, straordinari, benefit) prima di comunicazioni.",
            "Non usare insight AI per decisioni su singole persone."
          ]
        };
      }
      case "retention": {
        const bands = payload.scoreBands as { high?: number; mid?: number } | undefined;
        return {
          rischi: [
            `${bands?.high ?? 0} profili ad alto score flight risk (aggregato).`,
            `${bands?.mid ?? 0} profili a rischio medio da monitorare con colloqui mirati.`,
            "Trend score in peggioramento su cluster CC senza piano retention."
          ],
          azioni7giorni: [
            "Pianificare stay interview su cluster a score medio-alto (solo aggregati).",
            "Allineare manager su segnali assenze/tenure correlati al cluster.",
            "Prioritizzare HRBP sui CC con media score più elevata.",
            "Documentare playbook colloqui prima di outreach ai team.",
            "Checkpoint retention tra 7 giorni su KPI score e trend."
          ],
          raccomandazioniHr: [
            "Playbook colloqui retention con domande standard e owner HRBP.",
            "Non condividere score individuali via canali non sicuri.",
            "Validare segnali con dati qualitativi prima di azioni disciplinari."
          ]
        };
      }
      case "competenze": {
        const gapCount = Number(payload.gapCount ?? 0);
        return {
          rischi: [
            `${gapCount} gap skill rilevati — rischio copertura ruoli critici.`,
            "Gap non coperti possono rallentare delivery e aumentare costo hiring.",
            ...baseDisclaimer.slice(0, 1)
          ],
          azioni7giorni: [
            "Priorizzare top 5 gap per ruolo con maggiore headcount.",
            "Distinguere hiring vs piano formazione per ciascun gap prioritario.",
            "Allineare recruiting su ruoli con gap massimo.",
            "Pianificare sessioni L&D su skill transversali critiche.",
            "Review copertura competenze con HRBP entro 7 giorni."
          ],
          raccomandazioniHr: [
            "Matrice hiring vs formazione con owner e timeline.",
            "Allineare fabbisogno ruolo in anagrafica prima di campagne recruiting.",
            "Monitorare chiusura gap trimestralmente."
          ]
        };
      }
      case "operativo": {
        const pending = Number(payload.pendingApprovalsCount ?? 0);
        return {
          rischi: [
            `${pending} approvazioni in coda — rischio SLA interni.`,
            "Backlog onboarding/offboarding può impattare employee experience.",
            "Alert HR aperti non gestiti aumentano rischio operativo."
          ],
          azioni7giorni: [
            "Smaltire approvazioni pendenti per tipo (ferie, spese, altro).",
            "Briefing HRBP giornaliero su onboarding/offboarding attivi.",
            "Escalation alert aperti oltre soglia interna.",
            "Allineare manager su backlog spese in attesa.",
            "Checkpoint operativo tra 7 giorni con HR operations."
          ],
          raccomandazioniHr: [
            "Runbook operativo HR con SLA approvazioni per tipo.",
            "Dashboard condivisa con HRBP e manager su backlog.",
            "Automatizzare reminder su approvazioni in ritardo."
          ]
        };
      }
      case "produttivita": {
        const agg = payload.productivity as { absenceDaysMonth?: number; overtimeHoursMonth?: number } | undefined;
        return {
          rischi: [
            `${agg?.absenceDaysMonth ?? 0} giorni assenza mese (aggregato) — monitorare hotspot.`,
            `${agg?.overtimeHoursMonth ?? 0} ore straordinario mese — rischio burnout/costo.`,
            "Correlazione assenze/straordinari con flight risk se presente in facts."
          ],
          azioni7giorni: [
            "Identificare CC con assenze/straordinari fuori media.",
            "Allineare manager su pattern presenze anomali (aggregati).",
            "Verificare policy smartworking vs dati ore lavorate.",
            "Checkpoint benessere/produttività con HRBP.",
            "Monitorare trend assenze prossima settimana."
          ],
          raccomandazioniHr: [
            "Policy presenze chiara con soglie di escalation manager.",
            "Non usare segnali AI per diagnosi mediche o disciplinari.",
            "Correlare con retention solo a livello aggregato."
          ]
        };
      }
      case "equita": {
        const equity = payload.equity as { spreadRatioHighLow?: number | null; rolesAnalyzed?: number } | undefined;
        return {
          rischi: [
            equity?.spreadRatioHighLow != null
              ? `Rapporto max/min globale ${equity.spreadRatioHighLow} — segnale disparità da validare.`
              : "Spread retributivo da verificare per ruolo.",
            `${equity?.rolesAnalyzed ?? 0} ruoli analizzati — possibili bande fuori policy.`,
            "Comunicazioni retributive senza audit equità aumentano rischio percepito."
          ],
          azioni7giorni: [
            "Audit spread per ruolo vs mediana globale.",
            "Validare ruoli con spread massimo con compensation policy.",
            "Documentare eccezioni retributive approvate.",
            "Allineare HRBP prima di revisioni bande.",
            "Checkpoint equità con HR controller entro 7 giorni."
          ],
          raccomandazioniHr: [
            "Audit equità retributiva periodico con documentazione policy.",
            "Nessuna indicazione legale vincolante da insight AI.",
            "Comunicare limiti analisi ai manager."
          ]
        };
      }
      case "carico_manager": {
        const load = payload.managerLoad as { pendingApprovalsTotal?: number; topLoad?: Array<{ loadScore?: number }> } | undefined;
        return {
          rischi: [
            `${load?.pendingApprovalsTotal ?? 0} approvazioni in coda a livello aziendale.`,
            "Cluster manager con load score elevato — rischio SLA approvazioni.",
            "Span of control eccessivo su cluster top load."
          ],
          azioni7giorni: focus === "approval_sla"
            ? [
                "Definire SLA approvazioni per cluster manager sovraccarichi.",
                "Delegare approvazioni di secondo livello dove possibile.",
                "Escalation backlog > soglia interna entro 48h.",
                "Review span of control su top 3 cluster load.",
                "Checkpoint carico manager tra 7 giorni."
              ]
            : [
                "Identificare cluster manager con maggior carico (aggregati).",
                "Pianificare delega approvazioni su backlog pendente.",
                "Allineare HR operations su SLA approvazioni.",
                "Review organizzazione span of control.",
                "Monitorare code approvazioni prossima settimana."
              ],
          raccomandazioniHr: [
            "SLA approvazioni documentati per tipo e livello manager.",
            "Programma riduzione carico su cluster critici.",
            "Non esporre nominativi manager in comunicazioni generiche."
          ]
        };
      }
      case "what_if": {
        const scenarios = Array.isArray(payload.scenarioCompare) ? payload.scenarioCompare : [];
        const growth = scenarios.find((s) => (s as { scenario?: string }).scenario === "growth") as
          | { lastMonthCostEur?: number | null }
          | undefined;
        return {
          rischi: [
            "Scenario crescita può aumentare massa costo vs base.",
            "Scenario freeze può impattare capacity operativa.",
            "Decisioni what-if senza allineamento CdA/HR rischiano incoerenza budget."
          ],
          azioni7giorni: [
            "Confrontare scenari base/growth/freeze su costo ultimo mese.",
            "Documentare assunzioni FTE per scenario crescita.",
            "Allineare workforce planning con controller.",
            "Simulare impatto freeze su headcount critico.",
            "Checkpoint scenario con HRBP entro 7 giorni."
          ],
          raccomandazioniHr: [
            "Collegare scenari al modulo workforce planning.",
            growth?.lastMonthCostEur != null
              ? `Ultimo mese scenario crescita: ${eur(Number(growth.lastMonthCostEur))} — validare in cockpit.`
              : "Validare costi scenario in workforce cockpit.",
            "Documentare ipotesi prima di comunicazioni organizzative."
          ]
        };
      }
      default:
        return {
          rischi: baseDisclaimer,
          azioni7giorni: [
            "Aprire la pagina analisi dedicata e validare i KPI con HR controller.",
            "Allineare manager sui cluster a rischio più elevato (solo aggregati).",
            "Pianificare un checkpoint entro 7 giorni su varianze o gap prioritari."
          ],
          raccomandazioniHr: [
            "Condividere la sintesi con HRBP e controller prima di comunicazioni ai team.",
            "Documentare le ipotesi usate per eventuali scenari what-if o varianze budget."
          ]
        };
    }
  }

  private narrativeSeedFromPayload(
    topic: string,
    payload: Record<string, unknown>,
    insightFocus?: string
  ): { title: string; bullets: string[]; summary: string } {
    const focusNote =
      insightFocus === "quarter_compare"
        ? " Confronto trimestre corrente vs precedente sui KPI disponibili."
        : insightFocus === "top_risks"
          ? " Focus sui 3 rischi operativi prioritari."
          : insightFocus === "actions_this_week"
            ? " Azioni concrete per questa settimana."
            : "";

    if (topic === "workforce_economic_control") {
      const budget = payload.budgetAnalysis as {
        totals?: { variancePct?: number | null; actual?: number; budget?: number; forecast?: number };
        topVariances?: Array<{ category?: string; variancePct?: number | null }>;
      } | undefined;
      const topVar = budget?.topVariances?.[0];
      return {
        title: "Controllo economico workforce",
        bullets: [
          budget?.totals?.variancePct != null
            ? `Varianza budget/actual: ${budget.totals.variancePct}% (periodo corrente).`
            : "Varianza budget non disponibile.",
          budget?.totals?.actual != null ? `Actual: ${eur(Number(budget.totals.actual))}.` : "",
          budget?.totals?.forecast != null ? `Forecast: ${eur(Number(budget.totals.forecast))}.` : "",
          topVar?.category ? `Driver varianza: ${topVar.category} (${topVar.variancePct ?? "n/d"}%).` : ""
        ].filter(Boolean),
        summary:
          `Leve CFO su budget vs actual vs forecast per centro di costo.${focusNote} Validare varianze oltre soglia con controller HR.`
      };
    }

    if (topic === "retention_flight_risk" || topic === "turnover_insights_deep") {
      const bands = payload.scoreBands as { low?: number; mid?: number; high?: number } | undefined;
      return {
        title: "Retention e flight risk",
        bullets: [
          `Profili ad alto score: ${bands?.high ?? 0} (aggregato).`,
          `Profili a medio rischio: ${bands?.mid ?? 0}.`,
          `Campione analizzato: ${payload.itemsCount ?? "n/d"} profili.`
        ],
        summary:
          `Playbook colloqui su cluster a score medio-alto; priorità per centro di costo.${focusNote} Nessun nominativo nel modello.`
      };
    }

    if (topic === "skills_role_coverage" || topic === "skills_gap") {
      const count = Number(payload.gapCount ?? payload.itemCount ?? 0);
      const items = Array.isArray(payload.items) ? payload.items : [];
      const top = items[0] as { roleName?: string; skillName?: string; gap?: number } | undefined;
      return {
        title: "Gap competenze vs fabbisogno",
        bullets: [
          `Gap rilevati: ${count}.`,
          top?.roleName ? `Priorità: ${top.roleName} · ${top.skillName ?? "skill"} (gap ${top.gap ?? "n/d"}).` : "",
          "Matrice hiring vs formazione da validare con HRBP."
        ].filter(Boolean),
        summary: `Copertura competenze per ruolo: hiring vs L&D.${focusNote}`
      };
    }

    if (topic === "hr_operational_briefing") {
      const summary = payload.summary as { pendingExpenseCount?: number } | undefined;
      const pending = Number(payload.pendingApprovalsCount ?? 0);
      const headcount = payload.headcount as { active?: number; hrOnboarding?: number; offboarding?: number } | undefined;
      return {
        title: "Sintesi operativa HR",
        bullets: [
          `Approvazioni in coda: ${pending}.`,
          headcount?.hrOnboarding != null ? `In onboarding: ${headcount.hrOnboarding}.` : "",
          headcount?.offboarding != null ? `In offboarding: ${headcount.offboarding}.` : "",
          summary?.pendingExpenseCount != null ? `Spese in attesa: ${summary.pendingExpenseCount}.` : ""
        ].filter(Boolean),
        summary: `Briefing operativo giornaliero HRBP: backlog e lifecycle.${focusNote}`
      };
    }

    if (topic === "productivity_absenteeism") {
      const agg = payload.productivity as {
        absenceDaysMonth?: number;
        overtimeHoursMonth?: number;
        avgMinutesWorkedPerDay?: number | null;
      } | undefined;
      return {
        title: "Produttività e assenteismo",
        bullets: [
          agg?.absenceDaysMonth != null ? `Giorni assenza mese: ${agg.absenceDaysMonth}.` : "",
          agg?.overtimeHoursMonth != null ? `Straordinari (h): ${agg.overtimeHoursMonth}.` : "",
          agg?.avgMinutesWorkedPerDay != null ? `Media minuti/giorno: ${agg.avgMinutesWorkedPerDay}.` : "",
          payload.turnoverHighRiskCount != null
            ? `Profili flight risk alto (correlazione): ${payload.turnoverHighRiskCount}.`
            : ""
        ].filter(Boolean),
        summary: `Ore, assenze e straordinari su aggregati per CC.${focusNote}`
      };
    }

    if (topic === "internal_pay_equity") {
      const equity = payload.equity as {
        spreadRatioHighLow?: number | null;
        globalMedianMonthlyEur?: number | null;
        byRole?: Array<{ roleName?: string; spreadPct?: number | null }>;
      } | undefined;
      const top = equity?.byRole?.[0];
      return {
        title: "Equità retributiva interna",
        bullets: [
          equity?.globalMedianMonthlyEur != null
            ? `Mediana globale: ${eur(Number(equity.globalMedianMonthlyEur))}/mese.`
            : "",
          equity?.spreadRatioHighLow != null ? `Rapporto max/min: ${equity.spreadRatioHighLow}.` : "",
          top?.roleName ? `Spread max ruolo: ${top.roleName} (${top.spreadPct ?? "n/d"}%).` : ""
        ].filter(Boolean),
        summary: `Segnali disparità interna da validare con policy retributive.${focusNote}`
      };
    }

    if (topic === "manager_load_bottlenecks") {
      const load = payload.managerLoad as {
        pendingApprovalsTotal?: number;
        medianReportsPerManager?: number | null;
        topLoad?: Array<{ directReports?: number; pendingApprovals?: number; loadScore?: number }>;
      } | undefined;
      const top = load?.topLoad?.[0];
      return {
        title: "Carico manager e SLA approvazioni",
        bullets: [
          load?.pendingApprovalsTotal != null ? `Approvazioni in coda: ${load.pendingApprovalsTotal}.` : "",
          load?.medianReportsPerManager != null ? `Mediana report/manager: ${load.medianReportsPerManager}.` : "",
          top
            ? `Cluster max load: ${top.directReports ?? "n/d"} report, ${top.pendingApprovals ?? 0} approvazioni (score ${top.loadScore ?? "n/d"}).`
            : ""
        ].filter(Boolean),
        summary: `Span of control e colli di bottiglia approvazioni.${focusNote}`
      };
    }

    if (topic === "workforce_what_if") {
      const scenarios = Array.isArray(payload.scenarioCompare)
        ? (payload.scenarioCompare as Array<{ scenario?: string; headcount?: number; lastMonthCostEur?: number | null }>)
        : [];
      const base = scenarios.find((s) => s.scenario === "base");
      const growth = scenarios.find((s) => s.scenario === "growth");
      return {
        title: "Scenario what-if organico",
        bullets: [
          base?.headcount != null ? `Headcount base: ${base.headcount}.` : "",
          growth?.lastMonthCostEur != null ? `Costo ultimo mese (crescita): ${eur(Number(growth.lastMonthCostEur))}.` : "",
          scenarios.find((s) => s.scenario === "freeze")?.lastMonthCostEur != null
            ? `Costo ultimo mese (freeze): ${eur(Number(scenarios.find((s) => s.scenario === "freeze")!.lastMonthCostEur))}.`
            : ""
        ].filter(Boolean),
        summary: `Confronto scenari base, crescita e freeze su headcount e costo.${focusNote}`
      };
    }

    const summary = payload.summary as { headcount?: number; budgetEur?: number; pendingExpenseCount?: number } | undefined;
    return {
      title: "Sintesi analytics",
      bullets: [
        summary?.headcount != null ? `Headcount: ${summary.headcount}.` : "",
        summary?.budgetEur != null ? `Budget indicativo: ${eur(summary.budgetEur)}.` : ""
      ].filter(Boolean),
      summary: `Snapshot aggregato perimetro HR.${focusNote}`
    };
  }

  private buildAnalystReplyDraft(
    card: AnalyticsHubCard,
    message: string,
    payload: Record<string, unknown>,
    history: Array<{ role: string; content: string }>,
    chatPersona?: string
  ): string {
    const histNote = history.length ? ` (contesto: ${history.length} messaggi precedenti)` : "";
    const persona = chatPersona ? ` Come ${chatPersona},` : "";
    return (
      `Analisi «${card.titleIt}»${histNote}:${persona} ho ricevuto la tua domanda «${message.slice(0, 120)}». ` +
      `I dati disponibili coprono ${Object.keys(payload).length} blocchi aggregati (nessun nominativo). ` +
      "Per approfondire, usa i chip insight o «Genera insight AI»; se OpenAI non è attivo, attivalo dalle impostazioni aziendali."
    );
  }

  private productivityFilters(scope?: AnalyticsScopeFilters): {
    costCenterId?: string;
    teamId?: string;
    yearMonth?: string;
  } {
    return {
      costCenterId: scope?.costCenterScope,
      teamId: scope?.teamScope,
      yearMonth: scope?.periodScope
    };
  }

  private async buildKpis(
    analysisId: string,
    companyId: string,
    actorUserId: string,
    scope?: AnalyticsScopeFilters
  ): Promise<AnalyticsKpi[]> {
    switch (analysisId) {
      case "economico": {
        const period = this.resolvePeriodFromScope(scope);
        const analysis = await this.store.getPersonnelBudgetAnalysis(
          companyId,
          period.year,
          period.month,
          5,
          500
        );
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
            hintIt: period.yearMonth,
            chartType: "line"
          },
          { id: "budget", labelIt: "Budget mese", value: eur(bud), chartType: "line" },
          { id: "forecast", labelIt: "Forecast mese", value: eur(fct), chartType: "line" },
          {
            id: "variance",
            labelIt: "Varianza vs budget",
            value: varPct != null ? `${varPct > 0 ? "+" : ""}${varPct}%` : "—",
            chartType: "bar"
          },
          {
            id: "cc",
            labelIt: "Centri di costo",
            value: String(breakdown.byCostCenter.length),
            hintIt: "Nel breakdown forecast",
            chartType: "bar"
          }
        ];
      }
      case "retention": {
        const items = await this.store.getLatestTurnoverRetention(companyId, scope?.costCenterScope);
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
          { id: "sample", labelIt: "Profili analizzati", value: String(agg.itemsCount ?? items.length), chartType: "line" },
          { id: "high", labelIt: "Score alto (rischio)", value: String(bands.high), chartType: "bar" },
          { id: "mid", labelIt: "Score medio", value: String(bands.mid), chartType: "bar" },
          {
            id: "trend",
            labelIt: "Media score (ultima sett.)",
            value: last?.avgScore != null ? String(last.avgScore) : "—",
            hintIt: last?.weekStart,
            chartType: "line"
          }
        ];
      }
      case "competenze": {
        const items = await this.store.getSkillsGapReport(companyId);
        const gaps = items.filter((r) => r.gap > 0);
        const roles = new Set(gaps.map((g) => g.roleId));
        return [
          { id: "gaps", labelIt: "Gap rilevati", value: String(gaps.length), chartType: "bar" },
          { id: "roles", labelIt: "Ruoli coinvolti", value: String(roles.size), chartType: "line" },
          {
            id: "top",
            labelIt: "Gap massimo",
            value: gaps.length ? String(Math.max(...gaps.map((g) => g.gap))) : "0",
            chartType: "bar"
          },
          { id: "rows", labelIt: "Righe report", value: String(items.length), chartType: "line" }
        ];
      }
      case "operativo": {
        const [summary, headcount, pending] = await Promise.all([
          this.store.getHrDashboardSummary(),
          this.store.getHrRecapHeadcount(companyId),
          this.store.listApprovalsForUser(actorUserId, "pending")
        ]);
        return [
          { id: "pending", labelIt: "Approvazioni in coda", value: String(pending.length), chartType: "bar" },
          { id: "onb", labelIt: "In onboarding HR", value: String(headcount.hrOnboarding), chartType: "line" },
          { id: "off", labelIt: "In offboarding", value: String(headcount.offboarding), chartType: "line" },
          { id: "hc", labelIt: "Organico attivo", value: String(headcount.active), chartType: "line" },
          { id: "exp", labelIt: "Spese in attesa", value: String(summary.pendingExpenseCount), chartType: "bar" }
        ];
      }
      case "produttivita": {
        const agg = await this.store.getProductivityAbsenteeismAggregate(companyId, this.productivityFilters(scope));
        return [
          { id: "hc", labelIt: "Headcount", value: String(agg.headcount), chartType: "line" },
          {
            id: "avgMin",
            labelIt: "Media minuti/giorno",
            value: agg.avgMinutesWorkedPerDay != null ? String(agg.avgMinutesWorkedPerDay) : "—",
            chartType: "line"
          },
          { id: "ot", labelIt: "Straordinari (h mese)", value: String(agg.overtimeHoursMonth), chartType: "bar" },
          { id: "abs", labelIt: "Giorni assenza mese", value: String(agg.absenceDaysMonth), chartType: "bar" },
          { id: "sw", labelIt: "Giorni smartworking", value: String(agg.smartworkingDaysMonth), chartType: "line" }
        ];
      }
      case "equita": {
        const agg = await this.store.getInternalPayEquityAggregate(companyId);
        const top = agg.byRole[0];
        return [
          { id: "hc", labelIt: "Headcount", value: String(agg.headcount), chartType: "line" },
          { id: "roles", labelIt: "Ruoli analizzati", value: String(agg.rolesAnalyzed), chartType: "bar" },
          {
            id: "median",
            labelIt: "Mediana globale mensile",
            value: agg.globalMedianMonthlyEur != null ? eur(agg.globalMedianMonthlyEur) : "—",
            chartType: "line"
          },
          {
            id: "spread",
            labelIt: "Rapporto max/min globale",
            value: agg.spreadRatioHighLow != null ? String(agg.spreadRatioHighLow) : "—",
            chartType: "bar"
          },
          {
            id: "topRole",
            labelIt: "Spread max ruolo",
            value: top?.spreadPct != null ? `${top.spreadPct}%` : "—",
            hintIt: top?.roleName,
            chartType: "bar"
          }
        ];
      }
      case "carico_manager": {
        const agg = await this.store.getManagerLoadAggregate(companyId);
        const top = agg.topLoad[0];
        return [
          { id: "mgr", labelIt: "Manager con team", value: String(agg.managersCount), chartType: "line" },
          { id: "reports", labelIt: "Report diretti totali", value: String(agg.totalDirectReports), chartType: "line" },
          { id: "pend", labelIt: "Approvazioni in coda", value: String(agg.pendingApprovalsTotal), chartType: "bar" },
          {
            id: "median",
            labelIt: "Mediana report/manager",
            value: agg.medianReportsPerManager != null ? String(agg.medianReportsPerManager) : "—",
            chartType: "line"
          },
          {
            id: "top",
            labelIt: "Carico max cluster",
            value: top ? String(top.loadScore) : "—",
            hintIt: top ? `${top.directReports} report, ${top.pendingApprovals} approvazioni` : undefined,
            chartType: "bar"
          }
        ];
      }
      case "what_if": {
        const [base, growth, freeze] = await Promise.all([
          this.store.getWorkforceCockpit("base", 6),
          this.store.getWorkforceCockpit("growth", 6),
          this.store.getWorkforceCockpit("freeze", 6)
        ]);
        const lastBase = base.series.length ? base.series[base.series.length - 1]!.costEur : 0;
        const lastGrowth = growth.series.length ? growth.series[growth.series.length - 1]!.costEur : 0;
        const deltaPct =
          lastBase > 0 ? Math.round(((lastGrowth - lastBase) / lastBase) * 1000) / 10 : null;
        return [
          { id: "hc", labelIt: "Headcount base", value: String(base.summary.headcount), chartType: "line" },
          {
            id: "mass",
            labelIt: "Massa mensile base",
            value: eur(base.summary.monthlyPayrollMassEur),
            chartType: "line"
          },
          {
            id: "growth",
            labelIt: "Costo ultimo mese (crescita)",
            value: eur(lastGrowth),
            hintIt: deltaPct != null ? `Δ vs base ${deltaPct > 0 ? "+" : ""}${deltaPct}%` : undefined,
            chartType: "line"
          },
          {
            id: "freeze",
            labelIt: "Costo ultimo mese (freeze)",
            value: freeze.series.length ? eur(freeze.series[freeze.series.length - 1]!.costEur) : "—",
            chartType: "line"
          },
          { id: "exp", labelIt: "Spese in attesa", value: String(base.summary.pendingExpenseCount), chartType: "bar" }
        ];
      }
      default:
        return [];
    }
  }

  private async buildPayload(
    analysisId: string,
    companyId: string,
    actorUserId: string,
    scope?: AnalyticsScopeFilters
  ): Promise<Record<string, unknown>> {
    const scopeMeta = {
      costCenterScope: scope?.costCenterScope ?? null,
      teamScope: scope?.teamScope ?? null,
      periodScope: scope?.periodScope ?? null,
      insightFocus: scope?.insightFocus ?? null
    };
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
          byCostCenter: scope?.costCenterScope
            ? byCc.filter((c) => c.label.toLowerCase().includes(scope.costCenterScope!.toLowerCase()))
            : byCc,
          forecastSeries: breakdown.series,
          workforceSeries: cockpit.series,
          scope: scopeMeta
        };
      }
      case "retention": {
        const ccFilter = scope?.costCenterScope?.trim() || undefined;
        const [rawItems, trend, costCenters] = await Promise.all([
          this.store.getLatestTurnoverRetention(companyId, ccFilter),
          this.store.getTurnoverRetentionTrend(companyId, 8),
          this.store.listCostCentersForTurnoverFilter(companyId)
        ]);
        return {
          ...turnoverAggregateForLlm(
            rawItems.map((r) => ({ score: r.score, costCenterId: r.costCenterId })),
            trend,
            "rule-v1",
            costCenters
          ),
          scope: scopeMeta
        };
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
        return { items: gapRows, itemCount: items.length, gapCount: gapRows.length, scope: scopeMeta };
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
          processCycles: cycles,
          scope: scopeMeta
        };
      }
      case "produttivita": {
        const agg = await this.store.getProductivityAbsenteeismAggregate(companyId, this.productivityFilters(scope));
        const retention = await this.store.getLatestTurnoverRetention(companyId, scope?.costCenterScope);
        const highRisk = retention.filter((r) => r.score >= 67).length;
        return {
          productivity: agg,
          turnoverHighRiskCount: highRisk,
          period: scope?.periodScope ?? new Date().toISOString().slice(0, 7),
          scope: scopeMeta
        };
      }
      case "equita": {
        const equity = await this.store.getInternalPayEquityAggregate(companyId);
        const breakdown = await this.store.payrollForecastCostBreakdown(companyId, 3);
        return {
          equity,
          byCostCenterPayroll: breakdown.byCostCenter.slice(0, 10).map((c) => ({
            label: c.label,
            headcount: c.headcount,
            monthlyRalMassEur: c.monthlyRalMassEur
          })),
          scope: scopeMeta
        };
      }
      case "carico_manager": {
        const [load, cycles, companyPending] = await Promise.all([
          this.store.getManagerLoadAggregate(companyId),
          this.store.getProcessCycleMetrics(companyId),
          this.store.listCompanyPendingApprovalViewsForHrDashboard(companyId)
        ]);
        return {
          managerLoad: load,
          processCycles: cycles,
          pendingApprovalsSampleSize: companyPending.length,
          scope: scopeMeta
        };
      }
      case "what_if": {
        const [base, growth, freeze, breakdown] = await Promise.all([
          this.store.getWorkforceCockpit("base", 6),
          this.store.getWorkforceCockpit("growth", 6),
          this.store.getWorkforceCockpit("freeze", 6),
          this.store.payrollForecastCostBreakdown(companyId, 6)
        ]);
        const scenarioCompare = ["base", "growth", "freeze"].map((name, i) => {
          const cock = [base, growth, freeze][i]!;
          const last = cock.series.length ? cock.series[cock.series.length - 1] : undefined;
          return {
            scenario: name,
            headcount: cock.summary.headcount,
            monthlyPayrollMassEur: cock.summary.monthlyPayrollMassEur,
            lastMonthCostEur: last?.costEur ?? null,
            lastMonthLabel: last?.month
          };
        });
        return {
          scenarioCompare,
          baseSeries: base.series,
          growthSeries: growth.series,
          freezeSeries: freeze.series,
          byCostCenter: breakdown.byCostCenter.slice(0, 8),
          scope: scopeMeta
        };
      }
      default:
        return { scope: scopeMeta };
    }
  }
}
