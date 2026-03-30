import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsObject, IsString } from "class-validator";
import type { OnboardingStatus } from "@payday/domain";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class PatchChecklistDto {
  @IsString()
  itemId!: string;

  @IsBoolean()
  done!: boolean;
}

class OffboardDto {
  @IsObject()
  checklist!: Record<string, boolean>;
}

@Controller("lifecycle")
@UseGuards(NexaPermissionGuard)
export class LifecycleController {
  constructor(private readonly store: HrDataStore) {}

  @Get("onboarding/status")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async onboardingStatus(
    @CurrentAuth() auth: AuthContext,
    @Query("userId") userId?: string
  ): Promise<OnboardingStatus> {
    const uid = userId ?? auth.userId;
    return this.store.getOrCreateOnboarding(uid);
  }

  @Patch("onboarding/checklist")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async patchChecklist(
    @CurrentAuth() auth: AuthContext,
    @Query("userId") userId: string | undefined,
    @Body() dto: PatchChecklistDto
  ): Promise<OnboardingStatus> {
    const uid = userId ?? auth.userId;
    return this.store.patchOnboardingItem(uid, dto.itemId, dto.done, auth.userId, auth.role);
  }

  @Post("offboard/:targetUserId")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async offboard(
    @CurrentAuth() auth: AuthContext,
    @Param("targetUserId") targetUserId: string,
    @Body() dto: OffboardDto
  ): Promise<unknown> {
    return this.store.completeOffboard(auth.userId, targetUserId, dto.checklist);
  }
}
