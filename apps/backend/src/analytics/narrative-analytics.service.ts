import { Injectable } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { HITL_PROPOSAL_KIND_CATALOG, hitlProposalKindIds } from "./hitl-proposal-kinds";

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
    private readonly openAi: AiOpenAiRefinementService
  ) {}

  async generate(auth: AuthContext, body: NarrativeAnalyticsRequest): Promise<NarrativeAnalyticsResponse> {
    const me = await this.store.getUser(auth.userId);
    const topic = body.topic.trim().slice(0, 80);
    const seed = this.buildTemplate(topic, body.payload);
    let title = seed.title;
    let bullets = [...seed.bullets];
    let summary = seed.summary;
    let llmApplied = false;

    const refineSchema =
      topic === "turnover_insights_deep"
        ? "ai_turnover_insights_deep_v1"
        : topic === "process_bottlenecks"
          ? "ai_process_bottlenecks_v1"
          : "ai_narrative_aggregate_v1";

    if (body.useLlm === true && this.openAi.isActive()) {
      const refined = await this.openAi.refinePseudonymizedJson(
        {
          envelope: {
            facts: body.payload,
            narrativeSeed: seed
          }
        },
        refineSchema
      );
      if (refined && typeof refined === "object") {
        const env = (refined as { envelope?: { title?: string; bullets?: unknown; summary?: string } }).envelope;
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
      companyId: me.companyId || "synapse-default",
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
    const intent = body.intent.trim().slice(0, 2000);
    const allowedKinds = hitlProposalKindIds();
    const defaultKind = allowedKinds[0] ?? "reminder.leave_balance";
    const seed = {
      title: "Bozza per la coda di approvazione umana",
      bullets: HITL_PROPOSAL_KIND_CATALOG.map((k) => `${k.labelIt} — codice: ${k.id}`).slice(0, 6),
      summary:
        intent.length > 0
          ? `Intento HR (testo libero, da rivedere prima dell’invio): ${intent.slice(0, 800)}`
          : "Descrivi in poche frase cosa vuoi proporre; poi usa «Genera bozza con AI» se disponibile."
    };
    let kind = defaultKind;
    let title = seed.title;
    let rationale =
      intent.length > 0
        ? `Richiesta in sintesi: ${intent}\n\nTipo predefinito suggerito: «${defaultKind}». Modifica il tipo dal menu se non è adatto, poi invia.`
        : "Compila l’intento della proposta, scegli il tipo dal catalogo e invia quando sei sicuro.";
    let checklist = [
      "Verifica che il tipo di proposta sia coerente con policy aziendali.",
      "Il revisore umano approverà o rifiuterà: nessuna azione automatica su cedolini o contratti da questa coda."
    ];
    let llmApplied = false;

    if (body.useLlm === true && this.openAi.isActive() && intent.length > 0) {
      const refined = await this.openAi.refinePseudonymizedJson(
        {
          envelope: {
            facts: {
              intent,
              allowedKinds,
              catalog: HITL_PROPOSAL_KIND_CATALOG
            },
            narrativeSeed: seed
          }
        },
        "ai_hitl_draft_v1"
      );
      if (refined && typeof refined === "object") {
        const env = (refined as { envelope?: { kind?: string; title?: string; rationale?: string; checklist?: unknown } })
          .envelope;
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
    }

    const text = JSON.stringify({ kind, title, rationale, checklist });
    await this.audit.append({
      companyId: me.companyId || "synapse-default",
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

    if (topic === "turnover_insights_deep") {
      const items = Array.isArray(payload.items)
        ? (payload.items as Array<{ score?: number; costCenterLabel?: string }>)
        : [];
      const trend = Array.isArray(payload.trend)
        ? (payload.trend as Array<{ weekStart?: string; avgScore?: number; sampleSize?: number }>)
        : [];
      const modelVersion = String(payload.modelVersion ?? "rule-v1");
      const bands = { low: 0, mid: 0, high: 0 };
      for (const it of items) {
        const s = Number(it.score);
        if (!Number.isFinite(s)) continue;
        if (s < 34) bands.low += 1;
        else if (s < 67) bands.mid += 1;
        else bands.high += 1;
      }
      const byCc = Array.isArray(payload.byCostCenter)
        ? (payload.byCostCenter as Array<{ label: string; count: number; avgScore: number }>)
        : [];
      const lastTrend = trend.length ? trend[trend.length - 1] : undefined;
      return {
        title: "Turnover e retention — analisi aggregata",
        bullets: [
          `Modello segnali: ${modelVersion}.`,
          `Distribuzione score (proxy): basso 0–33: ${bands.low}, medio 34–66: ${bands.mid}, alto 67–100: ${bands.high} (su ${items.length} persone).`,
          byCc.length
            ? `Per centro di costo (solo aggregati): ${byCc
                .slice(0, 5)
                .map((c) => `${c.label}: n=${c.count}, media ${c.avgScore}`)
                .join(" · ")}${byCc.length > 5 ? " …" : ""}`
            : "",
          lastTrend?.weekStart && Number.isFinite(Number(lastTrend.avgScore))
            ? `Ultima settimana trend (${lastTrend.weekStart}): media score ${lastTrend.avgScore}, campione ${lastTrend.sampleSize ?? "n/d"}.`
            : ""
        ].filter(Boolean),
        summary:
          "Analisi solo su numeri aggregati e medie per reparto: utile per priorità HR e colloqui, non per decisioni automatiche su singole persone."
      };
    }

    if (topic === "turnover_retention" || topic === "turnover_insights") {
      const items = Array.isArray(payload.items) ? (payload.items as Array<{ score?: number }>) : [];
      const trend = Array.isArray(payload.trend) ? (payload.trend as Array<{ weekStart?: string; avgScore?: number }>) : [];
      const modelVersion = String(payload.modelVersion ?? "rule-v1");
      const avg =
        items.length > 0
          ? Math.round((items.reduce((s, r) => s + (Number(r.score) || 0), 0) / items.length) * 10) / 10
          : NaN;
      const lastTrend = trend.length ? trend[trend.length - 1] : undefined;
      return {
        title: "Turnover e retention — sintesi",
        bullets: [
          `Modello segnali: ${modelVersion}.`,
          items.length ? `Persone nel campione (ultimo run): ${items.length}.` : "Nessun elemento nel campione: eseguire l'aggiornamento segnali.",
          Number.isFinite(avg) ? `Score medio (ultimo run): ${avg} su 100.` : "",
          lastTrend?.weekStart && Number.isFinite(Number(lastTrend.avgScore))
            ? `Media settimanale trend più recente (${lastTrend.weekStart}): ${lastTrend.avgScore}.`
            : ""
        ].filter(Boolean),
        summary:
          "I valori sono proxy operativi su aggregati HR, non diagnosi individuali. Usare il trend settimanale per contestualizzare picchi rispetto agli snapshot salvati."
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
          "Le metriche sono indicative (v0). L’analisi AI deve proporre azioni realistiche su processi, non modifiche ai dati."
      };
    }

    return {
      title: "Sintesi analytics",
      bullets: [
        `Topic generico «${topic}».`,
        `Campi in ingresso: ${Object.keys(payload).length}.`,
        "Per sintesi più ricche usare topic «workforce_cockpit» o «turnover_retention» con payload degli endpoint analytics corrispondenti."
      ],
      summary:
        "Ricevuto un payload aggregato non mappato a un template dedicato: verificare il topic o arricchire i campi numerici nel corpo della richiesta."
    };
  }
}
