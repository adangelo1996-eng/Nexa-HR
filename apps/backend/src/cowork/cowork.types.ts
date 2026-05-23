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
  sectionId: string;
  domain: CoworkDomain;
  userId: string;
  fullName: string;
  action: string;
  detail: string;
  rationale?: string;
  status: CoworkRowStatus;
  errorMessage?: string;
  payload: Record<string, unknown>;
};

export type CoworkPlanSection = {
  sectionId: string;
  domain: CoworkDomain;
  title: string;
  rows: CoworkPlanRow[];
};

export type CoworkPlanStatus = "pending" | "partial" | "applied" | "expired";

export type CoworkPlanDto = {
  planId: string;
  domain: CoworkDomain;
  summary: string;
  sections: CoworkPlanSection[];
  rows: CoworkPlanRow[];
  status: CoworkPlanStatus;
  createdAt: string;
  expiresAt: string;
  appliedAt?: string | null;
  llmApplied: boolean;
  privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
};

export type CoworkClarificationResponse = {
  kind: "clarification";
  message: string;
  suggestions: string[];
  confidence: number;
};

export type CoworkPlanResponse = CoworkPlanDto | CoworkClarificationResponse;

export function isCoworkClarification(
  response: CoworkPlanResponse
): response is CoworkClarificationResponse {
  return "kind" in response && response.kind === "clarification";
}

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
  sections: CoworkPlanSection[];
  appliedCount: number;
  errorCount: number;
};

/** Sezione proposta dal planner LLM prima dell'hydration server-side. */
export type CoworkPlannerSectionSpec = {
  tool: string;
  domain: CoworkDomain;
  title: string;
};

export type CoworkPlannerLlmEnvelope = {
  needs_clarification?: boolean;
  confidence?: number;
  clarification_message?: string;
  suggestions?: string[];
  summary?: string;
  sections?: Array<{
    tool?: string;
    domain?: string;
    title?: string;
  }>;
};

export type CoworkPlannerInterpretResult =
  | {
      kind: "clarification";
      message: string;
      suggestions: string[];
      confidence: number;
      llmApplied: boolean;
      tokenCount: number;
    }
  | {
      kind: "sections";
      summary: string;
      sections: CoworkPlannerSectionSpec[];
      llmApplied: boolean;
      tokenCount: number;
    };
