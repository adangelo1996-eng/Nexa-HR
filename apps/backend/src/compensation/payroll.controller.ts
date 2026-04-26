import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
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
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import {
  type User,
  isPayrollCompetencePeriodCalculableTodayRome,
  payrollCompetenceCalculationFirstDateIsoRome
} from "@payday/domain";
import { createItExportGenerator } from "@payday/payroll-adapters-it";
import PDFDocument from "pdfkit";
import { CurrentAuth, type AuthRole } from "../platform/auth";
import { type CompanySettingsDto, HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";
import { PayslipExplainService } from "./payslip-explain.service";

class SimulateHireDto {
  @IsNumber()
  @Min(0)
  grossMonthlySalary!: number;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(80)
  age?: number;

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

class BatchGenerateDto {
  @IsString()
  period!: string;

  @IsOptional()
  @IsBoolean()
  usePreviousMonthVariables?: boolean;
}

class PublishPeriodDto {
  @IsString()
  period!: string;
}

class PayslipImportCommitDto {
  @IsString()
  userId!: string;

  @IsString()
  period!: string;

  @IsOptional()
  @IsString()
  netSalary?: string;

  @IsOptional()
  @IsString()
  grossSalary?: string;
}

const PAYSLIP_IMPORT_MAX_BYTES = 6_000_000;

class PayslipExplainRequestDto {
  @IsString()
  payslipId!: string;
}

@Controller("payroll")
@UseGuards(NexaPermissionGuard)
export class PayrollController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly payslipExplain: PayslipExplainService
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

  /** HR / console estesa: vede bozze e può generare al volo. */
  private async isPayrollCalcOperator(auth: { userId: string; role: AuthRole }): Promise<boolean> {
    if (auth.role === "superuser") {
      return true;
    }
    const me = await this.store.getUser(auth.userId);
    return this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
  }

  /** Stessa logica di `GET /payroll/payslips?userId=` per il titolare del cedolino. */
  private async assertPayslipTargetReadable(
    auth: { userId: string; role: AuthRole },
    payslipUserId: string
  ): Promise<void> {
    if (payslipUserId === auth.userId) {
      return;
    }
    if (auth.role === "superuser") {
      return;
    }
    const me = await this.store.getUser(auth.userId);
    const hr = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    if (hr) {
      await this.assertSameCompanyUnlessSuperuser(auth, payslipUserId);
      return;
    }
    const canReadOthers = await this.hasPayrollManagerialAccess(auth.userId, auth.role);
    if (payslipUserId && !canReadOthers && payslipUserId !== auth.userId) {
      throw new ForbiddenException("Accesso non autorizzato al cedolino");
    }
    if (payslipUserId && payslipUserId !== auth.userId) {
      const ok =
        (await this.store.isManagerOf(auth.userId, payslipUserId)) ||
        (await this.store.isUserLeadOfTeamContaining(auth.userId, payslipUserId));
      if (!ok) {
        throw new ForbiddenException("Manager può leggere solo cedolini dei sottoposti");
      }
    }
  }

  @Get("competence-unlock")
  @RequireNexaPermissions("nexa.payroll:read")
  async competenceUnlock(@Query("period") period?: string): Promise<unknown> {
    const p = period?.trim();
    if (!p || !/^\d{4}-\d{2}$/.test(p)) {
      throw new BadRequestException("Query period (YYYY-MM) obbligatorio");
    }
    return {
      period: p,
      firstCalculableDate: payrollCompetenceCalculationFirstDateIsoRome(p),
      calculableToday: isPayrollCompetencePeriodCalculableTodayRome(p)
    };
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
      age: dto.age,
      taxRegion: dto.taxRegion,
      taxMunicipalityIt: dto.taxMunicipalityIt,
      weeklyContractHours: dto.weeklyContractHours
    });
  }

  @Get("exports/preview")
  @RequireNexaPermissions("nexa.payroll:read")
  async exportPreview(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Query("period") period?: string
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    const gen = createItExportGenerator();
    const p = period?.trim() || new Date().toISOString().slice(0, 7);
    return gen.buildExports({ companyId: "comp-1", period: p, jurisdiction: "IT" });
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
    return this.store.generatePayslip(userId, period, {
      status: "draft"
    });
  }

  @Get("payslips/drafts")
  @RequireNexaPermissions("nexa.payroll:read")
  async listDrafts(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Query("period") period?: string
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    const p = period?.trim();
    if (!p) {
      throw new BadRequestException("Query period (YYYY-MM) obbligatorio");
    }
    const items = await this.store.listDraftPayslipsForPeriod(auth.userId, p);
    return { items };
  }

  @Post("batch-generate")
  @RequireNexaPermissions("nexa.payroll:write")
  async batchGenerate(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Body() dto: BatchGenerateDto
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    const results = await this.store.batchGenerateDraftPayslips(auth.userId, dto.period.trim(), {
      usePreviousMonthVariables: dto.usePreviousMonthVariables === true
    });
    return { results };
  }

  @Post("payslips/publish")
  @RequireNexaPermissions("nexa.payroll:write")
  async publishPeriod(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Body() dto: PublishPeriodDto
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    const { updated } = await this.store.publishPayslipsForPeriod(auth.userId, dto.period.trim());
    return { updated };
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
    const payrollOperator = await this.isPayrollCalcOperator(auth);
    if (!payrollOperator) {
      items = items.filter((p) => (p.status ?? "published") === "published");
    }
    const cap = months ? Math.min(24, Math.max(1, Number(months) || 12)) : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - cap);
    const min = cutoff.toISOString().slice(0, 7);
    items = items.filter((p) => p.period >= min).sort((a, b) => b.period.localeCompare(a.period));
    return { items };
  }

  @Post("payslips/explain")
  @RequireNexaPermissions("nexa.payslips:read")
  async explainPayslip(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @Body() dto: PayslipExplainRequestDto
  ): Promise<unknown> {
    const p = await this.store.getPayslipById(dto.payslipId.trim());
    if (!p) {
      throw new NotFoundException("Cedolino non trovato");
    }
    await this.assertPayslipTargetReadable(auth, p.userId);
    const payrollOp = await this.isPayrollCalcOperator({ userId: auth.userId, role: auth.role });
    if ((p.status ?? "published") !== "published" && !payrollOp) {
      throw new BadRequestException("Spiegazione disponibile su cedolini già pubblicati (in bozza solo per operatori HR).");
    }
    const employee = await this.store.getUser(p.userId);
    if (!employee) {
      throw new NotFoundException("Dipendente non trovato");
    }
    return this.payslipExplain.explainForPayslip(auth, p, employee);
  }

  @Post("payslips/import/pdf-preview")
  @RequireNexaPermissions("nexa.payroll:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: PAYSLIP_IMPORT_MAX_BYTES }
    })
  )
  async payslipImportPreview(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @UploadedFile() file: Express.Multer.File | undefined
  ): Promise<{
    excerpt: string;
    textLength: number;
    suggestedPeriod: string | null;
    netHints: string[];
  }> {
    await this.assertPayrollCalcAccess(auth);
    if (!file?.buffer?.length) {
      throw new BadRequestException("File mancante");
    }
    const mime = String(file.mimetype ?? "").toLowerCase();
    const name = String(file.originalname ?? "").toLowerCase();
    if (mime !== "application/pdf" && !name.endsWith(".pdf")) {
      throw new BadRequestException("Caricare un file PDF");
    }
    const { PDFParse } = await import("pdf-parse");
    const Parser = PDFParse as unknown as new (opts: { data: Buffer }) => {
      load: () => Promise<void>;
      getText: () => Promise<{ text?: string }>;
      destroy: () => Promise<void>;
    };
    const parser = new Parser({ data: file.buffer });
    await parser.load();
    let fullText = "";
    try {
      const parsed = await parser.getText();
      fullText = String(parsed.text ?? "");
    } finally {
      await parser.destroy();
    }
    const excerpt = fullText.replace(/\s+/g, " ").trim().slice(0, 8000);
    const periodMatch = fullText.match(/\b(20\d{2})[-/](\d{2})\b/);
    const suggestedPeriod = periodMatch
      ? `${periodMatch[1]}-${periodMatch[2]}`
      : null;
    const netHints = [...fullText.matchAll(/netto[:\s]+([\d][\d.,]*)/gi)]
      .map((m) => String(m[1]).trim())
      .filter(Boolean)
      .slice(0, 8);
    return {
      excerpt,
      textLength: fullText.length,
      suggestedPeriod,
      netHints
    };
  }

  @Post("payslips/import/pdf-commit")
  @RequireNexaPermissions("nexa.payroll:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: PAYSLIP_IMPORT_MAX_BYTES }
    })
  )
  async payslipImportCommit(
    @CurrentAuth() auth: { userId: string; role: AuthRole },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: PayslipImportCommitDto
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    if (!file?.buffer?.length) {
      throw new BadRequestException("File mancante");
    }
    const mime = String(file.mimetype ?? "").toLowerCase();
    const name = String(file.originalname ?? "").toLowerCase();
    if (mime !== "application/pdf" && !name.endsWith(".pdf")) {
      throw new BadRequestException("Caricare un file PDF");
    }
    const targetUserId = String(body.userId ?? "").trim();
    const period = String(body.period ?? "").trim();
    if (!targetUserId || !period) {
      throw new BadRequestException("userId e period (YYYY-MM) obbligatori");
    }
    await this.assertSameCompanyUnlessSuperuser(auth, targetUserId);
    const op = await this.store.getUser(auth.userId);
    const netRaw = body.netSalary?.trim();
    const grossRaw = body.grossSalary?.trim();
    const netSalary = netRaw ? Number.parseFloat(netRaw.replace(",", ".")) : undefined;
    const grossSalary = grossRaw ? Number.parseFloat(grossRaw.replace(",", ".")) : undefined;
    return this.store.importPayslipFromExternalPdf(
      auth.userId,
      auth.role,
      op.email ?? "",
      targetUserId,
      period,
      file.buffer,
      {
        netSalary: netSalary != null && Number.isFinite(netSalary) ? netSalary : undefined,
        grossSalary: grossSalary != null && Number.isFinite(grossSalary) ? grossSalary : undefined
      }
    );
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
    const payrollOperator = await this.isPayrollCalcOperator(auth);
    let payslip = await this.store.getPayslipForPeriod(userId, period);
    if (payslip && !payrollOperator && (payslip.status ?? "published") !== "published") {
      throw new NotFoundException("Cedolino non ancora pubblicato");
    }
    if (!payslip) {
      if (!payrollOperator) {
        throw new NotFoundException("Cedolino non disponibile");
      }
      payslip = await this.store.generatePayslip(userId, period, {
        status: "draft"
      });
    }
    const supa = String(payslip.pdfUrl ?? "").trim();
    if (supa.startsWith("supabase://")) {
      const raw = supa.slice("supabase://".length);
      const slash = raw.indexOf("/");
      if (slash <= 0) {
        throw new NotFoundException("Percorso PDF importato non valido");
      }
      const bucket = raw.slice(0, slash);
      const path = raw.slice(slash + 1);
      const buf = await this.store.downloadSupabasePrivateFile(bucket, path);
      return new StreamableFile(buf, {
        disposition: `attachment; filename="nexa-hr-cedolino-${userId}-${period}.pdf"`,
        type: "application/pdf"
      });
    }
    const employee = await this.store.getUser(userId);
    const company = await this.store.getCompanySettings(employee.companyId);
    const buffer = await this.buildOfficialPayslipPdf(employee, company, payslip);
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="nexa-hr-cedolino-${userId}-${period}.pdf"`,
      type: "application/pdf"
    });
  }

  private async buildOfficialPayslipPdf(
    employee: User,
    company: CompanySettingsDto,
    payslip: {
      lines: Array<{ code: string; description: string; amount: number }>;
      netSalary: number;
      grossSalary: number;
      period: string;
      variablePeriod?: string | null;
      status?: string;
    }
  ): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const title = "Nexa HR — Busta paga (Italia, simulazione)";
      const currency = "EUR";
      const generatedAt = new Date().toISOString();

      doc.fontSize(16).text(title, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor("#444444").text("Trasparenza retributiva (informazioni da D.Lgs 23/2015, ove applicabile)", {
        align: "center"
      });
      doc.fillColor("#000000");
      doc.moveDown(0.8);

      doc.fontSize(10).text("Datore di lavoro", { underline: true });
      doc.fontSize(9).text(company.companyLegalName || "—");
      if (company.companyVatNumber?.trim()) {
        doc.text(`P.IVA: ${company.companyVatNumber.trim()}`);
      }
      if (company.companyRegistrationInfo?.trim()) {
        doc.text(company.companyRegistrationInfo.trim().slice(0, 200));
      }
      doc.moveDown(0.6);
      doc.fontSize(10).text("Dipendente", { underline: true });
      doc.fontSize(9).text(employee.fullName);
      if (employee.fiscalCode?.trim()) {
        doc.text(`Codice fiscale: ${employee.fiscalCode.trim()}`);
      }
      if (employee.contractType?.trim()) {
        doc.text(`Contratto: ${employee.contractType.trim()}`);
      }
      if (employee.weeklyContractHours != null && employee.weeklyContractHours > 0) {
        doc.text(`Ore settimanali: ${employee.weeklyContractHours}`);
      }
      if (employee.payMonthsPerYear != null) {
        doc.text(`Mensilità: ${employee.payMonthsPerYear}`);
      }
      if (employee.annualGrossSalary != null && Number(employee.annualGrossSalary) > 0) {
        doc.text(`RAL indicativa: ${employee.annualGrossSalary} ${currency}`);
      }
      doc.moveDown(0.6);
      doc.fontSize(10).text("Periodo e stato", { underline: true });
      doc.fontSize(9).text(`Competenza: ${payslip.period}`);
      if (payslip.variablePeriod && payslip.variablePeriod !== payslip.period) {
        doc.text(`Variabili (straordinari, assenze, remote working): mese ${payslip.variablePeriod}`);
      }
      doc.text(`Stato documento: ${payslip.status ?? "published"}`);
      doc.moveDown();

      const competenze = ["BASE", "FIX_SUP", "EXTRA", "GROSS", "RMB", "TIR"];
      const trattenute = [
        "INPS",
        "IRPEF",
        "ADD_REG",
        "ADD_COM",
        "GARN",
        "FERIE_G",
        "NET"
      ];
      const info = payslip.lines.filter(
        (l) => !competenze.includes(l.code) && !trattenute.includes(l.code)
      );
      const compLines = payslip.lines.filter((l) => competenze.includes(l.code) && l.code !== "NET");
      const trattLines = payslip.lines.filter((l) => trattenute.includes(l.code) && l.code !== "NET");

      const drawTable = (heading: string, rows: typeof payslip.lines): void => {
        if (rows.length === 0) {
          return;
        }
        doc.fontSize(11).text(heading, { underline: true });
        doc.moveDown(0.3);
        rows.forEach((line) => {
          doc
            .fontSize(9)
            .text(`${line.code.padEnd(7)} ${line.description}`.slice(0, 78), {
              continued: true,
              width: 400
            })
            .text(`${currency} ${line.amount.toFixed(2)}`, { align: "right" });
        });
        doc.moveDown(0.5);
      };

      drawTable("Competenze e elementi retributivi", compLines);
      drawTable("Trattenute fiscali, sociali e altre trattenute", trattLines);
      drawTable("Altri elementi (anagrafica / informativi)", info);

      doc.moveDown(0.5);
      doc.fillColor("#000000").fontSize(11).text(`Lordo imponibile: ${currency} ${payslip.grossSalary.toFixed(2)}`);
      doc.fontSize(13).text(`Netto da pagare: ${currency} ${payslip.netSalary.toFixed(2)}`, {
        align: "right"
      });
      doc.moveDown(0.6);
      if (employee.iban?.trim()) {
        const ib = employee.iban.replace(/\s+/g, "");
        doc.fontSize(9).text(`Pagamento — IBAN: ${ib.slice(0, 4)}…${ib.slice(-4)}`);
        if (employee.bankName?.trim()) {
          doc.text(`Istituto: ${employee.bankName.trim()}`);
        }
      }

      doc.moveDown(1.2);
      doc.fontSize(8).fillColor("#555555");
      doc.text(
        "Documento prodotto da Nexa HR con motore interno Hebb (simulazione). Non sostituisce software paghe certificato né adempimenti (UniEmens, F24). Per formalità rivolgersi al consulente del lavoro.",
        { align: "justify" }
      );
      doc.text(`Generato: ${generatedAt} · Motore Nexa/Hebb`, { align: "center" });
      doc.fillColor("#000000");
      doc.end();
    });
  }
}
