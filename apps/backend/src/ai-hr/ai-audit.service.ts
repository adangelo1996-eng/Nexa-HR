import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";

export interface AiAuditInsertInput {
  companyId: string;
  userId: string;
  roleSnapshot: string;
  feature: string;
  schemaVersion?: string | null;
  sessionId?: string | null;
  /** Oggetto o stringa da non persistere in chiaro: solo fingerprint. */
  inputForFingerprint?: unknown;
  dataSources?: string[];
  responseSizeBytes?: number | null;
  outcome?: string | null;
}

@Injectable()
export class AiAuditService {
  constructor(private readonly store: HrDataStore) {}

  fingerprintOf(input: unknown): string {
    const s = typeof input === "string" ? input : JSON.stringify(input ?? null);
    return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 48);
  }

  async append(row: AiAuditInsertInput): Promise<void> {
    const sb = this.store.getServiceRoleClient();
    const fp = row.inputForFingerprint !== undefined ? this.fingerprintOf(row.inputForFingerprint) : null;
    const { error } = await sb.from("ai_interaction_audit").insert({
      company_id: row.companyId,
      user_id: row.userId,
      role_snapshot: row.roleSnapshot,
      feature: row.feature,
      schema_version: row.schemaVersion ?? null,
      session_id: row.sessionId ?? null,
      input_fingerprint: fp,
      data_sources: row.dataSources ?? [],
      response_size_bytes: row.responseSizeBytes ?? null,
      outcome: row.outcome ?? null
    });
    if (error) {
      // eslint-disable-next-line no-console -- audit fallback: non bloccare il flusso AI
      console.warn("[ai-audit] insert failed:", error.message);
    }
  }
}
