import { Controller, Get, UseGuards } from "@nestjs/common";
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
}
