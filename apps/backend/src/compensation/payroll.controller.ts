import {
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
import { CurrentAuth } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

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
  constructor(private readonly store: HrDataStore) {}

  @Post("simulate-hire")
  @RequireNexaPermissions("nexa.payroll:read")
  simulateHire(
    @CurrentAuth() auth: { role: string },
    @Body() dto: SimulateHireDto
  ): unknown {
    if (auth.role !== "admin" && auth.role !== "team_lead") {
      throw new ForbiddenException("Solo manager/admin possono simulare costi assunzione");
    }
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
    @CurrentAuth() auth: { role: string },
    @Query("jurisdiction") jurisdiction: string,
    @Query("period") period?: string
  ): Promise<unknown> {
    if (auth.role !== "admin" && auth.role !== "team_lead") {
      throw new ForbiddenException("Solo manager/admin possono anteprima export paghe");
    }
    const j: JurisdictionCode = jurisdiction === "IT" ? "IT" : "CH";
    const gen = j === "IT" ? createItExportGenerator() : createChExportGenerator();
    const p = period?.trim() || new Date().toISOString().slice(0, 7);
    return gen.buildExports({ companyId: "comp-1", period: p, jurisdiction: j });
  }

  @Post(":userId/:period/generate")
  @RequireNexaPermissions("nexa.payroll:write")
  async generate(
    @CurrentAuth() auth: { userId: string; role: string },
    @Param("userId") userId: string,
    @Param("period") period: string
  ): Promise<unknown> {
    if (auth.role !== "admin" && auth.role !== "team_lead") {
      throw new ForbiddenException("Solo manager/admin possono generare cedolini di altri utenti");
    }
    if (
      auth.role === "team_lead" &&
      userId !== auth.userId &&
      !(await this.store.isManagerOf(auth.userId, userId))
    ) {
      throw new ForbiddenException("Manager può generare solo cedolini dei sottoposti");
    }
    return this.store.generatePayslip(userId, period);
  }

  @Post(":period/generate-self")
  @RequireNexaPermissions("nexa.payroll:write")
  async generateSelf(
    @CurrentAuth() auth: { userId: string; role: string },
    @Param("period") period: string
  ): Promise<unknown> {
    if (auth.role !== "employee") {
      throw new ForbiddenException("Solo dipendente può usare generate-self");
    }
    return this.store.generatePayslip(auth.userId, period);
  }

  @Get("payslips")
  @RequireNexaPermissions("nexa.payslips:read")
  async list(
    @CurrentAuth() auth: { userId: string; role: string },
    @Query("userId") userId?: string,
    @Query("months") months?: string
  ): Promise<unknown> {
    const canReadOthers = auth.role === "admin" || auth.role === "team_lead";
    if (userId && !canReadOthers && userId !== auth.userId) {
      throw new ForbiddenException("Accesso non autorizzato al cedolino");
    }
    if (
      userId &&
      auth.role === "team_lead" &&
      !(await this.store.isManagerOf(auth.userId, userId))
    ) {
      throw new ForbiddenException("Manager può leggere solo cedolini dei sottoposti");
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
    @CurrentAuth() auth: { userId: string; role: string },
    @Param("userId") userId: string,
    @Param("period") period: string
  ): Promise<StreamableFile> {
    const canRead = auth.role !== "employee" || auth.userId === userId;
    if (!canRead) {
      throw new ForbiddenException("Accesso PDF cedolino non autorizzato");
    }
    if (auth.role === "team_lead" && !(await this.store.isManagerOf(auth.userId, userId))) {
      throw new ForbiddenException("Manager può esportare solo PDF dei sottoposti");
    }
    let payslip = await this.store.getPayslipForPeriod(userId, period);
    if (!payslip) {
      payslip = await this.store.generatePayslip(userId, period);
    }
    const employee = await this.store.getUser(userId);
    const buffer = await this.buildOfficialPayslipPdf(
      employee.fullName,
      period,
      payslip,
      employee.jurisdiction === "IT"
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
