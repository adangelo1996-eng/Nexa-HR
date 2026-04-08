import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabasePoolService } from "../platform/database-pool.service";

export interface RecruitPositionRow {
  id: string;
  company_id: string;
  title: string;
  job_description: string;
  status: "open" | "closed";
  created_at: string;
}

export interface RecruitCandidateRow {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  created_at: string;
}

export interface RecruitCandidatePositionStateSummary {
  state_id: string;
  position_id: string;
  position_title: string;
  current_stage_id: string;
  status: "in_progress" | "passed" | "failed";
  updated_at: string;
}

export interface RecruitPipelineStageRow {
  id: string;
  pipeline_id: string;
  stage_order: number;
  name: string;
  stage_kind: string;
}

export interface RecruitCandidateStageStateRow {
  id: string;
  candidate_id: string;
  position_id: string;
  current_stage_id: string;
  status: "in_progress" | "passed" | "failed";
  updated_at: string;
}

@Injectable()
export class RecruitingService {
  constructor(private readonly dbPool: DatabasePoolService) {}

  private async q<T = unknown>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    return this.dbPool.withTransaction(async (client: PoolClient) => {
      const out = await client.query(sql, params);
      return { rows: out.rows as T[] };
    });
  }

  async listPositions(companyId: string): Promise<RecruitPositionRow[]> {
    const { rows } = await this.q<RecruitPositionRow>(
      `select id::text, company_id, title, job_description, status, created_at::text
       from public.recruit_positions
       where company_id = $1
       order by created_at desc
       limit 200`,
      [companyId]
    );
    return rows;
  }

  async createPosition(input: {
    companyId: string;
    title: string;
    jobDescription: string;
    createdByUserId: string;
  }): Promise<RecruitPositionRow> {
    const { rows } = await this.q<RecruitPositionRow>(
      `insert into public.recruit_positions (company_id, title, job_description, status, created_by_user_id)
       values ($1, $2, $3, 'open', $4)
       returning id::text, company_id, title, job_description, status, created_at::text`,
      [input.companyId, input.title, input.jobDescription, input.createdByUserId]
    );
    return rows[0] as RecruitPositionRow;
  }

  async ensureDefaultPipelineForPosition(positionId: string): Promise<{ pipelineId: string; stages: RecruitPipelineStageRow[] }> {
    await this.q(
      `insert into public.recruit_pipelines (position_id, name)
       values ($1, 'Pipeline')
       on conflict (position_id) do nothing`,
      [positionId]
    );
    const pl = await this.q<{ id: string }>(
      `select id::text from public.recruit_pipelines where position_id = $1 limit 1`,
      [positionId]
    );
    const pipelineId = pl.rows[0]?.id ?? "";
    if (!pipelineId) {
      throw new Error("Pipeline non disponibile");
    }
    const st = await this.q<RecruitPipelineStageRow>(
      `select id::text, pipeline_id::text, stage_order, name, stage_kind
       from public.recruit_pipeline_stages
       where pipeline_id = $1
       order by stage_order asc`,
      [pipelineId]
    );
    if (st.rows.length === 0) {
      // Seed fasi default MVP
      await this.q(
        `insert into public.recruit_pipeline_stages (pipeline_id, stage_order, name, stage_kind)
         values
          ($1, 10, 'Nuovo', 'screening'),
          ($1, 20, 'Screening', 'screening'),
          ($1, 30, 'Colloquio 1', 'interview'),
          ($1, 40, 'Colloquio 2', 'interview'),
          ($1, 50, 'Offerta', 'offer'),
          ($1, 60, 'Assunto', 'hired'),
          ($1, 70, 'Scartato', 'rejected')`,
        [pipelineId]
      );
    }
    const st2 = await this.q<RecruitPipelineStageRow>(
      `select id::text, pipeline_id::text, stage_order, name, stage_kind
       from public.recruit_pipeline_stages
       where pipeline_id = $1
       order by stage_order asc`,
      [pipelineId]
    );
    return { pipelineId, stages: st2.rows };
  }

  async listCandidates(companyId: string): Promise<RecruitCandidateRow[]> {
    const { rows } = await this.q<RecruitCandidateRow>(
      `select id::text, company_id, first_name, last_name, email, phone, notes, created_at::text
       from public.recruit_candidates
       where company_id = $1
       order by created_at desc
       limit 300`,
      [companyId]
    );
    return rows;
  }

  async createCandidate(input: {
    companyId: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    notes?: string;
    createdByUserId: string;
  }): Promise<RecruitCandidateRow> {
    const { rows } = await this.q<RecruitCandidateRow>(
      `insert into public.recruit_candidates (company_id, first_name, last_name, email, phone, notes, created_by_user_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id::text, company_id, first_name, last_name, email, phone, notes, created_at::text`,
      [
        input.companyId,
        input.firstName,
        input.lastName,
        input.email ?? null,
        input.phone ?? null,
        input.notes ?? "",
        input.createdByUserId
      ]
    );
    return rows[0] as RecruitCandidateRow;
  }

  async getCandidate(candidateId: string): Promise<RecruitCandidateRow> {
    const { rows } = await this.q<RecruitCandidateRow>(
      `select id::text, company_id, first_name, last_name, email, phone, notes, created_at::text
       from public.recruit_candidates
       where id = $1
       limit 1`,
      [candidateId]
    );
    if (!rows[0]) {
      throw new Error("Candidato non trovato");
    }
    return rows[0];
  }

  async listCandidateStates(candidateId: string): Promise<RecruitCandidatePositionStateSummary[]> {
    const { rows } = await this.q<RecruitCandidatePositionStateSummary>(
      `select
        s.id::text as state_id,
        s.position_id::text,
        p.title as position_title,
        s.current_stage_id::text,
        s.status,
        s.updated_at::text
      from public.recruit_candidate_stage_state s
      join public.recruit_positions p on p.id = s.position_id
      where s.candidate_id = $1
      order by s.updated_at desc`,
      [candidateId]
    );
    return rows;
  }

  async attachCandidateToPosition(input: {
    companyId: string;
    candidateId: string;
    positionId: string;
    actorUserId: string;
  }): Promise<RecruitCandidateStageStateRow> {
    const { stages } = await this.ensureDefaultPipelineForPosition(input.positionId);
    const firstStage = stages[0];
    if (!firstStage) {
      throw new Error("Pipeline senza fasi");
    }
    const { rows } = await this.q<RecruitCandidateStageStateRow>(
      `insert into public.recruit_candidate_stage_state
        (candidate_id, position_id, current_stage_id, status, updated_by_user_id)
       values ($1, $2, $3, 'in_progress', $4)
       on conflict (candidate_id, position_id)
       do update set current_stage_id = excluded.current_stage_id, status = 'in_progress', updated_at = now(), updated_by_user_id = excluded.updated_by_user_id
       returning id::text, candidate_id::text, position_id::text, current_stage_id::text, status, updated_at::text`,
      [input.candidateId, input.positionId, firstStage.id, input.actorUserId]
    );
    return rows[0] as RecruitCandidateStageStateRow;
  }

  async listPipelineBoard(positionId: string): Promise<{
    position: { id: string; title: string };
    stages: RecruitPipelineStageRow[];
    items: Array<{
      state: RecruitCandidateStageStateRow;
      candidate: RecruitCandidateRow;
    }>;
  }> {
    const { stages } = await this.ensureDefaultPipelineForPosition(positionId);
    const pos = await this.q<{ id: string; title: string }>(
      `select id::text, title from public.recruit_positions where id = $1 limit 1`,
      [positionId]
    );
    const positionRow = pos.rows[0];
    if (!positionRow) {
      throw new Error("Posizione non trovata");
    }
    const position = { id: positionRow.id, title: positionRow.title };
    const { rows } = await this.q<any>(
      `select
        s.id::text as state_id,
        s.candidate_id::text,
        s.position_id::text,
        s.current_stage_id::text,
        s.status,
        s.updated_at::text,
        c.id::text as cand_id,
        c.company_id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.notes,
        c.created_at::text as created_at
      from public.recruit_candidate_stage_state s
      join public.recruit_candidates c on c.id = s.candidate_id
      where s.position_id = $1
      order by s.updated_at desc`,
      [positionId]
    );
    const items = rows.map((r) => ({
      state: {
        id: r.state_id,
        candidate_id: r.candidate_id,
        position_id: r.position_id,
        current_stage_id: r.current_stage_id,
        status: r.status,
        updated_at: r.updated_at
      } as RecruitCandidateStageStateRow,
      candidate: {
        id: r.cand_id,
        company_id: r.company_id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        notes: r.notes,
        created_at: r.created_at
      } as RecruitCandidateRow
    }));
    return { position, stages, items };
  }

  async moveCandidateToStage(input: { stateId: string; nextStageId: string; actorUserId: string }): Promise<RecruitCandidateStageStateRow> {
    const { rows } = await this.q<RecruitCandidateStageStateRow>(
      `update public.recruit_candidate_stage_state
       set current_stage_id = $2, updated_at = now(), updated_by_user_id = $3
       where id = $1
       returning id::text, candidate_id::text, position_id::text, current_stage_id::text, status, updated_at::text`,
      [input.stateId, input.nextStageId, input.actorUserId]
    );
    if (!rows[0]) throw new Error("Stato candidato non trovato");
    return rows[0] as RecruitCandidateStageStateRow;
  }

  async setCandidateDecision(input: { stateId: string; status: "passed" | "failed" | "in_progress"; actorUserId: string }): Promise<RecruitCandidateStageStateRow> {
    const { rows } = await this.q<RecruitCandidateStageStateRow>(
      `update public.recruit_candidate_stage_state
       set status = $2, updated_at = now(), updated_by_user_id = $3
       where id = $1
       returning id::text, candidate_id::text, position_id::text, current_stage_id::text, status, updated_at::text`,
      [input.stateId, input.status, input.actorUserId]
    );
    if (!rows[0]) throw new Error("Stato candidato non trovato");
    return rows[0] as RecruitCandidateStageStateRow;
  }
}

