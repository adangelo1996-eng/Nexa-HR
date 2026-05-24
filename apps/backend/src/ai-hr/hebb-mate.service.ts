import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger
} from "@nestjs/common";
import type { User } from "@payday/domain";
import type { PersonDirectoryEntry } from "../ai-privacy/pseudonymize-free-text";
import type { AuthContext, AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { COWORK_TOOL_LIST } from "../cowork/cowork-tool-catalog";
import { HrContractsService } from "../hr-contracts/hr-contracts.service";
import {
  buildPartyFromUser,
  employmentBlocksForParty,
  employmentContractTitle,
  remoteWorkingBlocksForParty,
  remoteWorkingContractTitle,
  type ContractBlockPayload,
  type ContractPartyPayload
} from "../hr-contracts/hr-contract-templates";
import { renderSynapseContractPdf } from "../hr-contracts/hr-contract-pdf.renderer";
import { DEFAULT_MAX_REMOTE_DAYS_PER_MONTH, DEFAULT_MAX_REMOTE_DAYS_PER_WEEK } from "../hr-contracts/hr-contract-brand.constants";
import { RecruitCvScreenService } from "../recruiting/recruit-cv-screen.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { AiAuditService } from "./ai-audit.service";
import { AiHrService, type AssistantScopePayload } from "./ai-hr.service";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";
import { HebbMateApplyLogStore } from "./hebb-mate-apply-log.store";
import { HebbMateAutomationsStore } from "./hebb-mate-automations.store";
import {
  getAutomationQuickExamplePrompts,
  selectAutomationProposalsFromCatalog
} from "./hebb-mate-automation-catalog";
import { HEBB_MATE_CAPABILITY_CARDS } from "./hebb-mate-capabilities";
import { HebbMateProposalsStore } from "./hebb-mate-proposals.store";
import {
  extractContractKind,
  extractDocumentKind,
  isHebbMateSuggestionIntent,
  routeHebbMateIntent
} from "./hebb-mate-router";
import { resolveEmployeesFromMessage, type HebbMateResolvedScope } from "./hebb-mate-scope.util";
import { HebbMateUndoService } from "./hebb-mate-undo.service";
import type {
  HebbMateAction,
  HebbMateActivateAutomationsResult,
  HebbMateApplyResponse,
  HebbMateAutomationDto,
  HebbMateAutomationProposal,
  HebbMateAutomationsListResponse,
  HebbMateCapabilityId,
  HebbMateChatResponse,
  HebbMateContractGenerateResult,
  HebbMateContractKind,
  HebbMateDocumentEmailResult,
  HebbMateDocumentGenerateResult,
  HebbMateDocumentKind,
  HebbMateHistoryResponse,
  HebbMateReportResult,
  HebbMateScopeSummary,
  HebbMateSkillSuggestResult,
  HebbMateSkillSuggestion
} from "./hebb-mate.types";

const SCHEMA_MATE_AUTOMATION = "ai_mate_automation_v1";
const SCHEMA_MATE_ORCHESTRATOR = "ai_mate_orchestrator_v1";

const MATE_CAPABILITY_IDS = new Set<HebbMateCapabilityId>([
  "contract_generation",
  "document_generation",
  "cv_screening",
  "document_email",
  "reports",
  "skill_suggestions",
  "automation_proposals"
]);

const HITL_CONFIRM_CAPABILITIES = new Set<HebbMateCapabilityId>([
  "contract_generation",
  "document_generation",
  "document_email",
  "automation_proposals"
]);

@Injectable()
export class HebbMateService {
  private readonly log = new Logger(HebbMateService.name);

  constructor(
    private readonly aiHr: AiHrService,
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly audit: AiAuditService,
    private readonly contracts: HrContractsService,
    private readonly cvScreen: RecruitCvScreenService,
    private readonly proposals: HebbMateProposalsStore,
    private readonly applyLog: HebbMateApplyLogStore,
    private readonly automations: HebbMateAutomationsStore,
    private readonly undoService: HebbMateUndoService
  ) {}

  listCapabilities(auth: { userId: string; role: AuthRole }): {
    capabilities: typeof HEBB_MATE_CAPABILITY_CARDS;
    llmActive: boolean;
  } {
    return {
      capabilities: HEBB_MATE_CAPABILITY_CARDS,
      llmActive: this.openAi.isActive()
    };
  }

  async chat(
    auth: AuthContext,
    body: {
      message: string;
      capability?: HebbMateCapabilityId;
      dryRun?: boolean;
      candidateId?: string;
      positionId?: string;
      documentId?: string;
      contractKind?: HebbMateContractKind;
      documentKind?: HebbMateDocumentKind;
    }
  ): Promise<HebbMateChatResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || auth.tenantId || "comp-1";
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === companyId);

    const { resolvedScope, privacy } = await this.resolveChatScope(auth, body.message, companyUsers);
    const scopeSummary = this.scopeSummary(resolvedScope);
    const pseudonymizedMessage = privacy.pseudonymizedMessage;

    const intent = routeHebbMateIntent(body.message, body.capability, pseudonymizedMessage);
    let llm: HebbMateChatResponse["llm"] = { configured: this.openAi.isActive(), routedBy: "rules" };

    if (intent === "general") {
      return this.handleGeneralChat(auth, body, companyId, resolvedScope, scopeSummary, privacy, llm);
    }

    if (intent === "cowork_batch") {
      return {
        capability: "cowork_batch",
        reply:
          "Per operazioni batch (rinnovi SW, approvazioni multiple) usa la scheda Cowork batch: genera un piano HITL e approva riga per riga.",
        actions: [{ type: "open_cowork", label: "Apri Cowork batch", payload: {} }],
        scope: scopeSummary,
        privacy: { pseudonymizedTokenCount: privacy.tokenCount },
        llm
      };
    }

    const ctx = {
      message: body.message,
      pseudonymizedMessage,
      subjectUserIds: resolvedScope.subjectUserIds,
      scopeKind: resolvedScope.scopeKind,
      subjectContext: privacy.subjectContext,
      dryRun: true,
      candidateId: body.candidateId,
      positionId: body.positionId,
      documentId: body.documentId,
      contractKind: body.contractKind ?? extractContractKind(body.message),
      documentKind: body.documentKind ?? extractDocumentKind(body.message)
    };

    const result = await this.executeCapability(auth, intent, ctx, true);
    const requiresConfirm = HITL_CONFIRM_CAPABILITIES.has(intent);

    const proposal = this.proposals.save({
      companyId,
      actorUserId: auth.userId,
      capability: intent,
      message: body.message,
      subjectUserIds: resolvedScope.subjectUserIds,
      resolvedNames: resolvedScope.resolvedNames,
      params: {
        contractKind: ctx.contractKind,
        documentKind: ctx.documentKind,
        candidateId: ctx.candidateId,
        positionId: ctx.positionId,
        documentId: ctx.documentId,
        scopeKind: resolvedScope.scopeKind
      },
      preview: result.result ?? result,
      requiresConfirm
    });

    return {
      ...result,
      scope: scopeSummary,
      privacy: { pseudonymizedTokenCount: privacy.tokenCount },
      hitl: {
        proposalId: proposal.proposalId,
        requiresConfirm,
        preview: result.result ?? result,
        scope: scopeSummary
      },
      llm
    };
  }

  async apply(auth: AuthContext, proposalId: string): Promise<HebbMateApplyResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || auth.tenantId || "comp-1";
    const proposal = this.proposals.get(proposalId, companyId, auth.userId);

    const scopeKind =
      (proposal.params.scopeKind as HebbMateResolvedScope["scopeKind"] | undefined) ??
      (proposal.resolvedNames.length > 0 ? "employees" : "self");

    const ctx = {
      message: proposal.message,
      pseudonymizedMessage: proposal.message,
      subjectUserIds: proposal.subjectUserIds,
      scopeKind,
      dryRun: false,
      candidateId: proposal.params.candidateId as string | undefined,
      positionId: proposal.params.positionId as string | undefined,
      documentId: proposal.params.documentId as string | undefined,
      contractKind: (proposal.params.contractKind as HebbMateContractKind) ?? "employment",
      documentKind: (proposal.params.documentKind as HebbMateDocumentKind) ?? "generic"
    };

    const result = await this.executeCapability(auth, proposal.capability, ctx, false, proposal);
    const applyLogIds = await this.recordApplyLogs(auth, companyId, proposal, result.result);

    this.proposals.markApplied(proposalId);

    return {
      ok: true,
      proposalId,
      capability: proposal.capability,
      reply: result.reply,
      result: result.result,
      applyLogIds
    };
  }

  async cancelProposal(auth: AuthContext, proposalId: string): Promise<{ ok: boolean }> {
    const user = await this.store.getUser(auth.userId);
    const companyId = user.companyId || auth.tenantId || "comp-1";
    this.proposals.get(proposalId, companyId, auth.userId);
    this.proposals.markCancelled(proposalId);
    return { ok: true };
  }

  async undo(auth: AuthContext, logId: string): Promise<{ ok: boolean; logId: string; message: string }> {
    return this.undoService.undo(auth, logId);
  }

  async listHistory(auth: AuthContext): Promise<HebbMateHistoryResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || auth.tenantId || "comp-1";
    const entries = await this.applyLog.listRecent(companyId, 50);
    return {
      entries: entries.map((e) => ({
        logId: e.id,
        proposalId: e.proposalId,
        capability: e.capability,
        subjectFullName: e.subjectFullName,
        detail: e.detail,
        undoStatus: e.undoStatus,
        undoBlockedReason: e.undoBlockedReason,
        appliedAt: e.appliedAt
      }))
    };
  }

  private scopeSummary(resolved: HebbMateResolvedScope): HebbMateScopeSummary {
    return {
      scopeKind: resolved.scopeKind,
      subjectCount: resolved.subjectUserIds.length,
      resolvedNames: resolved.resolvedNames
    };
  }

  private async handleGeneralChat(
    auth: AuthContext,
    body: {
      message: string;
      capability?: HebbMateCapabilityId;
      candidateId?: string;
      positionId?: string;
      documentId?: string;
      contractKind?: HebbMateContractKind;
      documentKind?: HebbMateDocumentKind;
    },
    companyId: string,
    resolvedScope: HebbMateResolvedScope,
    scopeSummary: HebbMateScopeSummary,
    privacy: { pseudonymizedMessage: string; tokenCount: number; subjectContext?: unknown },
    llm: HebbMateChatResponse["llm"]
  ): Promise<HebbMateChatResponse> {
    if (isHebbMateSuggestionIntent(body.message)) {
      return this.buildSuggestionsReply(scopeSummary, privacy.tokenCount, llm, resolvedScope);
    }

    if (this.openAi.isActive()) {
      const orchestrated = await this.orchestrateGeneralIntent(auth, body.message, privacy);
      if (orchestrated.capability && MATE_CAPABILITY_IDS.has(orchestrated.capability)) {
        llm = { configured: true, routedBy: "llm" };
        const ctx = {
          message: body.message,
          pseudonymizedMessage: privacy.pseudonymizedMessage,
          subjectUserIds: resolvedScope.subjectUserIds,
          scopeKind: resolvedScope.scopeKind,
          subjectContext: privacy.subjectContext,
          dryRun: true,
          candidateId: body.candidateId,
          positionId: body.positionId,
          documentId: body.documentId,
          contractKind: body.contractKind ?? extractContractKind(body.message),
          documentKind: body.documentKind ?? extractDocumentKind(body.message)
        };
        const result = await this.executeCapability(auth, orchestrated.capability, ctx, true);
        const requiresConfirm = HITL_CONFIRM_CAPABILITIES.has(orchestrated.capability);
        const proposal = this.proposals.save({
          companyId,
          actorUserId: auth.userId,
          capability: orchestrated.capability,
          message: body.message,
          subjectUserIds: resolvedScope.subjectUserIds,
          resolvedNames: resolvedScope.resolvedNames,
          params: {
            contractKind: ctx.contractKind,
            documentKind: ctx.documentKind,
            candidateId: ctx.candidateId,
            positionId: ctx.positionId,
            documentId: ctx.documentId,
            scopeKind: resolvedScope.scopeKind
          },
          preview: result.result ?? result,
          requiresConfirm
        });
        return {
          ...result,
          scope: scopeSummary,
          privacy: { pseudonymizedTokenCount: privacy.tokenCount },
          hitl: {
            proposalId: proposal.proposalId,
            requiresConfirm,
            preview: result.result ?? result,
            scope: scopeSummary
          },
          llm
        };
      }
      if (orchestrated.reply?.trim()) {
        return {
          capability: "general",
          reply: orchestrated.reply.trim(),
          scope: scopeSummary,
          privacy: { pseudonymizedTokenCount: privacy.tokenCount },
          llm: { configured: true, routedBy: "llm" },
          result: orchestrated.actions?.length ? { kind: "orchestrated", actions: orchestrated.actions } : undefined,
          actions: orchestrated.actions
        };
      }
    }

    try {
      const assistant = await this.aiHr.assistant(auth, {
        message: body.message,
        scope:
          resolvedScope.scopeKind === "self"
            ? { mode: "self" }
            : {
                mode: "user",
                userId: resolvedScope.subjectUserIds[0] ?? auth.userId
              }
      });
      return {
        capability: "general",
        reply: assistant.reply,
        scope: scopeSummary,
        privacy: { pseudonymizedTokenCount: privacy.tokenCount },
        llm: { configured: assistant.llm.configured, routedBy: assistant.llm.refineApplied ? "llm" : "rules" },
        result: { kind: "assistant", sources: assistant.sources }
      };
    } catch (err) {
      this.log.warn(`Mate assistant fallback: ${err instanceof Error ? err.message : err}`);
    }

    return {
      capability: "general",
      reply:
        "Non ho collegato la richiesta a un'operazione specifica. Prova un esempio rapido (automazioni, report, contratti) o cita i nominativi nel messaggio; per batch di massa usa **Cowork**.",
      scope: scopeSummary,
      privacy: { pseudonymizedTokenCount: privacy.tokenCount },
      llm,
      actions: getAutomationQuickExamplePrompts()
        .slice(0, 3)
        .map((prompt) => ({
          type: "open_cowork" as const,
          label: prompt.slice(0, 48),
          payload: { examplePrompt: prompt }
        }))
    };
  }

  private async orchestrateGeneralIntent(
    auth: AuthContext,
    message: string,
    privacy: { pseudonymizedMessage: string; subjectContext?: unknown }
  ): Promise<{
    capability?: HebbMateCapabilityId;
    reply?: string;
    actions?: HebbMateAction[];
  }> {
    const companyId = auth.tenantId ?? "comp-1";
    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const payload = {
        message: privacy.pseudonymizedMessage,
        subjectContext: privacy.subjectContext,
        capabilities: HEBB_MATE_CAPABILITY_CARDS.map((c) => ({
          id: c.id,
          title: c.title,
          examples: c.examplePrompts.slice(0, 2)
        })),
        automationExamples: getAutomationQuickExamplePrompts().slice(0, 6),
        task: "Classify HR Mate intent or answer helpfully with actionable next steps"
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, SCHEMA_MATE_ORCHESTRATOR);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_MATE_ORCHESTRATOR);
      const raw = refined.ok ? refined.data : pseudo.pseudonymized;
      const envelope =
        raw && typeof raw === "object" && "envelope" in raw
          ? (raw as { envelope?: Record<string, unknown> }).envelope
          : (raw as Record<string, unknown>);
      const env = (envelope ?? {}) as {
        capability?: string;
        confidence?: number;
        reply?: string;
        suggestedPrompts?: string[];
      };
      const confidence = Number(env.confidence ?? 0);
      const capability =
        typeof env.capability === "string" && MATE_CAPABILITY_IDS.has(env.capability as HebbMateCapabilityId)
          ? (env.capability as HebbMateCapabilityId)
          : undefined;
      const actions =
        Array.isArray(env.suggestedPrompts) && env.suggestedPrompts.length
          ? env.suggestedPrompts.slice(0, 4).map((label) => ({
              type: "open_cowork" as const,
              label: label.slice(0, 56),
              payload: { examplePrompt: label }
            }))
          : undefined;
      if (capability && confidence >= 0.55) {
        return { capability, reply: env.reply, actions };
      }
      return { reply: env.reply, actions };
    } catch {
      return {};
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private buildSuggestionsReply(
    scope: HebbMateScopeSummary,
    tokenCount: number,
    llm: HebbMateChatResponse["llm"],
    resolvedScope: HebbMateResolvedScope
  ): HebbMateChatResponse {
    const scopeLine =
      scope.resolvedNames.length > 0
        ? `Perimetro attuale: **${scope.resolvedNames.join(", ")}** (${scope.subjectCount} ${scope.subjectCount === 1 ? "persona" : "persone"}).`
        : scope.scopeKind === "company"
          ? "Perimetro attuale: **tutta l'azienda**."
          : scope.subjectCount === 1
            ? "Perimetro attuale: **profilo personale**."
            : `Perimetro attuale: **${scope.subjectCount} persone** nel team citato.`;

    const capabilityLines = HEBB_MATE_CAPABILITY_CARDS.map((card) => {
      const example = card.examplePrompts[0] ?? "";
      return `- **${card.title}** — ${card.description}${example ? `\n  Esempio: «${example}»` : ""}`;
    }).join("\n");

    const automationIdeas = getAutomationQuickExamplePrompts()
      .slice(0, 5)
      .map((idea) => `- ${idea}`)
      .join("\n");

    const reply = [
      "Ecco cosa posso fare per te in **Hebb AI Mate** (nessuna azione eseguita finché non confermi in preview HITL):",
      "",
      scopeLine,
      "",
      "### Operazioni HR",
      capabilityLines,
      "",
      "### Idee automazioni",
      "Chiedi «Suggerisci automazioni mensili per HR» per proposte schedulabili, oppure prova:",
      automationIdeas,
      "",
      "### Batch di massa",
      "Per rinnovi smart working o approvazioni multiple usa la scheda **Cowork batch**.",
      "",
      "Cita i nominativi nel messaggio per definire il perimetro; nella chat verso il modello uso pseudonimi stabili."
    ].join("\n");

    return {
      capability: "general",
      reply,
      scope,
      privacy: { pseudonymizedTokenCount: tokenCount },
      llm,
      result: {
        kind: "suggestions",
        scopeKind: resolvedScope.scopeKind,
        subjectCount: resolvedScope.subjectUserIds.length,
        capabilities: HEBB_MATE_CAPABILITY_CARDS.map((c) => ({
          id: c.id,
          title: c.title,
          examplePrompt: c.examplePrompts[0]
        }))
      }
    };
  }

  async listAutomations(auth: AuthContext): Promise<HebbMateAutomationsListResponse> {
    await this.assertMateAccess(auth);
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || auth.tenantId || "comp-1";
    const rows = await this.automations.listActive(companyId);
    return { automations: rows.map((row) => this.toAutomationDto(row)) };
  }

  private toAutomationDto(row: {
    id: string;
    title: string;
    description: string;
    workArea: string;
    frequency: HebbMateAutomationProposal["frequency"];
    scheduleHint: string;
    actions: Array<{ type: string; label: string; toolId?: string }>;
    scopeKind: "self" | "employees" | "company";
    subjectUserIds: string[];
    status: "active" | "paused" | "archived";
    createdAt: string;
    updatedAt: string;
  }): HebbMateAutomationDto {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      workArea: row.workArea,
      frequency: row.frequency,
      scheduleHint: row.scheduleHint,
      actions: row.actions,
      scopeKind: row.scopeKind,
      subjectCount: row.subjectUserIds.length,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private async activateAutomationsFromProposal(
    auth: AuthContext,
    companyId: string,
    proposal: {
      proposalId: string;
      subjectUserIds: string[];
      params: Record<string, unknown>;
      preview: unknown;
    }
  ): Promise<HebbMateActivateAutomationsResult> {
    const previewEnvelope = proposal.preview as { proposals?: HebbMateAutomationProposal[] } | HebbMateAutomationProposal[];
    const proposals = Array.isArray(previewEnvelope)
      ? previewEnvelope
      : Array.isArray(previewEnvelope?.proposals)
        ? previewEnvelope.proposals
        : [];

    if (!proposals.length) {
      throw new BadRequestException("Nessuna automazione da attivare nella proposta.");
    }

    const scopeKind =
      (proposal.params.scopeKind as HebbMateResolvedScope["scopeKind"] | undefined) ?? "company";

    const created = await this.automations.createMany(
      proposals.map((p, index) => ({
        companyId,
        title: p.title,
        description: p.description,
        workArea: p.workArea || "all",
        frequency: p.frequency,
        scheduleHint: p.scheduleHint,
        cronExpression: null,
        actions:
          p.actions ??
          [{ type: "cowork_tool", label: p.title, toolId: p.toolId, payload: { catalogId: p.catalogId } }],
        toolId: p.toolId ?? null,
        scopeKind,
        subjectUserIds: proposal.subjectUserIds,
        createdByUserId: auth.userId,
        proposalId: proposals.length === 1 && index === 0 ? proposal.proposalId : null
      }))
    );

    return {
      created: created.length,
      automations: created.map((row) => this.toAutomationDto(row))
    };
  }

  private async resolveChatScope(
    auth: AuthContext,
    message: string,
    companyUsers: User[]
  ): Promise<{
    resolvedScope: HebbMateResolvedScope;
    privacy: { pseudonymizedMessage: string; tokenCount: number; subjectContext?: unknown };
  }> {
    const me = await this.store.getUser(auth.userId);
    const org = auth.role === "superuser" || (await this.permissions.userHasAll(auth.userId, ["nexa.ai_assistant:scope_org"]));
    const managed = await this.permissions.userHasAll(auth.userId, ["nexa.ai_assistant:scope_managed"]);
    const managedSet = managed ? await this.store.listManagedMemberIdsForApprover(auth.userId) : new Set<string>();

    const canView = (userId: string): boolean => {
      if (userId === auth.userId) return true;
      if (org) {
        const sub = companyUsers.find((u) => u.id === userId);
        return sub?.companyId === me.companyId;
      }
      return managedSet.has(userId);
    };

    const resolvedScope = resolveEmployeesFromMessage(message, companyUsers, auth.userId, canView);

    for (const uid of resolvedScope.subjectUserIds) {
      if (uid !== auth.userId && !canView(uid)) {
        throw new ForbiddenException("Non puoi analizzare uno o più nominativi citati.");
      }
    }

    const personDirectory: PersonDirectoryEntry[] = companyUsers
      .filter((u) => canView(u.id))
      .map((u) => ({
        fullName: u.fullName,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email
      }));

    const companyId = me.companyId || auth.tenantId || "comp-1";
    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const pseudo = await this.gateway.pseudonymizeFreeText(sessionId, message, personDirectory);

      let subjectContext: unknown;
      const subjects = resolvedScope.subjectUserIds
        .map((id) => companyUsers.find((u) => u.id === id))
        .filter((u): u is User => Boolean(u));
      if (subjects.length > 0) {
        const roles = await this.store.listRoles();
        const roleById = new Map(roles.map((r) => [r.id, r.name]));
        const contextRaw = {
          scopeKind: resolvedScope.scopeKind,
          subjectCount: subjects.length,
          subjects: subjects.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            roleName: u.roleId ? roleById.get(u.roleId) : undefined,
            costCenterId: u.costCenterId,
            hireDate: u.hireDate
          }))
        };
        const ctxPseudo = await this.gateway.toModelPayload(sessionId, contextRaw, "hebb_mate_subject_context_v1");
        subjectContext = ctxPseudo.pseudonymized;
      }

      return {
        resolvedScope,
        privacy: {
          pseudonymizedMessage: pseudo.text,
          tokenCount: pseudo.replacementCount,
          subjectContext
        }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private async recordApplyLogs(
    auth: AuthContext,
    companyId: string,
    proposal: { proposalId: string; capability: HebbMateCapabilityId },
    result: unknown
  ): Promise<string[]> {
    const ids: string[] = [];
    const undoMeta = this.undoService.buildUndoMeta(proposal.capability);

    if (proposal.capability === "contract_generation") {
      const gen = result as HebbMateContractGenerateResult;
      for (const item of gen.items.filter((i) => i.status === "created")) {
        const entry = await this.applyLog.append({
          companyId,
          proposalId: proposal.proposalId,
          actorUserId: auth.userId,
          capability: proposal.capability,
          subjectUserId: item.userId,
          subjectFullName: item.fullName,
          entityType: item.contractId ? "contract" : null,
          entityId: item.contractId ?? null,
          previousState: null,
          appliedPayload: { documentId: item.documentId, contractId: item.contractId },
          detail: item.detail ?? "Contratto generato",
          ...undoMeta
        });
        ids.push(entry.id);
      }
      return ids;
    }

    if (proposal.capability === "document_generation") {
      const gen = result as HebbMateDocumentGenerateResult;
      for (const item of gen.items) {
        const entry = await this.applyLog.append({
          companyId,
          proposalId: proposal.proposalId,
          actorUserId: auth.userId,
          capability: proposal.capability,
          subjectUserId: item.userId,
          subjectFullName: item.fullName,
          entityType: "employee_document",
          entityId: item.documentId,
          previousState: null,
          appliedPayload: { documentId: item.documentId, title: item.title },
          detail: `Documento: ${item.title}`,
          ...undoMeta
        });
        ids.push(entry.id);
      }
      return ids;
    }

    if (proposal.capability === "document_email") {
      const sent = result as HebbMateDocumentEmailResult;
      const user = await this.store.getUser(sent.targetUserId);
      const entry = await this.applyLog.append({
        companyId,
        proposalId: proposal.proposalId,
        actorUserId: auth.userId,
        capability: proposal.capability,
        subjectUserId: sent.targetUserId,
        subjectFullName: user.fullName,
        entityType: "document_email",
        entityId: sent.documentId,
        previousState: null,
        appliedPayload: { documentId: sent.documentId, delivery: sent.delivery },
        detail: `Notifica documento (${sent.delivery})`,
        ...undoMeta
      });
      ids.push(entry.id);
      return ids;
    }

    if (proposal.capability === "automation_proposals") {
      const activated = result as HebbMateActivateAutomationsResult;
      for (const auto of activated.automations) {
        const entry = await this.applyLog.append({
          companyId,
          proposalId: proposal.proposalId,
          actorUserId: auth.userId,
          capability: proposal.capability,
          subjectUserId: null,
          subjectFullName: auto.scopeKind === "company" ? "Tutta l'azienda" : `${auto.subjectCount} persone`,
          entityType: "automation",
          entityId: auto.id,
          previousState: null,
          appliedPayload: { automationId: auto.id, frequency: auto.frequency, workArea: auto.workArea },
          detail: `Automazione: ${auto.title}`,
          ...undoMeta
        });
        ids.push(entry.id);
      }
      return ids;
    }

    return ids;
  }

  private async executeCapability(
    auth: AuthContext,
    capability: HebbMateCapabilityId,
    ctx: {
      message: string;
      pseudonymizedMessage: string;
      subjectUserIds: string[];
      scopeKind: "self" | "employees" | "company";
      subjectContext?: unknown;
      dryRun?: boolean;
      candidateId?: string;
      positionId?: string;
      documentId?: string;
      contractKind: HebbMateContractKind;
      documentKind: HebbMateDocumentKind;
    },
    previewOnly: boolean,
    storedProposal?: {
      proposalId: string;
      subjectUserIds: string[];
      params: Record<string, unknown>;
      preview: unknown;
    }
  ): Promise<Omit<HebbMateChatResponse, "llm">> {
    const subjectCtx = {
      subjectUserIds: ctx.subjectUserIds,
      scopeKind: ctx.scopeKind
    };

    switch (capability) {
      case "contract_generation": {
        const result = await this.generateContracts(auth, {
          subjectUserIds: ctx.subjectUserIds,
          scopeKind: ctx.scopeKind,
          contractKind: ctx.contractKind,
          dryRun: previewOnly || ctx.dryRun,
          requestSummary: ctx.message
        });
        const verb = previewOnly ? "Anteprima" : "Generati";
        return {
          capability,
          reply: `${verb}: ${result.created} contratti (${result.contractKind}), ${result.skipped} già presenti, ${result.errors} errori su ${result.subjectCount} persone.`,
          result,
          actions: result.items
            .filter((i) => i.documentId)
            .slice(0, 5)
            .map((i) => ({
              type: "preview_document" as const,
              label: `Anteprima ${i.fullName}`,
              payload: { documentId: i.documentId, userId: i.userId, contractId: i.contractId }
            }))
        };
      }
      case "document_generation": {
        const result = previewOnly
          ? await this.previewDocuments(auth, {
              subjectUserIds: ctx.subjectUserIds,
              scopeKind: ctx.scopeKind,
              documentKind: ctx.documentKind,
              titleHint: ctx.message
            })
          : await this.generateDocuments(auth, {
              subjectUserIds: ctx.subjectUserIds,
              scopeKind: ctx.scopeKind,
              documentKind: ctx.documentKind,
              titleHint: ctx.message
            });
        return {
          capability,
          reply: previewOnly
            ? `Anteprima: ${result.created} documenti «${result.title}» per ${result.scopeKind}.`
            : `Creati ${result.created} documenti «${result.title}» nel vault.`,
          result,
          actions: result.items.slice(0, 5).map((i) => ({
            type: "preview_document" as const,
            label: `Apri ${i.fullName}`,
            payload: { documentId: i.documentId, userId: i.userId }
          }))
        };
      }
      case "cv_screening": {
        if (!ctx.candidateId?.trim()) {
          return {
            capability,
            reply:
              "Per lo screening CV indica il candidato nel messaggio o fornisci candidateId. Es.: «Screening CV candidato … per posizione …».",
            result: { needsCandidateId: true }
          };
        }
        if (previewOnly) {
          return {
            capability,
            reply: `Anteprima screening CV per candidato ${ctx.candidateId}. Conferma per avviare la valutazione.`,
            result: { candidateId: ctx.candidateId, positionId: ctx.positionId, preview: true }
          };
        }
        const screened = await this.cvScreen.screenCandidateCv(auth, {
          candidateId: ctx.candidateId.trim(),
          positionId: ctx.positionId?.trim()
        });
        return {
          capability,
          reply: `Screening completato: punteggio ${screened.candidateCvScreeningScore}/100. ${screened.screeningSummary.summary}`,
          result: screened,
          actions: [
            {
              type: "view_report",
              label: "Dettaglio screening",
              payload: { candidateId: screened.candidateId, score: screened.candidateCvScreeningScore }
            }
          ]
        };
      }
      case "document_email": {
        if (previewOnly) {
          const preview = await this.previewDocuments(auth, {
            subjectUserIds: ctx.subjectUserIds,
            scopeKind: ctx.scopeKind,
            documentKind: ctx.documentKind,
            titleHint: ctx.message
          });
          const first = preview.items[0];
          return {
            capability,
            reply: first
              ? `Anteprima invio documento a ${first.fullName}. Conferma per generare e notificare.`
              : "Anteprima invio: nessun destinatario nel perimetro.",
            result: { preview, targetUserId: first?.userId, documentKind: ctx.documentKind }
          };
        }
        if (!ctx.documentId?.trim()) {
          const gen = await this.generateDocuments(auth, {
            subjectUserIds: ctx.subjectUserIds,
            scopeKind: ctx.scopeKind,
            documentKind: ctx.documentKind,
            titleHint: ctx.message
          });
          const first = gen.items[0];
          if (!first) {
            throw new BadRequestException("Nessun documento generato per l'invio.");
          }
          const sent = await this.sendDocumentEmail(auth, {
            documentId: first.documentId,
            targetUserId: first.userId,
            subject: gen.title,
            body: ctx.message
          });
          return {
            capability,
            reply: `Documento generato e notifica inviata a ${first.fullName} (${sent.delivery}).`,
            result: { generated: gen, email: sent },
            actions: [
              {
                type: "preview_document",
                label: "Anteprima documento",
                payload: { documentId: first.documentId, userId: first.userId }
              }
            ]
          };
        }
        const targetUserId = ctx.subjectUserIds[0];
        if (!targetUserId) {
          throw new BadRequestException("Cita un destinatario nel messaggio.");
        }
        const sent = await this.sendDocumentEmail(auth, {
          documentId: ctx.documentId.trim(),
          targetUserId,
          subject: "Documento HR Nexa",
          body: ctx.message
        });
        return {
          capability,
          reply: `Notifica documento inviata (${sent.delivery}).`,
          result: sent,
          actions: [
            {
              type: "preview_document",
              label: "Anteprima documento",
              payload: { documentId: sent.documentId, userId: sent.targetUserId }
            }
          ]
        };
      }
      case "reports": {
        const report = await this.generateReport(auth, { ...subjectCtx, message: ctx.message });
        return {
          capability,
          reply: report.summary,
          result: report,
          actions: [{ type: "view_report", label: "Report completo", payload: { reportType: report.reportType } }]
        };
      }
      case "skill_suggestions": {
        const skills = await this.suggestSkills(auth, {
          ...subjectCtx,
          message: ctx.pseudonymizedMessage
        });
        return {
          capability,
          reply: `${skills.suggestions.length} competenze suggerite per ${skills.roleName}.`,
          result: skills,
          actions: [
            {
              type: "apply_skills",
              label: "Vedi competenze",
              payload: { roleId: skills.roleId, userId: skills.userId }
            }
          ]
        };
      }
      case "automation_proposals": {
        if (!previewOnly && storedProposal) {
          const me = await this.store.getUser(auth.userId);
          const companyId = me.companyId || auth.tenantId || "comp-1";
          const activated = await this.activateAutomationsFromProposal(auth, companyId, storedProposal);
          const scopeLabel = ctx.scopeKind === "company" ? "tutta l'azienda" : `${ctx.subjectUserIds.length} persone`;
          return {
            capability,
            reply: `${activated.created} automazioni attivate per ${scopeLabel}.`,
            result: activated
          };
        }
        const proposals = await this.proposeAutomations(auth, {
          subjectUserIds: ctx.subjectUserIds,
          scopeKind: ctx.scopeKind,
          message: ctx.message,
          subjectContext: ctx.subjectContext
        });
        const areaLabel =
          proposals.length > 0
            ? [...new Set(proposals.map((p) => p.workArea))].slice(0, 3).join(", ")
            : "HR";
        const titlePreview = proposals
          .slice(0, 5)
          .map((p) => `• ${p.title}`)
          .join("\n");
        return {
          capability,
          reply:
            proposals.length > 0
              ? `${proposals.length} automazioni HR concrete (${areaLabel}). Anteprima:\n${titlePreview}\n\nConferma in preview HITL per attivarle sul perimetro selezionato.`
              : "Nessuna automazione corrispondente al catalogo per questa richiesta.",
          result: { proposals },
          actions: proposals.slice(0, 3).map((p) => ({
            type: "open_cowork" as const,
            label: p.title,
            payload: { toolId: p.toolId, frequency: p.frequency }
          }))
        };
      }
      default:
        return { capability: "general", reply: "Capability non riconosciuta." };
    }
  }

  async generateContracts(
    auth: AuthContext,
    input: {
      subjectUserIds?: string[];
      scopeKind?: string;
      contractKind: HebbMateContractKind;
      dryRun?: boolean;
      requestSummary?: string;
      force?: boolean;
      scope?: AssistantScopePayload;
    }
  ): Promise<HebbMateContractGenerateResult> {
    await this.assertMateAccess(auth);
    const companyId = auth.tenantId ?? "comp-1";
    const subjectUserIds = input.subjectUserIds?.length
      ? input.subjectUserIds
      : (
          await this.aiHr.resolveAssistantScope(
            { userId: auth.userId, role: auth.role as AuthRole },
            input.scope!
          )
        ).subjectUserIds;
    const scopeKind = input.scopeKind ?? "self";
    if (subjectUserIds.length > 50 && !input.dryRun) {
      throw new BadRequestException("Massimo 50 persone per generazione contratti; usa dryRun o restringi il perimetro.");
    }

    const company = await this.store.getCompanySettings(companyId);
    const [roles, costCenters] = await Promise.all([this.store.listRoles(), this.store.listCostCenters()]);
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const ccById = new Map(costCenters.map((c) => [c.id, c]));
    const policyYear = new Date().getFullYear();

    const result: HebbMateContractGenerateResult = {
      dryRun: Boolean(input.dryRun),
      contractKind: input.contractKind,
      scopeKind,
      subjectCount: subjectUserIds.length,
      created: 0,
      skipped: 0,
      errors: 0,
      items: []
    };

    for (const uid of subjectUserIds) {
      let user: User;
      try {
        user = await this.store.getUser(uid);
      } catch {
        result.errors += 1;
        result.items.push({ userId: uid, fullName: uid, status: "error", detail: "Utente non trovato" });
        continue;
      }

      const cc = user.costCenterId ? ccById.get(user.costCenterId) : undefined;
      const roleTitle = user.roleId ? roleById.get(user.roleId)?.name : undefined;

      try {
        const partyBase =
          input.contractKind === "remote_working"
            ? buildPartyFromUser(user, company, {
                roleTitle,
                costCenterCode: cc?.code,
                costCenterName: cc?.name,
                contractKind: "remote_working",
                maxRemoteDaysPerWeek: DEFAULT_MAX_REMOTE_DAYS_PER_WEEK,
                maxRemoteDaysPerMonth: DEFAULT_MAX_REMOTE_DAYS_PER_MONTH,
                policyVersion: String(policyYear)
              })
            : buildPartyFromUser(user, company, {
                roleTitle,
                costCenterCode: cc?.code,
                costCenterName: cc?.name,
                contractKind: "employment"
              });
        const party: ContractPartyPayload = { ...partyBase, generationSource: "hebb_mate_v1" };

        const blocks =
          input.contractKind === "remote_working"
            ? remoteWorkingBlocksForParty(party)
            : employmentBlocksForParty(party);
        const title =
          input.contractKind === "remote_working"
            ? remoteWorkingContractTitle(user, policyYear)
            : employmentContractTitle(user);

        if (input.dryRun) {
          result.created += 1;
          result.items.push({ userId: uid, fullName: user.fullName, status: "created", detail: "Anteprima dry-run" });
          continue;
        }

        const contract = await this.contracts.create({
          companyId,
          title,
          party: party as unknown as Record<string, unknown>,
          blocks: blocks as unknown[],
          createdByUserId: auth.userId
        });

        const documentId = await this.uploadContractPdf({
          contractId: contract.id,
          party,
          blocks,
          documentTitle: title,
          subtitle: input.contractKind === "remote_working" ? "Accordo smart working" : "Contratto di lavoro",
          userId: uid,
          uploadedBy: auth.userId
        });

        result.created += 1;
        result.items.push({
          userId: uid,
          fullName: user.fullName,
          contractId: contract.id,
          documentId,
          status: "created"
        });
      } catch (e) {
        result.errors += 1;
        result.items.push({
          userId: uid,
          fullName: user.fullName,
          status: "error",
          detail: e instanceof Error ? e.message : String(e)
        });
      }
    }

    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "hebb_mate_contract_generation",
      inputForFingerprint: {
        contractKind: input.contractKind,
        scopeKind,
        created: result.created,
        errors: result.errors,
        dryRun: result.dryRun
      },
      outcome: "ok"
    });

    return result;
  }

  async previewDocuments(
    auth: AuthContext,
    input: {
      subjectUserIds?: string[];
      scopeKind?: string;
      documentKind: HebbMateDocumentKind;
      titleHint?: string;
    }
  ): Promise<HebbMateDocumentGenerateResult> {
    await this.assertMateAccess(auth);
    const title = this.documentTitleForKind(input.documentKind, input.titleHint);
    const items: HebbMateDocumentGenerateResult["items"] = [];
    for (const uid of (input.subjectUserIds ?? []).slice(0, 30)) {
      const user = await this.store.getUser(uid);
      items.push({
        userId: uid,
        fullName: user.fullName,
        documentId: `preview-${uid}`,
        title
      });
    }
    return {
      scopeKind: input.scopeKind ?? "self",
      documentKind: input.documentKind,
      title,
      created: items.length,
      items
    };
  }

  async generateDocuments(
    auth: AuthContext,
    input: {
      subjectUserIds?: string[];
      scopeKind?: string;
      documentKind: HebbMateDocumentKind;
      titleHint?: string;
      scope?: AssistantScopePayload;
    }
  ): Promise<HebbMateDocumentGenerateResult> {
    await this.assertMateAccess(auth);
    if (!(await this.permissions.userHasAll(auth.userId, ["nexa.documents:write"]))) {
      throw new ForbiddenException("Permesso nexa.documents:write richiesto.");
    }

    const subjectUserIds = input.subjectUserIds?.length
      ? input.subjectUserIds
      : (
          await this.aiHr.resolveAssistantScope(
            { userId: auth.userId, role: auth.role as AuthRole },
            input.scope!
          )
        ).subjectUserIds;
    const scopeKind = input.scopeKind ?? "self";
    const company = await this.store.getCompanySettings(auth.tenantId ?? "comp-1");
    const title = this.documentTitleForKind(input.documentKind, input.titleHint);
    const blocks = this.documentBlocksForKind(input.documentKind, company.companyLegalName ?? "Azienda");

    const items: HebbMateDocumentGenerateResult["items"] = [];
    for (const uid of subjectUserIds.slice(0, 30)) {
      const user = await this.store.getUser(uid);
      const personalizedBlocks = blocks.map((b) => ({
        ...b,
        content: b.content
          .replace("{{employeeFullName}}", user.fullName)
          .replace("{{companyLegalName}}", company.companyLegalName ?? "Azienda")
          .replace("{{today}}", new Date().toLocaleDateString("it-IT"))
      }));

      const buffer = await renderSynapseContractPdf({
        documentTitle: title,
        subtitle: "Documento HR",
        metaLines: [`Destinatario: ${user.fullName}`, `Generato: ${new Date().toLocaleString("it-IT")}`],
        blocks: personalizedBlocks.map((b) => ({ title: b.title, content: b.content, key: b.key })),
        footerNote: "Documento generato da Hebb AI Mate · SYNAPSE"
      });

      const uploaded = await this.store.createEmployeeDocument({
        userId: uid,
        uploadedBy: auth.userId,
        kind: input.documentKind === "smartworking_letter" ? "remote_working" : "other",
        title,
        mimeType: "application/pdf",
        bodyBase64: buffer.toString("base64")
      });

      items.push({ userId: uid, fullName: user.fullName, documentId: uploaded.id, title });
    }

    return {
      scopeKind,
      documentKind: input.documentKind,
      title,
      created: items.length,
      items
    };
  }

  async sendDocumentEmail(
    auth: AuthContext,
    input: { documentId: string; targetUserId: string; subject: string; body: string }
  ): Promise<HebbMateDocumentEmailResult> {
    if (!(await this.permissions.userHasAll(auth.userId, ["nexa.documents:write"]))) {
      throw new ForbiddenException("Permesso nexa.documents:write richiesto.");
    }
    const docs = await this.store.listDocumentsForRequester(auth.userId, auth.role, input.targetUserId);
    const doc = docs.find((d) => d.id === input.documentId);
    if (!doc || doc.userId !== input.targetUserId) {
      throw new BadRequestException("Documento non trovato o non appartiene al destinatario.");
    }

    await this.store.notifyUserInApp({
      userId: input.targetUserId,
      title: input.subject.slice(0, 120) || "Nuovo documento HR",
      body: `È disponibile un documento: ${doc.title}. ${input.body.slice(0, 200)}`,
      kind: "hebb_mate_document_delivery",
      actionPath: "/documents"
    });

    const webhookUrl =
      process.env.MATE_DOCUMENT_EMAIL_WEBHOOK_URL?.trim() || process.env.IMPORT_NOTIFY_WEBHOOK_URL?.trim();
    let webhookAttempted = false;
    let webhookOk = false;
    if (webhookUrl) {
      webhookAttempted = true;
      try {
        const target = await this.store.getUser(input.targetUserId);
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "hebb_mate_document_email",
            to: target.email,
            subject: input.subject,
            body: input.body,
            documentId: input.documentId,
            documentTitle: doc.title,
            actorUserId: auth.userId
          })
        });
        webhookOk = res.ok;
      } catch (e) {
        this.log.warn(`Webhook email Mate: ${e instanceof Error ? e.message : e}`);
      }
    }

    return {
      documentId: input.documentId,
      targetUserId: input.targetUserId,
      delivery: webhookOk ? "both" : "in_app",
      webhookAttempted,
      webhookOk
    };
  }

  async generateReport(
    auth: AuthContext,
    input: {
      subjectUserIds?: string[];
      scopeKind?: string;
      message?: string;
      scope?: AssistantScopePayload;
    }
  ): Promise<HebbMateReportResult> {
    await this.assertMateAccess(auth);
    const companyId = auth.tenantId ?? "comp-1";
    const subjectUserIds = input.subjectUserIds?.length
      ? input.subjectUserIds
      : (
          await this.aiHr.resolveAssistantScope(
            { userId: auth.userId, role: auth.role as AuthRole },
            input.scope!
          )
        ).subjectUserIds;
    const scopeKind = input.scopeKind ?? "self";

    const reportType: HebbMateReportResult["reportType"] =
      subjectUserIds.length > 1 ? "team" : "employee";

    let scopeLabel = "Profilo personale";
    if (subjectUserIds.length > 1) {
      scopeLabel = `${subjectUserIds.length} dipendenti citati`;
    } else if (subjectUserIds.length === 1) {
      const u = await this.store.getUser(subjectUserIds[0]!);
      scopeLabel = u.fullName;
    }

    const year = new Date().getFullYear();
    let pendingLeaves = 0;
    let lowLeaveCount = 0;
    let docCount = 0;
    let trainingPending = 0;

    for (const uid of subjectUserIds) {
      try {
        const leaves = await this.store.listLeave(uid);
        pendingLeaves += leaves.filter((l) => l.status === "pending").length;
        const bal = await this.store.getLeaveBalance(uid, year);
        if (bal.residualDays <= 3) lowLeaveCount += 1;
        const docs = await this.store.listDocumentsForRequester(auth.userId, auth.role, uid);
        docCount += docs.length;
      } catch {
        /* skip subject */
      }
    }

    const skillsGap = await this.store.getSkillsGapReport(companyId).catch(() => []);
    const topGaps = skillsGap.slice(0, 5);

    const sections = [
      {
        title: "Organico e perimetro",
        bullets: [
          `${subjectUserIds.length} persone nel perimetro`,
          `Ambito: ${scopeKind}`,
          reportType === "employee" ? "Report individuale" : "Report aggregato"
        ]
      },
      {
        title: "Assenze e ferie",
        bullets: [
          `${pendingLeaves} richieste ferie/permessi in attesa`,
          `${lowLeaveCount} persone con ferie residue ≤ 3 giorni`
        ]
      },
      {
        title: "Documenti e competenze",
        bullets: [
          `${docCount} documenti in vault nel perimetro`,
          topGaps.length
            ? `Top gap competenze: ${topGaps.map((g) => `${g.roleName}/${g.skillName}`).join(", ")}`
            : "Nessun gap competenze rilevato nel catalogo"
        ]
      }
    ];

    const summary = `${scopeLabel}: ${subjectUserIds.length} persone, ${pendingLeaves} approvazioni pendenti, ${docCount} documenti vault.`;

    return {
      reportType,
      scopeLabel,
      generatedAt: new Date().toISOString(),
      summary,
      sections,
      metrics: {
        headcount: subjectUserIds.length,
        pendingLeaves,
        lowLeaveCount,
        documentCount: docCount,
        skillsGapCount: skillsGap.length
      }
    };
  }

  async suggestSkills(
    auth: AuthContext,
    input: {
      subjectUserIds?: string[];
      scopeKind?: string;
      message?: string;
      roleId?: string;
      scope?: AssistantScopePayload;
    }
  ): Promise<HebbMateSkillSuggestResult> {
    await this.assertMateAccess(auth);
    const companyId = auth.tenantId ?? "comp-1";
    const subjectUserIds = input.subjectUserIds?.length
      ? input.subjectUserIds
      : (
          await this.aiHr.resolveAssistantScope(
            { userId: auth.userId, role: auth.role as AuthRole },
            input.scope!
          )
        ).subjectUserIds;

    let roleId = input.roleId?.trim();
    let roleName = "Ruolo generico";
    let userId: string | undefined;

    if (!roleId && subjectUserIds.length === 1) {
      userId = subjectUserIds[0];
      const user = await this.store.getUser(userId);
      roleId = user.roleId ?? undefined;
      if (user.roleId) {
        const roles = await this.store.listRoles();
        roleName = roles.find((r) => r.id === user.roleId)?.name ?? roleName;
      }
    } else if (roleId) {
      const roles = await this.store.listRoles();
      roleName = roles.find((r) => r.id === roleId)?.name ?? roleName;
    }

    const suggestions: HebbMateSkillSuggestion[] = [];
    const gapRows = await this.store.getSkillsGapReport(companyId, roleId ?? null);
    for (const g of gapRows.slice(0, 12)) {
      suggestions.push({
        skillCode: g.skillCode,
        skillName: g.skillName,
        suggestedLevel: g.minLevel,
        reason: `Richiesto livello ${g.minLevel} per ${g.roleName}; media attuale ${g.avgUserLevel.toFixed(1)}`,
        source: "gap_analysis"
      });
    }

    if (roleId && suggestions.length === 0) {
      const sb = this.store.getServiceRoleClient();
      const { data: reqs } = await sb
        .from("hr_role_skill_requirements")
        .select("min_level, skill_id, hr_skills ( code, name )")
        .eq("company_id", companyId)
        .eq("role_id", roleId)
        .limit(15);
      for (const row of reqs ?? []) {
        const sk = (row as { hr_skills?: { code?: string; name?: string } | null }).hr_skills;
        if (!sk) continue;
        suggestions.push({
          skillCode: String(sk.code ?? ""),
          skillName: String(sk.name ?? ""),
          suggestedLevel: Number((row as { min_level?: number }).min_level ?? 3),
          reason: "Da fabbisogno competenze del ruolo",
          source: "role_template"
        });
      }
    }

    if (suggestions.length === 0 && this.openAi.isActive() && input.message?.trim()) {
      const llmSug = await this.llmSkillSuggestions(companyId, auth.userId, roleName, input.message);
      suggestions.push(...llmSug);
    }

    if (suggestions.length === 0) {
      suggestions.push(
        {
          skillCode: "COMM",
          skillName: "Comunicazione efficace",
          suggestedLevel: 3,
          reason: "Competenza trasversale tipica HR",
          source: "role_template"
        },
        {
          skillCode: "COLLAB",
          skillName: "Collaborazione di team",
          suggestedLevel: 3,
          reason: "Competenza trasversale tipica HR",
          source: "role_template"
        }
      );
    }

    return { roleId, roleName, userId, suggestions: suggestions.slice(0, 15) };
  }

  async proposeAutomations(
    auth: AuthContext,
    input: {
      subjectUserIds?: string[];
      scopeKind?: string;
      message?: string;
      workArea?: string;
      subjectContext?: unknown;
      scope?: AssistantScopePayload;
    }
  ): Promise<HebbMateAutomationProposal[]> {
    await this.assertMateAccess(auth);
    const companyWide = input.scopeKind === "company";
    const impact = companyWide
      ? "Automazione per tutti i dipendenti dell'azienda"
      : "Riduce lavoro manuale HR nel perimetro selezionato";

    const fromCatalog = selectAutomationProposalsFromCatalog({
      message: input.message,
      workArea: input.workArea,
      limit: 8
    });

    let proposals: HebbMateAutomationProposal[] = fromCatalog.map((p) => ({
      ...p,
      estimatedImpact: p.estimatedImpact || impact,
      workArea: companyWide && p.workArea !== "all" ? p.workArea : p.workArea
    }));

    if (!proposals.length) {
      proposals = this.fallbackCoworkToolAutomations(input.workArea ?? input.message ?? "", impact, companyWide);
    }

    if (this.openAi.isActive() && input.message?.trim() && proposals.length) {
      const enriched = await this.llmAutomationEnrich(auth, input.message, proposals, input.subjectContext);
      if (enriched.length) {
        return enriched.map((row, i) => ({
          ...proposals[i],
          ...row,
          catalogId: row.catalogId ?? proposals[i]?.catalogId,
          triggerType: row.triggerType ?? proposals[i]?.triggerType,
          actions: row.actions?.length ? row.actions : proposals[i]?.actions
        }));
      }
    }

    return proposals;
  }

  private fallbackCoworkToolAutomations(
    areaHintRaw: string,
    impact: string,
    companyWide: boolean
  ): HebbMateAutomationProposal[] {
    const areaHint = areaHintRaw.toLowerCase();
    const allowedTools = COWORK_TOOL_LIST.filter((t) => t.executable);
    const filtered = allowedTools.filter((t) => {
      if (!areaHint.trim()) return true;
      return (
        t.areaId.includes(areaHint) ||
        t.domain.includes(areaHint) ||
        t.labelIt.toLowerCase().includes(areaHint) ||
        /smart|ferie|document|formaz|payroll|lifecycle|recruit|calendar|timbr|presenz|attendanc/i.test(areaHint)
      );
    });
    const base = (filtered.length ? filtered : allowedTools).slice(0, 6);
    return base.map((tool) => ({
      id: `auto-${tool.id}`,
      title: tool.labelIt,
      description: tool.hintIt,
      workArea: companyWide ? "all" : tool.areaId,
      frequency: this.inferFrequency(tool.id),
      scheduleHint: this.scheduleHintFor(tool.id),
      triggerType: "schedule" as const,
      toolId: tool.id,
      permissions: tool.permissions ?? [],
      estimatedImpact: impact,
      actions: [{ type: "cowork_tool", label: tool.labelIt, toolId: tool.id }]
    }));
  }

  private async llmSkillSuggestions(
    companyId: string,
    userId: string,
    roleName: string,
    message: string
  ): Promise<HebbMateSkillSuggestion[]> {
    const { sessionId } = await this.gateway.beginSession(companyId, userId);
    try {
      const payload = { roleName, message, task: "Suggest 5 typical skills with level 1-5 for this HR role." };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, "ai_field_suggest_v1");
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_field_suggest_v1");
      const raw = refined.ok ? refined.data : pseudo.pseudonymized;
      const parsed = raw as { suggestions?: Array<{ code?: string; name?: string; level?: number; reason?: string }> };
      const list = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
      return list.map((s) => ({
        skillCode: String(s.code ?? "SKILL"),
        skillName: String(s.name ?? "Competenza"),
        suggestedLevel: Number(s.level ?? 3),
        reason: String(s.reason ?? "Suggerimento LLM"),
        source: "llm" as const
      }));
    } catch {
      return [];
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private async llmAutomationEnrich(
    auth: AuthContext,
    message: string,
    seed: HebbMateAutomationProposal[],
    subjectContext?: unknown
  ): Promise<HebbMateAutomationProposal[]> {
    const companyId = auth.tenantId ?? "comp-1";
    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const payload = {
        message,
        subjectContext,
        seedTools: seed.map((s) => s.toolId),
        task: "Rank and refine HR automation proposals"
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, SCHEMA_MATE_AUTOMATION);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_MATE_AUTOMATION);
      const raw = refined.ok ? refined.data : pseudo.pseudonymized;
      const env = raw as { proposals?: HebbMateAutomationProposal[] };
      if (Array.isArray(env.proposals) && env.proposals.length) {
        return env.proposals.slice(0, 10);
      }
    } catch {
      /* fallback seed */
    } finally {
      await this.gateway.endSession(sessionId);
    }
    return seed;
  }

  private async uploadContractPdf(input: {
    contractId: string;
    party: ContractPartyPayload;
    blocks: ContractBlockPayload[];
    documentTitle: string;
    subtitle: string;
    userId: string;
    uploadedBy: string;
  }): Promise<string> {
    const buffer = await renderSynapseContractPdf({
      documentTitle: input.documentTitle,
      subtitle: input.subtitle,
      metaLines: [`Riferimento contratto: ${input.contractId}`],
      blocks: input.blocks.map((b) => ({ title: b.title, content: b.content, key: b.key })),
      footerNote: "Documento generato da Hebb AI Mate · SYNAPSE"
    });
    const uploaded = await this.store.createEmployeeDocument({
      userId: input.userId,
      uploadedBy: input.uploadedBy,
      kind: "contract",
      title: `${input.documentTitle} (PDF)`,
      mimeType: "application/pdf",
      bodyBase64: buffer.toString("base64")
    });
    return uploaded.id;
  }

  private documentTitleForKind(kind: HebbMateDocumentKind, hint?: string): string {
    const fromHint = hint?.trim().slice(0, 80);
    if (fromHint && fromHint.length > 8 && !/genera|crea|document/i.test(fromHint)) {
      return fromHint;
    }
    const map: Record<HebbMateDocumentKind, string> = {
      certificate_attendance: "Attestato di frequenza",
      certificate_training: "Attestato di formazione",
      smartworking_letter: "Lettera accordo smart working",
      employment_letter: "Lettera di assunzione",
      generic: "Documento HR"
    };
    return map[kind];
  }

  private documentBlocksForKind(
    kind: HebbMateDocumentKind,
    companyName: string
  ): ContractBlockPayload[] {
    const intro = `Il presente documento è rilasciato da ${companyName} in data {{today}} a favore di {{employeeFullName}}.`;
    switch (kind) {
      case "certificate_training":
        return [
          { key: "body", title: "Attestato", content: `${intro}\n\nSi certifica la partecipazione al percorso formativo aziendale con esito positivo.` }
        ];
      case "certificate_attendance":
        return [
          { key: "body", title: "Attestato presenze", content: `${intro}\n\nSi certifica la regolare frequenza nel periodo di riferimento secondo le registrazioni HR.` }
        ];
      case "smartworking_letter":
        return [
          {
            key: "body",
            title: "Accordo agile",
            content: `${intro}\n\nCon la presente si comunica l'attivazione dell'accordo di lavoro agile secondo policy aziendale vigente.`
          }
        ];
      case "employment_letter":
        return [
          { key: "body", title: "Lettera assunzione", content: `${intro}\n\nSi conferma l'inizio del rapporto di lavoro subordinato alle condizioni concordate con HR.` }
        ];
      default:
        return [{ key: "body", title: "Documento", content: `${intro}\n\nDocumento generato su richiesta HR tramite Hebb AI Mate.` }];
    }
  }

  private inferFrequency(toolId: string): HebbMateAutomationProposal["frequency"] {
    if (/publish_payslip|payroll|month/i.test(toolId)) return "monthly";
    if (/renew_agreement|year/i.test(toolId)) return "yearly";
    if (/approve_pending|daily/i.test(toolId)) return "daily";
    if (/training|quarter/i.test(toolId)) return "quarterly";
    if (/week|calendar/i.test(toolId)) return "weekly";
    return "on_demand";
  }

  private scheduleHintFor(toolId: string): string {
    const freq = this.inferFrequency(toolId);
    const map: Record<HebbMateAutomationProposal["frequency"], string> = {
      daily: "Ogni giorno lavorativo alle 08:00",
      weekly: "Ogni lunedì alle 09:00",
      monthly: "Primo giorno lavorativo del mese",
      quarterly: "Primo giorno del trimestre",
      yearly: "Gennaio — allineato ciclo policy",
      on_demand: "Su richiesta HR o trigger evento"
    };
    return map[freq];
  }

  private async assertMateAccess(auth: AuthContext): Promise<void> {
    const ok =
      auth.role === "superuser" ||
      (await this.permissions.userHasAll(auth.userId, ["nexa.lifecycle:read"]));
    if (!ok) {
      throw new ForbiddenException("Permesso nexa.lifecycle:read richiesto per Hebb AI Mate.");
    }
  }
}
