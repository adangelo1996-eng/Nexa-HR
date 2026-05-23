import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { EmployeeDocument, EmployeeDocumentKind } from "@payday/domain";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

const DOC_KINDS: EmployeeDocumentKind[] = ["contract", "payslip", "personal", "other"];
const MAX_B64 = 1_800_000;

class UploadDocDto {
  @IsString()
  @MaxLength(512)
  title!: string;

  @IsIn(DOC_KINDS)
  kind!: EmployeeDocumentKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  /** Base64 del file (MVP; preferire object storage in produzione). */
  @IsOptional()
  @IsString()
  bodyBase64?: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;
}

@Controller("documents")
@UseGuards(NexaPermissionGuard)
export class DocumentsController {
  constructor(private readonly store: HrDataStore) {}

  @Get("vault")
  @RequireNexaPermissions("nexa.documents:read")
  async vault(
    @CurrentAuth() auth: AuthContext,
    @Query("userId") userId?: string
  ): Promise<{ items: EmployeeDocument[] }> {
    const items = await this.store.listDocumentsForRequester(auth.userId, auth.role, userId);
    return { items };
  }

  @Post("vault")
  @RequireNexaPermissions("nexa.documents:write")
  async upload(@CurrentAuth() auth: AuthContext, @Body() dto: UploadDocDto): Promise<EmployeeDocument> {
    const target = dto.targetUserId ?? auth.userId;
    if (dto.targetUserId && dto.targetUserId !== auth.userId) {
      const tid = dto.targetUserId;
      const ok =
        auth.role === "superuser" ||
        (await this.store.isManagerOf(auth.userId, tid)) ||
        (await this.store.isUserLeadOfTeamContaining(auth.userId, tid));
      if (!ok) {
        throw new BadRequestException("Caricamento per altri utenti non consentito");
      }
    }
    if (dto.bodyBase64 && dto.bodyBase64.length > MAX_B64) {
      throw new BadRequestException("File troppo grande per upload inline");
    }
    return this.store.createEmployeeDocument({
      userId: target,
      uploadedBy: auth.userId,
      kind: dto.kind,
      title: dto.title,
      mimeType: dto.mimeType,
      bodyBase64: dto.bodyBase64
    });
  }

  @Post("vault/:documentId/reminder")
  @RequireNexaPermissions("nexa.documents:read")
  async sendReadReminder(
    @CurrentAuth() auth: AuthContext,
    @Param("documentId") documentId: string
  ): Promise<{ ok: true }> {
    return this.store.sendEmployeeDocumentVaultReminder(auth.userId, auth.role, documentId);
  }

  @Get("vault/:id/file")
  @RequireNexaPermissions("nexa.documents:read")
  async download(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string
  ): Promise<StreamableFile> {
    const file = await this.store.getEmployeeDocumentFile(auth.userId, auth.role, id);
    let buf: Buffer;
    try {
      buf = Buffer.from(file.base64, "base64");
    } catch {
      throw new BadRequestException("Contenuto file non valido");
    }
    const mime = file.mimeType || "application/octet-stream";
    return new StreamableFile(buf, {
      type: mime,
      disposition: `inline; filename="doc-${id}"`
    });
  }
}
