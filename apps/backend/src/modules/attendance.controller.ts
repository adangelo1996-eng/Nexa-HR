import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { CurrentAuth } from "./auth";
import { HrDataStore } from "./hr-data.store";

class ClockDto {
  @IsIn(["clock_in", "clock_out"])
  type!: "clock_in" | "clock_out";

  @IsOptional()
  @IsISO8601()
  at?: string;
}

class AggregateQueryDto {
  @IsOptional()
  @IsIn(["week", "month", "year"])
  scope?: "week" | "month" | "year";

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

@Controller("attendance")
export class AttendanceController {
  constructor(private readonly store: HrDataStore) {}

  @Post("clock")
  async clock(@CurrentAuth() auth: { userId: string }, @Body() dto: ClockDto): Promise<unknown> {
    return this.store.addTimeEntry(auth.userId, dto.type, dto.at);
  }

  @Post("mode")
  async setMode(@CurrentAuth() auth: { userId: string }, @Body() dto: WorkModeDto): Promise<unknown> {
    return this.store.upsertWorkMode(auth.userId, dto.date, dto.mode);
  }

  @Get("entries")
  async entries(
    @CurrentAuth() auth: { userId: string },
    @Query("userId") userId?: string,
    @Query("date") date?: string
  ): Promise<unknown> {
    return this.store.listTimeEntries(userId ?? auth.userId, date);
  }

  @Get("summary")
  async summary(
    @CurrentAuth() auth: { userId: string },
    @Query("userId") userId?: string,
    @Query("date") date?: string
  ): Promise<unknown> {
    return this.store.listWorkdaySummary(userId ?? auth.userId, date);
  }

  @Get("status")
  async status(@CurrentAuth() auth: { userId: string }, @Query("date") date?: string): Promise<unknown> {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    return this.store.getClockStatus(auth.userId, targetDate);
  }

  @Get("aggregates")
  async aggregates(
    @CurrentAuth() auth: { userId: string },
    @Query() query: AggregateQueryDto
  ): Promise<unknown> {
    const targetDate = query.date ?? new Date().toISOString().slice(0, 10);
    return this.store.getOvertimeAggregates(auth.userId, targetDate, query.scope);
  }
}
