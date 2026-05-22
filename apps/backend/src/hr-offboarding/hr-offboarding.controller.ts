import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsObject, IsString } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import type { HrOffboardingWizardStepKey } from "./hr-offboarding.constants";
import { HrOffboardingService } from "./hr-offboarding.service";

class StartOffboardDto {
  @IsString()
  userId!: string;
}

class SaveOffboardStepDto {
  @IsString()
  stepKey!: HrOffboardingWizardStepKey;

  @IsObject()
  data!: Record<string, unknown>;

  @IsBoolean()
  markDone!: boolean;
}

@Controller("hr-offboarding")
@UseGuards(NexaPermissionGuard)
export class HrOffboardingController {
  constructor(private readonly svc: HrOffboardingService) {}

  @Post("start")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async start(@CurrentAuth() auth: AuthContext, @Body() dto: StartOffboardDto): Promise<unknown> {
    return this.svc.startForEmployee({
      userId: dto.userId,
      companyId: auth.tenantId ?? "comp-1",
      actorUserId: auth.userId
    });
  }

  @Get("wizard/:userId")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async getWizard(@Param("userId") userId: string): Promise<unknown> {
    return this.svc.getWizard(userId);
  }

  @Patch("wizard/:userId/step")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async saveStep(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string,
    @Body() dto: SaveOffboardStepDto
  ): Promise<unknown> {
    return this.svc.saveStep({
      userId,
      stepKey: dto.stepKey,
      data: dto.data,
      markDone: dto.markDone,
      actorUserId: auth.userId
    });
  }

  @Post("wizard/:userId/cancel")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async cancel(@CurrentAuth() auth: AuthContext, @Param("userId") userId: string): Promise<unknown> {
    return this.svc.cancelOffboarding({
      userId,
      companyId: auth.tenantId ?? "comp-1",
      actorUserId: auth.userId
    });
  }
}
