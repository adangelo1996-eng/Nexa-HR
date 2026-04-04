import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { createChExportGenerator } from "@payday/payroll-adapters-ch";
import { createItExportGenerator } from "@payday/payroll-adapters-it";
import type { JurisdictionCode } from "@payday/payroll-core";
import PDFDocument from "pdfkit";
import { CurrentAuth, type AuthRole } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { isSwissPayrollFeatureEnabled } from "../platform/nexa-swiss-payroll-flag";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";

class SimulateHireDto {
  @IsNumber()
  @Min(0)
  grossMonthlySalary!: number;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  canton?: string;

  @IsOptional()
  @IsString()
  municipality?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(80)
  age?: number;

  @IsOptional()
  @IsIn(["CH", "IT"])
  jurisdiction?: "CH" | "IT";

  @IsOptional()
  @IsString()
  taxRegion?: string;

  @IsOptional()
  @IsString()
  taxMunicipalityIt?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(80)
  weeklyContractHours?: number;
}

@Controller("payroll")
@UseGuards(NexaPermissionGuard)
export class PayrollController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  /** Calcolo/simulazione cedolino: solo superuser o console admin (allineato a `canAccessPayrollArea` su `/users/me`). */
  private async assertPayrollCalcAccess(auth: { userId: string; role: AuthRole }): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const me = await this.store.getUser(auth.userId);
    const canHr = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    if (canHr) {
      return;
    }
    throw new ForbiddenException("Calcolo cedolino riservato agli amministratori");
  }

  private async assertSameCompanyUnlessSuperuser(
    auth: { userId: string; role: AuthRole },
    targetUserId: string
  ): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const viewer = await this.store.getUser(auth.userId);
    const target = await this.store.getUser(targetUserId);
    if (viewer.companyId !== target.companyId) {
      throw new ForbiddenException("Utente non nella stessa azienda");
    }
  }

  private async hasPayrollManagerialAccess(userId: string, role: AuthRole): Promise<boolean> {
    if (role === "superuser") {
      return true;
    }
    const subs = await this.store.listUsersByManager(userId);
    if (subs.length > 0) {
      return true;
    }
    const led = await this.store.listWorkTeamIdsWhereUserIsLead(userId);
    return led.length > 0;
  }

  @Post("simulate-hire")
  @RequireNexaPermissions("nexa.payroll:read")
  async simulateHire(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Body() dto: SimulateHireDto
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    return this.store.simulateHirePayroll({
      grossMonthlySalary: dto.grossMonthlySalary,
      period: dto.period,
      canton: dto.canton,
      municipality: dto.municipality,
      age: dto.age,
      jurisdiction: dto.jurisdiction,
      taxRegion: dto.taxRegion,
      taxMunicipalityIt: dto.taxMunicipalityIt,
      weeklyContractHours: dto.weeklyContractHours
    });
  }

  @Get("exports/preview")
  @RequireNexaPermissions("nexa.payroll:read")
  async exportPreview(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Query("jurisdiction") jurisdiction: string,
    @Query("period") period?: string
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    const j: JurisdictionCode = jurisdiction === "IT" ? "IT" : "CH";
    if (j === "CH" && !isSwissPayrollFeatureEnabled()) {
      throw new BadRequestException("Export payroll Svizzera temporaneamente disattivato.");
    }
    const gen = j === "IT" ? createItExportGenerator() : createChExportGenerator();
    const p = period?.trim() || new Date().toISOString().slice(0, 7);
    return gen.buildExports({ companyId: "comp-1", period: p, jurisdiction: j });
  }

  @Post(":userId/:period/generate")
  @RequireNexaPermissions("nexa.payroll:write")
  async generate(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Param("userId") userId: string,
    @Param("period") period: string
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    await this.assertSameCompanyUnlessSuperuser(auth, userId);
    return this.store.generatePayslip(userId, period);
  }

  @Get("payslips")
  @RequireNexaPermissions("nexa.payslips:read")
  async list(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Query("userId") userId?: string,
    @Query("months") months?: string
  ): Promise<unknown> {
    const canReadOthers = await this.hasPayrollManagerialAccess(auth.userId, auth.role);
    if (userId && !canReadOthers && userId !== auth.userId) {
      throw new ForbiddenException("Accesso non autorizzato al cedolino");
    }
    if (userId && auth.role !== "superuser" && userId !== auth.userId) {
      const ok =
        (await this.store.isManagerOf(auth.userId, userId)) ||
        (await this.store.isUserLeadOfTeamContaining(auth.userId, userId));
      if (!ok) {
        throw new ForbiddenException("Manager può leggere solo cedolini dei sottoposti");
      }
    }
    const target = canReadOthers ? userId : auth.userId;
    let items = await this.store.listPayslipsWithNewFlag(auth.userId, target);
    const cap = months ? Math.min(24, Math.max(1, Number(months) || 12)) : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - cap);
    const min = cutoff.toISOString().slice(0, 7);
    items = items.filter((p) => p.period >= min).sort((a, b) => b.period.localeCompare(a.period));
    return { items };
  }

  @Patch("payslips/:payslipId/read")
  @RequireNexaPermissions("nexa.payslips:read")
  async markRead(
    @CurrentAuth() auth: { userId: string },
    @Param("payslipId") payslipId: string
  ): Promise<unknown> {
    const rows = await this.store.listPayslips(auth.userId, auth.userId);
    if (!rows.some((p) => p.id === payslipId)) {
      throw new ForbiddenException("Cedolino non trovato");
    }
    await this.store.markPayslipRead(auth.userId, payslipId);
    return { ok: true };
  }

  @Get(":userId/:period/pdf")
  @RequireNexaPermissions("nexa.payslips:read")
  async exportPdf(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Param("userId") userId: string,
    @Param("period") period: string
  ): Promise<StreamableFile> {
    if (auth.userId !== userId) {
      if (auth.role === "superuser") {
        /* ok */
      } else if (auth.role === "user") {
        const ok =
          (await this.store.isManagerOf(auth.userId, userId)) ||
          (await this.store.isUserLeadOfTeamContaining(auth.userId, userId));
        if (!ok) {
          throw new ForbiddenException("Manager può esportare solo PDF dei sottoposti");
        }
      } else {
        throw new ForbiddenException("Accesso PDF cedolino non autorizzato");
      }
    }
    let payslip = await this.store.getPayslipForPeriod(userId, period);
    if (!payslip) {
      payslip = await this.store.generatePayslip(userId, period);
    }
    const employee = await this.store.getUser(userId);
    const isItaly =
      !isSwissPayrollFeatureEnabled() || employee.jurisdiction === "IT";
    const buffer = await this.buildOfficialPayslipPdf(
      employee.fullName,
      period,
      payslip,
      isItaly
    );
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="nexa-hr-cedolino-${userId}-${period}.pdf"`,
      type: "application/pdf"
    });
  }

  private async buildOfficialPayslipPdf(
    employeeName: string,
    period: string,
    payslip: { lines: Array<{ code: string; description: string; amount: number }>; netSalary: number; grossSalary: number },
    isItaly: boolean
  ): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const title = isItaly
        ? "Nexa HR — Busta paga (Italia, simulazione)"
        : "Nexa HR — Busta paga (Svizzera)";
      const currency = isItaly ? "EUR" : "CHF";
      const templateNote = isItaly
        ? "Template: simulazione IT — validare con consulenza del lavoro"
        : "Template: formato ufficiale interno payroll CH";

      doc.fontSize(18).text(title, { align: "center" });
      doc.moveDown(0.8);
      doc.fontSize(11).text(`Periodo: ${period}`);
      doc.text(`Dipendente: ${employeeName}`);
      doc.text(templateNote);
      doc.moveDown();

      doc.fontSize(12).text("Dettaglio competenze e trattenute", { underline: true });
      doc.moveDown(0.5);
      payslip.lines.forEach((line) => {
        doc
          .fontSize(10)
          .text(`${line.code.padEnd(6)} ${line.description}`, { continued: true })
          .text(` ${currency} ${line.amount.toFixed(2)}`, { align: "right" });
      });

      doc.moveDown();
      doc.fontSize(12).text(`Lordo rettificato: ${currency} ${payslip.grossSalary.toFixed(2)}`);
      doc.fontSize(14).text(`Netto da pagare: ${currency} ${payslip.netSalary.toFixed(2)}`, {
        align: "right"
      });
      doc.moveDown(2);
      doc.fontSize(9).text("Documento generato automaticamente da Nexa HR Payroll Engine", {
        align: "center"
      });
      doc.end();
    });
  }
}
