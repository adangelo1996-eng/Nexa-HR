import { Injectable } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { HrDataStore } from "../platform/hr-data.store";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { assertHebbUserMessageAllowed } from "../ai-hr/ai-hr-message-policy";
import { HITL_PROPOSAL_KIND_CATALOG, hitlProposalKindIds } from "./hitl-proposal-kinds";
import { resolveAdvancedProfile } from "./advanced-analysis-profiles";

export interface NarrativeAnalyticsRequest {
  topic: string;
  payload: Record<string, unknown>;
  useLlm?: boolean;
}

export interface NarrativeAnalyticsResponse {
  title: string;
  bullets: string[];
  summary: string;
  llmApplied: boolean;
  templateOnly: boolean;
}

export interface HitlProposalDraftResponse {
  kind: string;
  title: string;
  rationale: string;
  checklist: string[];
  llmApplied: boolean;
}

@Injectable()
export class NarrativeAnalyticsService {
  constructor(
    private readonly store: HrDataStore,
    private readonly audit: AiAuditService,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly gateway: AiPrivacyGateway
  ) {}

  async generate(auth: AuthContext, body: NarrativeAnalyticsRequest): Promise<NarrativeAnalyticsResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || "synapse-default";
    const topic = body.topic.trim().slice(0, 80);
    const seed = this.buildTemplate(topic, body.payload);
    let title = seed.title;
    let bullets = [...seed.bullets];
    let summary = seed.summary;
    let llmApplied = false;

    const refineSchema =
      topic === "workforce_economic_control" ||
      topic === "retention_flight_risk" ||
      topic === "skills_role_coverage" ||
      topic === "hr_operational_briefing" ||
      topic === "productivity_absenteeism" ||
      topic === "internal_pay_equity" ||
      topic === "manager_load_bottlenecks" ||
      topic === "workforce_what_if"
        ? "ai_advanced_analytics_v1"
        : topic === "turnover_insights_deep"
        ? "ai_turnover_insights_deep_v1"
        : topic === "process_bottlenecks"
          ? "ai_process_bottlenecks_v1"
          : topic === "compensation_bench"
            ? "ai_compensation_bench_v1"
            : topic === "attendance_payroll_anomalies"
              ? "ai_attendance_payroll_anomalies_v1"
              : "ai_narrative_aggregate_v1";

    if (body.useLlm === true && this.openAi.isActive()) {
      const sessionId = (await this.gateway.beginSession(companyId, auth.userId)).sessionId;
      try {
        const envelopePayload = {
          envelope: {
            facts: body.payload,
            narrativeSeed: seed,
            topic,
            analysisProfile: resolveAdvancedProfile(
              topic === "workforce_economic_control"
                ? "economico"
                : topic === "retention_flight_risk"
                  ? "retention"
                  : topic === "skills_role_coverage"
                    ? "competenze"
                    : topic === "hr_operational_briefing"
                      ? "operativo"
                      : topic === "productivity_absenteeism"
                        ? "produttivita"
                        : topic === "internal_pay_equity"
                          ? "equita"
                          : topic === "manager_load_bottlenecks"
                            ? "carico_manager"
                            : topic === "workforce_what_if"
                              ? "what_if"
                              : ""
            )
          }
        };
        const pseudo = await this.gateway.toModelPayload(sessionId, envelopePayload, refineSchema);
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, refineSchema);
        if (refined.ok && refined.data && typeof refined.data === "object") {
          const env = (refined.data as { envelope?: { title?: string; bullets?: unknown; summary?: string } }).envelope;
          if (env?.title && env?.summary) {
            title = env.title;
            summary = env.summary;
            if (Array.isArray(env.bullets)) {
              bullets = env.bullets.filter((b): b is string => typeof b === "string").slice(0, 8);
            }
            if (bullets.length === 0) {
              bullets = [...seed.bullets];
            }
            llmApplied = true;
          }
        }
      } finally {
        await this.gateway.endSession(sessionId);
      }
    }

    const out: NarrativeAnalyticsResponse = {
      title,
      bullets,
      summary,
      llmApplied,
      templateOnly: !llmApplied
    };

    const text = JSON.stringify(out);
    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "narrative_analytics",
      schemaVersion: "narrative_v1",
      inputForFingerprint: { topic, keys: Object.keys(body.payload) },
      dataSources: [`topic:${topic}`],
      responseSizeBytes: text.length,
      outcome: llmApplied ? "llm" : "template"
    });

    return out;
  }

  async generateHitlProposalDraft(
    auth: AuthContext,
    body: { intent: string; useLlm?: boolean }
  ): Promise<HitlProposalDraftResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || "synapse-default";
    const intent = body.intent.trim().slice(0, 2000);
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);
    assertHebbUserMessageAllowed(intent, companyUsers);
    const allowedKinds = hitlProposalKindIds();
    const defaultKind = allowedKinds[0] ?? "reminder.leave_balance";
    const seed = {
      title: "Bozza per la coda di approvazione umana",
      bullets: HITL_PROPOSAL_KIND_CATALOG.map((k) => `${k.labelIt} — codice: ${k.id}`).slice(0, 6),
      summary:
        intent.length > 0
          ? `Intento HR (testo libero, da rivedere prima dell'invio): ${intent.slice(0, 800)}`
          : "Descrivi in poche frase cosa vuoi proporre; poi usa «Genera bozza con AI» se disponibile."
    };
    let kind = defaultKind;
    let title = seed.title;
    let rationale =
      intent.length > 0
        ? `Richiesta in sintesi: ${intent}\n\nTipo predefinito suggerito: «${defaultKind}». Modifica il tipo dal menu se non è adatto, poi invia.`
        : "Compila l'intento della proposta, scegli il tipo dal catalogo e invia quando sei sicuro.";
    let checklist = [
      "Verifica che il tipo di proposta sia coerente con policy aziendali.",
      "Il revisore umano approverà o rifiuterà: nessuna azione automatica su cedolini o contratti da questa coda."
    ];
    let llmApplied = false;

    if (body.useLlm === true && this.openAi.isActive() && intent.length > 0) {
      const sessionId = (await this.gateway.beginSession(companyId, auth.userId)).sessionId;
      try {
        const envelopePayload = {
          envelope: {
            facts: {
              intent,
              allowedKinds,
              catalog: HITL_PROPOSAL_KIND_CATALOG
            },
            narrativeSeed: seed
          }
        };
        const pseudo = await this.gateway.toModelPayload(sessionId, envelopePayload, "ai_hitl_draft_v1");
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_hitl_draft_v1");
        if (refined.ok && refined.data && typeof refined.data === "object") {
          const env = (
            refined.data as { envelope?: { kind?: string; title?: string; rationale?: string; checklist?: unknown } }
          ).envelope;
          const k = typeof env?.kind === "string" ? env.kind.trim() : "";
          if (k && allowedKinds.includes(k)) {
            kind = k;
          }
          if (typeof env?.title === "string" && env.title.trim()) {
            title = env.title.trim();
          }
          if (typeof env?.rationale === "string" && env.rationale.trim()) {
            rationale = env.rationale.trim();
          }
          if (Array.isArray(env?.checklist)) {
            const cl = env.checklist.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
            if (cl.length > 0) {
              checklist = cl.slice(0, 6);
            }
          }
          llmApplied = true;
        }
      } finally {
        await this.gateway.endSession(sessionId);
      }
    }

    const text = JSON.stringify({ kind, title, rationale, checklist });
    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "hitl_proposal_draft",
      schemaVersion: "hitl_draft_v1",
      inputForFingerprint: { intentLen: intent.length, llm: llmApplied },
      dataSources: ["hitl_kind_catalog"],
      responseSizeBytes: text.length,
      outcome: llmApplied ? "llm" : "template"
    });

    return { kind, title, rationale, checklist, llmApplied };
  }

  private buildTemplate(
    topic: string,
    payload: Record<string, unknown>
  ): { title: string; bullets: string[]; summary: string } {
    if (topic === "workforce_cockpit" || topic === "workforce_planning") {
      const scenario = String(payload.scenario ?? "base");
      const summaryBlock = payload.summary as { headcount?: number; monthlyPayrollMassEur?: number } | undefined;
      const headcount = Number(summaryBlock?.headcount ?? payload.headcount ?? NaN);
      const mass = Number(summaryBlock?.monthlyPayrollMassEur ?? payload.monthlyPayrollMassEur ?? NaN);
      const series = Array.isArray(payload.series) ? (payload.series as Array<{ month?: string; costEur?: number }>) : [];
      const last = series.length ? series[series.length - 1] : undefined;
      const eur = (n: number): string =>
        Number.isFinite(n)
          ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
          : "—";
      const scenLabel =
        scenario === "growth" ? "crescita (+2 FTE stimati)" : scenario === "freeze" ? "congelamento costi" : "base";
      return {
        title: "Workforce planning — sintesi",
        bullets: [
          `Scenario selezionato: ${scenLabel}.`,
          Number.isFinite(headcount) ? `Headcount di riferimento: ${headcount} persone.` : "Headcount non disponibile nel payload.",
          Number.isFinite(mass) ? `Massa retributiva mensile stimata (punto di partenza): ${eur(mass)}.` : "",
          last?.month && Number.isFinite(Number(last.costEur))
            ? `Ultimo mese in serie (${last.month}): costo cumulato scenario ${eur(Number(last.costEur))}.`
            : "Serie costi: dati incompleti o assenti."
        ].filter(Boolean),
        summary:
          "Quadro sintetico del workforce cockpit su numeri aggregati: confronta gli scenari con attenzione al costo ultimo mese e al headcount prima di decisioni di budget."
      };
    }

    if (topic === "turnover_insights_deep" || topic === "turnover_retention" || topic === "turnover_insights") {
      const trend = Array.isArray(payload.trend)
        ? (payload.trend as Array<{ weekStart?: string; avgScore?: number; sampleSize?: number }>)
        : [];
      const modelVersion = String(payload.modelVersion ?? "rule-v1");
      const itemsCount = Number(payload.itemsCount ?? NaN);
      const bandsRaw = payload.scoreBands as { low?: number; mid?: number; high?: number } | undefined;
      const bands =
        bandsRaw && typeof bandsRaw === "object"
          ? { low: Number(bandsRaw.low ?? 0), mid: Number(bandsRaw.mid ?? 0), high: Number(bandsRaw.high ?? 0) }
          : (() => {
              const items = Array.isArray(payload.items)
                ? (payload.items as Array<{ score?: number }>)
                : [];
              const b = { low: 0, mid: 0, high: 0 };
              for (const it of items) {
                const s = Number(it.score);
                if (!Number.isFinite(s)) continue;
                if (s < 34) b.low += 1;
                else if (s < 67) b.mid += 1;
                else b.high += 1;
              }
              return b;
            })();
      const sampleN = Number.isFinite(itemsCount) ? itemsCount : bands.low + bands.mid + bands.high;
      const byCc = Array.isArray(payload.byCostCenter)
        ? (payload.byCostCenter as Array<{ label: string; count: number; avgScore: number }>)
        : [];
      const lastTrend = trend.length ? trend[trend.length - 1] : undefined;
      return {
        title: "Retention e rischio turnover — analisi aggregata",
        bullets: [
          `Modello segnali: ${modelVersion}.`,
          `Distribuzione score: basso ${bands.low}, medio ${bands.mid}, alto ${bands.high} (campione ${sampleN} profili).`,
          byCc.length
            ? `Per centro di costo: ${byCc
                .slice(0, 5)
                .map((c) => `${c.label}: n=${c.count}, media ${c.avgScore}`)
                .join(" · ")}`
            : "",
          lastTrend?.weekStart && Number.isFinite(Number(lastTrend.avgScore))
            ? `Ultima settimana trend (${lastTrend.weekStart}): media score ${lastTrend.avgScore}.`
            : ""
        ].filter(Boolean),
        summary:
          "Analisi su aggregati HR pseudonimizzati: utile per priorità e colloqui, non per decisioni automatiche su singole persone."
      };
    }

    if (topic === "process_bottlenecks") {
      const m = payload.metrics as
        | {
            samples?: { leave?: number; expense?: number; onboarding?: number };
            windowDays?: number;
            note?: string;
          }
        | undefined;
      const evCount = Array.isArray(payload.eventSummaries) ? (payload.eventSummaries as unknown[]).length : 0;
      return {
        title: "Ottimizzazione processi — quadro sintetico",
        bullets: [
          `Finestra analisi: ${m?.windowDays ?? "n/d"} giorni.`,
          `Campioni (v0): ferie ${m?.samples?.leave ?? "—"}, spese ${m?.samples?.expense ?? "—"}, onboarding ${m?.samples?.onboarding ?? "—"}.`,
          evCount ? `${evCount} tipi di evento verso suite esterne in elenco.` : "Nessun evento in elenco.",
          m?.note ? `Nota tecnica: ${String(m.note).slice(0, 200)}` : ""
        ].filter(Boolean),
        summary:
          "Le metriche sono indicative (v0). L'analisi AI propone azioni su processi, non modifiche ai dati."
      };
    }

    if (topic === "personnel_cost_radar" || topic === "executive_recap") {
      const summary = payload.summary as { headcount?: number; budgetEur?: number; pendingExpenseCount?: number } | undefined;
      return {
        title: topic === "executive_recap" ? "Sintesi executive HR" : "Radar costo del personale",
        bullets: [
          summary?.headcount != null ? `Headcount: ${summary.headcount}.` : "",
          summary?.budgetEur != null
            ? `Budget indicativo: ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(summary.budgetEur)}.`
            : "",
          summary?.pendingExpenseCount != null ? `Spese in attesa: ${summary.pendingExpenseCount}.` : ""
        ].filter(Boolean),
        summary: "Snapshot aggregato perimetro HR: verificare i numeri in budget personale e report prima di decisioni."
      };
    }

    if (topic === "skills_gap") {
      const count = Number(payload.itemCount ?? (Array.isArray(payload.items) ? payload.items.length : 0));
      const items = Array.isArray(payload.items)
        ? (payload.items as Array<{ roleName?: string; skillName?: string; gap?: number }>)
        : [];
      const topGaps = items
        .filter((r) => Number(r.gap) > 0)
        .sort((a, b) => Number(b.gap ?? 0) - Number(a.gap ?? 0))
        .slice(0, 4)
        .map((r) => `${r.roleName ?? "Ruolo"} · ${r.skillName ?? "Skill"} (gap ${r.gap})`);
      return {
        title: "Gap competenze vs fabbisogno",
        bullets: [
          `Righe gap nel report: ${count}.`,
          topGaps.length ? `Priorità indicative: ${topGaps.join(" · ")}` : "Nessun gap rilevato sulle righe attuali.",
          "Dettaglio per ruolo nella pagina Gap competenze."
        ].filter(Boolean),
        summary: "Confronta fabbisogno e competenze mappate; priorità formazione e hiring da validare con HR."
      };
    }

    if (topic === "compensation_bench") {
      return {
        title: "Benchmark retribuzione",
        bullets: [
          "Confronto su aggregati interni senza nominativi nel payload inviato al modello.",
          "Usa la pagina Benchmark retribuzione per il dettaglio per ruolo e centro di costo."
        ],
        summary: "Posizionamento RAL rispetto alla mediana interna: validare con policy retributive prima di comunicazioni ai team."
      };
    }

    if (topic === "attendance_payroll_anomalies") {
      const headcount = Number((payload as { headcount?: number }).headcount ?? NaN);
      const pending = Number((payload as { pendingExpenseCount?: number }).pendingExpenseCount ?? NaN);
      return {
        title: "Anomalie presenze e payroll (indicative)",
        bullets: [
          Number.isFinite(headcount) ? `Headcount di riferimento: ${headcount}.` : "",
          Number.isFinite(pending) ? `Spese in attesa di approvazione: ${pending}.` : "",
          String(payload.note ?? "Verificare report presenze per il dettaglio operativo.")
        ].filter(Boolean),
        summary: "Segnali aggregati v0: non sostituiscono controlli payroll formali né decisioni disciplinari."
      };
    }

    if (topic === "workforce_economic_control") {
      const budget = payload.budgetAnalysis as { totals?: { variancePct?: number | null } } | undefined;
      return {
        title: "Controllo economico workforce",
        bullets: [
          budget?.totals?.variancePct != null ? `Varianza budget/actual: ${budget.totals.variancePct}%.` : "",
          "Confronto actual, budget e forecast per centro di costo.",
          "Driver di varianza oltre soglia nel periodo corrente."
        ].filter(Boolean),
        summary: "Narrativa orientata al CFO: leve budget e checkpoint controller su aggregati pseudonimizzati."
      };
    }

    if (topic === "retention_flight_risk") {
      const bands = payload.scoreBands as { high?: number; mid?: number } | undefined;
      return {
        title: "Retention e flight risk",
        bullets: [
          `Profili ad alto score: ${bands?.high ?? 0}.`,
          `Profili a medio rischio: ${bands?.mid ?? 0}.`,
          "Playbook colloqui su cluster prioritari per centro di costo."
        ],
        summary: "Priorità retention e stay interview su aggregati, senza nominativi nel modello."
      };
    }

    if (topic === "skills_role_coverage") {
      const count = Number(payload.gapCount ?? payload.itemCount ?? 0);
      return {
        title: "Gap competenze vs fabbisogno",
        bullets: [`Gap rilevati: ${count}.`, "Matrice hiring vs formazione per ruolo.", "Headcount coinvolto per skill critica."],
        summary: "Copertura competenze: priorità L&D e recruiting su gap più ampi."
      };
    }

    if (topic === "hr_operational_briefing") {
      const pending = Number(payload.pendingApprovalsCount ?? 0);
      return {
        title: "Sintesi operativa HR",
        bullets: [
          `Approvazioni in coda: ${pending}.`,
          "Onboarding/offboarding e alert HR aperti.",
          "Backlog spese da smaltire con priorità per tipo."
        ],
        summary: "Briefing operativo giornaliero per HRBP su backlog e lifecycle."
      };
    }

    if (topic === "productivity_absenteeism") {
      const agg = payload.productivity as { absenceDaysMonth?: number; overtimeHoursMonth?: number } | undefined;
      return {
        title: "Produttività e assenteismo",
        bullets: [
          agg?.absenceDaysMonth != null ? `Giorni assenza mese: ${agg.absenceDaysMonth}.` : "",
          agg?.overtimeHoursMonth != null ? `Straordinari (h): ${agg.overtimeHoursMonth}.` : "",
          "Correlazioni indicative con flight risk se presenti in facts."
        ].filter(Boolean),
        summary: "Ore, assenze e straordinari su aggregati per centro di costo."
      };
    }

    if (topic === "internal_pay_equity") {
      const equity = payload.equity as { spreadRatioHighLow?: number | null } | undefined;
      return {
        title: "Equità retributiva interna",
        bullets: [
          equity?.spreadRatioHighLow != null ? `Rapporto max/min: ${equity.spreadRatioHighLow}.` : "",
          "Spread per ruolo vs mediana globale.",
          "Segnali disparità da validare con policy retributive."
        ].filter(Boolean),
        summary: "Audit equità interna su stipendi base in anagrafica — nessuna indicazione legale vincolante."
      };
    }

    if (topic === "manager_load_bottlenecks") {
      const load = payload.managerLoad as { pendingApprovalsTotal?: number } | undefined;
      return {
        title: "Carico manager e SLA approvazioni",
        bullets: [
          load?.pendingApprovalsTotal != null ? `Approvazioni in coda: ${load.pendingApprovalsTotal}.` : "",
          "Cluster manager con span of control elevato.",
          "Priorità delega e riduzione backlog approvazioni."
        ].filter(Boolean),
        summary: "Colli di bottiglia manager: SLA approvazioni e redesign carico operativo."
      };
    }

    if (topic === "workforce_what_if") {
      return {
        title: "Scenario what-if organico",
        bullets: [
          "Confronto scenari base, crescita e freeze.",
          "Headcount e costo ultimo mese per scenario.",
          "Collegamento al workforce planning Nexa."
        ],
        summary: "Simulazione scenari organico su costo e headcount aggregati."
      };
    }

    return {
      title: "Sintesi analytics",
      bullets: [
        `Topic «${topic}».`,
        `Campi in ingresso: ${Object.keys(payload).length}.`,
        "Per sintesi più ricche usare topic dedicati dal hub Analytics."
      ],
      summary: "Payload aggregato ricevuto: verificare il topic o arricchire i campi numerici."
    };
  }
}
