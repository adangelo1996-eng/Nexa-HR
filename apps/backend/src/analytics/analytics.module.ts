import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { WorkforceModule } from "../workforce/workforce.module";
import { AnalyticsController } from "./analytics.controller";
import { NarrativeAnalyticsService } from "./narrative-analytics.service";
import { ReportsController } from "./reports.controller";

@Module({
  imports: [WorkforceModule, AiHrModule],
  controllers: [AnalyticsController, ReportsController],
  providers: [NarrativeAnalyticsService]
})
export class AnalyticsModule {}
