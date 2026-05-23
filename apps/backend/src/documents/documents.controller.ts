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
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type {
  EmployeeDocument,
  EmployeeDocumentKind,
  HrDocumentSignatureRequest,
  HrDocumentSignatureRequestStatus
} from "@payday/domain";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { RemoteWorkPolicyService } from "../smartworking/remote-work-policy.service";

const DOC_KINDS: EmployeeDocumentKind[] = ["contract", "payslip", "personal", "other", "remote_working"];
const MAX_B64 = 1_800_000;
const SIG_STATUSES: HrDocumentSignatureRequestStatus[] = [
  "pending_employee_sign",
  "signed",
  "returned"
];

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

  /** Versione HITL: scheda origine in catena archivio. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  parentDocumentId?: string;

  @IsOptional()
  @IsBoolean()
  triggerSignatureWorkflow?: boolean;
}

class SignVaultDocumentDto {
  @IsString()
  @MaxLength(200)
  employeeSignerName!: string;
}

@Controller("documents")
@UseGuards(NexaPermissionGuard)
export class DocumentsController {
  constructor(
    private readonly store: HrDataStore,
    private readonly remoteWorkPolicy: RemoteWorkPolicyService
  ) {}

  @Get("vault")
  @RequireNexaPermissions("nexa.documents:read")
  async vault(
    @CurrentAuth() auth: AuthContext,
    @Query("userId") userId?: string
  ): Promise<{ items: EmployeeDocument[] }> {
    const items = await this.store.listDocumentsForRequester(auth.userId, auth.role, userId);
    return { items };
  }

  @Get("vault/signature-requests")
  @RequireNexaPermissions("nexa.documents:read")
  async listSignatureRequests(
    @CurrentAuth() auth: AuthContext,
    @Query("role") role?: "employee" | "requester",
    @Query("status") status?: HrDocumentSignatureRequestStatus,
    @Query("userId") userId?: string
  ): Promise<{ items: HrDocumentSignatureRequest[] }> {
    const mode = role === "requester" ? "requester" : "employee";
    if (mode === "requester") {
      const items = await this.store.listVaultSignatureRequestsForRequester(
        auth.userId,
        status && SIG_STATUSES.includes(status) ? status : undefined
      );
      return { items };
    }
    const target = userId?.trim() || auth.userId;
    if (target !== auth.userId) {
      const ok =
        auth.role === "superuser" ||
        (await this.store.isManagerOf(auth.userId, target)) ||
        (await this.store.isUserLeadOfTeamContaining(auth.userId, target));
      if (!ok) {
        throw new BadRequestException("Elenco firme per altri utenti non consentito");
      }
    }
    const items = await this.store.listVaultSignatureRequestsForEmployee(
      target,
      status && SIG_STATUSES.includes(status) ? status : undefined
    );
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
    const doc = await this.store.createEmployeeDocument({
      userId: target,
      uploadedBy: auth.userId,
      kind: dto.kind,
      title: dto.title,
      mimeType: dto.mimeType,
      bodyBase64: dto.bodyBase64,
      parentDocumentId: dto.parentDocumentId,
      triggerSignatureWorkflow: dto.triggerSignatureWorkflow
    });
    if (dto.kind === "remote_working") {
      const actor = await this.store.getUser(auth.userId);
      await this.remoteWorkPolicy.syncFromVaultDocument(actor.companyId, target, {
        bodyBase64: dto.bodyBase64,
        mimeType: dto.mimeType,
        title: dto.title
      });
    }
    return doc;
  }

  @Post("vault/:documentId/sign")
  @RequireNexaPermissions("nexa.documents:read")
  async signVault(
    @CurrentAuth() auth: AuthContext,
    @Param("documentId") documentId: string,
    @Body() dto: SignVaultDocumentDto
  ): Promise<{ document: EmployeeDocument; request: HrDocumentSignatureRequest }> {
    const name = dto.employeeSignerName.trim();
    if (!name) {
      throw new BadRequestException("Nome firmatario obbligatorio");
    }
    return this.store.signVaultDocument({
      documentId,
      actorUserId: auth.userId,
      employeeSignerName: name
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
