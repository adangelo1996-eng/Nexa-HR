import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsArray, IsDateString, IsIn, IsOptional, IsString } from "class-validator";
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
}
