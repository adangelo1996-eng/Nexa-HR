import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { RecruitingService } from "./recruiting.service";

class CreatePositionDto {
  @IsString()
  @MaxLength(140)
  title!: string;

  @IsString()
  jobDescription!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

class CreateCandidateDto {
  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

class AttachCandidateDto {
  @IsString()
  candidateId!: string;

  @IsString()
  positionId!: string;
}

class MoveStageDto {
  @IsString()
  nextStageId!: string;
}

class DecideDto {
  @IsIn(["in_progress", "passed", "failed"])
  status!: "in_progress" | "passed" | "failed";
}

@Controller("recruiting")
@UseGuards(NexaPermissionGuard)
export class RecruitingController {
  constructor(private readonly svc: RecruitingService) {}

  @Get("positions")
  @RequireNexaPermissions("nexa.recruiting:read")
  async listPositions(@CurrentAuth() auth: AuthContext): Promise<{ items: unknown[] }> {
    const tenantId = auth.tenantId ?? "comp-1";
    const items = await this.svc.listPositions(tenantId);
    return { items };
  }

  @Post("positions")
  @RequireNexaPermissions("nexa.recruiting:write")
  async createPosition(@CurrentAuth() auth: AuthContext, @Body() dto: CreatePositionDto): Promise<unknown> {
    return this.svc.createPosition({
      companyId: auth.tenantId ?? "comp-1",
      title: dto.title,
      jobDescription: dto.jobDescription,
      createdByUserId: auth.userId,
      dueDate: dto.dueDate ?? null
    });
  }

  @Delete("positions/:id")
  @RequireNexaPermissions("nexa.recruiting:write")
  async deletePosition(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.svc.deleteOpenPosition(auth.tenantId ?? "comp-1", id);
    return { ok: true };
  }

  @Get("candidates")
  @RequireNexaPermissions("nexa.recruiting:read")
  async listCandidates(@CurrentAuth() auth: AuthContext): Promise<{ items: unknown[] }> {
    const items = await this.svc.listCandidates(auth.tenantId ?? "comp-1");
    return { items };
  }

  @Get("candidates/:id")
  @RequireNexaPermissions("nexa.recruiting:read")
  async getCandidate(@Param("id") id: string): Promise<unknown> {
    const candidate = await this.svc.getCandidate(id);
    const states = await this.svc.listCandidateStates(id);
    return { candidate, states };
  }

  @Post("candidates")
  @RequireNexaPermissions("nexa.recruiting:write")
  async createCandidate(@CurrentAuth() auth: AuthContext, @Body() dto: CreateCandidateDto): Promise<unknown> {
    return this.svc.createCandidate({
      companyId: auth.tenantId ?? "comp-1",
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      notes: dto.notes ?? "",
      createdByUserId: auth.userId
    });
  }

  @Post("attach")
  @RequireNexaPermissions("nexa.recruiting:write")
  async attach(@CurrentAuth() auth: AuthContext, @Body() dto: AttachCandidateDto): Promise<unknown> {
    return this.svc.attachCandidateToPosition({
      companyId: auth.tenantId ?? "comp-1",
      candidateId: dto.candidateId,
      positionId: dto.positionId,
      actorUserId: auth.userId
    });
  }

  @Get("board/:positionId")
  @RequireNexaPermissions("nexa.recruiting:read")
  async board(@Param("positionId") positionId: string): Promise<unknown> {
    return this.svc.listPipelineBoard(positionId);
  }

  @Patch("state/:stateId/move")
  @RequireNexaPermissions("nexa.recruiting:write")
  async move(
    @CurrentAuth() auth: AuthContext,
    @Param("stateId") stateId: string,
    @Body() dto: MoveStageDto
  ): Promise<unknown> {
    return this.svc.moveCandidateToStage({ stateId, nextStageId: dto.nextStageId, actorUserId: auth.userId });
  }

  @Patch("state/:stateId/decision")
  @RequireNexaPermissions("nexa.recruiting:write")
  async decide(
    @CurrentAuth() auth: AuthContext,
    @Param("stateId") stateId: string,
    @Body() dto: DecideDto
  ): Promise<unknown> {
    return this.svc.setCandidateDecision({ stateId, status: dto.status, actorUserId: auth.userId });
  }
}

