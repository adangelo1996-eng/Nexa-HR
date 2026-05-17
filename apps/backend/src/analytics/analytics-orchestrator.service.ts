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

const HUB_CARDS: AnalyticsHubCard[] = [
  {
    id: "a1",
    titleIt: "Radar economico del personale",
    blurbIt: "Varianza budget e consuntivo per centro di costo, con narrativa AI su aggregati.",
    href: "/personnel-budget",
    topic: "personnel_cost_radar",
    llmCapable: true
  },
  {
    id: "a2",
    titleIt: "Retention e rischio turnover",
    blurbIt: "Score retention e trend settimanali su aggregati pseudonimizzati.",
    href: "/insights",
    topic: "turnover_insights_deep",
    llmCapable: true
  },
  {
    id: "a3",
    titleIt: "Gap competenze vs fabbisogno",
    blurbIt: "Heatmap gap per ruolo e competenza rispetto al fabbisogno mappato.",
    href: "/analytics/competenze",
    topic: "skills_gap",
    llmCapable: true
  },
  {
    id: "a6",
    titleIt: "Sintesi executive del perimetro",
    blurbIt: "Narrativa board su KPI HR aggregati del perimetro selezionato.",
    href: "/hr-center/recap",
    topic: "executive_recap",
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
    const card = HUB_CARDS.find((c) => c.id === analysisId.trim().toLowerCase());
    if (!card) {
      throw new ForbiddenException("Analisi non riconosciuta");
    }
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile");
    }

    const payload = await this.buildPayload(card.id, companyId);
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

  private async buildPayload(analysisId: string, companyId: string): Promise<Record<string, unknown>> {
    switch (analysisId) {
      case "a1": {
        const summary = await this.store.getHrDashboardSummary();
        return { summary, focus: "personnel_budget_variance" };
      }
      case "a2": {
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
      case "a3": {
        const items = await this.store.getSkillsGapReport(companyId);
        return { items, itemCount: items.length };
      }
      case "a6": {
        const summary = await this.store.getHrDashboardSummary();
        const cockpit = await this.store.getWorkforceCockpit("base", 6);
        return { summary, workforce: cockpit.summary };
      }
      default:
        return {};
    }
  }
}
