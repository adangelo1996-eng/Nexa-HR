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
  Res,
  UseGuards
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import type { ExpenseClaim } from "@payday/domain";
import type { ExpenseWorkflowRow } from "../platform/hr-data.store";
import archiver from "archiver";
import { Type } from "class-transformer";
import type { Response } from "express";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";
import { payslipPeriodFromExpenseDate } from "./expense-date.util";

const EXPENSE_TYPES = [
  "ristorante",
  "autostrada",
  "hotel",
  "carburante",
  "trasporti",
  "parcheggio",
  "materiale",
  "altro"
] as const;

const RECEIPT_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

const MAX_BATCH_ITEMS = 20;
const MAX_BATCH_TOTAL_BYTES = 28 * 1024 * 1024;
const MAX_ZIP_CLAIM_IDS = 80;
const RECEIPT_MAX_BYTES = 6 * 1024 * 1024;

class CreateExpenseDto {
  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsString()
  currency!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expenseDate!: string;

  @IsIn(EXPENSE_TYPES as unknown as string[])
  expenseType!: (typeof EXPENSE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(12_000_000)
  receiptBase64?: string;

  @IsOptional()
  @IsIn(RECEIPT_MIME as unknown as string[])
  receiptMime?: (typeof RECEIPT_MIME)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  ocrRawText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ocrSuggestedCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  kmDistance?: number;
}

class CreateExpenseBatchDto {
  @IsArray()
  @ArrayMaxSize(MAX_BATCH_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  items!: CreateExpenseDto[];
}

class ExpenseZipByIdsDto {
  @IsArray()
  @ArrayMaxSize(MAX_ZIP_CLAIM_IDS)
  @IsString({ each: true })
  claimIds!: string[];
}

function receiptExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) {
    return "png";
  }
  if (m.includes("webp")) {
    return "webp";
  }
  return "jpg";
}

function resolvePayslipPeriod(expenseDate: string): string {
  try {
    return payslipPeriodFromExpenseDate(expenseDate.trim());
  } catch {
    throw new BadRequestException("Data spesa non valida");
  }
}

@Controller("expenses")
@UseGuards(NexaPermissionGuard)
export class ExpensesController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Get("receipts/zip")
  @RequireNexaPermissions("nexa.expenses:read")
  async downloadReceiptsArchive(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("status") status: string | undefined,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    const rows = await this.store.fetchExpenseReceiptZipRowsForUser(auth.userId, {
      fromDate: from?.trim(),
      toDate: to?.trim(),
      status: status?.trim()
    });
    if (rows.length === 0) {
      throw new BadRequestException("Nessuno scontrino da esportare con i filtri indicati");
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="scontrini-archivio.zip"');
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", () => {
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    archive.pipe(res);
    for (const row of rows) {
      try {
        const buf = Buffer.from(row.receiptBodyBase64.trim(), "base64");
        if (buf.length >= 256) {
          archive.append(buf, { name: `receipt-${row.id}.${receiptExt(row.receiptMime ?? "image/jpeg")}` });
        }
      } catch {
        /* skip corrupt */
      }
    }
    await archive.finalize();
  }

  @Post("receipts/zip")
  @RequireNexaPermissions("nexa.expenses:read")
  async downloadReceiptsBatchZip(
    @Body() dto: ExpenseZipByIdsDto,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    const ids = [...new Set(dto.claimIds.map((x) => x.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new BadRequestException("Nessun ID indicato");
    }
    const rows = await this.store.fetchExpenseReceiptZipRowsForUserAndIds(auth.userId, ids);
    if (rows.length === 0) {
      throw new BadRequestException("Nessuno scontrino trovato per gli ID indicati");
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="scontrini-batch.zip"');
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", () => {
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    archive.pipe(res);
    for (const row of rows) {
      try {
        const buf = Buffer.from(row.receiptBodyBase64.trim(), "base64");
        if (buf.length >= 256) {
          archive.append(buf, { name: `receipt-${row.id}.${receiptExt(row.receiptMime ?? "image/jpeg")}` });
        }
      } catch {
        /* skip */
      }
    }
    await archive.finalize();
  }

  @Get()
  @RequireNexaPermissions("nexa.expenses:read")
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("scope") scope?: string
  ): Promise<{ items: ExpenseClaim[] }> {
    const s = scope === "team" ? "team" : "self";
    let teamOrgWide = false;
    if (s === "team") {
      if (auth.role === "superuser") {
        teamOrgWide = true;
      } else {
        const me = await this.store.getUser(auth.userId);
        teamOrgWide = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
      }
      if (!teamOrgWide) {
        const managed = await this.store.listManagedMemberIdsForApprover(auth.userId);
        if (managed.size <= 1) {
          throw new ForbiddenException("Scope team non consentito");
        }
      }
    }
    const items = await this.store.listExpenseClaimsForRequester(auth.userId, auth.role, s, {
      teamOrgWide: s === "team" && teamOrgWide
    });
    return { items };
  }

  @Get("workflow")
  @RequireNexaPermissions("nexa.expenses:read")
  async workflow(@CurrentAuth() auth: AuthContext): Promise<{
    toApproveManager: ExpenseWorkflowRow[];
    toApproveHr: ExpenseWorkflowRow[];
    mine: ExpenseWorkflowRow[];
  }> {
    const me = await this.store.getUser(auth.userId);
    return this.store.listExpenseClaimsForWorkflow(auth.userId, me.role, me.email);
  }

  @Get(":id/receipt")
  @RequireNexaPermissions("nexa.expenses:read")
  async getReceipt(
    @Param("id") id: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    const payload = await this.store.getExpenseClaimReceiptForViewer(id.trim(), auth.userId);
    if (!payload) {
      res.status(404).json({ message: "Scontrino non trovato" });
      return;
    }
    res.setHeader("Content-Type", payload.mime);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(payload.body);
  }

  @Post("batch")
  @RequireNexaPermissions("nexa.expenses:write")
  async createBatch(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateExpenseBatchDto
  ): Promise<{ items: ExpenseClaim[] }> {
    if (!dto.items?.length) {
      throw new BadRequestException("Elenco vuoto");
    }
    let totalReceipt = 0;
    for (const it of dto.items) {
      if (it.receiptBase64?.trim()) {
        try {
          totalReceipt += Buffer.from(it.receiptBase64.trim(), "base64").length;
        } catch {
          throw new BadRequestException("Immagine scontrino non valida");
        }
      }
    }
    if (totalReceipt > MAX_BATCH_TOTAL_BYTES) {
      throw new BadRequestException("Dimensione totale scontrini oltre il limite consentito");
    }
    const items: ExpenseClaim[] = [];
    const legalArchivalAt = new Date().toISOString();
    for (const it of dto.items) {
      items.push(await this.persistOneExpense(auth.userId, it, legalArchivalAt));
    }
    return { items };
  }

  @Post()
  @RequireNexaPermissions("nexa.expenses:write")
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateExpenseDto): Promise<ExpenseClaim> {
    return this.persistOneExpense(auth.userId, dto, new Date().toISOString());
  }

  private async persistOneExpense(
    userId: string,
    dto: CreateExpenseDto,
    legalArchivalAtIso: string
  ): Promise<ExpenseClaim> {
    const payslipPeriod = resolvePayslipPeriod(dto.expenseDate);
    let receiptSha256: string | null = null;
    let receiptBodyBase64: string | null = null;
    let receiptMime: string | null = null;
    if (dto.receiptBase64?.trim()) {
      if (!dto.receiptMime) {
        throw new BadRequestException("receiptMime obbligatorio con immagine scontrino");
      }
      let raw: Buffer;
      try {
        raw = Buffer.from(dto.receiptBase64.trim(), "base64");
      } catch {
        throw new BadRequestException("Immagine scontrino non valida");
      }
      if (raw.length < 256) {
        throw new BadRequestException("Immagine scontrino non valida");
      }
      if (raw.length > RECEIPT_MAX_BYTES) {
        throw new BadRequestException("Immagine scontrino troppo grande (max 6 MB)");
      }
      receiptSha256 = createHash("sha256").update(raw).digest("hex");
      receiptBodyBase64 = dto.receiptBase64.trim();
      receiptMime = dto.receiptMime;
    }
    return this.store.createExpenseClaim(userId, {
      amountCents: dto.amountCents,
      currency: dto.currency,
      description: dto.description.trim(),
      expenseDate: dto.expenseDate.trim(),
      expenseType: dto.expenseType,
      kmDistance: dto.kmDistance,
      receiptMime,
      receiptSha256,
      receiptBodyBase64,
      ocrRawText: dto.ocrRawText?.trim() ?? null,
      ocrSuggestedCents: dto.ocrSuggestedCents ?? null,
      legalArchivalAt: receiptBodyBase64 ? legalArchivalAtIso : null,
      payslipPeriod
    });
  }

  @Patch(":id/approve")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ExpenseClaim> {
    return this.store.approveExpenseClaim(id, auth.userId);
  }

  @Patch(":id/reject")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ExpenseClaim> {
    return this.store.rejectExpenseClaim(id, auth.userId);
  }
}
