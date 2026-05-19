import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";

export interface RecruitPositionRow {
  id: string;
  company_id: string;
  title: string;
  job_description: string;
  status: "open" | "closed";
  created_at: string;
  job_code: string;
  due_date: string | null;
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
  privacy_notice_version: string | null;
  consent_recorded_at: string | null;
}

export interface RecruitCandidateDocumentRow {
  id: string;
  candidate_id: string;
  kind: "cv" | "other";
  label: string;
  created_at: string;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
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

const RECRUIT_DOC_MAX_BYTES = 15 * 1024 * 1024;
const RECRUIT_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg"
]);

/** Solo colonne da `040_recruiting_core.sql`. Dopo `049` sul DB, si possono riaggiungere privacy_notice_version e consent_recorded_at in select/insert. */
const RECRUIT_CANDIDATE_DB_COLS =
  "id, company_id, first_name, last_name, email, phone, notes, created_at";

/** Solo colonne da `040` per `recruit_candidate_documents` (storage/mime/size in `048`). */
const RECRUIT_CANDIDATE_DOC_DB_COLS =
  "id, candidate_id, kind, employee_document_id, label, created_at";

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

  private mapCandidateRow(r: Record<string, unknown>): RecruitCandidateRow {
    return {
      id: String(r.id),
      company_id: r.company_id as string,
      first_name: r.first_name as string,
      last_name: r.last_name as string,
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      notes: (r.notes as string) ?? "",
      created_at: this.toIso(r.created_at),
      privacy_notice_version: (r.privacy_notice_version as string | null | undefined) ?? null,
      consent_recorded_at: r.consent_recorded_at != null ? this.toIso(r.consent_recorded_at) : null
    };
  }

  async assertCandidateInCompany(candidateId: string, companyId: string): Promise<RecruitCandidateRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidates")
      .select(RECRUIT_CANDIDATE_DB_COLS)
      .eq("id", candidateId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Candidato non trovato");
    }
    return this.mapCandidateRow(data as Record<string, unknown>);
  }

  async listPositions(companyId: string): Promise<RecruitPositionRow[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_positions")
      .select("id, company_id, title, job_description, status, created_at, job_code, due_date")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      throw new InternalServerErrorException(`Recruiting list positions: ${error.message}`);
    }
    return (data ?? []).map((r) => {
      const rawStatus = String((r as { status?: string }).status ?? "open").trim().toLowerCase();
      const status: RecruitPositionRow["status"] = rawStatus === "closed" ? "closed" : "open";
      return {
        id: String(r.id),
        company_id: r.company_id as string,
        title: r.title as string,
        job_description: r.job_description as string,
        status,
        created_at: this.toIso(r.created_at),
        job_code: String((r as { job_code?: string }).job_code ?? ""),
        due_date: (r as { due_date?: string | null }).due_date != null ? String((r as { due_date?: string }).due_date) : null
      };
    });
  }

  private formatJobCode(year: number, n: number): string {
    const seq = String(Math.max(1, Math.floor(n))).padStart(3, "0");
    return `HR-${year}-${seq}`;
  }

  async createPosition(input: {
    companyId: string;
    title: string;
    jobDescription: string;
    createdByUserId: string;
    dueDate?: string | null;
  }): Promise<RecruitPositionRow> {
    const sb = this.sb();
    const year = new Date().getUTCFullYear();
    const { data: nextN, error: seqErr } = await sb.rpc("recruit_next_job_code_number", {
      p_company_id: input.companyId,
      p_year: year
    });
    if (seqErr) {
      throw new InternalServerErrorException(`Job code progressivo: ${seqErr.message}`);
    }
    const jobCode = this.formatJobCode(year, Number(nextN ?? 1));
    const { data, error } = await sb
      .from("recruit_positions")
      .insert({
        company_id: input.companyId,
        title: input.title,
        job_description: input.jobDescription,
        status: "open",
        created_by_user_id: input.createdByUserId,
        job_code: jobCode,
        due_date: input.dueDate ?? null
      })
      .select("id, company_id, title, job_description, status, created_at, job_code, due_date")
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
      created_at: this.toIso(data.created_at),
      job_code: String((data as { job_code?: string }).job_code ?? ""),
      due_date: (data as { due_date?: string | null }).due_date != null ? String((data as { due_date?: string }).due_date) : null
    };
  }

  async deleteOpenPosition(companyId: string, positionId: string): Promise<void> {
    const sb = this.sb();
    const { data: pos, error: posErr } = await sb
      .from("recruit_positions")
      .select("id, company_id, status")
      .eq("id", positionId)
      .maybeSingle();
    if (posErr || !pos) {
      throw new NotFoundException("Posizione non trovata");
    }
    if (String((pos as { company_id?: string }).company_id) !== companyId) {
      throw new NotFoundException("Posizione non trovata");
    }
    if (String((pos as { status?: string }).status) !== "open") {
      throw new ConflictException("La posizione non è aperta");
    }
    const linked = await sb
      .from("recruit_candidate_stage_state")
      .select("id", { count: "exact", head: true })
      .eq("position_id", positionId);
    if (linked.error) {
      throw new InternalServerErrorException(`Verifica candidati: ${linked.error.message}`);
    }
    if ((linked.count ?? 0) > 0) {
      throw new ConflictException("Impossibile eliminare: candidati collegati. Chiudi la posizione.");
    }
    const { error: delErr } = await sb
      .from("recruit_positions")
      .delete()
      .eq("id", positionId)
      .eq("company_id", companyId);
    if (delErr) {
      throw new InternalServerErrorException(`Eliminazione posizione: ${delErr.message}`);
    }
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
        { pipeline_id: pipelineId, stage_order: 58, name: "Onboarding assunzione", stage_kind: "onboarding" },
        { pipeline_id: pipelineId, stage_order: 60, name: "Assunto", stage_kind: "hired" },
        { pipeline_id: pipelineId, stage_order: 70, name: "Respinti", stage_kind: "rejected" }
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
      .select(RECRUIT_CANDIDATE_DB_COLS)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      throw new InternalServerErrorException(`Lista candidati: ${error.message}`);
    }
    return (data ?? []).map((r) => this.mapCandidateRow(r as Record<string, unknown>));
  }

  async createCandidate(input: {
    companyId: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    notes?: string;
    createdByUserId: string;
    privacyNoticeVersion?: string | null;
    consentRecordedAt?: string | null;
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
      .select(RECRUIT_CANDIDATE_DB_COLS)
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione candidato: ${error?.message ?? "nessun dato"}`);
    }
    return this.mapCandidateRow(data as Record<string, unknown>);
  }

  async getCandidate(candidateId: string): Promise<RecruitCandidateRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidates")
      .select(RECRUIT_CANDIDATE_DB_COLS)
      .eq("id", candidateId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Candidato non trovato");
    }
    return this.mapCandidateRow(data as Record<string, unknown>);
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
      can_undo_last_move: boolean;
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
        `id, candidate_id, position_id, current_stage_id, status, updated_at, recruit_candidates ( ${RECRUIT_CANDIDATE_DB_COLS} )`
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
        candidate: this.mapCandidateRow(c)
      };
    });
    const undoMap = await this.buildUndoFlagsForBoard(items);
    return {
      position,
      stages,
      items: items.map((it) => ({
        ...it,
        can_undo_last_move: undoMap.get(it.state.id) ?? false
      }))
    };
  }

  private async buildUndoFlagsForBoard(
    items: Array<{ state: RecruitCandidateStageStateRow }>
  ): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    const ids = items.map((i) => i.state.id);
    for (const it of items) {
      map.set(it.state.id, false);
    }
    if (ids.length === 0) {
      return map;
    }
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_stage_transition_log")
      .select("state_id, to_stage_id, created_at")
      .in("state_id", ids)
      .is("reverted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(`Audit pipeline: ${error.message}`);
    }
    const latestTo = new Map<string, string>();
    for (const row of data ?? []) {
      const sid = String((row as { state_id?: string }).state_id);
      if (!latestTo.has(sid)) {
        latestTo.set(sid, String((row as { to_stage_id?: string }).to_stage_id));
      }
    }
    for (const it of items) {
      const to = latestTo.get(it.state.id);
      map.set(it.state.id, to != null && to === it.state.current_stage_id);
    }
    return map;
  }

  async moveCandidateToStage(input: { stateId: string; nextStageId: string; actorUserId: string }): Promise<RecruitCandidateStageStateRow> {
    const sb = this.sb();
    const { data: before, error: e0 } = await sb
      .from("recruit_candidate_stage_state")
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .eq("id", input.stateId)
      .maybeSingle();
    if (e0) {
      throw new InternalServerErrorException(e0.message);
    }
    if (!before) {
      throw new NotFoundException("Stato candidato non trovato");
    }
    const fromStage = String(before.current_stage_id);
    if (fromStage === input.nextStageId) {
      return {
        id: String(before.id),
        candidate_id: String(before.candidate_id),
        position_id: String(before.position_id),
        current_stage_id: fromStage,
        status: before.status as RecruitCandidateStageStateRow["status"],
        updated_at: this.toIso(before.updated_at)
      };
    }
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
    const { error: logErr } = await sb.from("recruit_stage_transition_log").insert({
      state_id: input.stateId,
      from_stage_id: fromStage,
      to_stage_id: input.nextStageId,
      actor_user_id: input.actorUserId
    });
    if (logErr) {
      throw new InternalServerErrorException(`Audit fase: ${logErr.message}`);
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
    const { data: before, error: e0 } = await sb
      .from("recruit_candidate_stage_state")
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .eq("id", input.stateId)
      .maybeSingle();
    if (e0) {
      throw new InternalServerErrorException(e0.message);
    }
    if (!before) {
      throw new NotFoundException("Stato candidato non trovato");
    }

    let nextStageId: string | null = null;
    if (input.status === "passed") {
      const { stages } = await this.ensureDefaultPipelineForPosition(String(before.position_id));
      const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
      const idx = sorted.findIndex((s) => s.id === String(before.current_stage_id));
      if (idx >= 0) {
        for (let j = idx + 1; j < sorted.length; j++) {
          if (sorted[j].stage_kind !== "rejected") {
            nextStageId = sorted[j].id;
            break;
          }
        }
      }
    } else if (input.status === "failed") {
      const { stages } = await this.ensureDefaultPipelineForPosition(String(before.position_id));
      const rejected = [...stages].find((s) => s.stage_kind === "rejected");
      if (rejected) {
        nextStageId = rejected.id;
      }
    }

    const patch: Record<string, unknown> = {
      status: input.status,
      updated_by_user_id: input.actorUserId
    };
    if (nextStageId) {
      patch.current_stage_id = nextStageId;
    }

    const { data, error } = await sb
      .from("recruit_candidate_stage_state")
      .update(patch)
      .eq("id", input.stateId)
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Stato candidato non trovato");
    }
    if (nextStageId) {
      const { error: logErr } = await sb.from("recruit_stage_transition_log").insert({
        state_id: input.stateId,
        from_stage_id: String(before.current_stage_id),
        to_stage_id: nextStageId,
        actor_user_id: input.actorUserId
      });
      if (logErr) {
        throw new InternalServerErrorException(`Audit fase: ${logErr.message}`);
      }
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

  async undoLastStageMove(input: { stateId: string; actorUserId: string }): Promise<RecruitCandidateStageStateRow> {
    const sb = this.sb();
    const { data: stateRow, error: e0 } = await sb
      .from("recruit_candidate_stage_state")
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .eq("id", input.stateId)
      .maybeSingle();
    if (e0) {
      throw new InternalServerErrorException(e0.message);
    }
    if (!stateRow) {
      throw new NotFoundException("Stato candidato non trovato");
    }
    const { data: logs, error: e1 } = await sb
      .from("recruit_stage_transition_log")
      .select("id, from_stage_id, to_stage_id, created_at")
      .eq("state_id", input.stateId)
      .is("reverted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (e1) {
      throw new InternalServerErrorException(e1.message);
    }
    const log = logs?.[0];
    if (!log || String(log.to_stage_id) !== String(stateRow.current_stage_id)) {
      throw new ConflictException("Nessuno spostamento da annullare");
    }
    const { data: updated, error: upErr } = await sb
      .from("recruit_candidate_stage_state")
      .update({
        current_stage_id: String(log.from_stage_id),
        updated_by_user_id: input.actorUserId
      })
      .eq("id", input.stateId)
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .maybeSingle();
    if (upErr) {
      throw new InternalServerErrorException(upErr.message);
    }
    if (!updated) {
      throw new NotFoundException("Stato candidato non trovato");
    }
    const { error: revErr } = await sb
      .from("recruit_stage_transition_log")
      .update({ reverted_at: new Date().toISOString() })
      .eq("id", log.id);
    if (revErr) {
      throw new InternalServerErrorException(revErr.message);
    }
    return {
      id: String(updated.id),
      candidate_id: String(updated.candidate_id),
      position_id: String(updated.position_id),
      current_stage_id: String(updated.current_stage_id),
      status: updated.status as RecruitCandidateStageStateRow["status"],
      updated_at: this.toIso(updated.updated_at)
    };
  }

  async listCandidateDocuments(companyId: string, candidateId: string): Promise<RecruitCandidateDocumentRow[]> {
    await this.assertCandidateInCompany(candidateId, companyId);
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidate_documents")
      .select(RECRUIT_CANDIDATE_DOC_DB_COLS)
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(`Lista documenti: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: String(r.id),
      candidate_id: String(r.candidate_id),
      kind: r.kind as "cv" | "other",
      label: String(r.label ?? ""),
      created_at: this.toIso(r.created_at),
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      byte_size: null
    }));
  }

  async uploadCandidateDocument(input: {
    companyId: string;
    candidateId: string;
    actorUserId: string;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    kind: "cv" | "other";
    label?: string;
  }): Promise<RecruitCandidateDocumentRow> {
    await this.assertCandidateInCompany(input.candidateId, input.companyId);
    const mime = (input.mimeType || "application/octet-stream").split(";")[0]?.trim() ?? "application/octet-stream";
    if (!RECRUIT_ALLOWED_MIME.has(mime)) {
      throw new BadRequestException("Tipo file non consentito");
    }
    if (input.buffer.length > RECRUIT_DOC_MAX_BYTES) {
      throw new BadRequestException("File troppo grande (max 15 MB)");
    }
    const sb = this.sb();
    /** Schema `040` senza colonne storage: solo metadati riga; upload binario su Storage richiede migrazione `048`. */
    const { data, error } = await sb
      .from("recruit_candidate_documents")
      .insert({
        candidate_id: input.candidateId,
        kind: input.kind,
        label: input.label?.trim() ? input.label.trim() : input.kind === "cv" ? "CV" : "Allegato"
      })
      .select(RECRUIT_CANDIDATE_DOC_DB_COLS)
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Metadati documento: ${error?.message ?? "nessun dato"}`);
    }
    return {
      id: String(data.id),
      candidate_id: String(data.candidate_id),
      kind: data.kind as "cv" | "other",
      label: String(data.label ?? ""),
      created_at: this.toIso(data.created_at),
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      byte_size: null
    };
  }

  async deleteCandidateDocument(companyId: string, documentId: string): Promise<void> {
    const sb = this.sb();
    const { data: doc, error } = await sb
      .from("recruit_candidate_documents")
      .select("id, candidate_id, recruit_candidates ( company_id )")
      .eq("id", documentId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!doc) {
      throw new NotFoundException("Documento non trovato");
    }
    const nest = doc.recruit_candidates as { company_id?: string } | null;
    if (!nest || nest.company_id !== companyId) {
      throw new NotFoundException("Documento non trovato");
    }
    const { error: delErr } = await sb.from("recruit_candidate_documents").delete().eq("id", documentId);
    if (delErr) {
      throw new InternalServerErrorException(delErr.message);
    }
  }

  async getCandidateDocumentFile(
    companyId: string,
    documentId: string
  ): Promise<{ buffer: Buffer; mimeType: string; downloadName: string }> {
    const sb = this.sb();
    const { data: doc, error } = await sb
      .from("recruit_candidate_documents")
      .select("id, label, recruit_candidates ( company_id )")
      .eq("id", documentId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!doc) {
      throw new NotFoundException("Documento non trovato");
    }
    const nest = doc.recruit_candidates as { company_id?: string } | null;
    if (!nest || nest.company_id !== companyId) {
      throw new NotFoundException("Documento non trovato");
    }
    /** Con schema `040` senza `048` non ci sono path Storage su DB; dopo `048` si può ripristinare download da bucket. */
    throw new NotFoundException("File non disponibile");
  }

  async deleteCandidate(companyId: string, candidateId: string): Promise<void> {
    await this.assertCandidateInCompany(candidateId, companyId);
    const sb = this.sb();
    const { error: delContracts } = await sb
      .from("hr_standard_contracts")
      .delete()
      .eq("recruit_candidate_id", candidateId)
      .eq("company_id", companyId);
    if (delContracts) {
      throw new InternalServerErrorException(`Eliminazione contratti collegati: ${delContracts.message}`);
    }
    const { error } = await sb.from("recruit_candidates").delete().eq("id", candidateId).eq("company_id", companyId);
    if (error) {
      throw new InternalServerErrorException(`Eliminazione candidato: ${error.message}`);
    }
  }

  async exportCandidateJson(companyId: string, candidateId: string): Promise<Record<string, unknown>> {
    const candidate = await this.assertCandidateInCompany(candidateId, companyId);
    const states = await this.listCandidateStates(candidateId);
    const documents = await this.listCandidateDocuments(companyId, candidateId);
    return {
      exportedAt: new Date().toISOString(),
      candidate,
      pipelineStates: states,
      documents: documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        created_at: d.created_at,
        mime_type: d.mime_type,
        byte_size: d.byte_size
      }))
    };
  }

  /** Candidati nella fase pipeline «Onboarding assunzione» (tutte le posizioni azienda). */
  async listOnboardingCandidatesForCompany(companyId: string): Promise<
    Array<{
      state_id: string;
      position_id: string;
      position_title: string;
      candidate: RecruitCandidateRow;
      status: string;
      updated_at: string;
    }>
  > {
    const sb = this.sb();
    const { data: positions, error: pe } = await sb
      .from("recruit_positions")
      .select("id, title")
      .eq("company_id", companyId);
    if (pe) {
      throw new InternalServerErrorException(pe.message);
    }
    const posList = (positions ?? []) as { id: string; title: string }[];
    if (!posList.length) {
      return [];
    }
    const positionIds = posList.map((p) => p.id);
    const titleByPos = new Map(posList.map((p) => [p.id, p.title ?? ""]));
    const { data: pipes, error: pipeErr } = await sb
      .from("recruit_pipelines")
      .select("id, position_id")
      .in("position_id", positionIds);
    if (pipeErr) {
      throw new InternalServerErrorException(pipeErr.message);
    }
    const pipelineIds = ((pipes ?? []) as { id: string; position_id: string }[]).map((p) => p.id);
    if (!pipelineIds.length) {
      return [];
    }
    const { data: stages, error: stErr } = await sb
      .from("recruit_pipeline_stages")
      .select("id, pipeline_id, stage_kind, name")
      .in("pipeline_id", pipelineIds);
    if (stErr) {
      throw new InternalServerErrorException(stErr.message);
    }
    const onboardStageIds = ((stages ?? []) as { id: string; stage_kind: string; name: string }[])
      .filter(
        (s) =>
          s.stage_kind === "onboarding" ||
          (s.stage_kind === "custom" && String(s.name ?? "").toLowerCase().includes("onboarding"))
      )
      .map((s) => s.id);
    if (!onboardStageIds.length) {
      return [];
    }
    const { data: states, error: sErr } = await sb
      .from("recruit_candidate_stage_state")
      .select("id, candidate_id, position_id, current_stage_id, status, updated_at")
      .in("current_stage_id", onboardStageIds);
    if (sErr) {
      throw new InternalServerErrorException(sErr.message);
    }
    const out: Array<{
      state_id: string;
      position_id: string;
      position_title: string;
      candidate: RecruitCandidateRow;
      status: string;
      updated_at: string;
    }> = [];
    for (const st of (states ?? []) as RecruitCandidateStageStateRow[]) {
      const { data: candRow, error: cErr } = await sb
        .from("recruit_candidates")
        .select(RECRUIT_CANDIDATE_DB_COLS)
        .eq("id", String(st.candidate_id))
        .eq("company_id", companyId)
        .is("onboarded_at", null)
        .maybeSingle();
      if (cErr || !candRow) {
        continue;
      }
      const posId = String(st.position_id);
      out.push({
        state_id: String(st.id),
        position_id: posId,
        position_title: titleByPos.get(posId) ?? "",
        candidate: this.mapCandidateRow(candRow as Record<string, unknown>),
        status: String(st.status),
        updated_at: this.toIso(st.updated_at)
      });
    }
    return out;
  }
}
