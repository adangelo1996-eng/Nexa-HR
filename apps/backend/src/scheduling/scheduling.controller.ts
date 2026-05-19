import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested
} from "class-validator";
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

class BulkCreateShiftsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => CreateShiftDto)
  items!: CreateShiftDto[];
}

class PublishWeekDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "weekStart deve essere YYYY-MM-DD" })
  weekStart!: string;
}

class CreateShiftPresetDto {
  @IsString()
  name!: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  startTime!: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  workTeamId?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

class UpdateShiftPresetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  workTeamId?: string | null;

  @IsOptional()
  @IsString()
  userId?: string | null;
}

@Controller("scheduling")
@UseGuards(NexaPermissionGuard)
export class SchedulingController {
  constructor(private readonly store: HrDataStore) {}

  @Get("proposals")
  @RequireNexaPermissions("nexa.shifts:read")
  async proposals(
    @Query("weekStart") weekStart?: string,
    @Query("respectAbsences") respectAbsences?: string
  ): Promise<{ items: Awaited<ReturnType<HrDataStore["proposeShiftsPreview"]>> }> {
    const ws = weekStart?.trim() || new Date().toISOString().slice(0, 10);
    const ra = respectAbsences === "1" || respectAbsences === "true" || respectAbsences === "yes";
    return { items: await this.store.proposeShiftsPreview(ws, ra) };
  }

  @Get("week")
  @RequireNexaPermissions("nexa.shifts:read")
  async week(
    @CurrentAuth() auth: AuthContext,
    @Query("weekStart") weekStart?: string
  ): Promise<{ items: Shift[] }> {
    const ws = weekStart?.trim() || new Date().toISOString().slice(0, 10);
    return { items: await this.store.listShiftsForPlannerWeek(auth.userId, auth.role, ws) };
  }

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

  @Post("shifts/bulk")
  @RequireNexaPermissions("nexa.shifts:write")
  async createShiftsBulk(@CurrentAuth() auth: AuthContext, @Body() dto: BulkCreateShiftsDto): Promise<{ items: Shift[] }> {
    const items = await this.store.createShiftsBulk(auth.userId, auth.role, dto.items);
    return { items };
  }

  @Post("publish-week")
  @RequireNexaPermissions("nexa.shifts:write")
  async publishWeek(@CurrentAuth() auth: AuthContext, @Body() dto: PublishWeekDto): Promise<{ published: number; notified: number }> {
    return this.store.publishShiftsWeek(auth.userId, auth.role, dto.weekStart);
  }

  @Delete("shifts/:id")
  @RequireNexaPermissions("nexa.shifts:write")
  async deleteShift(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.store.deleteShift(auth.userId, auth.role, id);
    return { ok: true };
  }

  @Get("presets")
  @RequireNexaPermissions("nexa.shifts:read")
  async listPresets(@CurrentAuth() auth: AuthContext): Promise<{ items: Awaited<ReturnType<HrDataStore["listShiftPresets"]>> }> {
    return { items: await this.store.listShiftPresets(auth.userId) };
  }

  @Get("presets/resolve")
  @RequireNexaPermissions("nexa.shifts:read")
  async resolvePreset(
    @CurrentAuth() auth: AuthContext,
    @Query("userId") userId?: string
  ): Promise<{ preset: Awaited<ReturnType<HrDataStore["resolveShiftPresetForUser"]>> }> {
    const uid = userId?.trim() || auth.userId;
    return { preset: await this.store.resolveShiftPresetForUser(uid) };
  }

  @Post("presets")
  @RequireNexaPermissions("nexa.shifts:write")
  async createPreset(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateShiftPresetDto
  ): Promise<{ item: Awaited<ReturnType<HrDataStore["createShiftPreset"]>> }> {
    const item = await this.store.createShiftPreset(auth.userId, dto);
    return { item };
  }

  @Patch("presets/:id")
  @RequireNexaPermissions("nexa.shifts:write")
  async updatePreset(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UpdateShiftPresetDto
  ): Promise<{ item: Awaited<ReturnType<HrDataStore["updateShiftPreset"]>> }> {
    const item = await this.store.updateShiftPreset(auth.userId, id, dto);
    return { item };
  }

  @Delete("presets/:id")
  @RequireNexaPermissions("nexa.shifts:write")
  async deletePreset(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.store.deleteShiftPreset(auth.userId, id);
    return { ok: true };
  }
}
