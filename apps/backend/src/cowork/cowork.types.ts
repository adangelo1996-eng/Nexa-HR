export const COWORK_AREAS = [
  "calendar",
  "time_off",
  "lifecycle",
  "training",
  "documents",
  "org",
  "compensation",
  "payroll",
  "personnel_budget",
  "recruiting",
  "corporate_policies",
  "third_party_licenses",
  "admin",
  "onboarding",
  "analytics",
  "generic",
  "smartworking_agreements",
  "smartworking_requests",
  "employment_contracts"
] as const;

export type CoworkAreaId = (typeof COWORK_AREAS)[number];

export const COWORK_DOMAINS = [
  "smartworking_agreements",
  "smartworking_requests",
  "employment_contracts",
  "calendar",
  "time_off",
  "lifecycle",
  "training",
  "documents",
  "org",
  "compensation",
  "payroll",
  "personnel_budget",
  "recruiting",
  "corporate_policies",
  "third_party_licenses",
  "admin",
  "onboarding",
  "analytics",
  "generic",
  "unknown"
] as const;

export type CoworkDomain = (typeof COWORK_DOMAINS)[number];

export type CoworkRowStatus = "proposed" | "applied" | "error" | "skipped";

export type CoworkPlanRow = {
  id: string;
  sectionId: string;
  domain: CoworkDomain;
  toolId: string;
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
  toolId: string;
  title: string;
  rows: CoworkPlanRow[];
};

export type CoworkPlanStatus = "pending" | "partial" | "applied" | "expired" | "cancelled";

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
  batchId: string;
  rows: CoworkPlanRow[];
  sections: CoworkPlanSection[];
  appliedCount: number;
  errorCount: number;
  logIds: string[];
};

export type CoworkHistoryQuery = {
  page?: number;
  pageSize?: number;
};

export type CoworkHistorySectionSummary = {
  sectionId: string;
  domain: CoworkDomain;
  toolId: string;
  title: string;
  appliedCount: number;
};

export type CoworkHistoryBatch = {
  planId: string;
  batchId: string;
  summary: string;
  domain: CoworkDomain;
  actorUserId: string;
  appliedAt: string;
  sections: CoworkHistorySectionSummary[];
  entries: Array<{
    logId: string;
    rowId: string;
    toolId: string;
    domain: CoworkDomain;
    categoryKey: string;
    categoryLabel: string;
    subjectFullName: string;
    detail: string;
    undoStatus: string;
    undoBlockedReason?: string | null;
  }>;
  categories: Array<{
    categoryKey: string;
    categoryLabel: string;
    domain: CoworkDomain;
    toolId: string;
    appliedCount: number;
    undoAvailableCount: number;
  }>;
};

export type CoworkHistoryMonth = {
  month: string;
  label: string;
  batches: CoworkHistoryBatch[];
};

export type CoworkHistoryResult = {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  totalMonths: number;
  totalBatches: number;
  months: CoworkHistoryMonth[];
};

export type CoworkUndoRequest = { logId: string } | { planId: string; rowId: string };

export type CoworkBulkUndoRequest =
  | { logIds: string[] }
  | { planId: string; batchId: string; category: string };

export type CoworkBulkUndoItemResult = {
  logId: string;
  ok: boolean;
  message: string;
  reversible: boolean;
};

export type CoworkBulkUndoResult = {
  ok: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: CoworkBulkUndoItemResult[];
};

export type CoworkCancelRequest = {
  planId: string;
};

/** Sezione proposta dal planner LLM prima dell'hydration server-side. */
export type CoworkPlannerSectionSpec = {
  tool: string;
  domain: CoworkDomain;
  areaId?: CoworkAreaId;
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

export type CoworkToolParamField = {
  type: "string" | "number" | "boolean" | "date" | "datetime";
  required?: boolean;
  descriptionIt?: string;
};

export type CoworkToolParamSchema = Record<string, CoworkToolParamField>;

export type CoworkToolDef = {
  id: string;
  areaId: CoworkAreaId;
  domain: CoworkDomain;
  labelIt: string;
  hintIt: string;
  executable: boolean;
  /** Tutti i permessi Nexa richiesti (AND). Vuoto = solo lifecycle Cowork sul controller. */
  permissions: string[];
  paramSchema?: CoworkToolParamSchema;
  disabledMessageIt?: string;
  /** Operazione ad alto impatto (payroll publish/generate): rationale esplicito in preview HITL. */
  highRisk?: boolean;
};
