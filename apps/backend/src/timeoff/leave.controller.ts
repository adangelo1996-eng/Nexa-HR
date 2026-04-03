import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { CurrentAuth, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class LeaveDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsIn(["annual", "rol"])
  kind?: "annual" | "rol";
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
  constructor(private readonly store: HrDataStore) {}

  @Post("plan")
  @RequireNexaPermissions("nexa.leaves:write")
  async create(@CurrentAuth() auth: { userId: string }, @Body() dto: LeaveDto): Promise<unknown> {
    return this.store.createLeavePlan({
      userId: auth.userId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      kind: dto.kind ?? "annual"
    });
  }

  @Patch("plan/:leaveId")
  @RequireNexaPermissions("nexa.leaves:write")
  async update(
    @Param("leaveId") leaveId: string,
    @Body() dto: LeaveDto
  ): Promise<unknown> {
    return this.store.updateLeavePlan(leaveId, dto.startDate, dto.endDate);
  }

  @Patch("approve/:leaveId")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@Param("leaveId") leaveId: string, @CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const leave = await this.store.getLeave(leaveId);
    if (!(await this.store.isManagerOf(auth.userId, leave.userId))) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.approveLeave(leaveId, auth.userId);
  }

  @Patch("reject/:leaveId")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(@Param("leaveId") leaveId: string, @CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const leave = await this.store.getLeave(leaveId);
    if (!(await this.store.isManagerOf(auth.userId, leave.userId))) {
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
