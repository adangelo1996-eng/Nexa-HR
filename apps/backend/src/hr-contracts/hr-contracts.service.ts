import { Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabasePoolService } from "../platform/database-pool.service";

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

@Injectable()
export class HrContractsService {
  constructor(private readonly dbPool: DatabasePoolService) {}

  private async q<T = unknown>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    return this.dbPool.withTransaction(async (client: PoolClient) => {
      const out = await client.query(sql, params);
      return { rows: out.rows as T[] };
    });
  }

  async listForCompany(companyId: string): Promise<HrStandardContractDto[]> {
    const { rows } = await this.q<ContractRow>(
      `select
        id::text,
        company_id,
        title,
        status,
        created_at::text,
        updated_at::text,
        party,
        blocks,
        last_exported_document_id,
        recruit_candidate_id::text,
        recruit_position_id::text
       from public.hr_standard_contracts
       where company_id = $1
       order by updated_at desc
       limit 500`,
      [companyId]
    );
    return rows.map(rowToDto);
  }

  async getById(companyId: string, id: string): Promise<HrStandardContractDto> {
    const { rows } = await this.q<ContractRow>(
      `select
        id::text,
        company_id,
        title,
        status,
        created_at::text,
        updated_at::text,
        party,
        blocks,
        last_exported_document_id,
        recruit_candidate_id::text,
        recruit_position_id::text
       from public.hr_standard_contracts
       where id = $1 and company_id = $2
       limit 1`,
      [id, companyId]
    );
    const r = rows[0];
    if (!r) throw new NotFoundException("Contratto non trovato");
    return rowToDto(r);
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
    const { rows } = await this.q<ContractRow>(
      `insert into public.hr_standard_contracts
        (company_id, title, status, party, blocks, created_by_user_id, recruit_candidate_id, recruit_position_id)
       values ($1, $2, 'draft', $3::jsonb, $4::jsonb, $5, $6::uuid, $7::uuid)
       returning
        id::text,
        company_id,
        title,
        status,
        created_at::text,
        updated_at::text,
        party,
        blocks,
        last_exported_document_id,
        recruit_candidate_id::text,
        recruit_position_id::text`,
      [
        input.companyId,
        input.title,
        JSON.stringify(input.party),
        JSON.stringify(input.blocks),
        input.createdByUserId,
        input.recruitCandidateId || null,
        input.recruitPositionId || null
      ]
    );
    return rowToDto(rows[0] as ContractRow);
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

    const { rows } = await this.q<ContractRow>(
      `update public.hr_standard_contracts
       set
         title = $3,
         party = $4::jsonb,
         blocks = $5::jsonb,
         status = $6,
         last_exported_document_id = $7,
         updated_at = now()
       where id = $1 and company_id = $2
       returning
        id::text,
        company_id,
        title,
        status,
        created_at::text,
        updated_at::text,
        party,
        blocks,
        last_exported_document_id,
        recruit_candidate_id::text,
        recruit_position_id::text`,
      [
        id,
        companyId,
        nextTitle,
        JSON.stringify(nextParty),
        JSON.stringify(nextBlocks),
        nextStatus,
        nextExportId
      ]
    );
    const r = rows[0];
    if (!r) throw new NotFoundException("Contratto non trovato");
    return rowToDto(r);
  }

  async delete(companyId: string, id: string): Promise<void> {
    const { rows } = await this.q<{ c: string }>(
      `delete from public.hr_standard_contracts where id = $1 and company_id = $2 returning id::text as c`,
      [id, companyId]
    );
    if (!rows[0]) throw new NotFoundException("Contratto non trovato");
  }
}
