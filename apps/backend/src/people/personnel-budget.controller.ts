import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import ExcelJS from "exceljs";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";

class CostCenterOrderItemDto {
  @IsString()
  costCenterId!: string;

  @IsInt()
  sortOrder!: number;
}

class PatchBudgetOrderDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CostCenterOrderItemDto)
  order!: CostCenterOrderItemDto[];
}

class BudgetCellPatchDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsNumber()
  budgetRal?: number | null;

  @IsOptional()
  @IsNumber()
  budgetOvertime?: number | null;

  @IsOptional()
  @IsNumber()
  budgetTravel?: number | null;

  @IsOptional()
  @IsNumber()
  budgetInps?: number | null;

  @IsOptional()
  @IsNumber()
  budgetInail?: number | null;

  @IsOptional()
  @IsNumber()
  budgetTfr?: number | null;
}

class PatchBudgetCellsDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCellPatchDto)
  cells!: BudgetCellPatchDto[];
}

class ForecastCellPatchDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsNumber()
  forecastRal?: number | null;

  @IsOptional()
  @IsNumber()
  forecastOvertime?: number | null;

  @IsOptional()
  @IsNumber()
  forecastTravel?: number | null;

  @IsOptional()
  @IsNumber()
  forecastInps?: number | null;

  @IsOptional()
  @IsNumber()
  forecastInail?: number | null;

  @IsOptional()
  @IsNumber()
  forecastTfr?: number | null;
}

class PatchForecastCellsDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ForecastCellPatchDto)
  cells!: ForecastCellPatchDto[];
}

class PatchAnalysisNoteDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsString()
  category!: string;

  @IsString()
  subjectUserId!: string;

  @IsString()
  comment!: string;
}

const PERSONNEL_BUDGET_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

@Controller("hr/personnel-budget")
@UseGuards(NexaPermissionGuard)
export class PersonnelBudgetController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  /** Budget personale: superuser, Synapse admin, o ruolo con `nexa.admin_users:read` (HR esteso). */
  private async assertNexaAdminPersonnelBudget(auth: AuthContext): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const me = await this.store.getUser(auth.userId);
    const ok = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    if (!ok) {
      throw new ForbiddenException("Budget personale riservato agli amministratori");
    }
  }

  private async companyIdForAuth(auth: AuthContext): Promise<string> {
    const me = await this.store.getUser(auth.userId);
    const cid = me.companyId?.trim();
    if (!cid) {
      throw new ForbiddenException("Azienda non associata");
    }
    return cid;
  }

  @Get()
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async get(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string,
    @Query("month") monthQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const now = new Date();
    const year = yearQ ? Number.parseInt(yearQ, 10) : now.getFullYear();
    const month = monthQ ? Number.parseInt(monthQ, 10) : now.getMonth() + 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return this.store.getPersonnelBudgetSnapshot(now.getFullYear(), now.getMonth() + 1);
    }
    return this.store.getPersonnelBudgetSnapshot(year, month);
  }

  @Get("export-actual.xlsx")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async exportActualXlsx(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string,
    @Query("month") monthQ?: string
  ): Promise<StreamableFile> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const now = new Date();
    const y = yearQ ? Number.parseInt(yearQ, 10) : now.getFullYear();
    const mo = monthQ ? Number.parseInt(monthQ, 10) : now.getMonth() + 1;
    const year = Number.isFinite(y) ? y : now.getFullYear();
    const month = Number.isFinite(mo) ? mo : now.getMonth() + 1;
    const snap = await this.store.getPersonnelBudgetSnapshot(year, month);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Actual");
    ws.addRow([
      "Centro di costo",
      "Dipendente",
      "userId",
      "Periodo",
      "ACT RAL",
      "ACT Straord.",
      "ACT Trasferte",
      "ACT INPS",
      "ACT INAIL",
      "ACT TFR",
      "ACT Tot. costo azienda"
    ]);
    for (const d of snap.departments) {
      for (const r of d.rows) {
        const a = r.actual;
        ws.addRow([
          d.costCenterName ?? "",
          r.fullName,
          r.userId,
          snap.period,
          a.ral,
          a.overtime,
          a.travel,
          a.inps,
          a.inail,
          a.tfr,
          a.totalCompanyCost ?? ""
        ]);
      }
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return new StreamableFile(buf, {
      disposition: `attachment; filename="nexa-personnel-budget-actual-${snap.period}.xlsx"`,
      type: PERSONNEL_BUDGET_XLSX_MIME
    });
  }

  @Get("year-status")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async getYearStatus(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const year = yearQ ? Number.parseInt(yearQ, 10) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      return this.store.getPersonnelBudgetYearStatus(cid, new Date().getFullYear());
    }
    return this.store.getPersonnelBudgetYearStatus(cid, year);
  }

  @Post("year-status/approve")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async approveYear(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const year = yearQ ? Number.parseInt(yearQ, 10) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      throw new ForbiddenException("Anno non valido");
    }
    return this.store.approvePersonnelBudgetYear(cid, year, auth.userId);
  }

  @Get("annual-matrix")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async annualMatrix(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const year = yearQ ? Number.parseInt(yearQ, 10) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      return this.store.getPersonnelBudgetAnnualMatrix(cid, new Date().getFullYear());
    }
    return this.store.getPersonnelBudgetAnnualMatrix(cid, year);
  }

  @Post("apply-pro-rata")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async applyProRata(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const year = yearQ ? Number.parseInt(yearQ, 10) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      throw new ForbiddenException("Anno non valido");
    }
    return this.store.applyPersonnelBudgetProRata(cid, year);
  }

  @Get("forecast-snapshot")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async forecastSnapshot(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string,
    @Query("month") monthQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const now = new Date();
    const year = yearQ ? Number.parseInt(yearQ, 10) : now.getFullYear();
    const month = monthQ ? Number.parseInt(monthQ, 10) : now.getMonth() + 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return this.store.getPersonnelBudgetForecastSnapshot(cid, now.getFullYear(), now.getMonth() + 1);
    }
    return this.store.getPersonnelBudgetForecastSnapshot(cid, year, month);
  }

  @Get("analysis")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async analysis(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string,
    @Query("month") monthQ?: string,
    @Query("thresholdPct") thresholdPctQ?: string,
    @Query("thresholdAbs") thresholdAbsQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const now = new Date();
    const year = yearQ ? Number.parseInt(yearQ, 10) : now.getFullYear();
    const month = monthQ ? Number.parseInt(monthQ, 10) : now.getMonth() + 1;
    const thresholdPct = thresholdPctQ != null ? Number.parseFloat(thresholdPctQ) : 5;
    const thresholdAbs = thresholdAbsQ != null ? Number.parseFloat(thresholdAbsQ) : 500;
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return this.store.getPersonnelBudgetAnalysis(cid, now.getFullYear(), now.getMonth() + 1, 5, 500);
    }
    return this.store.getPersonnelBudgetAnalysis(
      cid,
      year,
      month,
      Number.isFinite(thresholdPct) ? thresholdPct : 5,
      Number.isFinite(thresholdAbs) ? thresholdAbs : 500
    );
  }

  @Patch("analysis/note")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchAnalysisNote(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PatchAnalysisNoteDto
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    return this.store.upsertPersonnelBudgetAnalysisNote(
      cid,
      dto.year,
      dto.month,
      dto.category,
      dto.subjectUserId,
      dto.comment,
      auth.userId
    );
  }

  @Patch("cost-center-order")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchOrder(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PatchBudgetOrderDto
  ): Promise<{ ok: true }> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    await this.store.setPersonnelBudgetCostCenterOrder(
      cid,
      dto.year,
      dto.order.map((o) => ({ costCenterId: o.costCenterId.trim(), sortOrder: o.sortOrder }))
    );
    return { ok: true };
  }

  @Patch("cells")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchCells(@CurrentAuth() auth: AuthContext, @Body() dto: PatchBudgetCellsDto): Promise<{ ok: true }> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    await this.store.upsertPersonnelBudgetCells(cid, dto.year, dto.month, dto.cells);
    return { ok: true };
  }

  @Patch("forecast-cells")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchForecastCells(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PatchForecastCellsDto
  ): Promise<{ ok: true }> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    await this.store.upsertPersonnelForecastCells(cid, dto.year, dto.month, dto.cells);
    return { ok: true };
  }
}
