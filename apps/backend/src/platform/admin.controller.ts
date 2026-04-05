import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import ExcelJS from "exceljs";
import { Transform } from "class-transformer";
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { CurrentAuth, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";
import {
  HUB_PERMISSIONS,
  NEXA_HR_PERMISSIONS,
  PLASTICITY_PERMISSIONS,
  SOMA_PERMISSIONS
} from "./permission-catalog";
import { NexaPermissionGuard, RequireNexaPermissions } from "./nexa-permission.guard";
import { SynapseAdminConsoleGuard } from "./synapse-admin-console.guard";
import { ADMIN_EXPORT_FIELD_CATALOG } from "./admin-export.catalog";
import {
  AdminEmployeeExcelService,
  EMPLOYEE_EXCEL_MAX_BYTES
} from "./admin-employee-excel.service";

class CreateRoleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

const PAYROLL_IT_SECTORS = [
  "industry",
  "commerce",
  "services",
  "tourism",
  "credit_insurance",
  "agriculture",
  "custom"
] as const;

function optionalCostCenterCodeTransform(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const s = String(value).trim();
  return s.length === 0 ? undefined : s;
}

class CreateCostCenterDto {
  @IsOptional()
  @Transform(({ value }) => optionalCostCenterCodeTransform(value))
  @IsString()
  code?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsIn(PAYROLL_IT_SECTORS as unknown as string[])
  payrollItSector?: (typeof PAYROLL_IT_SECTORS)[number] | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  payrollDefaultInailPermille?: number | null;
}

class CreateWorkTeamDto {
  @IsString()
  name!: string;
}

class PatchWorkTeamDto {
  @IsOptional()
  @IsString()
  name?: string;
}

class SetWorkTeamMembersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

class SetWorkTeamLeadDto {
  @IsString()
  userId!: string;

  @IsString()
  roleId!: string;
}

class AdminExportBodyDto {
  @IsArray()
  @IsString({ each: true })
  fields!: string[];

  @IsOptional()
  @IsString()
  competencePeriod?: string;
}

class UpdateCostCenterDto {
  @IsOptional()
  @Transform(({ value }) => optionalCostCenterCodeTransform(value))
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsIn(PAYROLL_IT_SECTORS as unknown as string[])
  payrollItSector?: (typeof PAYROLL_IT_SECTORS)[number] | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  payrollDefaultInailPermille?: number | null;
}

const ADMIN_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

@Controller("admin")
@UseGuards(RoleGuard, NexaPermissionGuard, SynapseAdminConsoleGuard)
export class AdminController {
  constructor(
    private readonly store: HrDataStore,
    private readonly employeeExcel: AdminEmployeeExcelService
  ) {}

  @Get("permission-catalog")
  @RequireNexaPermissions("nexa.admin_roles:read")
  permissionCatalog(): unknown {
    return {
      nexa_hr: NEXA_HR_PERMISSIONS,
      plasticity: PLASTICITY_PERMISSIONS,
      soma: SOMA_PERMISSIONS,
      hub: HUB_PERMISSIONS
    };
  }

  @Get("roles")
  @RequireNexaPermissions("nexa.admin_roles:read")
  listRoles(): unknown {
    return this.store.listRoles();
  }

  @Post("roles")
  @RequireNexaPermissions("nexa.admin_roles:write")
  createRole(@Body() dto: CreateRoleDto): unknown {
    return this.store.createRole(dto);
  }

  @Patch("roles/:roleId")
  @RequireNexaPermissions("nexa.admin_roles:write")
  updateRole(@Param("roleId") roleId: string, @Body() dto: UpdateRoleDto): unknown {
    return this.store.updateRole(roleId, dto);
  }

  @Delete("roles/:roleId")
  @RequireNexaPermissions("nexa.admin_roles:write")
  deleteRole(@Param("roleId") roleId: string): unknown {
    return this.store.deleteRole(roleId);
  }

  @Get("cost-centers")
  @RequireNexaPermissions("nexa.admin_cost_centers:read")
  listCostCenters(): unknown {
    return this.store.listCostCenters();
  }

  @Post("cost-centers")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  createCostCenter(@Body() dto: CreateCostCenterDto): unknown {
    return this.store.createCostCenter(dto);
  }

  @Patch("cost-centers/:costCenterId")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  updateCostCenter(
    @Param("costCenterId") costCenterId: string,
    @Body() dto: UpdateCostCenterDto
  ): unknown {
    return this.store.updateCostCenter(costCenterId, dto);
  }

  @Delete("cost-centers/:costCenterId")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  deleteCostCenter(@Param("costCenterId") costCenterId: string): unknown {
    return this.store.deleteCostCenter(costCenterId);
  }

  @Get("cost-centers/:costCenterId/teams")
  @RequireNexaPermissions("nexa.admin_cost_centers:read")
  listWorkTeams(@Param("costCenterId") costCenterId: string): unknown {
    return this.store.listWorkTeamsByCostCenter(costCenterId);
  }

  @Post("cost-centers/:costCenterId/teams")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  createWorkTeam(@Param("costCenterId") costCenterId: string, @Body() dto: CreateWorkTeamDto): unknown {
    return this.store.createWorkTeam(costCenterId, dto.name);
  }

  @Patch("work-teams/:teamId")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  patchWorkTeam(@Param("teamId") teamId: string, @Body() dto: PatchWorkTeamDto): unknown {
    return this.store.updateWorkTeam(teamId, dto);
  }

  @Patch("work-teams/:teamId/members")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  setWorkTeamMembers(@Param("teamId") teamId: string, @Body() dto: SetWorkTeamMembersDto): unknown {
    return this.store.setWorkTeamMembers(teamId, dto.userIds);
  }

  @Patch("work-teams/:teamId/lead")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  setWorkTeamLead(@Param("teamId") teamId: string, @Body() dto: SetWorkTeamLeadDto): unknown {
    return this.store.setTeamLead(teamId, dto.userId, dto.roleId);
  }

  @Get("export/fields")
  @RequireNexaPermissions("nexa.admin_users:read")
  adminExportFieldCatalog(): unknown {
    return { fields: ADMIN_EXPORT_FIELD_CATALOG };
  }

  @Post("export/preview")
  @RequireNexaPermissions("nexa.admin_users:read")
  async adminExportPreview(
    @CurrentAuth() auth: { userId: string },
    @Body() dto: AdminExportBodyDto
  ): Promise<unknown> {
    return this.store.buildAdminExportPreview(auth.userId, dto.fields, dto.competencePeriod);
  }

  @Post("export/xlsx")
  @RequireNexaPermissions("nexa.admin_users:read")
  async adminExportXlsx(
    @CurrentAuth() auth: { userId: string },
    @Body() dto: AdminExportBodyDto
  ): Promise<StreamableFile> {
    const preview = await this.store.buildAdminExportPreview(auth.userId, dto.fields, dto.competencePeriod);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Export");
    ws.addRow(preview.columns.map((c) => c.label));
    for (const r of preview.rows) {
      ws.addRow(preview.columnIds.map((id) => r[id] ?? ""));
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return new StreamableFile(buf, {
      disposition: 'attachment; filename="nexa-hr-export-dipendenti.xlsx"',
      type: ADMIN_XLSX_MIME
    });
  }

  @Get("employee-excel/new-users-template")
  @RequireNexaPermissions("nexa.admin_users:read")
  async employeeExcelNewUsersTemplate(
    @CurrentAuth() auth: { userId: string },
    @Query("rows") rowsRaw?: string
  ): Promise<StreamableFile> {
    const rows = rowsRaw ? Number.parseInt(rowsRaw, 10) : 5;
    const buf = await this.employeeExcel.buildNewUsersTemplate(auth.userId, Number.isFinite(rows) ? rows : 5);
    return new StreamableFile(buf, {
      disposition: 'attachment; filename="nexa-hr-template-nuovi-dipendenti.xlsx"',
      type: ADMIN_XLSX_MIME
    });
  }

  @Post("employee-excel/validate")
  @RequireNexaPermissions("nexa.admin_users:read")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: EMPLOYEE_EXCEL_MAX_BYTES }
    })
  )
  async employeeExcelValidate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: { userId: string }
  ): Promise<unknown> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("File mancante");
    }
    if (
      file.mimetype !== ADMIN_XLSX_MIME &&
      !String(file.originalname ?? "")
        .toLowerCase()
        .endsWith(".xlsx")
    ) {
      throw new BadRequestException("Tipo file non consentito (solo .xlsx)");
    }
    this.employeeExcel.assertXlsxMagic(file.buffer);
    return this.employeeExcel.validateWorkbook(file.buffer, auth.userId);
  }

  @Post("employee-excel/apply")
  @RequireNexaPermissions("nexa.admin_users:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: EMPLOYEE_EXCEL_MAX_BYTES }
    })
  )
  async employeeExcelApply(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: { userId: string }
  ): Promise<unknown> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("File mancante");
    }
    if (
      file.mimetype !== ADMIN_XLSX_MIME &&
      !String(file.originalname ?? "")
        .toLowerCase()
        .endsWith(".xlsx")
    ) {
      throw new BadRequestException("Tipo file non consentito (solo .xlsx)");
    }
    this.employeeExcel.assertXlsxMagic(file.buffer);
    const actorUser = await this.store.getUser(auth.userId);
    return this.employeeExcel.applyWorkbook(file.buffer, auth.userId, {
      userId: auth.userId,
      email: actorUser.email
    });
  }
}
