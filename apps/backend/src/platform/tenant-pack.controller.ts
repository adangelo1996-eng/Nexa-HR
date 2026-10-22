import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { ACTIVITY_TEMPLATE_IDS, type ActivityTemplateId, type TenantPackApplyInput } from "@payday/domain";
import { CurrentAuth, type AuthContext } from "./auth";
import { HrDataStore } from "./hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "./nexa-permission.guard";
import { PermissionsService } from "./permissions.service";
import { TenantPackService } from "./tenant-pack.service";

class TenantPackLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50_000)
  maxEmployees?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5_000)
  maxHrSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  plasticityMaxDatasets?: number;
}

class TenantPackDefaultsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(80)
  weeklyFullTimeHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsIn(["IT", "none"])
  payrollCountry?: "IT" | "none";

  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(14)
  payrollInstallmentMonths?: number;
}

class TenantPackWorkflowsDto {
  @IsOptional()
  @IsIn(["manager_then_hr", "hr_only"])
  expenseApproval?: "manager_then_hr" | "hr_only";

  @IsOptional()
  @IsIn(["manager", "hr"])
  leaveApprover?: "manager" | "hr";
}

class TenantPackKpisDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  nexa?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  plasticity?: string[];
}

class TenantPackAnagraficheDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraFields?: string[];
}

class TenantPackExceptionDto {
  @IsString()
  @MaxLength(80)
  id!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @MaxLength(32)
  reviewBy!: string;
}

class ApplyTenantPackDto {
  @IsIn([...ACTIVITY_TEMPLATE_IDS])
  templateId!: ActivityTemplateId;

  @IsOptional()
  @IsObject()
  modules?: Record<string, boolean>;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantPackLimitsDto)
  limits?: TenantPackLimitsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantPackDefaultsDto)
  defaults?: TenantPackDefaultsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantPackWorkflowsDto)
  workflows?: TenantPackWorkflowsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantPackKpisDto)
  kpis?: TenantPackKpisDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantPackAnagraficheDto)
  anagrafiche?: TenantPackAnagraficheDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TenantPackExceptionDto)
  customExceptions?: TenantPackExceptionDto[];
}

@Controller("tenant-pack")
@UseGuards(NexaPermissionGuard)
export class TenantPackController {
  constructor(
    private readonly packs: TenantPackService,
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Get("catalog")
  @RequireNexaPermissions("nexa.org:read")
  catalog(): unknown {
    return this.packs.catalog();
  }

  @Get()
  @RequireNexaPermissions("nexa.org:read")
  async getCurrent(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    const row = await this.packs.getRow(user.companyId);
    return { ...row, catalog: this.packs.catalog() };
  }

  @Post("apply")
  @RequireNexaPermissions("nexa.org:read")
  async apply(@CurrentAuth() auth: AuthContext, @Body() body: ApplyTenantPackDto): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    const can = await this.permissions.canAccessNexaAdminUi(auth.userId, auth.role, user.email);
    if (!can) {
      throw new ForbiddenException("Solo la console admin può applicare un template di attività");
    }
    const input: TenantPackApplyInput = {
      templateId: body.templateId,
      overlay: {
        modules: body.modules,
        limits: body.limits,
        defaults: body.defaults,
        workflows: body.workflows,
        kpis: body.kpis,
        anagrafiche: body.anagrafiche,
        customExceptions: body.customExceptions
      }
    };
    const saved = await this.packs.apply(user.companyId, user.id, input);
    return saved;
  }
}
