export const COWORK_DOMAINS = [
  "smartworking_agreements",
  "smartworking_requests",
  "employment_contracts",
  "training",
  "unknown"
] as const;

export type CoworkDomain = (typeof COWORK_DOMAINS)[number];

export type CoworkRowStatus = "proposed" | "applied" | "error" | "skipped";

export type CoworkPlanRow = {
  id: string;
  userId: string;
  fullName: string;
  action: string;
  detail: string;
  rationale?: string;
  status: CoworkRowStatus;
  errorMessage?: string;
  payload: Record<string, unknown>;
};

export type CoworkPlanStatus = "pending" | "partial" | "applied" | "expired";

export type CoworkPlanDto = {
  planId: string;
  domain: CoworkDomain;
  summary: string;
  rows: CoworkPlanRow[];
  status: CoworkPlanStatus;
  createdAt: string;
  expiresAt: string;
  appliedAt?: string | null;
  llmApplied: boolean;
  privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
};

export type CoworkPlanRequest = {
  message: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  costCenterId?: string;
  teamId?: string;
};

export type CoworkApplyRequest = {
  planId: string;
  selectedRowIds: string[];
};

export type CoworkApplyResult = {
  planId: string;
  rows: CoworkPlanRow[];
  appliedCount: number;
  errorCount: number;
};
