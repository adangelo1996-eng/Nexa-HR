import { Module } from "@nestjs/common";
import { WorkforceModule } from "../workforce/workforce.module";
import { AnalyticsController } from "./analytics.controller";
import { ReportsController } from "./reports.controller";

@Module({
  imports: [WorkforceModule],
  controllers: [AnalyticsController, ReportsController]
})
export class AnalyticsModule {}
