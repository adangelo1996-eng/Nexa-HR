import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

@Controller("reports")
@UseGuards(NexaPermissionGuard)
export class ReportsController {
  constructor(private readonly store: HrDataStore) {}

  @Get("attendance")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async attendance(
    @Query("from") from: string,
    @Query("to") to: string
  ): Promise<{ rows: Awaited<ReturnType<HrDataStore["exportAttendanceReportRows"]>> }> {
    const f = from?.trim() || new Date().toISOString().slice(0, 10);
    const t = to?.trim() || f;
    return { rows: await this.store.exportAttendanceReportRows(f, t) };
  }
}
