export type RecruitPositionSource = "nexa" | "linkedin";

export type LinkedInSyncStatus = "not_linked" | "pending" | "synced" | "error";

export type LinkedInJobAdapterMode = "stub" | "oauth";

export interface LinkedInPublishedJob {
  linkedinJobId: string;
  linkedinJobUrl: string;
  mode: LinkedInJobAdapterMode;
}

export interface LinkedInInboundJobPayload {
  event: string;
  company_id?: string;
  linkedin_job_id: string;
  title: string;
  description?: string;
  location?: string | null;
  status?: "open" | "closed";
  linkedin_job_url?: string | null;
}

export interface LinkedInInboundApplicationPayload {
  event: string;
  company_id?: string;
  linkedin_job_id: string;
  applicant_first_name?: string;
  applicant_last_name?: string;
  applicant_email?: string | null;
  applicant_phone?: string | null;
  linkedin_application_id?: string | null;
  notes?: string;
}

export interface LinkedInIntegrationStatus {
  configured: boolean;
  adapterMode: LinkedInJobAdapterMode;
  autoPublishOnCreate: boolean;
  organizationUrnSet: boolean;
  webhookSecretSet: boolean;
}

export interface LinkedInIntegrationUiConfig extends LinkedInIntegrationStatus {
  provider: "linkedin";
  companyId: string;
  webhookPath: string;
  webhookUrl: string;
  signatureHeaders: string[];
  signatureFormat: string;
  rateLimitPerMinute: number;
  defaultCompanyId: string;
  documentationPath: string;
}

export interface LinkedInCandidateIngestResult {
  candidateId: string;
  positionId: string;
  stateId: string;
  createdCandidate: boolean;
  duplicate: boolean;
}
