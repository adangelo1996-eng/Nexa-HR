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
  UseGuards
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import type { ExpenseClaim } from "@payday/domain";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

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

class CreateExpenseDto {
  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsString()
  currency!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

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

@Controller("expenses")
@UseGuards(NexaPermissionGuard)
export class ExpensesController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  @RequireNexaPermissions("nexa.expenses:read")
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("scope") scope?: string
  ): Promise<{ items: ExpenseClaim[] }> {
    const s = scope === "team" ? "team" : "self";
    if (s === "team" && auth.role !== "superuser") {
      const managed = await this.store.listManagedMemberIdsForApprover(auth.userId);
      if (managed.size <= 1) {
        throw new ForbiddenException("Scope team non consentito");
      }
    }
    const items = await this.store.listExpenseClaimsForRequester(auth.userId, auth.role, s);
    return { items };
  }

  @Post()
  @RequireNexaPermissions("nexa.expenses:write")
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateExpenseDto): Promise<ExpenseClaim> {
    let receiptSha256: string | null = null;
    let receiptBodyBase64: string | null = null;
    let receiptMime: string | null = null;
    const legalArchivalAt = new Date().toISOString();
    if (dto.receiptBase64?.trim()) {
      if (!dto.receiptMime) {
        throw new BadRequestException("receiptMime obbligatorio con immagine scontrino");
      }
      const raw = Buffer.from(dto.receiptBase64.trim(), "base64");
      if (raw.length < 256) {
        throw new BadRequestException("Immagine scontrino non valida");
      }
      if (raw.length > 6 * 1024 * 1024) {
        throw new BadRequestException("Immagine scontrino troppo grande (max 6 MB)");
      }
      receiptSha256 = createHash("sha256").update(raw).digest("hex");
      receiptBodyBase64 = dto.receiptBase64.trim();
      receiptMime = dto.receiptMime;
    }
    return this.store.createExpenseClaim(auth.userId, {
      amountCents: dto.amountCents,
      currency: dto.currency,
      description: dto.description.trim(),
      expenseType: dto.expenseType,
      kmDistance: dto.kmDistance,
      receiptMime,
      receiptSha256,
      receiptBodyBase64,
      ocrRawText: dto.ocrRawText?.trim() ?? null,
      ocrSuggestedCents: dto.ocrSuggestedCents ?? null,
      legalArchivalAt: receiptBodyBase64 ? legalArchivalAt : null
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
