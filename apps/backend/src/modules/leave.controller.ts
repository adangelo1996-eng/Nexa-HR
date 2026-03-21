import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsInt, IsString, Max, Min } from "class-validator";
import { CurrentAuth, RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";

class LeaveDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

class LeaveAllowanceDto {
  @IsInt()
  @Min(0)
  @Max(120)
  allocatedDays!: number;
}

@Controller("leave")
export class LeaveController {
  constructor(private readonly store: HrDataStore) {}

  @Post("plan")
  async create(@CurrentAuth() auth: { userId: string }, @Body() dto: LeaveDto): Promise<unknown> {
    return this.store.createLeavePlan({
      userId: auth.userId,
      startDate: dto.startDate,
      endDate: dto.endDate
    });
  }

  @Patch("plan/:leaveId")
  async update(
    @Param("leaveId") leaveId: string,
    @Body() dto: LeaveDto
  ): Promise<unknown> {
    return this.store.updateLeavePlan(leaveId, dto.startDate, dto.endDate);
  }

  @Patch("approve/:leaveId")
  @UseGuards(RoleGuard)
  @RequireRole("manager_controllo_gestione")
  async approve(@Param("leaveId") leaveId: string, @CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const leave = await this.store.getLeave(leaveId);
    if (!(await this.store.isManagerOf(auth.userId, leave.userId))) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.approveLeave(leaveId, auth.userId);
  }

  @Patch("reject/:leaveId")
  @UseGuards(RoleGuard)
  @RequireRole("manager_controllo_gestione")
  async reject(@Param("leaveId") leaveId: string, @CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const leave = await this.store.getLeave(leaveId);
    if (!(await this.store.isManagerOf(auth.userId, leave.userId))) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.rejectLeave(leaveId, auth.userId);
  }

  @Get("plan")
  async list(@CurrentAuth() auth: { userId: string }, @Query("userId") userId?: string): Promise<unknown> {
    return this.store.listLeave(userId ?? auth.userId);
  }

  @Get("balance")
  async balance(
    @CurrentAuth() auth: { userId: string; role: "admin" | "manager_controllo_gestione" | "employee" },
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
  async setBalance(@Param("userId") userId: string, @Body() dto: LeaveAllowanceDto): Promise<unknown> {
    return this.store.setLeaveAllowance(userId, dto.allocatedDays);
  }
}
