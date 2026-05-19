import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Param,
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

class PlannedExtraLineDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  costCenterId?: string | null;

  @IsString()
  label!: string;

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

class PatchAssumptionsDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsNumber()
  employerInpsPercent?: number | null;

  @IsOptional()
  @IsNumber()
  inailPermille?: number | null;

  @IsOptional()
  @IsNumber()
  tfrDivisor?: number | null;

  @IsOptional()
  @IsNumber()
  welfarePercent?: number | null;

  @IsOptional()
  @IsNumber()
  bonusProvisionPercent?: number | null;
}

class PatchCellNoteDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number | null;

  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsOptional()
  @IsString()
  plannedLineId?: string | null;

  @IsString()
  fieldKey!: string;

  @IsString()
  note!: string;
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
    const cid = await this.companyIdForAuth(auth);
    const now = new Date();
    const y = yearQ ? Number.parseInt(yearQ, 10) : now.getFullYear();
    const mo = monthQ ? Number.parseInt(monthQ, 10) : undefined;
    const year = Number.isFinite(y) ? y : now.getFullYear();
    const monthFilter = mo != null && Number.isFinite(mo) ? mo : undefined;
    const wb = new ExcelJS.Workbook();
    const months =
      monthFilter != null
        ? [monthFilter]
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    const wsAct = wb.addWorksheet("Actual");
    wsAct.addRow([
      "Mese",
      "Centro di costo",
      "Dipendente",
      "userId",
      "ACT RAL",
      "ACT Straord.",
      "ACT Trasferte",
      "ACT INPS",
      "ACT INAIL",
      "ACT TFR",
      "ACT Tot. costo azienda"
    ]);
    const wsBdg = wb.addWorksheet("Budget");
    wsBdg.addRow([
      "Mese",
      "Centro di costo",
      "Dipendente",
      "userId",
      "BDG RAL",
      "BDG Straord.",
      "BDG Trasferte",
      "BDG INPS",
      "BDG INAIL",
      "BDG TFR",
      "BDG Tot. costo azienda"
    ]);
    const wsFc = wb.addWorksheet("Forecast");
    wsFc.addRow([
      "Mese",
      "Centro di costo",
      "Dipendente",
      "userId",
      "FCST RAL",
      "FCST Straord.",
      "FCST Trasferte",
      "FCST INPS",
      "FCST INAIL",
      "FCST TFR",
      "FCST Tot. costo azienda"
    ]);
    const wsAn = wb.addWorksheet("Analysis");
    wsAn.addRow([
      "Mese",
      "Categoria",
      "Dipendente",
      "userId",
      "Actual",
      "Budget",
      "Forecast",
      "Varianza B-F",
      "Varianza %"
    ]);

    for (const month of months) {
      const snap = await this.store.getPersonnelBudgetSnapshot(year, month);
      const forecast = await this.store.getPersonnelBudgetForecastSnapshot(cid, year, month);
      const analysis = await this.store.getPersonnelBudgetAnalysis(cid, year, month, 5, 500);
      const fcByUser = new Map<string, (typeof forecast.departments)[0]["rows"][0]>();
      for (const d of forecast.departments) {
        for (const r of d.rows) {
          fcByUser.set(r.userId, r);
        }
      }
      for (const d of snap.departments) {
        for (const r of d.rows) {
          const a = r.actual;
          const b = r.budget;
          const fr = fcByUser.get(r.userId)?.forecast ?? {};
          wsAct.addRow([
            month,
            d.costCenterName ?? "",
            r.fullName,
            r.userId,
            a.ral,
            a.overtime,
            a.travel,
            a.inps,
            a.inail,
            a.tfr,
            a.totalCompanyCost ?? ""
          ]);
          wsBdg.addRow([
            month,
            d.costCenterName ?? "",
            r.fullName,
            r.userId,
            b.ral ?? "",
            b.overtime ?? "",
            b.travel ?? "",
            b.inps ?? "",
            b.inail ?? "",
            b.tfr ?? "",
            b.totalCompanyCost ?? ""
          ]);
          wsFc.addRow([
            month,
            d.costCenterName ?? "",
            r.fullName,
            r.userId,
            fr.ral ?? "",
            fr.overtime ?? "",
            fr.travel ?? "",
            fr.inps ?? "",
            fr.inail ?? "",
            fr.tfr ?? "",
            fr.totalCompanyCost ?? ""
          ]);
        }
      }
      for (const v of analysis.variances) {
        wsAn.addRow([
          month,
          v.category,
          v.fullName,
          v.userId,
          v.actual,
          v.budget,
          v.forecast,
          v.varianceBf,
          v.variancePct ?? ""
        ]);
      }
    }

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const label =
      monthFilter != null
        ? `${year}-${String(monthFilter).padStart(2, "0")}`
        : String(year);
    return new StreamableFile(buf, {
      disposition: `attachment; filename="nexa-personnel-budget-${label}.xlsx"`,
      type: PERSONNEL_BUDGET_XLSX_MIME
    });
  }

  @Get("year-monthly")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async yearMonthly(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const year = yearQ ? Number.parseInt(yearQ, 10) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      return this.store.getPersonnelBudgetYearMonthly(cid, new Date().getFullYear());
    }
    return this.store.getPersonnelBudgetYearMonthly(cid, year);
  }

  @Get("assumptions")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async getAssumptions(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const year = yearQ ? Number.parseInt(yearQ, 10) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      return this.store.getPersonnelBudgetAssumptions(cid, new Date().getFullYear());
    }
    return this.store.getPersonnelBudgetAssumptions(cid, year);
  }

  @Patch("assumptions")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchAssumptions(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PatchAssumptionsDto
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    return this.store.upsertPersonnelBudgetAssumptions(
      cid,
      dto.year,
      {
        employerInpsPercent: dto.employerInpsPercent,
        inailPermille: dto.inailPermille,
        tfrDivisor: dto.tfrDivisor,
        welfarePercent: dto.welfarePercent,
        bonusProvisionPercent: dto.bonusProvisionPercent
      },
      auth.userId
    );
  }

  @Get("cell-notes")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async listCellNotes(
    @CurrentAuth() auth: AuthContext,
    @Query("year") yearQ?: string,
    @Query("month") monthQ?: string
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const year = yearQ ? Number.parseInt(yearQ, 10) : new Date().getFullYear();
    const month = monthQ != null ? Number.parseInt(monthQ, 10) : undefined;
    if (!Number.isFinite(year)) {
      return this.store.listPersonnelBudgetCellNotes(cid, new Date().getFullYear());
    }
    return this.store.listPersonnelBudgetCellNotes(
      cid,
      year,
      month != null && Number.isFinite(month) ? month : undefined
    );
  }

  @Patch("cell-notes")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async patchCellNote(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PatchCellNoteDto
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    const me = await this.store.getUser(auth.userId);
    return this.store.upsertPersonnelBudgetCellNote(
      cid,
      {
        year: dto.year,
        month: dto.month ?? null,
        userId: dto.userId ?? null,
        plannedLineId: dto.plannedLineId ?? null,
        fieldKey: dto.fieldKey,
        note: dto.note
      },
      auth.userId,
      me.fullName
    );
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

  @Post("planned-extra-lines")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async upsertPlannedExtraLine(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PlannedExtraLineDto
  ): Promise<unknown> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    return this.store.upsertPersonnelBudgetPlannedExtraLine(cid, {
      id: dto.id,
      year: dto.year,
      month: dto.month,
      costCenterId: dto.costCenterId ?? null,
      label: dto.label,
      budgetRal: dto.budgetRal,
      budgetOvertime: dto.budgetOvertime,
      budgetTravel: dto.budgetTravel,
      budgetInps: dto.budgetInps,
      budgetInail: dto.budgetInail,
      budgetTfr: dto.budgetTfr
    });
  }

  @Post("planned-extra-lines/:id/delete")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  async deletePlannedExtraLine(
    @CurrentAuth() auth: AuthContext,
    @Param("id") lineId: string
  ): Promise<{ ok: true }> {
    await this.assertNexaAdminPersonnelBudget(auth);
    const cid = await this.companyIdForAuth(auth);
    await this.store.deletePersonnelBudgetPlannedExtraLine(cid, lineId);
    return { ok: true };
  }
}
