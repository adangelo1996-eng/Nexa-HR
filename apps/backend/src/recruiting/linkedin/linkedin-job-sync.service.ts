import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { HrDataStore } from "../../platform/hr-data.store";
import { RecruitingService, type RecruitPositionRow } from "../recruiting.service";
import {
  isNormalizedCandidatePayload,
  normalizeCandidateIngestPayload,
  type NormalizedLinkedInCandidateIngest
} from "./linkedin-candidate-ingest.util";
import {
  createLinkedInJobAdapter,
  getLinkedInWebhookDefaultCompanyId,
  isLinkedInAutoPublishEnabled
} from "./linkedin-job-adapter.factory";
import { LinkedInWebhookRateLimiter } from "./linkedin-webhook-rate-limit";
import type {
  LinkedInCandidateIngestResult,
  LinkedInInboundApplicationPayload,
  LinkedInInboundJobPayload,
  LinkedInIntegrationStatus,
  LinkedInIntegrationUiConfig,
  LinkedInSyncStatus
} from "./linkedin.types";

const WEBHOOK_PATH = "/recruiting/integrations/linkedin/webhook";
const DEFAULT_WEBHOOK_RATE = 60;

const POSITION_LINKEDIN_COLS =
  "id, company_id, title, job_description, status, created_at, job_code, due_date, location, source, linkedin_job_id, linkedin_job_url, linkedin_sync_status, linkedin_last_synced_at, linkedin_sync_error";

@Injectable()
export class LinkedInJobSyncService {
  private readonly webhookRateLimiter: LinkedInWebhookRateLimiter;

  constructor(
    private readonly store: HrDataStore,
    private readonly recruiting: RecruitingService
  ) {
    const max = Number(process.env.LINKEDIN_WEBHOOK_RATE_LIMIT_PER_MIN ?? DEFAULT_WEBHOOK_RATE);
    this.webhookRateLimiter = new LinkedInWebhookRateLimiter(
      Number.isFinite(max) && max > 0 ? Math.min(max, 300) : DEFAULT_WEBHOOK_RATE
    );
  }

  consumeWebhookRateLimit(clientKey: string): void {
    this.webhookRateLimiter.consume(clientKey);
  }

  private allowedWebhookCompanyIds(): string[] {
    const raw = process.env.LINKEDIN_WEBHOOK_ALLOWED_COMPANY_IDS?.trim();
    if (!raw) {
      return [];
    }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private assertCompanyAllowed(companyId: string): void {
    const allowlist = this.allowedWebhookCompanyIds();
    if (allowlist.length > 0 && !allowlist.includes(companyId)) {
      throw new ForbiddenException("companyId non autorizzato per il webhook");
    }
  }

  private integrationActorUserId(): string | null {
    const id = process.env.LINKEDIN_INTEGRATION_ACTOR_USER_ID?.trim();
    return id && id.length > 0 ? id : null;
  }

  getUiConfig(companyId: string, publicApiBaseUrl?: string): LinkedInIntegrationUiConfig {
    const base = (publicApiBaseUrl ?? process.env.PUBLIC_API_BASE_URL ?? "https://YOUR_BACKEND_HOST/api")
      .replace(/\/+$/, "");
    const apiBase = base.endsWith("/api") ? base : `${base}/api`;
    const status = this.getIntegrationStatus();
    return {
      ...status,
      provider: "linkedin",
      companyId,
      webhookPath: WEBHOOK_PATH,
      webhookUrl: `${apiBase}${WEBHOOK_PATH}`,
      signatureHeaders: [
        "X-Nexa-Signature",
        "X-Nexa-Webhook-Signature",
        "X-LinkedIn-Signature",
        "X-Hub-Signature-256"
      ],
      signatureFormat: "sha256=<hex(HMAC_SHA256(LINKEDIN_WEBHOOK_SECRET, raw_request_body))>",
      rateLimitPerMinute: Number(process.env.LINKEDIN_WEBHOOK_RATE_LIMIT_PER_MIN ?? DEFAULT_WEBHOOK_RATE),
      defaultCompanyId: getLinkedInWebhookDefaultCompanyId(),
      documentationPath: "docs/integrations/linkedin-recruiting-intake.md"
    };
  }

  getIntegrationStatus(): LinkedInIntegrationStatus {
    const adapter = createLinkedInJobAdapter();
    return {
      configured: adapter.mode === "oauth",
      adapterMode: adapter.mode,
      autoPublishOnCreate: isLinkedInAutoPublishEnabled(),
      organizationUrnSet: Boolean(process.env.LINKEDIN_ORGANIZATION_URN?.trim()),
      webhookSecretSet: Boolean(process.env.LINKEDIN_WEBHOOK_SECRET?.trim())
    };
  }

  mapPositionRow(r: Record<string, unknown>): RecruitPositionRow {
    const rawStatus = String(r.status ?? "open").trim().toLowerCase();
    const status: RecruitPositionRow["status"] = rawStatus === "closed" ? "closed" : "open";
    return {
      id: String(r.id),
      company_id: r.company_id as string,
      title: r.title as string,
      job_description: r.job_description as string,
      status,
      created_at: new Date(r.created_at as string | number | Date).toISOString(),
      job_code: String(r.job_code ?? ""),
      due_date: r.due_date != null ? String(r.due_date) : null,
      location: (r.location as string | null) ?? null,
      source: (r.source as RecruitPositionRow["source"]) ?? "nexa",
      linkedin_job_id: (r.linkedin_job_id as string | null) ?? null,
      linkedin_job_url: (r.linkedin_job_url as string | null) ?? null,
      linkedin_sync_status: (r.linkedin_sync_status as LinkedInSyncStatus) ?? "not_linked",
      linkedin_last_synced_at:
        r.linkedin_last_synced_at != null ? new Date(r.linkedin_last_synced_at as string).toISOString() : null,
      linkedin_sync_error: (r.linkedin_sync_error as string | null) ?? null
    };
  }

  async getPosition(companyId: string, positionId: string): Promise<RecruitPositionRow> {
    const sb = this.store.getServiceRoleClient();
    const { data, error } = await sb
      .from("recruit_positions")
      .select(POSITION_LINKEDIN_COLS)
      .eq("id", positionId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Posizione non trovata");
    }
    return this.mapPositionRow(data as Record<string, unknown>);
  }

  private async setSyncState(
    positionId: string,
    patch: Partial<{
      linkedin_sync_status: LinkedInSyncStatus;
      linkedin_job_id: string | null;
      linkedin_job_url: string | null;
      linkedin_last_synced_at: string | null;
      linkedin_sync_error: string | null;
      source: "nexa" | "linkedin";
    }>
  ): Promise<void> {
    const sb = this.store.getServiceRoleClient();
    const { error } = await sb.from("recruit_positions").update(patch).eq("id", positionId);
    if (error) {
      throw new InternalServerErrorException(`Aggiornamento sync LinkedIn: ${error.message}`);
    }
  }

  async recordIntegrationEvent(input: {
    companyId: string;
    eventType: string;
    externalId?: string | null;
    positionId?: string | null;
    payload: Record<string, unknown>;
    errorMessage?: string | null;
  }): Promise<void> {
    const sb = this.store.getServiceRoleClient();
    const { error } = await sb.from("recruiting_integration_events").insert({
      company_id: input.companyId,
      provider: "linkedin",
      event_type: input.eventType,
      external_id: input.externalId ?? null,
      position_id: input.positionId ?? null,
      payload: input.payload,
      processed_at: input.errorMessage ? null : new Date().toISOString(),
      error_message: input.errorMessage ?? null
    });
    if (error) {
      throw new InternalServerErrorException(`Log evento integrazione: ${error.message}`);
    }
  }

  async publishPositionToLinkedIn(companyId: string, positionId: string): Promise<RecruitPositionRow> {
    const position = await this.getPosition(companyId, positionId);
    if (position.status !== "open") {
      throw new BadRequestException("Solo le posizioni aperte possono essere pubblicate su LinkedIn");
    }
    await this.setSyncState(positionId, {
      linkedin_sync_status: "pending",
      linkedin_sync_error: null
    });
    const adapter = createLinkedInJobAdapter();
    try {
      const published = await adapter.publishJob({
        title: position.title,
        description: position.job_description,
        location: position.location,
        externalReference: position.id
      });
      await this.setSyncState(positionId, {
        linkedin_sync_status: "synced",
        linkedin_job_id: published.linkedinJobId,
        linkedin_job_url: published.linkedinJobUrl,
        linkedin_last_synced_at: new Date().toISOString(),
        linkedin_sync_error: null,
        source: position.source ?? "nexa"
      });
      await this.recordIntegrationEvent({
        companyId,
        eventType: "job.published_to_linkedin",
        externalId: published.linkedinJobId,
        positionId,
        payload: { adapterMode: published.mode, linkedinJobUrl: published.linkedinJobUrl }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore pubblicazione LinkedIn";
      await this.setSyncState(positionId, {
        linkedin_sync_status: "error",
        linkedin_sync_error: msg.slice(0, 500)
      });
      await this.recordIntegrationEvent({
        companyId,
        eventType: "job.publish_failed",
        positionId,
        payload: { positionId },
        errorMessage: msg
      });
      throw new InternalServerErrorException(msg);
    }
    return this.getPosition(companyId, positionId);
  }

  async maybeAutoPublishOnCreate(companyId: string, positionId: string): Promise<void> {
    if (!isLinkedInAutoPublishEnabled()) {
      return;
    }
    try {
      await this.publishPositionToLinkedIn(companyId, positionId);
    } catch {
      /* auto-sync must not block position creation */
    }
  }

  async upsertPositionFromLinkedInJob(payload: LinkedInInboundJobPayload): Promise<RecruitPositionRow> {
    const companyId = payload.company_id?.trim() || getLinkedInWebhookDefaultCompanyId();
    const linkedinJobId = payload.linkedin_job_id?.trim();
    if (!linkedinJobId) {
      throw new BadRequestException("linkedin_job_id obbligatorio");
    }
    if (!payload.title?.trim()) {
      throw new BadRequestException("title obbligatorio");
    }
    const sb = this.store.getServiceRoleClient();
    const { data: existing, error: findErr } = await sb
      .from("recruit_positions")
      .select(POSITION_LINKEDIN_COLS)
      .eq("company_id", companyId)
      .eq("linkedin_job_id", linkedinJobId)
      .maybeSingle();
    if (findErr) {
      throw new InternalServerErrorException(findErr.message);
    }
    const status = payload.status === "closed" ? "closed" : "open";
    const description = (payload.description ?? "").trim() || payload.title.trim();
    const now = new Date().toISOString();
    if (existing) {
      const id = String(existing.id);
      const { error: updErr } = await sb
        .from("recruit_positions")
        .update({
          title: payload.title.trim(),
          job_description: description,
          location: payload.location ?? null,
          status,
          linkedin_job_url: payload.linkedin_job_url ?? (existing as { linkedin_job_url?: string }).linkedin_job_url,
          linkedin_sync_status: "synced",
          linkedin_last_synced_at: now,
          linkedin_sync_error: null,
          source: "linkedin"
        })
        .eq("id", id);
      if (updErr) {
        throw new InternalServerErrorException(updErr.message);
      }
      await this.recruiting.ensureDefaultPipelineForPosition(id);
      return this.getPosition(companyId, id);
    }
    const year = new Date().getUTCFullYear();
    const { data: nextN, error: seqErr } = await sb.rpc("recruit_next_job_code_number", {
      p_company_id: companyId,
      p_year: year
    });
    if (seqErr) {
      throw new InternalServerErrorException(seqErr.message);
    }
    const seq = Number(nextN ?? 1);
    const jobCode = `HR-${year}-${String(Math.max(1, Math.floor(seq))).padStart(3, "0")}`;
    const { data: inserted, error: insErr } = await sb
      .from("recruit_positions")
      .insert({
        company_id: companyId,
        title: payload.title.trim(),
        job_description: description,
        location: payload.location ?? null,
        status,
        source: "linkedin",
        linkedin_job_id: linkedinJobId,
        linkedin_job_url: payload.linkedin_job_url ?? null,
        linkedin_sync_status: "synced",
        linkedin_last_synced_at: now,
        job_code: jobCode
      })
      .select(POSITION_LINKEDIN_COLS)
      .single();
    if (insErr || !inserted) {
      throw new InternalServerErrorException(insErr?.message ?? "Creazione posizione da LinkedIn fallita");
    }
    const positionId = String(inserted.id);
    await this.recruiting.ensureDefaultPipelineForPosition(positionId);
    return this.mapPositionRow(inserted as Record<string, unknown>);
  }

  async ingestApplication(payload: LinkedInInboundApplicationPayload): Promise<LinkedInCandidateIngestResult> {
    const companyId = payload.company_id?.trim() || getLinkedInWebhookDefaultCompanyId();
    this.assertCompanyAllowed(companyId);
    const linkedinJobId = payload.linkedin_job_id?.trim();
    if (!linkedinJobId) {
      throw new BadRequestException("linkedin_job_id obbligatorio");
    }
    const position = await this.upsertPositionFromLinkedInJob({
      event: "job.ensure",
      company_id: companyId,
      linkedin_job_id: linkedinJobId,
      title: `Posizione LinkedIn ${linkedinJobId}`,
      description: ""
    });
    return this.ingestNormalizedCandidate({
      companyId,
      jobId: position.id,
      externalId: payload.linkedin_application_id ?? undefined,
      firstName: (payload.applicant_first_name ?? "Candidato").trim() || "Candidato",
      lastName: (payload.applicant_last_name ?? "LinkedIn").trim() || "LinkedIn",
      email: payload.applicant_email ?? undefined,
      phone: payload.applicant_phone ?? undefined,
      notes: payload.notes?.trim() ? payload.notes.trim() : "Import da LinkedIn (evento application)"
    });
  }

  async ingestNormalizedCandidate(payload: NormalizedLinkedInCandidateIngest): Promise<LinkedInCandidateIngestResult> {
    this.assertCompanyAllowed(payload.companyId);
    await this.recruiting.assertPositionInCompany(payload.jobId, payload.companyId);

    if (payload.externalId) {
      const dup = await this.findDuplicateApplication(payload.companyId, payload.externalId);
      if (dup) {
        return { ...dup, duplicate: true };
      }
    }

    const notesParts: string[] = [];
    if (payload.linkedinUrl) notesParts.push(`LinkedIn: ${payload.linkedinUrl}`);
    if (payload.resumeUrl) notesParts.push(`CV: ${payload.resumeUrl}`);
    if (payload.appliedAt) notesParts.push(`Candidatura: ${payload.appliedAt}`);
    if (payload.notes) notesParts.push(payload.notes);
    const notes = notesParts.join("\n");

    const actorId = this.integrationActorUserId();
    let candidateId: string;
    let createdCandidate = false;

    const existing = payload.email
      ? await this.recruiting.findCandidateByEmail(payload.companyId, payload.email)
      : null;

    if (existing) {
      candidateId = existing.id;
      if (notes) {
        await this.recruiting.appendCandidateNotes(candidateId, notes);
      }
    } else {
      const created = await this.recruiting.createCandidate({
        companyId: payload.companyId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        notes,
        createdByUserId: actorId
      });
      candidateId = created.id;
      createdCandidate = true;
    }

    const state = await this.recruiting.attachCandidateToPosition({
      companyId: payload.companyId,
      candidateId,
      positionId: payload.jobId,
      actorUserId: actorId
    });

    return {
      candidateId,
      positionId: payload.jobId,
      stateId: state.id,
      createdCandidate,
      duplicate: false
    };
  }

  private async findDuplicateApplication(
    companyId: string,
    externalId: string
  ): Promise<LinkedInCandidateIngestResult | null> {
    const sb = this.store.getServiceRoleClient();
    const { data, error } = await sb
      .from("recruiting_integration_events")
      .select("payload, position_id")
      .eq("provider", "linkedin")
      .eq("company_id", companyId)
      .eq("external_id", externalId)
      .eq("event_type", "candidate.apply")
      .is("error_message", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.position_id) {
      return null;
    }
    const pl = data.payload as { candidateId?: string; stateId?: string } | null;
    if (!pl?.candidateId) {
      return null;
    }
    return {
      candidateId: pl.candidateId,
      positionId: String(data.position_id),
      stateId: pl.stateId ?? "",
      createdCandidate: false,
      duplicate: true
    };
  }

  async handleWebhookPayload(body: Record<string, unknown>): Promise<{ ok: true; action: string; positionId?: string; candidateId?: string }> {
    if (isNormalizedCandidatePayload(body)) {
      const normalized = normalizeCandidateIngestPayload({
        ...body,
        companyId:
          body.companyId ??
          body.company_id ??
          getLinkedInWebhookDefaultCompanyId()
      });
      const result = await this.ingestNormalizedCandidate(normalized);
      await this.recordIntegrationEvent({
        companyId: normalized.companyId,
        eventType: "candidate.apply",
        externalId: normalized.externalId ?? null,
        positionId: result.positionId,
        payload: { ...body, candidateId: result.candidateId, stateId: result.stateId, duplicate: result.duplicate }
      });
      return {
        ok: true,
        action: result.duplicate ? "candidate_duplicate" : "candidate_ingested",
        positionId: result.positionId,
        candidateId: result.candidateId
      };
    }

    const event = String(body.event ?? body.type ?? "").trim().toLowerCase();
    const companyId = typeof body.company_id === "string" ? body.company_id : getLinkedInWebhookDefaultCompanyId();
    this.assertCompanyAllowed(companyId);

    if (event === "application.received" || event === "application.created") {
      const result = await this.ingestApplication(body as unknown as LinkedInInboundApplicationPayload);
      await this.recordIntegrationEvent({
        companyId,
        eventType: event,
        externalId: typeof body.linkedin_application_id === "string" ? body.linkedin_application_id : null,
        positionId: result.positionId,
        payload: body
      });
      return {
        ok: true,
        action: "application_ingested",
        positionId: result.positionId,
        candidateId: result.candidateId
      };
    }

    if (
      event === "job.posted" ||
      event === "job.created" ||
      event === "job.updated" ||
      event === "job.publish" ||
      event === "job.published"
    ) {
      const position = await this.upsertPositionFromLinkedInJob(body as unknown as LinkedInInboundJobPayload);
      await this.recordIntegrationEvent({
        companyId,
        eventType: event,
        externalId: position.linkedin_job_id,
        positionId: position.id,
        payload: body
      });
      return { ok: true, action: "job_upserted", positionId: position.id };
    }

    await this.recordIntegrationEvent({
      companyId,
      eventType: event || "unknown",
      externalId: typeof body.linkedin_job_id === "string" ? body.linkedin_job_id : null,
      payload: body,
      errorMessage: "Evento non gestito"
    });
    return { ok: true, action: "ignored" };
  }
}
