import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import type { HrOnboardingWizardStepKey } from "./hr-onboarding.constants";
import { HrOnboardingService } from "./hr-onboarding.service";

class StartFromCandidateDto {
  @IsString()
  candidateId!: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractType?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  managerId?: string;
}

class SaveWizardStepDto {
  @IsString()
  stepKey!: HrOnboardingWizardStepKey;

  @IsObject()
  data!: Record<string, unknown>;

  @IsBoolean()
  markDone!: boolean;
}

class LinkCandidateDto {
  @IsString()
  candidateId!: string;

  @IsString()
  userId!: string;
}

@Controller("hr-onboarding")
@UseGuards(NexaPermissionGuard)
export class HrOnboardingController {
  constructor(private readonly svc: HrOnboardingService) {}

  @Post("start-from-candidate")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async startFromCandidate(@CurrentAuth() auth: AuthContext, @Body() dto: StartFromCandidateDto): Promise<unknown> {
    return this.svc.startFromCandidate({
      companyId: auth.tenantId ?? "comp-1",
      candidateId: dto.candidateId,
      actorUserId: auth.userId,
      roleId: dto.roleId,
      costCenterId: dto.costCenterId,
      contractType: dto.contractType,
      hireDate: dto.hireDate,
      managerId: dto.managerId
    });
  }

  @Post("link-candidate")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async linkCandidate(@CurrentAuth() auth: AuthContext, @Body() dto: LinkCandidateDto): Promise<unknown> {
    return this.svc.linkExistingUser({
      userId: dto.userId,
      candidateId: dto.candidateId,
      companyId: auth.tenantId ?? "comp-1",
      actorUserId: auth.userId
    });
  }

  @Get("wizard/:userId")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async getWizard(@Param("userId") userId: string): Promise<unknown> {
    return this.svc.getWizard(userId);
  }

  @Post("wizard/:userId/reminder")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async sendWizardReminder(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string
  ): Promise<{ ok: true }> {
    return this.svc.sendWizardReminder({
      companyId: auth.tenantId ?? "comp-1",
      userId,
      requestedByUserId: auth.userId
    });
  }

  @Patch("wizard/:userId/step")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async saveStep(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string,
    @Body() dto: SaveWizardStepDto
  ): Promise<unknown> {
    return this.svc.saveStep({
      userId,
      stepKey: dto.stepKey,
      data: dto.data,
      markDone: dto.markDone,
      actorUserId: auth.userId
    });
  }
}
