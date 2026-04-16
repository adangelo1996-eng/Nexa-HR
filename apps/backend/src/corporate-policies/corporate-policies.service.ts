import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import type { AuthRole } from "../platform/auth";

const BUCKET = "corporate-policy-files";
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export interface CorporatePolicyDocumentRow {
  id: string;
  company_id: string;
  title: string;
  description: string;
  mime_type: string | null;
  byte_size: number | null;
  version: number;
  created_by_user_id: string | null;
  created_at: string;
}

@Injectable()
export class CorporatePoliciesService {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  async list(companyId: string): Promise<CorporatePolicyDocumentRow[]> {
    const { data, error } = await this.sb()
      .from("corporate_policy_documents")
      .select("id, company_id, title, description, mime_type, byte_size, version, created_by_user_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []).map((r) => ({
      id: String(r.id),
      company_id: String(r.company_id),
      title: String(r.title ?? ""),
      description: String(r.description ?? ""),
      mime_type: (r.mime_type as string | null) ?? null,
      byte_size: r.byte_size != null ? Number(r.byte_size) : null,
      version: Number(r.version ?? 1),
      created_by_user_id: (r.created_by_user_id as string | null) ?? null,
      created_at: new Date(r.created_at as string).toISOString()
    }));
  }

  async listSnippetsForAi(companyId: string): Promise<{ id: string; title: string; description: string }[]> {
    const rows = await this.list(companyId);
    return rows.map((r) => ({ id: r.id, title: r.title, description: r.description }));
  }

  async upload(input: {
    companyId: string;
    actorUserId: string;
    title: string;
    description: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<CorporatePolicyDocumentRow> {
    const mime = (input.mimeType || "application/octet-stream").split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException("Formato file non consentito (PDF o Word)");
    }
    if (input.buffer.length > MAX_BYTES) {
      throw new BadRequestException("File troppo grande (max 12 MB)");
    }
    const safe = input.originalName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const objectPath = `${input.companyId}/${randomUUID()}_${safe}`;
    const sb = this.sb();
    const { error: upErr } = await sb.storage.from(BUCKET).upload(objectPath, input.buffer, {
      contentType: mime,
      upsert: false
    });
    if (upErr) {
      throw new InternalServerErrorException(`Upload: ${upErr.message}`);
    }
    const { data, error } = await sb
      .from("corporate_policy_documents")
      .insert({
        company_id: input.companyId,
        title: input.title.trim(),
        description: input.description.trim(),
        storage_bucket: BUCKET,
        storage_path: objectPath,
        mime_type: mime,
        byte_size: input.buffer.length,
        created_by_user_id: input.actorUserId
      })
      .select("id, company_id, title, description, mime_type, byte_size, version, created_by_user_id, created_at")
      .single();
    if (error || !data) {
      await sb.storage.from(BUCKET).remove([objectPath]).catch(() => undefined);
      throw new InternalServerErrorException(error?.message ?? "Salvataggio metadati fallito");
    }
    return {
      id: String(data.id),
      company_id: String(data.company_id),
      title: String(data.title ?? ""),
      description: String(data.description ?? ""),
      mime_type: (data.mime_type as string | null) ?? null,
      byte_size: data.byte_size != null ? Number(data.byte_size) : null,
      version: Number(data.version ?? 1),
      created_by_user_id: (data.created_by_user_id as string | null) ?? null,
      created_at: new Date(data.created_at as string).toISOString()
    };
  }

  async getFile(companyId: string, documentId: string): Promise<{ buffer: Buffer; mimeType: string; downloadName: string }> {
    const sb = this.sb();
    const { data: row, error } = await sb
      .from("corporate_policy_documents")
      .select("company_id, title, storage_bucket, storage_path, mime_type")
      .eq("id", documentId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!row || String(row.company_id) !== companyId) {
      throw new NotFoundException("Documento non trovato");
    }
    const buck = String(row.storage_bucket ?? BUCKET);
    const path = String(row.storage_path ?? "");
    const { data: blob, error: dErr } = await sb.storage.from(buck).download(path);
    if (dErr || !blob) {
      throw new InternalServerErrorException(dErr?.message ?? "Download fallito");
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const mime = (row.mime_type as string) || "application/octet-stream";
    const base = String(row.title ?? "policy").replace(/[^\w.\-]+/g, "_").slice(0, 80);
    return { buffer: buf, mimeType: mime, downloadName: base };
  }

  async assertCanManagePolicies(userId: string, jwtRole: AuthRole): Promise<void> {
    if (jwtRole === "superuser") {
      return;
    }
    const ok =
      (await this.permissions.userHasAll(userId, ["nexa.corporate_policies:write"])) ||
      (await this.permissions.userHasAll(userId, ["nexa.admin_users:read"]));
    if (!ok) {
      throw new ForbiddenException("Caricamento policy riservato a HR/Admin");
    }
  }
}
