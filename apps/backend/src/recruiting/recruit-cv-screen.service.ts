import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { HrDataStore } from "../platform/hr-data.store";
import { mergeCvTextSources, normalizeCvText } from "./recruit-cv-text.util";

const SCHEMA = "ai_recruit_cv_screen_v1";

export interface CvScreeningSummary {
  matches: string[];
  mismatches: string[];
  summary: string;
}

export interface CvScreeningResult {
  stateId: string;
  candidateId: string;
  positionId: string;
  candidateCvScreeningScore: number;
  screeningSummary: CvScreeningSummary;
  screenedAt: string;
  llm: { active: boolean; refineApplied: boolean };
}

@Injectable()
export class RecruitCvScreenService {
  constructor(
    private readonly store: HrDataStore,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly audit: AiAuditService
  ) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  async screenCandidateCv(
    auth: AuthContext,
    input: { candidateId: string; positionId?: string; cvText?: string }
  ): Promise<CvScreeningResult> {
    const companyId = auth.tenantId ?? "comp-1";
    const positionId = await this.resolvePositionId(companyId, input.candidateId, input.positionId);
    const state = await this.loadStageState(companyId, input.candidateId, positionId);
    const position = await this.loadPosition(companyId, positionId);
    const cvText = await this.resolveCvText(input.candidateId, input.cvText);
    if (!cvText.trim()) {
      throw new BadRequestException(
        "CV non disponibile: carica un PDF o inserisci testo nelle note / parametro cvText."
      );
    }
    if (!this.openAi.isActive()) {
      throw new ServiceUnavailableException("Screening AI non disponibile: configurare OPENAI_API_KEY.");
    }

    const requiredSkills = await this.loadPositionSkills(companyId, positionId);
    const sessionId = (await this.gateway.beginSession(companyId, auth.userId)).sessionId;
    let refineApplied = false;

    const facts = {
      roleTitle: position.title,
      jobDescription: normalizeCvText(position.job_description).slice(0, 6000),
      requiredSkills,
      cvExcerpt: cvText,
      disclaimer:
        "Valutazione preliminare a supporto HR: non sostituisce colloquio né decisione umana. Non usare come unico criterio di selezione."
    };
    const seed =
      "Confronta il CV (cvExcerpt) con jobDescription e requiredSkills. " +
      "Assegna score 0-100 (100 = fit eccellente). " +
      "matches: bullet brevi su allineamenti concreti; mismatches: gap o rischi; summary: 2-3 frasi operative per HR.";

    const wrapped = { envelope: { seed, facts } };

    try {
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA);
      if (!refined.ok) {
        throw new ServiceUnavailableException(`Screening AI non riuscito (${refined.failure}).`);
      }
      refineApplied = true;
      const cleared = await this.gateway.fromModelResponse(sessionId, refined.data);
      const env = (cleared as { envelope?: Record<string, unknown> })?.envelope ?? {};
      const score = clampScore(env.score);
      const screeningSummary = this.parseSummary(env);

      const screenedAt = new Date().toISOString();
      const sb = this.sb();
      const { error: upErr } = await sb
        .from("recruit_candidate_stage_state")
        .update({
          candidate_cv_screening_score: score,
          screening_summary: screeningSummary,
          screened_at: screenedAt,
          updated_by_user_id: auth.userId
        })
        .eq("id", state.id);
      if (upErr) {
        throw new InternalServerErrorException(upErr.message);
      }

      await this.audit.append({
        companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "recruit_cv_screen",
        schemaVersion: SCHEMA,
        sessionId,
        inputForFingerprint: {
          candidateId: input.candidateId,
          positionId,
          cvLength: cvText.length
        },
        dataSources: ["recruit_candidates", "recruit_positions", "recruit_candidate_documents"],
        responseSizeBytes: Buffer.byteLength(JSON.stringify(screeningSummary), "utf8"),
        outcome: "ok"
      });

      return {
        stateId: state.id,
        candidateId: input.candidateId,
        positionId,
        candidateCvScreeningScore: score,
        screeningSummary,
        screenedAt,
        llm: { active: true, refineApplied }
      };
    } finally {
      await this.gateway.endSession(sessionId).catch(() => undefined);
    }
  }

  async screenCandidateCvBatch(
    auth: AuthContext,
    input: { positionId: string; candidateIds: string[] }
  ): Promise<{ items: CvScreeningResult[]; errors: Array<{ candidateId: string; message: string }> }> {
    const items: CvScreeningResult[] = [];
    const errors: Array<{ candidateId: string; message: string }> = [];
    for (const candidateId of input.candidateIds.slice(0, 50)) {
      try {
        const result = await this.screenCandidateCv(auth, {
          candidateId,
          positionId: input.positionId
        });
        items.push(result);
      } catch (e) {
        errors.push({
          candidateId,
          message: e instanceof Error ? e.message : "Errore screening"
        });
      }
    }
    return { items, errors };
  }

  private async resolvePositionId(
    companyId: string,
    candidateId: string,
    positionId?: string
  ): Promise<string> {
    if (positionId?.trim()) {
      return positionId.trim();
    }
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidate_stage_state")
      .select("position_id, recruit_positions ( company_id )")
      .eq("candidate_id", candidateId)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    const rows = (data ?? []).filter((r) => {
      const pos = r.recruit_positions as { company_id?: string } | null;
      return pos?.company_id === companyId;
    });
    if (rows.length === 1) {
      return String(rows[0]!.position_id);
    }
    if (rows.length === 0) {
      throw new BadRequestException("Candidato non associato a posizioni: specificare positionId.");
    }
    throw new BadRequestException("Più posizioni attive: specificare positionId nel body.");
  }

  private async loadStageState(companyId: string, candidateId: string, positionId: string) {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_candidate_stage_state")
      .select("id, candidate_id, position_id, recruit_positions ( company_id )")
      .eq("candidate_id", candidateId)
      .eq("position_id", positionId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Candidatura non trovata per questa posizione");
    }
    const pos = data.recruit_positions as { company_id?: string } | null;
    if (!pos || pos.company_id !== companyId) {
      throw new NotFoundException("Candidatura non trovata");
    }
    return { id: String(data.id) };
  }

  private async loadPosition(companyId: string, positionId: string) {
    const sb = this.sb();
    const { data, error } = await sb
      .from("recruit_positions")
      .select("id, title, job_description")
      .eq("id", positionId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Posizione non trovata");
    }
    return {
      title: String(data.title ?? ""),
      job_description: String(data.job_description ?? "")
    };
  }

  private async resolveCvText(candidateId: string, override?: string): Promise<string> {
    if (override?.trim()) {
      return normalizeCvText(override);
    }
    const sb = this.sb();
    const { data: cand, error: candErr } = await sb
      .from("recruit_candidates")
      .select("notes")
      .eq("id", candidateId)
      .maybeSingle();
    if (candErr) {
      throw new InternalServerErrorException(candErr.message);
    }
    const { data: docs, error: docErr } = await sb
      .from("recruit_candidate_documents")
      .select("kind, label, extracted_text")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    if (docErr) {
      throw new InternalServerErrorException(docErr.message);
    }
    const cvDocs = (docs ?? []).filter((d) => d.kind === "cv");
    const extracted = cvDocs.map((d) => (d.extracted_text as string | null) ?? "").filter(Boolean);
    const labels =
      extracted.length === 0
        ? cvDocs.map((d) => `[Allegato CV: ${String(d.label ?? "CV")} — testo non estratto, ricaricare PDF]`)
        : [];
    return mergeCvTextSources([
      ...extracted,
      ...labels,
      cand?.notes ? String(cand.notes) : null
    ]);
  }

  private async loadPositionSkills(
    companyId: string,
    positionId: string
  ): Promise<Array<{ name: string; minLevel: number }>> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_position_skill_demand")
      .select("min_level, hr_skills ( name )")
      .eq("company_id", companyId)
      .eq("position_id", positionId);
    if (error) {
      return [];
    }
    return (data ?? [])
      .map((row) => {
        const skill = row.hr_skills as { name?: string } | null;
        return {
          name: String(skill?.name ?? "").trim(),
          minLevel: Number(row.min_level ?? 1)
        };
      })
      .filter((s) => s.name.length > 0);
  }

  private parseSummary(env: Record<string, unknown>): CvScreeningSummary {
    const matches = Array.isArray(env.matches)
      ? env.matches.map((m) => String(m).trim()).filter(Boolean).slice(0, 8)
      : [];
    const mismatches = Array.isArray(env.mismatches)
      ? env.mismatches.map((m) => String(m).trim()).filter(Boolean).slice(0, 8)
      : [];
    const summary = typeof env.summary === "string" ? env.summary.trim() : "";
    return { matches, mismatches, summary };
  }
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
