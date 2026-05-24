import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsObject, IsString } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
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

class PatchChecklistDto {
  @IsString()
  itemId!: string;

  @IsBoolean()
  done!: boolean;
}

@Controller("hr-offboarding")
@UseGuards(RoleGuard, NexaPermissionGuard)
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

  /** Checklist offboarding per dipendente (self-service). */
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
  async completeMyOffboarding(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    return this.svc.completeEmployeeOffboarding(auth.userId);
  }
}
