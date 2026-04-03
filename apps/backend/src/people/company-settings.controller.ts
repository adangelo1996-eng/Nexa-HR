import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

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
  constructor(private readonly store: HrDataStore) {}

  @Get("settings")
  @RequireNexaPermissions("nexa.org:read")
  async getSettings(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    return this.store.getCompanySettings(user.companyId);
  }

  @Patch("settings")
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  @RequireNexaPermissions("nexa.org:read")
  async patchSettings(
    @CurrentAuth() auth: AuthContext,
    @Body() body: PatchCompanySettingsDto
  ): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    return this.store.patchCompanySettings(user.companyId, body);
  }
}
