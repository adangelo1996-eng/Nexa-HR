import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { WorkCalendarExportDto } from "./work-calendar-export.dto";

@Controller("hr/work-calendar")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("user")
export class WorkCalendarController {
  constructor(private readonly store: HrDataStore) {}

  private async resolveScopeUserIds(
    auth: AuthContext,
    userIdsRaw?: string | string[]
  ): Promise<string[]> {
    const allUsers = await this.store.listUsers();
    let allowedIds: string[];
    if (auth.role === "superuser") {
      allowedIds = allUsers.map((u) => u.id);
    } else {
      allowedIds = [...(await this.store.listManagedMemberIdsForApprover(auth.userId))];
    }
    const allowed = new Set(allowedIds);
    let ids: string[];
    if (Array.isArray(userIdsRaw)) {
      ids = userIdsRaw.map((s) => String(s).trim()).filter(Boolean);
    } else if (userIdsRaw?.trim()) {
      ids = userIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      ids = allowedIds;
    }
    ids = ids.filter((id) => allowed.has(id));
    if (ids.length === 0) {
      ids = allowedIds;
    }
    return ids;
  }

  @Get()
  @RequireNexaPermissions("nexa.work_calendar:read")
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("userIds") userIdsRaw?: string
  ): Promise<{ events: Awaited<ReturnType<HrDataStore["getTeamWorkCalendar"]>> }> {
    const ids = await this.resolveScopeUserIds(auth, userIdsRaw);
    const events = await this.store.getTeamWorkCalendar(ids, from, to);
    return { events };
  }

  @Post("export")
  @RequireNexaPermissions("nexa.work_calendar:read")
  async exportSummary(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: WorkCalendarExportDto
  ): Promise<ReturnType<HrDataStore["buildTeamWorkCalendarExportSummary"]>> {
    const ids = await this.resolveScopeUserIds(auth, dto.userIds);
    const events = await this.store.getTeamWorkCalendar(ids, dto.from, dto.to);
    return this.store.buildTeamWorkCalendarExportSummary(ids, events, dto.from, dto.to);
  }
}
