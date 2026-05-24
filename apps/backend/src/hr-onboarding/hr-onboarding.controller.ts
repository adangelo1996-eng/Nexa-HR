import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import type { HrOnboardingWizardStepKey } from "./hr-onboarding.constants";
import { HrOnboardingBuddyService } from "./hr-onboarding-buddy.service";
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

class PatchChecklistDto {
  @IsString()
  itemId!: string;

  @IsBoolean()
  done!: boolean;
}

class ConfirmBuddyDto {
  @IsString()
  buddyUserId!: string;

  @IsOptional()
  @IsNumber()
  matchScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  matchReason?: string;
}

@Controller("hr-onboarding")
@UseGuards(RoleGuard, NexaPermissionGuard)
export class HrOnboardingController {
  constructor(
    private readonly svc: HrOnboardingService,
    private readonly buddy: HrOnboardingBuddyService
  ) {}

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

  @Get("wizard/:userId/buddy-suggestions")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async buddySuggestions(@CurrentAuth() auth: AuthContext, @Param("userId") userId: string): Promise<unknown> {
    return this.buddy.suggestBuddies(userId, auth.userId);
  }

  @Get("wizard/:userId/buddy-assignment")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async buddyAssignment(@Param("userId") userId: string): Promise<unknown> {
    return this.buddy.getAssignment(userId);
  }

  @Post("wizard/:userId/buddy/confirm")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async confirmBuddy(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string,
    @Body() dto: ConfirmBuddyDto
  ): Promise<unknown> {
    return this.buddy.confirmBuddy({
      newHireUserId: userId,
      buddyUserId: dto.buddyUserId,
      actorUserId: auth.userId,
      matchScore: dto.matchScore,
      matchReason: dto.matchReason
    });
  }

  @Post("wizard/:userId/complete")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async completeWizard(@CurrentAuth() auth: AuthContext, @Param("userId") userId: string): Promise<unknown> {
    return this.svc.finalizeWizard(userId, auth.userId);
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

  /** Checklist onboarding per dipendente (self-service). */
  @Get("my/checklist")
  @RequireRole("user")
  async myChecklist(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    return this.svc.getEmployeeChecklist(auth.userId);
  }

  @Patch("my/checklist")
  @RequireRole("user")
  async patchMyChecklist(@CurrentAuth() auth: AuthContext, @Body() dto: PatchChecklistDto): Promise<unknown> {
    return this.svc.patchEmployeeChecklistItem(
      auth.userId,
      dto.itemId,
      dto.done,
      auth.userId,
      auth.role
    );
  }

  @Post("my/complete")
  @RequireRole("user")
  async completeMyOnboarding(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    return this.svc.completeEmployeeOnboarding(auth.userId, auth.userId);
  }
}
