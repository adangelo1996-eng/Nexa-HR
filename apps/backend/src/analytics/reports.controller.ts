import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { AttendanceTeamService } from "../workforce/attendance-team.service";

@Controller("reports")
@UseGuards(NexaPermissionGuard)
export class ReportsController {
  constructor(
    private readonly store: HrDataStore,
    private readonly team: AttendanceTeamService
  ) {}

  @Get("attendance")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async attendance(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from: string,
    @Query("to") to: string
  ): Promise<{ rows: Awaited<ReturnType<HrDataStore["exportAttendanceReportRows"]>> }> {
    await this.team.assertHrOrNexaAdminForAttendanceExports(auth.userId, auth.role);
    const f = from?.trim() || new Date().toISOString().slice(0, 10);
    const t = to?.trim() || f;
    return { rows: await this.store.exportAttendanceReportRows(f, t) };
  }
}
