import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import PDFDocument from "pdfkit";
import { CurrentAuth } from "./auth";
import { HrDataStore } from "./hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "./nexa-permission.guard";

@Controller("payroll")
@UseGuards(NexaPermissionGuard)
export class PayrollController {
  constructor(private readonly store: HrDataStore) {}

  @Post(":userId/:period/generate")
  @RequireNexaPermissions("nexa.payroll:write")
  async generate(
    @CurrentAuth() auth: { userId: string; role: string },
    @Param("userId") userId: string,
    @Param("period") period: string
  ): Promise<unknown> {
    if (auth.role !== "admin" && auth.role !== "manager_controllo_gestione") {
      throw new ForbiddenException("Solo manager/admin possono generare cedolini di altri utenti");
    }
    if (
      auth.role === "manager_controllo_gestione" &&
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
    @Query("userId") userId?: string
  ): Promise<unknown> {
    const canReadOthers = auth.role === "admin" || auth.role === "manager_controllo_gestione";
    if (userId && !canReadOthers && userId !== auth.userId) {
      throw new ForbiddenException("Accesso non autorizzato al cedolino");
    }
    if (
      userId &&
      auth.role === "manager_controllo_gestione" &&
      !(await this.store.isManagerOf(auth.userId, userId))
    ) {
      throw new ForbiddenException("Manager può leggere solo cedolini dei sottoposti");
    }
    return this.store.listPayslips(auth.userId, canReadOthers ? userId : auth.userId);
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
    if (auth.role === "manager_controllo_gestione" && !(await this.store.isManagerOf(auth.userId, userId))) {
      throw new ForbiddenException("Manager può esportare solo PDF dei sottoposti");
    }
    let payslip = await this.store.getPayslipForPeriod(userId, period);
    if (!payslip) {
      payslip = await this.store.generatePayslip(userId, period);
    }
    const employee = await this.store.getUser(userId);
    const buffer = await this.buildOfficialPayslipPdf(employee.fullName, period, payslip);
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="nexa-hr-cedolino-${userId}-${period}.pdf"`,
      type: "application/pdf"
    });
  }

  private async buildOfficialPayslipPdf(
    employeeName: string,
    period: string,
    payslip: { lines: Array<{ code: string; description: string; amount: number }>; netSalary: number; grossSalary: number }
  ): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      doc.fontSize(18).text("Nexa HR — Busta paga (Svizzera)", { align: "center" });
      doc.moveDown(0.8);
      doc.fontSize(11).text(`Periodo: ${period}`);
      doc.text(`Dipendente: ${employeeName}`);
      doc.text("Template: formato ufficiale interno payroll CH");
      doc.moveDown();

      doc.fontSize(12).text("Dettaglio competenze e trattenute", { underline: true });
      doc.moveDown(0.5);
      payslip.lines.forEach((line) => {
        doc
          .fontSize(10)
          .text(`${line.code.padEnd(6)} ${line.description}`, { continued: true })
          .text(` CHF ${line.amount.toFixed(2)}`, { align: "right" });
      });

      doc.moveDown();
      doc.fontSize(12).text(`Lordo rettificato: CHF ${payslip.grossSalary.toFixed(2)}`);
      doc.fontSize(14).text(`Netto da pagare: CHF ${payslip.netSalary.toFixed(2)}`, {
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
