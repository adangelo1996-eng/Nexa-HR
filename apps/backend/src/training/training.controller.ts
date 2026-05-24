import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { TrainingService, type TrainingAssignmentStatus } from "./training.service";

class AssignCoursesDto {
  @IsString()
  userId!: string;

  @IsArray()
  @IsString({ each: true })
  courseIds!: string[];

  @IsDateString()
  dueDate!: string;
}

class BatchAssignCoursesDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];

  @IsArray()
  @IsString({ each: true })
  courseIds!: string[];

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsBoolean()
  assignAllEmployees?: boolean;
}

class PatchStatusDto {
  @IsIn(["not_started", "in_progress", "completed"])
  status!: TrainingAssignmentStatus;
}

@Controller("training")
@UseGuards(NexaPermissionGuard)
export class TrainingController {
  constructor(private readonly svc: TrainingService) {}

  @Get("courses")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async listCourses(
    @CurrentAuth() auth: AuthContext,
    @Query("category") category?: "mandatory" | "optional"
  ): Promise<{ items: unknown[] }> {
    const items = await this.svc.listCourses(auth.tenantId ?? "comp-1", category ? { category } : undefined);
    return { items };
  }

  @Get("my-assignments")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async myAssignments(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    const items = await this.svc.listAssignmentsForUser(auth.userId);
    return { items, progress: this.svc.progressSummary(items) };
  }

  @Get("assignments")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async companyAssignments(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    const companyId = auth.tenantId ?? "comp-1";
    const items = await this.svc.listAssignmentsForCompany(companyId);
    return { items };
  }

  @Get("assignments/:userId")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async userAssignments(@Param("userId") userId: string): Promise<unknown> {
    const items = await this.svc.listAssignmentsForUser(userId);
    return { items, progress: this.svc.progressSummary(items) };
  }

  @Post("assign")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async assign(@CurrentAuth() auth: AuthContext, @Body() dto: AssignCoursesDto): Promise<{ items: unknown[] }> {
    const companyId = auth.tenantId ?? "comp-1";
    const items = [];
    for (const courseId of dto.courseIds) {
      items.push(
        await this.svc.assignCourse({
          companyId,
          userId: dto.userId,
          courseId,
          dueDate: dto.dueDate,
          assignedBy: auth.userId
        })
      );
    }
    return { items };
  }

  @Post("assign-batch")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async assignBatch(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: BatchAssignCoursesDto
  ): Promise<{ items: unknown[]; assignedCount: number }> {
    const companyId = auth.tenantId ?? "comp-1";
    const userIds = dto.assignAllEmployees
      ? await this.svc.listAssignableEmployeeIds(companyId)
      : dto.userIds;
    const items = await this.svc.assignCoursesBatch({
      companyId,
      userIds,
      courseIds: dto.courseIds,
      dueDate: dto.dueDate,
      assignedBy: auth.userId
    });
    return { items, assignedCount: items.length };
  }

  @Get("courses/:courseId")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async getCourse(
    @CurrentAuth() auth: AuthContext,
    @Param("courseId") courseId: string
  ): Promise<unknown> {
    const companyId = auth.tenantId ?? "comp-1";
    return this.svc.getCourseById(companyId, courseId);
  }

  @Patch("assignments/:assignmentId/status")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async patchStatus(
    @CurrentAuth() auth: AuthContext,
    @Param("assignmentId") assignmentId: string,
    @Body() dto: PatchStatusDto
  ): Promise<unknown> {
    return this.svc.patchAssignmentStatus({
      assignmentId,
      userId: auth.userId,
      status: dto.status
    });
  }

  @Post("assignments/:assignmentId/reminder")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async sendReminder(
    @CurrentAuth() auth: AuthContext,
    @Param("assignmentId") assignmentId: string
  ): Promise<{ ok: true }> {
    const companyId = auth.tenantId ?? "comp-1";
    return this.svc.sendAssignmentReminder({
      companyId,
      assignmentId,
      requestedByUserId: auth.userId
    });
  }

  @Get("validity-alerts")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async validityAlerts(
    @CurrentAuth() auth: AuthContext,
    @Query("days") days?: string
  ): Promise<{ items: unknown[]; thresholdDays: number }> {
    const companyId = auth.tenantId ?? "comp-1";
    const parsed = days != null ? Number(days) : undefined;
    const thresholdDays =
      parsed != null && Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.round(parsed))) : undefined;
    return this.svc.listExpiringValidities({ companyId, thresholdDays });
  }

  @Post("validity-alerts/:assignmentId/renew")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async renewValidity(
    @CurrentAuth() auth: AuthContext,
    @Param("assignmentId") assignmentId: string,
    @Body() body: { dueDate?: string }
  ): Promise<{ assignment: unknown; notified: true }> {
    const companyId = auth.tenantId ?? "comp-1";
    return this.svc.renewAssignmentForExpiringValidity({
      companyId,
      assignmentId,
      requestedByUserId: auth.userId,
      dueDate: body?.dueDate
    });
  }
}
