import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import PDFDocument from "pdfkit";

export type HrStandardContractStatus = "draft" | "approved" | "exported";

export interface HrStandardContractDto {
  id: string;
  title: string;
  status: HrStandardContractStatus;
  createdAt: string;
  updatedAt: string;
  party: Record<string, unknown>;
  blocks: unknown[];
  lastExportedDocumentId?: string;
  /** Scansione PDF firmata caricata (ulteriore rispetto al PDF generato in export). */
  signedScanDocumentId?: string;
  recruitCandidateId?: string;
  recruitPositionId?: string;
  signedAt?: string;
  signatures?: Record<string, unknown>;
}

interface ContractRow {
  id: string;
  company_id: string;
  title: string;
  status: HrStandardContractStatus;
  created_at: string;
  updated_at: string;
  party: Record<string, unknown>;
  blocks: unknown[];
  last_exported_document_id: string | null;
  signed_scan_document_id: string | null;
  recruit_candidate_id: string | null;
  recruit_position_id: string | null;
  signed_at: string | null;
  signatures: Record<string, unknown>;
}

function rowToDto(r: ContractRow): HrStandardContractDto {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    party: r.party,
    blocks: Array.isArray(r.blocks) ? r.blocks : [],
    lastExportedDocumentId: r.last_exported_document_id ?? undefined,
    signedScanDocumentId: r.signed_scan_document_id ?? undefined,
    recruitCandidateId: r.recruit_candidate_id ?? undefined,
    recruitPositionId: r.recruit_position_id ?? undefined,
    signedAt: r.signed_at ?? undefined,
    signatures: r.signatures ?? undefined
  };
}

function recordToRow(r: Record<string, unknown>): ContractRow {
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    title: String(r.title),
    status: r.status as HrStandardContractStatus,
    created_at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as string).toISOString(),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : new Date(r.updated_at as string).toISOString(),
    party: (r.party as Record<string, unknown>) ?? {},
    blocks: Array.isArray(r.blocks) ? r.blocks : [],
    last_exported_document_id: (r.last_exported_document_id as string | null) ?? null,
    signed_scan_document_id: (r.signed_scan_document_id as string | null) ?? null,
    recruit_candidate_id: r.recruit_candidate_id != null ? String(r.recruit_candidate_id) : null,
    recruit_position_id: r.recruit_position_id != null ? String(r.recruit_position_id) : null,
    signed_at: r.signed_at != null ? String(r.signed_at) : null,
    signatures: (r.signatures as Record<string, unknown>) ?? {}
  };
}

@Injectable()
export class HrContractsService {
  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  async listForCompany(companyId: string): Promise<HrStandardContractDto[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contracts")
      .select(
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, signed_scan_document_id, recruit_candidate_id, recruit_position_id, signed_at, signatures"
      )
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      throw new InternalServerErrorException(`Contratti: ${error.message}`);
    }
    return (data ?? []).map((r) => rowToDto(recordToRow(r as Record<string, unknown>)));
  }

  async getById(companyId: string, id: string): Promise<HrStandardContractDto> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contracts")
      .select(
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, signed_scan_document_id, recruit_candidate_id, recruit_position_id, signed_at, signatures"
      )
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Contratto non trovato");
    }
    return rowToDto(recordToRow(data as Record<string, unknown>));
  }

  async create(input: {
    companyId: string;
    title: string;
    party: Record<string, unknown>;
    blocks: unknown[];
    createdByUserId: string;
    recruitCandidateId?: string | null;
    recruitPositionId?: string | null;
  }): Promise<HrStandardContractDto> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contracts")
      .insert({
        company_id: input.companyId,
        title: input.title,
        status: "draft" as const,
        party: input.party,
        blocks: input.blocks,
        signatures: {},
        created_by_user_id: input.createdByUserId,
        recruit_candidate_id: input.recruitCandidateId || null,
        recruit_position_id: input.recruitPositionId || null
      })
      .select(
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, signed_scan_document_id, recruit_candidate_id, recruit_position_id, signed_at, signatures"
      )
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione contratto: ${error?.message ?? "nessun dato"}`);
    }
    return rowToDto(recordToRow(data as Record<string, unknown>));
  }

  async update(
    companyId: string,
    id: string,
    patch: {
      title?: string;
      party?: Record<string, unknown>;
      blocks?: unknown[];
      status?: HrStandardContractStatus;
      lastExportedDocumentId?: string | null;
      signedScanDocumentId?: string | null;
    }
  ): Promise<HrStandardContractDto> {
    const cur = await this.getById(companyId, id);
    const nextTitle = patch.title ?? cur.title;
    const nextParty = patch.party ?? cur.party;
    const nextBlocks = patch.blocks ?? cur.blocks;
    const nextStatus = patch.status ?? cur.status;
    const nextExportId =
      patch.lastExportedDocumentId !== undefined ? patch.lastExportedDocumentId : cur.lastExportedDocumentId ?? null;
    const nextSignedScanId =
      patch.signedScanDocumentId !== undefined ? patch.signedScanDocumentId : cur.signedScanDocumentId ?? null;

    const sb = this.sb();

    // Versioning: snapshot the next state as a new version.
    const { data: lastVer } = await sb
      .from("hr_standard_contract_versions")
      .select("version")
      .eq("contract_id", id)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = Number((lastVer?.[0] as { version?: number } | undefined)?.version ?? 0) + 1;
    const snapshot = {
      title: nextTitle,
      status: nextStatus,
      party: nextParty,
      blocks: nextBlocks,
      lastExportedDocumentId: nextExportId,
      signedScanDocumentId: nextSignedScanId,
      updatedAt: new Date().toISOString()
    };
    await sb.from("hr_standard_contract_versions").insert({
      contract_id: id,
      version: nextVersion,
      snapshot,
      created_by_user_id: null
    });

    const { data, error } = await sb
      .from("hr_standard_contracts")
      .update({
        title: nextTitle,
        party: nextParty,
        blocks: nextBlocks,
        status: nextStatus,
        last_exported_document_id: nextExportId,
        signed_scan_document_id: nextSignedScanId,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select(
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, signed_scan_document_id, recruit_candidate_id, recruit_position_id, signed_at, signatures"
      )
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Contratto non trovato");
    }
    return rowToDto(recordToRow(data as Record<string, unknown>));
  }

  async delete(companyId: string, id: string): Promise<void> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contracts")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Contratto non trovato");
    }
  }

  async listVersions(
    companyId: string,
    id: string
  ): Promise<Array<{ version: number; created_at: string; note: string }>> {
    await this.getById(companyId, id);
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contract_versions")
      .select("version, created_at, note")
      .eq("contract_id", id)
      .order("version", { ascending: false })
      .limit(50);
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []).map((r) => ({
      version: Number((r as { version: number }).version),
      created_at: String((r as { created_at: string }).created_at),
      note: String((r as { note?: string }).note ?? "")
    }));
  }

  async restoreVersion(companyId: string, id: string, version: number, actorUserId: string): Promise<HrStandardContractDto> {
    if (!Number.isFinite(version) || version <= 0) {
      throw new BadRequestException("Versione non valida");
    }
    await this.getById(companyId, id);
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contract_versions")
      .select("snapshot")
      .eq("contract_id", id)
      .eq("version", version)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException("Versione non trovata");
    const snap = (data as { snapshot?: Record<string, unknown> }).snapshot ?? {};
    return this.update(companyId, id, {
      title: (snap.title as string | undefined) ?? undefined,
      party: (snap.party as Record<string, unknown> | undefined) ?? undefined,
      blocks: (snap.blocks as unknown[] | undefined) ?? undefined,
      status: (snap.status as HrStandardContractStatus | undefined) ?? undefined,
      lastExportedDocumentId: (snap.lastExportedDocumentId as string | null | undefined) ?? undefined,
      signedScanDocumentId: (snap.signedScanDocumentId as string | null | undefined) ?? undefined
    });
  }

  async signContract(
    companyId: string,
    id: string,
    actorUserId: string,
    input: { companySignerName: string; employeeSignerName: string }
  ): Promise<HrStandardContractDto> {
    const cur = await this.getById(companyId, id);
    if (cur.status !== "approved") {
      throw new BadRequestException("Firma consentita solo dopo approvazione");
    }
    const signatures = {
      companySignerName: input.companySignerName,
      employeeSignerName: input.employeeSignerName
    };
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contracts")
      .update({
        signatures,
        signed_at: new Date().toISOString(),
        signed_by_user_id: actorUserId,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select(
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, signed_scan_document_id, recruit_candidate_id, recruit_position_id, signed_at, signatures"
      )
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException("Contratto non trovato");
    return rowToDto(recordToRow(data as Record<string, unknown>));
  }

  private async renderPdfBase64(doc: HrStandardContractDto): Promise<string> {
    const out: Buffer[] = [];
    const pdf = new PDFDocument({ size: "A4", margin: 48 });
    pdf.on("data", (chunk) => out.push(chunk as Buffer));
    const done = new Promise<Buffer>((resolve, reject) => {
      pdf.on("end", () => resolve(Buffer.concat(out)));
      pdf.on("error", reject);
    });

    pdf.font("Times-Roman").fontSize(16).text(doc.title || "Contratto di lavoro", { align: "left" });
    pdf.moveDown(0.6);
    pdf.font("Times-Roman").fontSize(10).fillColor("#444").text(`Stato: ${doc.status.toUpperCase()}`);
    if (doc.signedAt) {
      pdf.text(`Firmato: ${String(doc.signedAt).slice(0, 10)}`);
    }
    pdf.fillColor("#000");
    pdf.moveDown(0.6);

    const blocks = Array.isArray(doc.blocks) ? (doc.blocks as Array<Record<string, unknown>>) : [];
    for (const b of blocks) {
      const title = String(b.title ?? "");
      const content = String(b.content ?? "");
      if (title.trim()) {
        pdf.font("Times-Bold").fontSize(12).text(title.trim());
      }
      pdf.moveDown(0.2);
      pdf.font("Times-Roman").fontSize(11).text(content || "", { align: "left" });
      pdf.moveDown(0.8);
    }

    pdf.end();
    const buf = await done;
    return buf.toString("base64");
  }

  async exportPdf(companyId: string, id: string, actorUserId: string): Promise<HrStandardContractDto> {
    const cur = await this.getById(companyId, id);
    if (cur.status !== "approved") {
      throw new BadRequestException("Export consentito solo dopo approvazione");
    }
    if (!cur.signedAt) {
      throw new BadRequestException("Export consentito solo dopo firma");
    }
    const base64 = await this.renderPdfBase64(cur);
    const uploaded = await this.store.createEmployeeDocument({
      userId: actorUserId,
      uploadedBy: actorUserId,
      kind: "contract",
      title: `${cur.title} (PDF)`,
      mimeType: "application/pdf",
      bodyBase64: base64
    });
    return this.update(companyId, id, {
      status: "exported",
      lastExportedDocumentId: uploaded.id
    });
  }

  async uploadSignedScan(
    companyId: string,
    contractId: string,
    actorUserId: string,
    input: { bodyBase64: string; mimeType?: string; title?: string }
  ): Promise<HrStandardContractDto> {
    const cur = await this.getById(companyId, contractId);
    if (cur.status === "draft") {
      throw new BadRequestException("Carica la scansione solo dopo approvazione del testo (stato almeno «Approvato»).");
    }
    const b64 = input.bodyBase64.trim();
    if (!b64) {
      throw new BadRequestException("File (base64) mancante");
    }
    const title = (input.title?.trim() || `${cur.title} (firmato)`).slice(0, 400);
    const uploaded = await this.store.createEmployeeDocument({
      userId: actorUserId,
      uploadedBy: actorUserId,
      kind: "contract",
      title,
      mimeType: input.mimeType?.trim() || "application/pdf",
      bodyBase64: b64
    });
    return this.update(companyId, contractId, { signedScanDocumentId: uploaded.id });
  }

  /** File collegato al contratto (export o scansione) — lettura lato servizio, senza vincolo sul proprietario del `employee_document`. */
  async getContractLinkedFile(
    companyId: string,
    contractId: string,
    documentId: string
  ): Promise<{ mimeType?: string; base64: string; filename: string }> {
    const cur = await this.getById(companyId, contractId);
    if (cur.lastExportedDocumentId !== documentId && cur.signedScanDocumentId !== documentId) {
      throw new NotFoundException("Documento non collegato a questo contratto");
    }
    const sb = this.sb();
    const { data, error } = await sb
      .from("employee_documents")
      .select("bodyBase64, mimeType, title")
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const row = (data ?? {}) as { bodyBase64?: string | null; mimeType?: string | null; title?: string | null };
    const b64 = row.bodyBase64 ? String(row.bodyBase64) : "";
    if (!b64) {
      throw new NotFoundException("Contenuto non disponibile (solo metadato)");
    }
    const ext = (row.mimeType && String(row.mimeType).includes("pdf")) || !row.mimeType ? "pdf" : "bin";
    const baseTitle = (row.title && String(row.title).replace(/[^\w\-]+/g, "_").slice(0, 40)) || "documento";
    return {
      mimeType: row.mimeType ? String(row.mimeType) : "application/pdf",
      base64: b64,
      filename: `${baseTitle}.${ext}`
    };
  }
}
