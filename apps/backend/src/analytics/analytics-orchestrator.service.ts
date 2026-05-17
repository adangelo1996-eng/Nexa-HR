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
    titleIt: "Radar costo del personale",
    blurbIt: "Varianza budget/consuntivo per centro di costo con narrativa AI.",
    href: "/personnel-budget/analysis",
    topic: "personnel_cost_radar",
    llmCapable: true
  },
  {
    id: "a2",
    titleIt: "Turnover predittivo spiegabile",
    blurbIt: "Score retention e trend settimanali su aggregati pseudonimizzati.",
    href: "/insights",
    topic: "turnover_insights_deep",
    llmCapable: true
  },
  {
    id: "a3",
    titleIt: "Gap competenze vs fabbisogno",
    blurbIt: "Heatmap gap per ruolo e centro di costo.",
    href: "/hr-center/analisi",
    topic: "skills_gap",
    llmCapable: true
  },
  {
    id: "a4",
    titleIt: "Colli di bottiglia operativi",
    blurbIt: "SLA approvazioni ferie, spese e onboarding.",
    href: "/workflow/approvals",
    topic: "process_bottlenecks",
    llmCapable: true
  },
  {
    id: "a5",
    titleIt: "Anomalie presenze e payroll",
    blurbIt: "Pattern timbrature e incongruenze indicative.",
    href: "/reports",
    topic: "attendance_payroll_anomalies",
    llmCapable: true
  },
  {
    id: "a6",
    titleIt: "Sintesi executive perimetro",
    blurbIt: "Narrativa board su KPI HR aggregati.",
    href: "/hr-center/recap",
    topic: "executive_recap",
    llmCapable: true
  },
  {
    id: "a7",
    titleIt: "Benchmark retribuzione",
    blurbIt: "Posizionamento RAL vs mediana interna.",
    href: "/compensation/bench",
    topic: "compensation_bench",
    llmCapable: true
  },
  {
    id: "a8",
    titleIt: "What-if assunzione / uscita",
    blurbIt: "Impatto costo azienda su scenari hiring.",
    href: "/workforce-planning",
    topic: "workforce_planning",
    llmCapable: true
  }
];

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

    const payload = await this.buildPayload(auth, card.id, companyId);
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

  private async buildPayload(
    auth: AuthContext,
    analysisId: string,
    companyId: string
  ): Promise<Record<string, unknown>> {
    switch (analysisId) {
      case "a1": {
        const summary = await this.store.getHrDashboardSummary();
        return { summary, focus: "personnel_budget_variance" };
      }
      case "a2": {
        const [items, trend] = await Promise.all([
          this.store.getLatestTurnoverRetention(companyId),
          this.store.getTurnoverRetentionTrend(companyId, 8)
        ]);
        return { items, trend, modelVersion: "rule-v1" };
      }
      case "a3": {
        const items = await this.store.getSkillsGapReport(companyId);
        return { items, itemCount: items.length };
      }
      case "a4": {
        const metrics = await this.store.getProcessCycleMetrics(companyId);
        return { metrics, eventSummaries: [] };
      }
      case "a5": {
        const summary = await this.store.getHrDashboardSummary();
        return {
          headcount: summary.headcount,
          pendingExpenseCount: summary.pendingExpenseCount,
          note: "Anomalie indicative v0: usare report presenze per dettaglio operativo."
        };
      }
      case "a6": {
        const summary = await this.store.getHrDashboardSummary();
        const cockpit = await this.store.getWorkforceCockpit("base", 6);
        return { summary, workforce: cockpit.summary };
      }
      case "a7": {
        return { focus: "compensation_bench", companyId, note: "Aggregati retribuzione senza nominativi in payload LLM." };
      }
      case "a8": {
        const cockpit = await this.store.getWorkforceCockpit("growth", 12);
        return { ...cockpit, scenario: "growth" };
      }
      default:
        return {};
    }
  }
}
