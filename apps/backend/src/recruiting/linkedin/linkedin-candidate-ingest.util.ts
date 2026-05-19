import { BadRequestException } from "@nestjs/common";

export interface NormalizedLinkedInCandidateIngest {
  companyId: string;
  jobId: string;
  externalId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  appliedAt?: string;
  notes?: string;
}

export function isNormalizedCandidatePayload(body: Record<string, unknown>): boolean {
  const jobId = body.jobId ?? body.job_id ?? body.positionId ?? body.position_id;
  const hasName =
    Boolean(String(body.firstName ?? body.first_name ?? "").trim()) ||
    Boolean(String(body.name ?? "").trim());
  return Boolean(jobId) && hasName && !body.event && !body.type;
}

export function normalizeCandidateIngestPayload(raw: Record<string, unknown>): NormalizedLinkedInCandidateIngest {
  const companyId = String(raw.companyId ?? raw.company_id ?? "").trim();
  const jobId = String(raw.jobId ?? raw.job_id ?? raw.positionId ?? raw.position_id ?? "").trim();
  if (!companyId) {
    throw new BadRequestException("companyId obbligatorio");
  }
  if (!jobId) {
    throw new BadRequestException("jobId obbligatorio (UUID posizione Nexa recruit_positions.id)");
  }
  let firstName = raw.firstName != null ? String(raw.firstName).trim() : String(raw.first_name ?? "").trim();
  let lastName = raw.lastName != null ? String(raw.lastName).trim() : String(raw.last_name ?? "").trim();
  const name = raw.name != null ? String(raw.name).trim() : "";
  if ((!firstName || !lastName) && name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      firstName = firstName || parts[0] ?? "";
      lastName = lastName || "—";
    } else if (parts.length >= 2) {
      firstName = firstName || parts[0] ?? "";
      lastName = lastName || parts.slice(1).join(" ");
    }
  }
  if (!firstName) {
    throw new BadRequestException("firstName o name obbligatori");
  }
  if (!lastName) {
    lastName = "—";
  }
  return {
    companyId,
    jobId,
    externalId:
      raw.externalId != null
        ? String(raw.externalId).trim()
        : raw.external_id != null
          ? String(raw.external_id).trim()
          : undefined,
    firstName,
    lastName,
    email: raw.email != null ? String(raw.email).trim() : undefined,
    phone: raw.phone != null ? String(raw.phone).trim() : undefined,
    linkedinUrl:
      raw.linkedinUrl != null
        ? String(raw.linkedinUrl).trim()
        : raw.linkedin_url != null
          ? String(raw.linkedin_url).trim()
          : undefined,
    resumeUrl:
      raw.resumeUrl != null
        ? String(raw.resumeUrl).trim()
        : raw.resume_url != null
          ? String(raw.resume_url).trim()
          : undefined,
    appliedAt:
      raw.appliedAt != null
        ? String(raw.appliedAt).trim()
        : raw.applied_at != null
          ? String(raw.applied_at).trim()
          : undefined,
    notes: raw.notes != null ? String(raw.notes).trim() : undefined
  };
}
