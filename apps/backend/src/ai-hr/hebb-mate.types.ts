import type { AssistantScopePayload } from "./ai-hr.service";

export type HebbMateCapabilityId =
  | "contract_generation"
  | "document_generation"
  | "cv_screening"
  | "document_email"
  | "reports"
  | "skill_suggestions"
  | "automation_proposals";

export type HebbMateRoutedIntent = HebbMateCapabilityId | "cowork_batch" | "general";

export type HebbMateScopePayload = AssistantScopePayload;

export interface HebbMateCapabilityCard {
  id: HebbMateCapabilityId;
  title: string;
  description: string;
  icon: string;
  requiredPermissions: string[];
  examplePrompts: string[];
}

export type HebbMateActionType =
  | "preview_document"
  | "download_document"
  | "send_email"
  | "open_cowork"
  | "view_report"
  | "apply_skills"
  | "open_contract";

export interface HebbMateAction {
  type: HebbMateActionType;
  label: string;
  payload: Record<string, unknown>;
}

export interface HebbMateChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface HebbMateScopeSummary {
  scopeKind: "self" | "employees" | "company";
  subjectCount: number;
  resolvedNames: string[];
}

export interface HebbMateHitlPreview {
  proposalId: string;
  requiresConfirm: boolean;
  preview: unknown;
  scope: HebbMateScopeSummary;
}

export interface HebbMateChatResponse {
  capability: HebbMateRoutedIntent;
  reply: string;
  result?: unknown;
  actions?: HebbMateAction[];
  hitl?: HebbMateHitlPreview;
  scope?: HebbMateScopeSummary;
  privacy?: { pseudonymizedTokenCount: number };
  llm: { configured: boolean; routedBy: "rules" | "llm" };
}

export interface HebbMateApplyResponse {
  ok: boolean;
  proposalId: string;
  capability: HebbMateCapabilityId;
  reply: string;
  result?: unknown;
  applyLogIds: string[];
}

export interface HebbMateApplyLogDto {
  logId: string;
  proposalId: string;
  capability: HebbMateCapabilityId;
  subjectFullName: string;
  detail: string;
  undoStatus: "available" | "undone" | "blocked" | "failed";
  undoBlockedReason: string | null;
  appliedAt: string;
}

export interface HebbMateHistoryResponse {
  entries: HebbMateApplyLogDto[];
}

export type HebbMateContractKind = "employment" | "remote_working";

export type HebbMateDocumentKind =
  | "certificate_attendance"
  | "certificate_training"
  | "smartworking_letter"
  | "employment_letter"
  | "generic";

export interface HebbMateContractGenerateResult {
  dryRun: boolean;
  contractKind: HebbMateContractKind;
  scopeKind: string;
  subjectCount: number;
  created: number;
  skipped: number;
  errors: number;
  items: Array<{
    userId: string;
    fullName: string;
    contractId?: string;
    documentId?: string;
    status: "created" | "skipped" | "error";
    detail?: string;
  }>;
}

export interface HebbMateDocumentGenerateResult {
  scopeKind: string;
  documentKind: HebbMateDocumentKind;
  title: string;
  created: number;
  items: Array<{
    userId: string;
    fullName: string;
    documentId: string;
    title: string;
  }>;
}

export interface HebbMateReportResult {
  reportType: "employee" | "team" | "cost_center";
  scopeLabel: string;
  generatedAt: string;
  summary: string;
  sections: Array<{ title: string; bullets: string[] }>;
  metrics: Record<string, unknown>;
}

export interface HebbMateSkillSuggestion {
  skillCode: string;
  skillName: string;
  suggestedLevel: number;
  reason: string;
  source: "role_template" | "gap_analysis" | "llm";
}

export interface HebbMateSkillSuggestResult {
  roleId?: string;
  roleName: string;
  userId?: string;
  suggestions: HebbMateSkillSuggestion[];
}

export type HebbMateAutomationTriggerType = "schedule" | "event" | "threshold";

export interface HebbMateAutomationProposal {
  id: string;
  /** Riferimento template catalogo (`hebb-mate-automation-catalog`). */
  catalogId?: string;
  title: string;
  description: string;
  workArea: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "on_demand";
  scheduleHint: string;
  triggerType?: HebbMateAutomationTriggerType;
  toolId?: string;
  permissions: string[];
  estimatedImpact: string;
  actions?: Array<{ type: string; label: string; toolId?: string; payload?: Record<string, unknown> }>;
}

export interface HebbMateAutomationDto {
  id: string;
  title: string;
  description: string;
  workArea: string;
  frequency: HebbMateAutomationProposal["frequency"];
  scheduleHint: string;
  actions: Array<{ type: string; label: string; toolId?: string }>;
  scopeKind: "self" | "employees" | "company";
  subjectCount: number;
  status: "active" | "paused" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface HebbMateAutomationsListResponse {
  automations: HebbMateAutomationDto[];
  canManage?: boolean;
}

export interface HebbMateActivateAutomationsResult {
  created: number;
  automations: HebbMateAutomationDto[];
  skipped?: number;
}

export interface HebbMateAutomationDryRunSample {
  label: string;
  count: number;
  detail?: string;
}

export interface HebbMateAutomationTestResult {
  dryRun: true;
  automationId: string;
  title: string;
  workArea: string;
  frequency: HebbMateAutomationProposal["frequency"];
  scheduleHint: string;
  scopeKind: "self" | "employees" | "company";
  subjectCount: number;
  plannedActions: Array<{ type: string; label: string; toolId?: string }>;
  summary: string;
  samples: HebbMateAutomationDryRunSample[];
  wouldPersist: false;
}

export interface HebbMateDocumentEmailResult {
  documentId: string;
  targetUserId: string;
  delivery: "in_app" | "webhook" | "both";
  notificationId?: string;
  webhookAttempted: boolean;
  webhookOk: boolean;
}
