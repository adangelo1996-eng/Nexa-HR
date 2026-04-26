import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, StreamableFile, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { HrContractsService, type HrStandardContractStatus } from "./hr-contracts.service";

const MAX_SIGNED_SCAN_B64 = 1_800_000;

class ContractPartyDto {
  @IsString()
  @MaxLength(400)
  companyLegalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  companyAddress?: string;

  @IsString()
  @MaxLength(120)
  employeeFirstName!: string;

  @IsString()
  @MaxLength(120)
  employeeLastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  employeeAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  roleTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  workLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startDateIso?: string;

  @IsOptional()
  @IsNumber()
  ralEuros?: number;

  @IsOptional()
  @IsIn([12, 13, 14])
  payMonthsPerYear?: 12 | 13 | 14;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endDateIso?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fixedTermReason?: string;

  @IsOptional()
  @IsNumber()
  weeklyHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intermittentWorkDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  projectScopeSummary?: string;
}

class ContractBlockDto {
  @IsString()
  key!: string;

  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  locked?: boolean;
}

class CreateStandardContractDto {
  @IsString()
  @MaxLength(400)
  title!: string;

  @ValidateNested()
  @Type(() => ContractPartyDto)
  party!: ContractPartyDto;

  @IsArray()
  blocks!: ContractBlockDto[];

  @IsOptional()
  @IsString()
  recruitCandidateId?: string;

  @IsOptional()
  @IsString()
  recruitPositionId?: string;
}

class PatchStandardContractDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContractPartyDto)
  party?: ContractPartyDto;

  @IsOptional()
  @IsArray()
  blocks?: ContractBlockDto[];

  @IsOptional()
  @IsIn(["draft", "approved", "exported"])
  status?: HrStandardContractStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastExportedDocumentId?: string;
}

class SignContractDto {
  @IsString()
  @MaxLength(160)
  companySignerName!: string;

  @IsString()
  @MaxLength(160)
  employeeSignerName!: string;
}

class UploadSignedScanDto {
  @IsString()
  bodyBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  title?: string;
}

@Controller("hr-contracts")
@UseGuards(NexaPermissionGuard)
export class HrContractsController {
  constructor(private readonly svc: HrContractsService) {}

  @Get()
  @RequireNexaPermissions("nexa.standard_contracts:read")
  async list(@CurrentAuth() auth: AuthContext): Promise<{ items: unknown[] }> {
    const items = await this.svc.listForCompany(auth.tenantId ?? "comp-1");
    return { items };
  }

  @Get(":id/linked-file/:documentId")
  @RequireNexaPermissions("nexa.standard_contracts:read")
  async downloadLinkedFile(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("documentId") documentId: string
  ): Promise<StreamableFile> {
    const f = await this.svc.getContractLinkedFile(auth.tenantId ?? "comp-1", id, documentId);
    let buf: Buffer;
    try {
      buf = Buffer.from(f.base64, "base64");
    } catch {
      throw new BadRequestException("Contenuto file non valido");
    }
    return new StreamableFile(buf, {
      type: f.mimeType || "application/pdf",
      disposition: `inline; filename="${f.filename}"`
    });
  }

  @Get(":id")
  @RequireNexaPermissions("nexa.standard_contracts:read")
  async getOne(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    return this.svc.getById(auth.tenantId ?? "comp-1", id);
  }

  @Post()
  @RequireNexaPermissions("nexa.standard_contracts:write")
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateStandardContractDto): Promise<unknown> {
    return this.svc.create({
      companyId: auth.tenantId ?? "comp-1",
      title: dto.title,
      party: dto.party as unknown as Record<string, unknown>,
      blocks: dto.blocks as unknown[],
      createdByUserId: auth.userId,
      recruitCandidateId: dto.recruitCandidateId ?? null,
      recruitPositionId: dto.recruitPositionId ?? null
    });
  }

  @Patch(":id")
  @RequireNexaPermissions("nexa.standard_contracts:write")
  async patch(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: PatchStandardContractDto
  ): Promise<unknown> {
    return this.svc.update(auth.tenantId ?? "comp-1", id, {
      title: dto.title,
      party: dto.party as Record<string, unknown> | undefined,
      blocks: dto.blocks as unknown[] | undefined,
      status: dto.status,
      lastExportedDocumentId: dto.lastExportedDocumentId
    });
  }

  @Delete(":id")
  @RequireNexaPermissions("nexa.standard_contracts:write")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.svc.delete(auth.tenantId ?? "comp-1", id);
    return { ok: true };
  }

  @Get(":id/versions")
  @RequireNexaPermissions("nexa.standard_contracts:read")
  async versions(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ items: unknown[] }> {
    const items = await this.svc.listVersions(auth.tenantId ?? "comp-1", id);
    return { items };
  }

  @Post(":id/restore/:version")
  @RequireNexaPermissions("nexa.standard_contracts:write")
  async restore(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("version") version: string
  ): Promise<unknown> {
    return this.svc.restoreVersion(auth.tenantId ?? "comp-1", id, Number(version), auth.userId);
  }

  @Post(":id/sign")
  @RequireNexaPermissions("nexa.standard_contracts:write")
  async sign(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() dto: SignContractDto): Promise<unknown> {
    return this.svc.signContract(auth.tenantId ?? "comp-1", id, auth.userId, {
      companySignerName: dto.companySignerName,
      employeeSignerName: dto.employeeSignerName
    });
  }

  @Post(":id/export")
  @RequireNexaPermissions("nexa.standard_contracts:write")
  async exportPdf(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    return this.svc.exportPdf(auth.tenantId ?? "comp-1", id, auth.userId);
  }

  @Post(":id/signed-scan")
  @RequireNexaPermissions("nexa.standard_contracts:write")
  async uploadSignedScan(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UploadSignedScanDto
  ): Promise<unknown> {
    if (dto.bodyBase64 && dto.bodyBase64.length > MAX_SIGNED_SCAN_B64) {
      throw new BadRequestException("File troppo grande per upload inline");
    }
    return this.svc.uploadSignedScan(auth.tenantId ?? "comp-1", id, auth.userId, {
      bodyBase64: dto.bodyBase64,
      mimeType: dto.mimeType,
      title: dto.title
    });
  }
}
