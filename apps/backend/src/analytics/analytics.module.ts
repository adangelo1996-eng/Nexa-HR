import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { ReportsController } from "./reports.controller";

@Module({
  controllers: [AnalyticsController, ReportsController]
})
export class AnalyticsModule {}
