import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsISO8601, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { sign } from "jsonwebtoken";
import { getAuthJwtSecret } from "../platform/auth-jwt-secret";
import { AttendanceTeamService } from "./attendance-team.service";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

const CLOCK_CHANNELS = ["app", "web", "qr"] as const;

class GeoDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lon!: number;

  @IsOptional()
  @IsNumber()
  accuracyM?: number;

  @IsOptional()
  @IsString()
  capturedAt?: string;
}

class ClockDto {
  @IsIn(["clock_in", "clock_out"])
  type!: "clock_in" | "clock_out";

  @IsOptional()
  @IsISO8601()
  at?: string;

  @IsOptional()
  @IsIn(CLOCK_CHANNELS)
  source?: (typeof CLOCK_CHANNELS)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoDto)
  geo?: GeoDto;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

class AggregateQueryDto {
  @IsOptional()
  @IsIn(["week", "month", "year"])
  scope?: "day" | "week" | "month" | "year";

  @IsOptional()
  @IsString()
  date?: string;
}

class WorkModeDto {
  @IsString()
  date!: string;

  @IsIn(["office", "smartworking"])
  mode!: "office" | "smartworking";
}

class TeamEntryDto {
  @IsString()
  userId!: string;

  @IsIn(["clock_in", "clock_out"])
  type!: "clock_in" | "clock_out";

  @IsOptional()
  @IsISO8601()
  at?: string;

  @IsOptional()
  @IsIn(CLOCK_CHANNELS)
  source?: (typeof CLOCK_CHANNELS)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoDto)
  geo?: GeoDto;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

class TeamEntriesBulkDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamEntryDto)
  entries!: TeamEntryDto[];
}

class PatchTimeEntryDto {
  @IsOptional()
  @IsISO8601()
  at?: string;

  @IsOptional()
  @IsIn(["clock_in", "clock_out"])
  type?: "clock_in" | "clock_out";
}

function parseBoardCostCenterIds(raw?: string): string[] | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

@Controller("attendance")
@UseGuards(NexaPermissionGuard)
export class AttendanceController {
  constructor(
    private readonly store: HrDataStore,
    private readonly team: AttendanceTeamService
  ) {}

  @Post("qr-token")
  @RequireNexaPermissions("nexa.attendance:write")
  mintQrToken(@CurrentAuth() auth: AuthContext): { token: string; expiresInSec: number } {
    const secret = getAuthJwtSecret();
    const expiresInSec = 900;
    const token = sign(
      { sub: auth.userId, typ: "attendance_qr" },
      secret,
      { algorithm: "HS256", expiresIn: expiresInSec }
    );
    return { token, expiresInSec };
  }

  @Post("clock")
  @RequireNexaPermissions("nexa.attendance:write")
  async clock(@CurrentAuth() auth: { userId: string }, @Body() dto: ClockDto): Promise<unknown> {
    return this.store.addTimeEntry(auth.userId, dto.type, dto.at, {
      source: dto.source,
      geo: dto.geo,
      deviceId: dto.deviceId
    });
  }

  @Post("mode")
  @RequireNexaPermissions("nexa.attendance:write")
  async setMode(@CurrentAuth() auth: { userId: string }, @Body() dto: WorkModeDto): Promise<unknown> {
    return this.store.upsertWorkMode(auth.userId, dto.date, dto.mode);
  }

  /** Path statico prima di GET entries per evitare conflitti di routing. */
  @Get("entries/export")
  @RequireNexaPermissions("nexa.attendance:read")
  async exportMonth(
    @CurrentAuth() auth: AuthContext,
    @Query("month") month: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    await this.team.assertHrOrNexaAdminForAttendanceExports(auth.userId, auth.role);
    AttendanceTeamService.assertValidMonth(month);
    const buf = await this.team.buildMonthExportXlsx(month);
    const filename = `nexa-timbrature-${month}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return new StreamableFile(buf);
  }

  @Get("entries")
  @RequireNexaPermissions("nexa.attendance:read")
  async entries(
    @CurrentAuth() auth: { userId: string },
    @Query("userId") queryUserId?: string,
    @Query("date") date?: string,
    @Query("month") month?: string
  ): Promise<unknown> {
    const targetUserId = queryUserId ?? auth.userId;
    await this.team.assertCanViewUserAttendance(auth.userId, targetUserId);
    if (month) {
      AttendanceTeamService.assertValidMonth(month);
      return this.store.listTimeEntries(targetUserId, { month });
    }
    return this.store.listTimeEntries(targetUserId, date ? { date } : undefined);
  }

  @Get("team/users")
  @RequireNexaPermissions("nexa.attendance:read")
  async teamUsers(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    return this.team.listPickerUsers(auth.userId);
  }

  @Get("team/day-board/cost-centers")
  @RequireNexaPermissions("nexa.attendance:read")
  async teamDayBoardCostCenters(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    return { costCenters: await this.team.listDayBoardCostCenterFilters(auth.userId, auth.role) };
  }

  /** Export Excel della vista giornaliera (stessi filtri della GET board). */
  @Get("team/day-board/export")
  @RequireNexaPermissions("nexa.attendance:read")
  async teamDayBoardExport(
    @CurrentAuth() auth: AuthContext,
    @Query("date") date: string | undefined,
    @Query("costCenterIds") costCenterIdsRaw: string | undefined,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const cc = parseBoardCostCenterIds(costCenterIdsRaw);
    const buf = await this.team.buildDayBoardExportXlsx(auth.userId, day, cc, auth.role);
    const safeDay = day.slice(0, 10);
    const filename = `nexa-presenze-giorno-${safeDay}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return new StreamableFile(buf);
  }

  /** Vista giornaliera HR: dipendenti per CDC/team, timbrature e stati da calendario. */
  @Get("team/day-board")
  @RequireNexaPermissions("nexa.attendance:read")
  async teamDayBoard(
    @CurrentAuth() auth: AuthContext,
    @Query("date") date: string | undefined,
    @Query("costCenterIds") costCenterIdsRaw: string | undefined
  ): Promise<unknown> {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const cc = parseBoardCostCenterIds(costCenterIdsRaw);
    return this.team.getDayAttendanceBoard(auth.userId, day, cc, auth.role);
  }

  @Post("team/entries")
  @RequireNexaPermissions("nexa.attendance:write")
  async teamAddEntry(
    @CurrentAuth() auth: { userId: string },
    @Body() dto: TeamEntryDto
  ): Promise<unknown> {
    await this.team.assertCanManageTeam(auth.userId);
    await this.team.assertCanViewUserAttendance(auth.userId, dto.userId);
    return this.store.addTimeEntryAdmin(dto.userId, dto.type, dto.at, {
      source: dto.source ?? "web",
      geo: dto.geo,
      deviceId: dto.deviceId
    });
  }

  @Post("team/entries/bulk")
  @RequireNexaPermissions("nexa.attendance:write")
  async teamAddEntriesBulk(
    @CurrentAuth() auth: { userId: string },
    @Body() dto: TeamEntriesBulkDto
  ): Promise<ReturnType<AttendanceTeamService["bulkAddTeamEntries"]>> {
    return this.team.bulkAddTeamEntries(auth.userId, dto.entries ?? []);
  }

  @Patch("entries/:entryId")
  @RequireNexaPermissions("nexa.attendance:write")
  async patchEntry(
    @CurrentAuth() auth: { userId: string },
    @Param("entryId") entryId: string,
    @Body() dto: PatchTimeEntryDto
  ): Promise<unknown> {
    await this.team.assertCanManageTeam(auth.userId);
    const existing = await this.store.getTimeEntryById(entryId);
    if (!existing) {
      throw new NotFoundException("Timbratura non trovata");
    }
    await this.team.assertCanViewUserAttendance(auth.userId, existing.userId);
    if (!dto.at && dto.type === undefined) {
      return existing;
    }
    return this.store.updateTimeEntryById(entryId, { at: dto.at, type: dto.type });
  }

  @Delete("entries/:entryId")
  @RequireNexaPermissions("nexa.attendance:write")
  async deleteEntry(
    @CurrentAuth() auth: { userId: string },
    @Param("entryId") entryId: string
  ): Promise<unknown> {
    await this.team.assertCanManageTeam(auth.userId);
    const existing = await this.store.getTimeEntryById(entryId);
    if (!existing) {
      throw new NotFoundException("Timbratura non trovata");
    }
    await this.team.assertCanViewUserAttendance(auth.userId, existing.userId);
    return this.store.deleteTimeEntryById(entryId);
  }

  @Get("summary")
  @RequireNexaPermissions("nexa.attendance:read")
  async summary(
    @CurrentAuth() auth: { userId: string },
    @Query("userId") queryUserId?: string,
    @Query("date") date?: string
  ): Promise<unknown> {
    const targetUserId = queryUserId ?? auth.userId;
    await this.team.assertCanViewUserAttendance(auth.userId, targetUserId);
    return this.store.listWorkdaySummary(targetUserId, date);
  }

  @Get("status")
  @RequireNexaPermissions("nexa.attendance:read")
  async status(@CurrentAuth() auth: { userId: string }, @Query("date") date?: string): Promise<unknown> {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    return this.store.getClockStatus(auth.userId, targetDate);
  }

  @Get("aggregates")
  @RequireNexaPermissions("nexa.attendance:read")
  async aggregates(
    @CurrentAuth() auth: { userId: string },
    @Query() query: AggregateQueryDto
  ): Promise<unknown> {
    const targetDate = query.date ?? new Date().toISOString().slice(0, 10);
    return this.store.getOvertimeAggregates(auth.userId, targetDate, query.scope);
  }
}
