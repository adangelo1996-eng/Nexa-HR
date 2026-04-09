import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";

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
  recruitCandidateId?: string;
  recruitPositionId?: string;
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
  recruit_candidate_id: string | null;
  recruit_position_id: string | null;
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
    recruitCandidateId: r.recruit_candidate_id ?? undefined,
    recruitPositionId: r.recruit_position_id ?? undefined
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
    recruit_candidate_id: r.recruit_candidate_id != null ? String(r.recruit_candidate_id) : null,
    recruit_position_id: r.recruit_position_id != null ? String(r.recruit_position_id) : null
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
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, recruit_candidate_id, recruit_position_id"
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
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, recruit_candidate_id, recruit_position_id"
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
        created_by_user_id: input.createdByUserId,
        recruit_candidate_id: input.recruitCandidateId || null,
        recruit_position_id: input.recruitPositionId || null
      })
      .select(
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, recruit_candidate_id, recruit_position_id"
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
    }
  ): Promise<HrStandardContractDto> {
    const cur = await this.getById(companyId, id);
    const nextTitle = patch.title ?? cur.title;
    const nextParty = patch.party ?? cur.party;
    const nextBlocks = patch.blocks ?? cur.blocks;
    const nextStatus = patch.status ?? cur.status;
    const nextExportId =
      patch.lastExportedDocumentId !== undefined ? patch.lastExportedDocumentId : cur.lastExportedDocumentId ?? null;

    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_standard_contracts")
      .update({
        title: nextTitle,
        party: nextParty,
        blocks: nextBlocks,
        status: nextStatus,
        last_exported_document_id: nextExportId,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select(
        "id, company_id, title, status, created_at, updated_at, party, blocks, last_exported_document_id, recruit_candidate_id, recruit_position_id"
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
}
