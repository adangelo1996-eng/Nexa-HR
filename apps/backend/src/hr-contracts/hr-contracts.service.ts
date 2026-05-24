import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import { RemoteWorkPolicyService } from "../smartworking/remote-work-policy.service";
import { renderSynapseContractPdf } from "./hr-contract-pdf.renderer";

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

export interface HrContractPresetDto {
  id: string;
  templateKey: string;
  label: string;
  description: string | null;
  defaultParty: Record<string, unknown>;
  sortOrder: number;
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
  constructor(
    private readonly store: HrDataStore,
    private readonly remoteWorkPolicy: RemoteWorkPolicyService
  ) {}

  private shouldSyncRemoteWorkPolicy(party: Record<string, unknown>, blocks: unknown[]): boolean {
    if (String(party.contractKind ?? "") === "remote_working") {
      return true;
    }
    if (!Array.isArray(blocks)) {
      return false;
    }
    return blocks.some((raw) => {
      if (!raw || typeof raw !== "object") {
        return false;
      }
      const t = String((raw as { type?: string }).type ?? "");
      return t === "remote_work_limits" || t === "remote_working_quota" || t === "smartworking_clause";
    });
  }

  private async syncRemoteWorkPolicyIfNeeded(companyId: string, dto: HrStandardContractDto): Promise<void> {
    if (!this.shouldSyncRemoteWorkPolicy(dto.party, dto.blocks)) {
      return;
    }
    await this.remoteWorkPolicy.syncFromContract(companyId, dto);
  }

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

  async listPresetsForCompany(companyId: string): Promise<HrContractPresetDto[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_contract_presets")
      .select("id, template_key, label, description, default_party_json, sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    if (error) {
      throw new InternalServerErrorException(`Preset contratti: ${error.message}`);
    }
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        templateKey: String(row.template_key),
        label: String(row.label),
        description: row.description != null ? String(row.description) : null,
        defaultParty: (row.default_party_json as Record<string, unknown>) ?? {},
        sortOrder: Number(row.sort_order ?? 0)
      };
    });
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
    const created = rowToDto(recordToRow(data as Record<string, unknown>));
    await this.syncRemoteWorkPolicyIfNeeded(input.companyId, created);
    return created;
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
    const updated = rowToDto(recordToRow(data as Record<string, unknown>));
    await this.syncRemoteWorkPolicyIfNeeded(companyId, updated);
    return updated;
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
    const blocks = Array.isArray(doc.blocks) ? (doc.blocks as Array<Record<string, unknown>>) : [];
    const metaLines = [`Stato: ${doc.status.toUpperCase()}`];
    if (doc.signedAt) {
      metaLines.push(`Firmato: ${String(doc.signedAt).slice(0, 10)}`);
    }
    const buf = await renderSynapseContractPdf({
      documentTitle: doc.title || "Contratto di lavoro",
      subtitle: "Contratto standard HR",
      metaLines,
      blocks: blocks.map((b) => ({
        title: String(b.title ?? ""),
        content: String(b.content ?? b.body ?? ""),
        key: String(b.key ?? "")
      })),
      footerNote: "Documento generato da Nexa HR · SYNAPSE"
    });
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

  private resolveContractCategoryKey(party: Record<string, unknown>, title: string): string {
    const kind = String(party.contractKind ?? party.contract_kind ?? "").trim();
    if (kind === "remote_working") {
      return "smart_working";
    }
    const template = String(party.templateKey ?? party.template_key ?? "").trim();
    if (template) {
      if (template === "part_time") return "part_time_indeterminato";
      return template;
    }
    const lower = title.toLowerCase();
    if (lower.includes("smart") || lower.includes("agile") || lower.includes("remote")) return "smart_working";
    if (lower.includes("determinato") || lower.includes("ctt")) return "determinato";
    if (lower.includes("part-time") || lower.includes("part time")) return "part_time_indeterminato";
    if (lower.includes("apprendist")) return "apprendistato";
    if (lower.includes("intermitt")) return "lavoro_intermittente";
    if (lower.includes("consulenz")) return "consulenza";
    if (lower.includes("collaboraz")) return "collaborazione";
    return "indeterminato";
  }

  private categoryLabel(key: string): string {
    const labels: Record<string, string> = {
      indeterminato: "Subordinato a tempo indeterminato",
      determinato: "Subordinato a tempo determinato (CTT)",
      part_time_indeterminato: "Part-time indeterminato",
      part_time_determinato: "Part-time a tempo determinato",
      apprendistato: "Apprendistato",
      lavoro_intermittente: "Lavoro intermittente (su chiamata)",
      consulenza: "Consulenza esterna (non subordinata)",
      collaborazione: "Collaborazione a progetto",
      smart_working: "Smart working e lavoro agile",
      integrazioni: "Integrazioni e variazioni contrattuali",
      vault: "Documenti firmati (vault dipendente)"
    };
    return labels[key] ?? key.replace(/_/g, " ");
  }

  async listGroupedByCategory(companyId: string): Promise<{
    categories: Array<{
      categoryKey: string;
      categoryLabel: string;
      items: Array<{
        id: string;
        source: "standard" | "smartworking" | "vault" | "amendment";
        title: string;
        status: string;
        employeeUserId: string | null;
        employeeName: string | null;
        contractId: string | null;
        documentId: string | null;
        updatedAt: string;
      }>;
    }>;
  }> {
    const sb = this.sb();
    const users = await this.store.listUsers();
    const userNameById = new Map(
      users.filter((u) => u.companyId === companyId).map((u) => [u.id, u.fullName] as const)
    );

    const buckets = new Map<string, Array<{
      id: string;
      source: "standard" | "smartworking" | "vault" | "amendment";
      title: string;
      status: string;
      employeeUserId: string | null;
      employeeName: string | null;
      contractId: string | null;
      documentId: string | null;
      updatedAt: string;
    }>>();

    const pushItem = (
      categoryKey: string,
      item: {
        id: string;
        source: "standard" | "smartworking" | "vault" | "amendment";
        title: string;
        status: string;
        employeeUserId: string | null;
        employeeName: string | null;
        contractId: string | null;
        documentId: string | null;
        updatedAt: string;
      }
    ): void => {
      if (!buckets.has(categoryKey)) buckets.set(categoryKey, []);
      buckets.get(categoryKey)!.push(item);
    };

    const contracts = await this.listForCompany(companyId);
    const { data: signedRows } = await sb
      .from("hr_standard_contracts")
      .select("id, signed_by_user_id")
      .eq("company_id", companyId);
    const signedByUserId = new Map(
      (signedRows ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return [String(row.id), row.signed_by_user_id != null ? String(row.signed_by_user_id) : null] as const;
      })
    );
    const linkedDocIds = new Set<string>();
    for (const c of contracts) {
      const party = c.party ?? {};
      const employeeUserId =
        party.employeeUserId != null
          ? String(party.employeeUserId)
          : signedByUserId.get(c.id) ?? null;
      const userId = employeeUserId;
      const categoryKey = this.resolveContractCategoryKey(party, c.title);
      if (c.lastExportedDocumentId) linkedDocIds.add(c.lastExportedDocumentId);
      if (c.signedScanDocumentId) linkedDocIds.add(c.signedScanDocumentId);
      pushItem(categoryKey, {
        id: c.id,
        source: "standard",
        title: c.title,
        status: c.status,
        employeeUserId: userId ?? null,
        employeeName: userId ? (userNameById.get(userId) ?? null) : null,
        contractId: c.id,
        documentId: c.signedScanDocumentId ?? c.lastExportedDocumentId ?? null,
        updatedAt: c.updatedAt
      });
    }

    const { data: swRows, error: swErr } = await sb
      .from("smartworking_agreements")
      .select("id, user_id, status, valid_from, valid_to, document_id, updated_at, policy_version")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (swErr) {
      throw new InternalServerErrorException(`Accordi smart working: ${swErr.message}`);
    }
    for (const raw of swRows ?? []) {
      const row = raw as Record<string, unknown>;
      const userId = String(row.user_id ?? "");
      pushItem("smart_working", {
        id: String(row.id),
        source: "smartworking",
        title: `Accordo smart working ${String(row.valid_from ?? "").slice(0, 10)} – ${String(row.valid_to ?? "").slice(0, 10)}`,
        status: String(row.status ?? "active"),
        employeeUserId: userId || null,
        employeeName: userId ? (userNameById.get(userId) ?? null) : null,
        contractId: null,
        documentId: row.document_id != null ? String(row.document_id) : null,
        updatedAt: String(row.updated_at ?? new Date().toISOString())
      });
    }

    const contractIds = contracts.map((c) => c.id);
    if (contractIds.length > 0) {
      const { data: versionRows, error: verErr } = await sb
        .from("hr_standard_contract_versions")
        .select("id, contract_id, version, note, created_at")
        .in("contract_id", contractIds)
        .gt("version", 1)
        .order("created_at", { ascending: false })
        .limit(300);
      if (verErr) {
        throw new InternalServerErrorException(`Versioni contratto: ${verErr.message}`);
      }
      const contractById = new Map(contracts.map((c) => [c.id, c]));
      for (const raw of versionRows ?? []) {
        const row = raw as Record<string, unknown>;
        const contractId = String(row.contract_id ?? "");
        const contract = contractById.get(contractId);
        if (!contract) continue;
        const party = contract.party ?? {};
        const userId =
          party.employeeUserId != null
            ? String(party.employeeUserId)
            : null;
        pushItem("integrazioni", {
          id: String(row.id),
          source: "amendment",
          title: `${contract.title} — v${String(row.version ?? "")}${row.note ? `: ${String(row.note).slice(0, 80)}` : ""}`,
          status: contract.status,
          employeeUserId: userId,
          employeeName: userId ? (userNameById.get(userId) ?? null) : null,
          contractId,
          documentId: contract.signedScanDocumentId ?? contract.lastExportedDocumentId ?? null,
          updatedAt: String(row.created_at ?? contract.updatedAt)
        });
      }
    }

    const { data: vaultRows, error: vaultErr } = await sb
      .from("employee_documents")
      .select("id, userId, title, createdAt")
      .eq("kind", "contract")
      .order("createdAt", { ascending: false })
      .limit(300);
    if (vaultErr) {
      throw new InternalServerErrorException(`Documenti contratto vault: ${vaultErr.message}`);
    }
    for (const raw of vaultRows ?? []) {
      const row = raw as Record<string, unknown>;
      const docId = String(row.id ?? "");
      if (linkedDocIds.has(docId)) continue;
      const userId = String(row.userId ?? "");
      const u = users.find((x) => x.id === userId);
      if (u && u.companyId !== companyId) continue;
      pushItem("vault", {
        id: docId,
        source: "vault",
        title: String(row.title ?? "Contratto firmato"),
        status: "archived",
        employeeUserId: userId || null,
        employeeName: userId ? (userNameById.get(userId) ?? u?.fullName ?? null) : null,
        contractId: null,
        documentId: docId,
        updatedAt: String(row.createdAt ?? new Date().toISOString())
      });
    }

    const order = [
      "indeterminato",
      "determinato",
      "part_time_indeterminato",
      "part_time_determinato",
      "apprendistato",
      "lavoro_intermittente",
      "consulenza",
      "collaborazione",
      "smart_working",
      "integrazioni",
      "vault"
    ];
    const categories = [...buckets.entries()]
      .map(([categoryKey, items]) => ({
        categoryKey,
        categoryLabel: this.categoryLabel(categoryKey),
        items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      }))
      .sort((a, b) => {
        const ai = order.indexOf(a.categoryKey);
        const bi = order.indexOf(b.categoryKey);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      });

    return { categories };
  }
}
