import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsISO8601, IsOptional, IsString } from "class-validator";
import type { Shift } from "@payday/domain";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class CreateShiftDto {
  @IsString()
  userId!: string;

  @IsISO8601()
  startAt!: string;

  @IsISO8601()
  endAt!: string;

  @IsOptional()
  @IsString()
  premiumCode?: string;
}

@Controller("scheduling")
@UseGuards(NexaPermissionGuard)
export class SchedulingController {
  constructor(private readonly store: HrDataStore) {}

  @Get("shifts")
  @RequireNexaPermissions("nexa.shifts:read")
  async listShifts(
    @CurrentAuth() auth: AuthContext,
    @Query("userId") userId?: string
  ): Promise<{ items: Shift[] }> {
    const items = await this.store.listShiftsForRequester(auth.userId, auth.role, userId);
    return { items };
  }

  @Post("shifts")
  @RequireNexaPermissions("nexa.shifts:write")
  async createShift(@CurrentAuth() auth: AuthContext, @Body() dto: CreateShiftDto): Promise<Shift> {
    return this.store.createShift(auth.userId, auth.role, dto);
  }

  @Delete("shifts/:id")
  @RequireNexaPermissions("nexa.shifts:write")
  async deleteShift(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.store.deleteShift(auth.userId, auth.role, id);
    return { ok: true };
  }
}
