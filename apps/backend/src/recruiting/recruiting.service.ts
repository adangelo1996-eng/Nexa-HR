import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";

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
  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private toIso(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return new Date(v as string | number | Date).toISOString();
  }

  async listPositions(companyId: string): Promise<RecruitPositionRow[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_positions")
      .select("id, company_id, title, job_description, status, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      throw new InternalServerErrorException(`Recruiting list positions: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: String(r.id),
      company_id: r.company_id as string,
      title: r.title as string,
      job_description: r.job_description as string,
      status: r.status as RecruitPositionRow["status"],
      created_at: this.toIso(r.created_at)
    }));
  }

  async createPosition(input: {
    companyId: string;
    title: string;
    jobDescription: string;
    createdByUserId: string;
  }): Promise<RecruitPositionRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_positions")
      .insert({
        company_id: input.companyId,
        title: input.title,
        job_description: input.jobDescription,
        status: "open",
        created_by_user_id: input.createdByUserId
      })
      .select("id, company_id, title, job_description, status, created_at")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione posizione: ${error?.message ?? "nessun dato"}`);
    }
    return {
      id: String(data.id),
      company_id: data.company_id as string,
      title: data.title as string,
      job_description: data.job_description as string,
      status: data.status as RecruitPositionRow["status"],
      created_at: this.toIso(data.created_at)
    };
  }

  async ensureDefaultPipelineForPosition(positionId: string): Promise<{ pipelineId: string; stages: RecruitPipelineStageRow[] }> {
    const sb = this.sb();
    const { error: insErr } = await sb.from("recruit_pipelines").insert({
      position_id: positionId,
      name: "Pipeline"
    });
    if (insErr && insErr.code !== "23505") {
      throw new InternalServerErrorException(`Pipeline insert: ${insErr.message}`);
    }
    const { data: pl, error: plErr } = await sb
      .from("recruit_pipelines")
      .select("id")
      .eq("position_id", positionId)
      .maybeSingle();
    if (plErr || !pl?.id) {
      throw new InternalServerErrorException(plErr?.message ?? "Pipeline non disponibile");
    }
    const pipelineId = String(pl.id);
    const { data: existing, error: stErr } = await sb
      .from("recruit_pipeline_stages")
      .select("id, pipeline_id, stage_order, name, stage_kind")
      .eq("pipeline_id", pipelineId)
      .order("stage_order", { ascending: true });
    if (stErr) {
      throw new InternalServerErrorException(`Lettura fasi: ${stErr.message}`);
    }
    if (!existing?.length) {
      const { error: seedErr } = await sb.from("recruit_pipeline_stages").insert([
        { pipeline_id: pipelineId, stage_order: 10, name: "Nuovo", stage_kind: "screening" },
        { pipeline_id: pipelineId, stage_order: 20, name: "Screening", stage_kind: "screening" },
        { pipeline_id: pipelineId, stage_order: 30, name: "Colloquio 1", stage_kind: "interview" },
        { pipeline_id: pipelineId, stage_order: 40, name: "Colloquio 2", stage_kind: "interview" },
        { pipeline_id: pipelineId, stage_order: 50, name: "Offerta", stage_kind: "offer" },
        { pipeline_id: pipelineId, stage_order: 60, name: "Assunto", stage_kind: "hired" },
        { pipeline_id: pipelineId, stage_order: 70, name: "Scartato", stage_kind: "rejected" }
      ]);
      if (seedErr) {
        throw new InternalServerErrorException(`Seed fasi: ${seedErr.message}`);
      }
    }
    const { data: st2, error: st2Err } = await sb
      .from("recruit_pipeline_stages")
      .select("id, pipeline_id, stage_order, name, stage_kind")
      .eq("pipeline_id", pipelineId)
      .order("stage_order", { ascending: true });
    if (st2Err) {
      throw new InternalServerErrorException(st2Err.message);
    }
    return {
      pipelineId,
      stages: (st2 ?? []).map((s) => ({
        id: String(s.id),
        pipeline_id: String(s.pipeline_id),
        stage_order: s.stage_order as number,
        name: s.name as string,
        stage_kind: s.stage_kind as string
      }))
    };
  }

  async listCandidates(companyId: string): Promise<RecruitCandidateRow[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidates")
      .select("id, company_id, first_name, last_name, email, phone, notes, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      throw new InternalServerErrorException(`Lista candidati: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: String(r.id),
      company_id: r.company_id as string,
      first_name: r.first_name as string,
      last_name: r.last_name as string,
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      notes: r.notes as string,
      created_at: this.toIso(r.created_at)
    }));
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
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidates")
      .insert({
        company_id: input.companyId,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? "",
        created_by_user_id: input.createdByUserId
      })
      .select("id, company_id, first_name, last_name, email, phone, notes, created_at")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione candidato: ${error?.message ?? "nessun dato"}`);
    }
    return {
      id: String(data.id),
      company_id: data.company_id as string,
      first_name: data.first_name as string,
      last_name: data.last_name as string,
      email: (data.email as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      notes: data.notes as string,
      created_at: this.toIso(data.created_at)
    };
  }

  async getCandidate(candidateId: string): Promise<RecruitCandidateRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidates")
      .select("id, company_id, first_name, last_name, email, phone, notes, created_at")
      .eq("id", candidateId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Candidato non trovato");
    }
    return {
      id: String(data.id),
      company_id: data.company_id as string,
      first_name: data.first_name as string,
      last_name: data.last_name as string,
      email: (data.email as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      notes: data.notes as string,
      created_at: this.toIso(data.created_at)
    };
  }

  async listCandidateStates(candidateId: string): Promise<RecruitCandidatePositionStateSummary[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidate_stage_state")
      .select(
        "id, position_id, current_stage_id, status, updated_at, recruit_positions ( title )"
      )
      .eq("candidate_id", candidateId)
      .order("updated_at", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(`Stati candidato: ${error.message}`);
    }
    return (data ?? []).map((row: Record<string, unknown>) => {
      const pos = row.recruit_positions as { title?: string } | null | undefined;
      return {
        state_id: String(row.id),
        position_id: String(row.position_id),
        position_title: pos?.title ?? "",
        current_stage_id: String(row.current_stage_id),
        status: row.status as RecruitCandidatePositionStateSummary["status"],
        updated_at: this.toIso(row.updated_at)
      };
    });
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
      throw new InternalServerErrorException("Pipeline senza fasi");
    }
    const sb = this.sb();
    const row = {
      candidate_id: input.candidateId,
      position_id: input.positionId,
      current_stage_id: firstStage.id,
      status: "in_progress" as const,
      updated_by_user_id: input.actorUserId
    };
    const { data, error } = await sb
      .from("recruit_candidate_stage_state")
      .upsert(row, { onConflict: "candidate_id,position_id" })
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Attach candidato: ${error?.message ?? "nessun dato"}`);
    }
    return {
      id: String(data.id),
      candidate_id: String(data.candidate_id),
      position_id: String(data.position_id),
      current_stage_id: String(data.current_stage_id),
      status: data.status as RecruitCandidateStageStateRow["status"],
      updated_at: this.toIso(data.updated_at)
    };
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
    const sb = this.sb();
    const { data: posRow, error: posErr } = await sb
      .from("recruit_positions")
      .select("id, title")
      .eq("id", positionId)
      .maybeSingle();
    if (posErr || !posRow) {
      throw posErr ? new InternalServerErrorException(posErr.message) : new NotFoundException("Posizione non trovata");
    }
    const position = { id: String(posRow.id), title: posRow.title as string };
    const { data: rows, error } = await sb
      .from("recruit_candidate_stage_state")
      .select(
        "id, candidate_id, position_id, current_stage_id, status, updated_at, recruit_candidates ( id, company_id, first_name, last_name, email, phone, notes, created_at )"
      )
      .eq("position_id", positionId)
      .order("updated_at", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(`Board pipeline: ${error.message}`);
    }
    const items = (rows ?? []).map((r: Record<string, unknown>) => {
      const c = r.recruit_candidates as Record<string, unknown> | null | undefined;
      if (!c) {
        throw new InternalServerErrorException("Board: candidato mancante nella join");
      }
      return {
        state: {
          id: String(r.id),
          candidate_id: String(r.candidate_id),
          position_id: String(r.position_id),
          current_stage_id: String(r.current_stage_id),
          status: r.status as RecruitCandidateStageStateRow["status"],
          updated_at: this.toIso(r.updated_at)
        } as RecruitCandidateStageStateRow,
        candidate: {
          id: String(c.id),
          company_id: c.company_id as string,
          first_name: c.first_name as string,
          last_name: c.last_name as string,
          email: (c.email as string | null) ?? null,
          phone: (c.phone as string | null) ?? null,
          notes: c.notes as string,
          created_at: this.toIso(c.created_at)
        } as RecruitCandidateRow
      };
    });
    return { position, stages, items };
  }

  async moveCandidateToStage(input: { stateId: string; nextStageId: string; actorUserId: string }): Promise<RecruitCandidateStageStateRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidate_stage_state")
      .update({
        current_stage_id: input.nextStageId,
        updated_by_user_id: input.actorUserId
      })
      .eq("id", input.stateId)
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Stato candidato non trovato");
    }
    return {
      id: String(data.id),
      candidate_id: String(data.candidate_id),
      position_id: String(data.position_id),
      current_stage_id: String(data.current_stage_id),
      status: data.status as RecruitCandidateStageStateRow["status"],
      updated_at: this.toIso(data.updated_at)
    };
  }

  async setCandidateDecision(input: {
    stateId: string;
    status: "passed" | "failed" | "in_progress";
    actorUserId: string;
  }): Promise<RecruitCandidateStageStateRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidate_stage_state")
      .update({
        status: input.status,
        updated_by_user_id: input.actorUserId
      })
      .eq("id", input.stateId)
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Stato candidato non trovato");
    }
    return {
      id: String(data.id),
      candidate_id: String(data.candidate_id),
      position_id: String(data.position_id),
      current_stage_id: String(data.current_stage_id),
      status: data.status as RecruitCandidateStageStateRow["status"],
      updated_at: this.toIso(data.updated_at)
    };
  }
}
