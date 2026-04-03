import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

@Controller("hr/work-calendar")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("manager_controllo_gestione")
export class WorkCalendarController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  @RequireNexaPermissions("nexa.work_calendar:read")
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("userIds") userIdsRaw?: string
  ): Promise<{ events: Awaited<ReturnType<HrDataStore["getTeamWorkCalendar"]>> }> {
    const allUsers = await this.store.listUsers();
    let allowedIds: string[];
    if (auth.role === "admin") {
      allowedIds = allUsers.map((u) => u.id);
    } else {
      const team = await this.store.listUsersByManager(auth.userId);
      allowedIds = [auth.userId, ...team.map((u) => u.id)];
    }
    const allowed = new Set(allowedIds);
    let ids = userIdsRaw
      ? userIdsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : allowedIds;
    ids = ids.filter((id) => allowed.has(id));
    if (ids.length === 0) {
      ids = allowedIds;
    }
    const events = await this.store.getTeamWorkCalendar(ids, from, to);
    return { events };
  }
}
