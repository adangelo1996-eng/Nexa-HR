import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";

class LeaveDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsIn(["annual", "rol"])
  kind?: "annual" | "rol";

  /** Solo `admin`: crea il piano ferie per un altro utente (console HR / calendario). */
  @IsOptional()
  @IsString()
  userId?: string;
}

class LeaveAllowanceDto {
  @IsInt()
  @Min(0)
  @Max(120)
  allocatedDays!: number;
}

@Controller("leave")
@UseGuards(NexaPermissionGuard)
export class LeaveController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Post("plan")
  @RequireNexaPermissions("nexa.leaves:write")
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: LeaveDto): Promise<unknown> {
    let userId = auth.userId;
    const proxy = dto.userId?.trim();
    if (proxy && proxy !== auth.userId) {
      if (auth.role !== "admin") {
        throw new ForbiddenException("Solo un amministratore può registrare ferie per altri utenti.");
      }
      userId = proxy;
    }
    return this.store.createLeavePlan({
      userId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      kind: dto.kind ?? "annual"
    });
  }

  @Patch("plan/:leaveId")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("leaveId") leaveId: string,
    @Body() dto: LeaveDto
  ): Promise<unknown> {
    if (auth.role !== "admin") {
      const leavesW = await this.permissions.userHasAll(auth.userId, ["nexa.leaves:write"]);
      const apprW = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:write"]);
      const leave = await this.store.getLeave(leaveId);
      if (leave.userId === auth.userId) {
        if (!leavesW) {
          throw new ForbiddenException("Permessi insufficienti per modificare le proprie ferie");
        }
      } else {
        if (!apprW || auth.role !== "team_lead" || !(await this.store.isManagerOf(auth.userId, leave.userId))) {
          throw new ForbiddenException(
            "Puoi modificare solo le richieste dei dipendenti di cui sei responsabile (e solo in attesa)"
          );
        }
      }
    }
    return this.store.updateLeavePlan(leaveId, dto.startDate, dto.endDate, auth.userId, dto.kind, auth.role);
  }

  @Delete("plan/:leaveId")
  async removePlan(@CurrentAuth() auth: AuthContext, @Param("leaveId") leaveId: string): Promise<{ ok: true }> {
    if (auth.role !== "admin") {
      const leavesW = await this.permissions.userHasAll(auth.userId, ["nexa.leaves:write"]);
      const apprW = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:write"]);
      const leave = await this.store.getLeave(leaveId);
      if (leave.userId === auth.userId) {
        if (!leavesW) {
          throw new ForbiddenException("Permessi insufficienti");
        }
      } else {
        if (!apprW || auth.role !== "team_lead" || !(await this.store.isManagerOf(auth.userId, leave.userId))) {
          throw new ForbiddenException("Operazione non consentita");
        }
      }
    }
    await this.store.cancelPendingLeavePlan(leaveId, auth.userId, auth.role);
    return { ok: true };
  }

  @Patch("approve/:leaveId")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@Param("leaveId") leaveId: string, @CurrentAuth() auth: AuthContext): Promise<unknown> {
    const leave = await this.store.getLeave(leaveId);
    if (
      auth.role !== "admin" &&
      !(await this.store.isManagerOf(auth.userId, leave.userId))
    ) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.approveLeave(leaveId, auth.userId);
  }

  @Patch("reject/:leaveId")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(@Param("leaveId") leaveId: string, @CurrentAuth() auth: AuthContext): Promise<unknown> {
    const leave = await this.store.getLeave(leaveId);
    if (
      auth.role !== "admin" &&
      !(await this.store.isManagerOf(auth.userId, leave.userId))
    ) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.rejectLeave(leaveId, auth.userId);
  }

  @Get("plan")
  @RequireNexaPermissions("nexa.leaves:read")
  async list(@CurrentAuth() auth: { userId: string }, @Query("userId") userId?: string): Promise<unknown> {
    return this.store.listLeave(userId ?? auth.userId);
  }

  @Get("balance")
  @RequireNexaPermissions("nexa.leaves:read")
  async balance(
    @CurrentAuth() auth: { userId: string; role: "admin" | "team_lead" | "employee" },
    @Query("userId") userId?: string,
    @Query("year") year?: string
  ): Promise<unknown> {
    const targetUserId = userId ?? auth.userId;
    const targetYear = Number(year ?? new Date().getUTCFullYear());
    if (
      auth.role !== "admin" &&
      targetUserId !== auth.userId &&
      !(await this.store.isManagerOf(auth.userId, targetUserId))
    ) {
      throw new ForbiddenException("Non puoi visualizzare il saldo ferie di questo utente");
    }
    return this.store.getLeaveBalance(targetUserId, targetYear);
  }

  @Patch("balance/:userId")
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  @RequireNexaPermissions("nexa.leaves:write")
  async setBalance(@Param("userId") userId: string, @Body() dto: LeaveAllowanceDto): Promise<unknown> {
    return this.store.setLeaveAllowance(userId, dto.allocatedDays);
  }
}
