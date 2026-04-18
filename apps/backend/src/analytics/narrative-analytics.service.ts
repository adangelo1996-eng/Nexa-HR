import { Injectable } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";

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

    if (body.useLlm === true && this.openAi.isActive()) {
      const refined = await this.openAi.refinePseudonymizedJson(
        {
          envelope: {
            facts: body.payload,
            narrativeSeed: seed
          }
        },
        "ai_narrative_aggregate_v1"
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
