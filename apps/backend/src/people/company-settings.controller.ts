import { Body, Controller, ForbiddenException, Get, Patch, UseGuards } from "@nestjs/common";
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";

class PatchCompanySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  companyLegalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyVatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  companyRegistrationInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  defaultCurrency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(80)
  weeklyFullTimeHours?: number;

  @IsOptional()
  @IsObject()
  customVariables?: Record<string, string>;
}

@Controller("company")
@UseGuards(NexaPermissionGuard)
export class CompanySettingsController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Get("settings")
  @RequireNexaPermissions("nexa.org:read")
  async getSettings(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    return this.store.getCompanySettings(user.companyId);
  }

  @Patch("settings")
  @RequireNexaPermissions("nexa.org:read")
  async patchSettings(
    @CurrentAuth() auth: AuthContext,
    @Body() body: PatchCompanySettingsDto
  ): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    const can = await this.permissions.canAccessNexaAdminUi(auth.userId, auth.role, user.email);
    if (!can) {
      throw new ForbiddenException("Solo chi può accedere alla console admin può modificare le variabili aziendali");
    }
    return this.store.patchCompanySettings(user.companyId, body);
  }
}
