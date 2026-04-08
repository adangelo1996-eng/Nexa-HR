import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import {
  ThirdPartyLicensesService,
  type AssignmentStatus,
  type ThirdPartyCostFrequency,
  type ThirdPartyLicenseAssignmentRow,
  type ThirdPartyLicenseRow
} from "./third-party-licenses.service";

function mapLicense(r: ThirdPartyLicenseRow): Record<string, unknown> {
  return {
    id: r.id,
    companyId: r.company_id,
    toolName: r.tool_name,
    licensePlan: r.license_plan,
    seatsPurchased: r.seats_purchased,
    costAmountCents: Number(r.cost_amount_cents),
    costFrequency: r.cost_frequency,
    costCenterId: r.cost_center_id,
    renewalDate: r.renewal_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    activeSeatsCount: r.active_seats_count
  };
}

function mapAssignment(r: ThirdPartyLicenseAssignmentRow): Record<string, unknown> {
  return {
    id: r.id,
    companyId: r.company_id,
    userId: r.user_id,
    licenseId: r.license_id,
    status: r.status,
    assignedAt: r.assigned_at,
    revokedAt: r.revoked_at,
    notes: r.notes,
    userFullName: r.user_full_name,
    toolName: r.tool_name,
    licensePlan: r.license_plan
  };
}

class CreateThirdPartyLicenseDto {
  @IsString()
  @MaxLength(200)
  toolName!: string;

  @IsString()
  @MaxLength(200)
  licensePlan!: string;

  @IsInt()
  @Min(0)
  seatsPurchased!: number;

  @IsInt()
  @Min(0)
  costAmountCents!: number;

  @IsIn(["monthly", "annual", "one_time", "other"])
  costFrequency!: ThirdPartyCostFrequency;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  renewalDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

class PatchThirdPartyLicenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  toolName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  licensePlan?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  seatsPurchased?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  costAmountCents?: number;

  @IsOptional()
  @IsIn(["monthly", "annual", "one_time", "other"])
  costFrequency?: ThirdPartyCostFrequency;

  @IsOptional()
  @IsString()
  costCenterId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  renewalDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

class SyncAssignmentItemDto {
  @IsString()
  licenseId!: string;

  @IsIn(["active", "inactive"])
  status!: AssignmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  assignedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class SyncUserAssignmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncAssignmentItemDto)
  items!: SyncAssignmentItemDto[];
}

@Controller("third-party-licenses")
@UseGuards(NexaPermissionGuard)
export class ThirdPartyLicensesController {
  constructor(private readonly svc: ThirdPartyLicensesService) {}

  private companyId(auth: AuthContext): string {
    return auth.tenantId ?? "comp-1";
  }

  @Get()
  @RequireNexaPermissions("nexa.third_party_licenses:read")
  async listLicenses(@CurrentAuth() auth: AuthContext): Promise<{ items: unknown[] }> {
    const rows = await this.svc.listLicenses(this.companyId(auth));
    return { items: rows.map(mapLicense) };
  }

  @Get("assignments")
  @RequireNexaPermissions("nexa.third_party_licenses:read")
  async listAssignments(@CurrentAuth() auth: AuthContext): Promise<{ items: unknown[] }> {
    const rows = await this.svc.listAssignments(this.companyId(auth));
    return { items: rows.map(mapAssignment) };
  }

  @Get("assignments/user/:userId")
  @RequireNexaPermissions("nexa.third_party_licenses:read")
  async userAssignments(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string
  ): Promise<{ items: unknown[] }> {
    const rows = await this.svc.listAssignmentsForUser(this.companyId(auth), userId);
    return { items: rows.map(mapAssignment) };
  }

  @Put("assignments/user/:userId")
  @RequireNexaPermissions("nexa.third_party_licenses:write")
  async syncUserAssignments(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string,
    @Body() dto: SyncUserAssignmentsDto
  ): Promise<{ items: unknown[] }> {
    const rows = await this.svc.syncUserAssignments(this.companyId(auth), userId, dto.items);
    return { items: rows.map(mapAssignment) };
  }

  @Post()
  @RequireNexaPermissions("nexa.third_party_licenses:write")
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateThirdPartyLicenseDto): Promise<unknown> {
    const row = await this.svc.createLicense({
      companyId: this.companyId(auth),
      toolName: dto.toolName,
      licensePlan: dto.licensePlan,
      seatsPurchased: dto.seatsPurchased,
      costAmountCents: dto.costAmountCents,
      costFrequency: dto.costFrequency,
      costCenterId: dto.costCenterId ?? null,
      renewalDate: dto.renewalDate ?? null,
      notes: dto.notes ?? "",
      createdByUserId: auth.userId
    });
    return mapLicense(row);
  }

  @Patch(":id")
  @RequireNexaPermissions("nexa.third_party_licenses:write")
  async patch(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: PatchThirdPartyLicenseDto
  ): Promise<unknown> {
    const row = await this.svc.updateLicense(this.companyId(auth), id, {
      toolName: dto.toolName,
      licensePlan: dto.licensePlan,
      seatsPurchased: dto.seatsPurchased,
      costAmountCents: dto.costAmountCents,
      costFrequency: dto.costFrequency,
      costCenterId: dto.costCenterId,
      renewalDate: dto.renewalDate,
      notes: dto.notes
    });
    return mapLicense(row);
  }

  @Delete(":id")
  @RequireNexaPermissions("nexa.third_party_licenses:write")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.svc.deleteLicense(this.companyId(auth), id);
    return { ok: true };
  }

  @Get(":id")
  @RequireNexaPermissions("nexa.third_party_licenses:read")
  async getOne(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    const row = await this.svc.getLicense(this.companyId(auth), id);
    return mapLicense(row);
  }
}
