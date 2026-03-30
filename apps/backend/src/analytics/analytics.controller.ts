import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

@Controller("analytics")
@UseGuards(NexaPermissionGuard)
export class AnalyticsController {
  constructor(private readonly store: HrDataStore) {}

  @Get("hr-dashboard/summary")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async summary(): Promise<{ headcount: number; budgetChf: number; pendingExpenseCount: number }> {
    return this.store.getHrDashboardSummary();
  }

  @Get("people-insights")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async peopleInsights(): Promise<{ items: Awaited<ReturnType<HrDataStore["getPeopleInsightsRisk"]>> }> {
    return { items: await this.store.getPeopleInsightsRisk() };
  }

  @Get("forecast-payroll")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async forecast(
    @Query("months") months?: string
  ): Promise<{ series: Awaited<ReturnType<HrDataStore["payrollForecastNextMonths"]>> }> {
    const m = months ? Math.min(12, Math.max(1, Number(months) || 3)) : 3;
    return { series: await this.store.payrollForecastNextMonths(m) };
  }
}
