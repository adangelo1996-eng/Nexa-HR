import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { WorkforceModule } from "../workforce/workforce.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsOrchestratorService } from "./analytics-orchestrator.service";
import { KpiSnapshotService } from "./kpi-snapshot.service";
import { NarrativeAnalyticsService } from "./narrative-analytics.service";
import { ReportsController } from "./reports.controller";

@Module({
  imports: [WorkforceModule, AiHrModule, AiPrivacyModule],
  controllers: [AnalyticsController, ReportsController],
  providers: [NarrativeAnalyticsService, AnalyticsOrchestratorService, KpiSnapshotService]
})
export class AnalyticsModule {}
