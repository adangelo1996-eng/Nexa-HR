import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { User } from "@payday/domain";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import type { PersonDirectoryEntry } from "../ai-privacy/pseudonymize-free-text";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import {
  COWORK_MAX_ROWS,
  COWORK_PLAN_TTL_MS,
  SCHEMA_COWORK_PLAN,
  SCHEMA_COWORK_PLANNER
} from "./cowork.constants";
import { getCoworkTool } from "./cowork-tool-catalog";
import { CoworkPlanHydrationService } from "./cowork-plan-hydration.service";
import { CoworkPermissionsService } from "./cowork-permissions.service";
import { CoworkPlannerService } from "./cowork-planner.service";
import { CoworkApplyLogStore } from "./cowork-apply-log.store";
import {
  buildCoworkHistoryBatchCategories,
  coworkHistoryCategoryKey,
  coworkHistoryCategoryLabel,
  groupCoworkHistoryBatchesByMonth,
  paginateCoworkHistoryMonths
} from "./cowork-history.util";
import { CoworkPlansStore } from "./cowork-plans.store";
import { CoworkRequestsStore } from "./cowork-requests.store";
import { CoworkUndoService, type CoworkUndoResult } from "./cowork-undo.service";
import { CoworkExecutorRegistry } from "./executors/cowork-executor.registry";
import type {
  CoworkApplyRequest,
  CoworkApplyResult,
  CoworkCancelRequest,
  CoworkClarificationResponse,
  CoworkDomain,
  CoworkHistoryQuery,
  CoworkHistoryBatch,
  CoworkHistoryResult,
  CoworkPlanDto,
  CoworkPlanRequest,
  CoworkPlanResponse,
  CoworkPlanRow,
  CoworkPlanSection,
  CoworkBulkUndoRequest,
  CoworkBulkUndoResult,
  CoworkUndoRequest
} from "./cowork.types";

@Injectable()
export class CoworkOrchestratorService {
  constructor(
    private readonly store: HrDataStore,
    private readonly plans: CoworkPlansStore,
    private readonly audit: AiAuditService,
    private readonly executors: CoworkExecutorRegistry,
    private readonly hydration: CoworkPlanHydrationService,
    private readonly planner: CoworkPlannerService,
    private readonly coworkPermissions: CoworkPermissionsService,
    private readonly applyLog: CoworkApplyLogStore,
    private readonly coworkRequests: CoworkRequestsStore,
    private readonly undoService: CoworkUndoService
  ) {}

  async plan(auth: AuthContext, body: CoworkPlanRequest): Promise<CoworkPlanResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || auth.tenantId || "comp-1";
    const message = body.message?.trim();
    if (!message) {
      throw new BadRequestException("Messaggio richiesto");
    }

    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === companyId);
    const personDirectory: PersonDirectoryEntry[] = companyUsers.map((u) => ({
      fullName: u.fullName,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email
    }));

    const draftRequest = await this.coworkRequests.upsertDraft({
      companyId,
      actorUserId: auth.userId,
      message,
      conversationHistory: body.conversationHistory,
      costCenterId: body.costCenterId,
      teamId: body.teamId
    });

    const regexDomains = this.classifyDomains(message);
    const regexToolHints = this.classifyToolHints(message);
    const scopeUsers = this.hydration.filterScopeUsers(companyUsers, body.costCenterId, body.teamId);
    if (scopeUsers.length === 0) {
      throw new BadRequestException("Nessun dipendente nel perimetro selezionato");
    }

    const allowedTools = await this.coworkPermissions.filterToolsForActor(auth);
    let interpret = this.planner.regexFallbackInterpret(
      regexDomains,
      regexToolHints,
      allowedTools,
      scopeUsers.length,
      message,
      false,
      0
    );

    if (this.planner.isLlmAvailable()) {
      interpret = await this.planner.interpret({
        auth,
        companyId,
        actorUserId: auth.userId,
        message,
        personDirectory,
        scopeUsers,
        costCenterId: body.costCenterId,
        teamId: body.teamId,
        conversationHistory: body.conversationHistory,
        regexDomains,
        regexToolHints
      });
    }

    if (interpret.kind === "clarification") {
      const clarification: CoworkClarificationResponse = {
        kind: "clarification",
        message: interpret.message,
        suggestions: interpret.suggestions,
        confidence: interpret.confidence
      };

      await this.audit.append({
        companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "cowork_plan",
        schemaVersion: SCHEMA_COWORK_PLANNER,
        inputForFingerprint: { message, outcome: "clarification", scopeCount: scopeUsers.length },
        dataSources: ["cowork_planner"],
        outcome: "ok"
      });

      return clarification;
    }

    const rowsByTool = new Map<string, CoworkPlanRow[]>();
    for (const spec of interpret.sections) {
      const toolMeta = getCoworkTool(spec.tool);
      if (!toolMeta?.executable) {
        continue;
      }
      const built = await this.hydration.buildRowsForTool(
        spec.tool,
        companyId,
        scopeUsers,
        message,
        auth.userId,
        me.fullName
      );
      rowsByTool.set(spec.tool, built);
    }

    const { sections, rows } = this.hydration.buildSectionsFromSpecs(interpret.sections, rowsByTool);
    const cappedRows = rows.slice(0, COWORK_MAX_ROWS);
    const cappedSections = this.capSectionsToRows(sections, cappedRows);

    if (cappedRows.length === 0) {
      return {
        kind: "clarification",
        message:
          "Nel perimetro selezionato non ci sono operazioni da proporre (es. nessuna richiesta approvata da estendere). Verifica filtri o riformula la richiesta.",
        suggestions: interpret.sections.map((s) => s.title),
        confidence: 0.5
      };
    }

    const domain = this.hydration.primaryDomainFromSections(cappedSections);
    const schemaVersion = interpret.llmApplied ? SCHEMA_COWORK_PLANNER : SCHEMA_COWORK_PLAN;

    const saved = await this.plans.save({
      planId: randomUUID(),
      companyId,
      actorUserId: auth.userId,
      domain,
      summary: interpret.summary,
      sections: cappedSections,
      rows: cappedRows,
      llmApplied: interpret.llmApplied,
      privacy: { pseudonymizedTokenCount: interpret.tokenCount, schemaVersion }
    });

    await this.coworkRequests.markPlanned(draftRequest.id, companyId, saved.planId);

    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "cowork_plan",
      schemaVersion,
      inputForFingerprint: {
        message,
        domain,
        sectionCount: cappedSections.length,
        scopeCount: scopeUsers.length
      },
      dataSources: ["cowork_planner", ...cappedSections.map((s) => s.domain)],
      outcome: "ok"
    });

    return saved;
  }

  async getPlan(auth: AuthContext, planId: string): Promise<CoworkPlanDto> {
    const me = await this.store.getUser(auth.userId);
    const stored = await this.plans.get(planId, me.companyId);
    if (stored.status === "expired") {
      throw new BadRequestException("Piano scaduto: genera un nuovo piano");
    }
    return this.plans.toDto(stored);
  }

  async apply(auth: AuthContext, body: CoworkApplyRequest): Promise<CoworkApplyResult> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId;
    const stored = await this.plans.get(body.planId, companyId);

    if (stored.status === "expired") {
      throw new BadRequestException("Piano scaduto");
    }
    if (stored.status === "applied") {
      throw new BadRequestException("Piano già applicato completamente");
    }

    const selected = new Set(body.selectedRowIds ?? []);
    if (selected.size === 0) {
      throw new BadRequestException("Seleziona almeno una riga");
    }

    const ctx = { auth, companyId };
    const nextRows: CoworkPlanRow[] = [];
    const batchId = randomUUID();
    const logIds: string[] = [];

    for (const row of stored.rows) {
      if (!selected.has(row.id)) {
        nextRows.push(row);
        continue;
      }
      if (row.status === "applied") {
        nextRows.push(row);
        continue;
      }
      const toolMeta = getCoworkTool(row.toolId);
      if (toolMeta && !(await this.coworkPermissions.actorCanUseTool(auth, toolMeta))) {
        nextRows.push({
          ...row,
          status: "error",
          errorMessage: "Permesso insufficiente per questa operazione"
        });
        continue;
      }
      const rowDomain = row.domain ?? stored.domain;
      const result = await this.executors.executeRow(ctx, rowDomain, row);
      nextRows.push(result);
      if (result.status === "applied") {
        const logged = await this.persistApplyLog({
          companyId,
          planId: body.planId,
          batchId,
          actorUserId: auth.userId,
          row: result,
          planSummary: stored.summary,
          sectionMeta: stored.sectionMeta
        });
        logIds.push(logged.id);
      }
    }

    const appliedCount = nextRows.filter((r) => selected.has(r.id) && r.status === "applied").length;
    const errorCount = nextRows.filter((r) => selected.has(r.id) && r.status === "error").length;
    const allSelectedDone = nextRows
      .filter((r) => selected.has(r.id))
      .every((r) => r.status === "applied" || r.status === "skipped");

    const status = allSelectedDone && errorCount === 0 ? "applied" : "partial";
    if (status === "applied") {
      await this.coworkRequests.markAppliedByPlanId(body.planId, companyId);
    }
    const updated = await this.plans.updateRows(
      body.planId,
      companyId,
      nextRows,
      status,
      appliedCount > 0 ? new Date().toISOString() : stored.appliedAt,
      stored.sectionMeta
    );

    const sections = this.hydration.groupRowsIntoSections(nextRows, stored.sectionMeta);

    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "cowork_apply",
      inputForFingerprint: { planId: body.planId, selectedCount: selected.size },
      outcome: errorCount > 0 ? "partial" : "ok"
    });

    return {
      planId: updated.planId,
      batchId,
      rows: nextRows,
      sections,
      appliedCount,
      errorCount,
      logIds
    };
  }

  async history(auth: AuthContext, query: CoworkHistoryQuery = {}): Promise<CoworkHistoryResult> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId;
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 12, 1), 24);
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const { items, total } = await this.applyLog.listSince(companyId, fromIso, {
      limit: 500,
      offset: 0
    });

    const batchMap = new Map<
      string,
      {
        planId: string;
        batchId: string;
        appliedAt: string;
        entries: typeof items;
      }
    >();
    for (const entry of items) {
      const key = `${entry.planId}:${entry.batchId}`;
      const cur = batchMap.get(key);
      if (!cur) {
        batchMap.set(key, {
          planId: entry.planId,
          batchId: entry.batchId,
          appliedAt: entry.appliedAt,
          entries: [entry]
        });
      } else {
        cur.entries.push(entry);
        if (entry.appliedAt > cur.appliedAt) {
          cur.appliedAt = entry.appliedAt;
        }
      }
    }

    const planCache = new Map<string, { summary: string; domain: CoworkDomain; sectionMeta: StoredPlan["sectionMeta"] }>();
    type StoredPlan = Awaited<ReturnType<CoworkPlansStore["get"]>>;

    const allBatchesSorted = [...batchMap.values()].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));

    const resultBatches: CoworkHistoryBatch[] = [];
    for (const batch of allBatchesSorted) {
      let planMeta = planCache.get(batch.planId);
      if (!planMeta) {
        try {
          const plan = await this.plans.get(batch.planId, companyId);
          planMeta = { summary: plan.summary, domain: plan.domain, sectionMeta: plan.sectionMeta };
        } catch {
          planMeta = {
            summary: batch.entries[0]?.detail ?? "Cowork",
            domain: batch.entries[0]?.domain ?? "unknown",
            sectionMeta: []
          };
        }
        planCache.set(batch.planId, planMeta);
      }

      const sectionCounts = new Map<string, CoworkHistoryBatch["sections"][0]>();
      for (const entry of batch.entries) {
        const sectionId = String(entry.appliedPayload.sectionId ?? entry.rowId);
        const meta = planMeta.sectionMeta.find((s) => s.sectionId === sectionId);
        const existing = sectionCounts.get(sectionId);
        if (existing) {
          existing.appliedCount += 1;
        } else {
          sectionCounts.set(sectionId, {
            sectionId,
            domain: entry.domain,
            toolId: entry.toolId,
            title: meta?.title ?? entry.toolId,
            appliedCount: 1
          });
        }
      }

      const entries = batch.entries.map((e) => {
        const sectionId = String(e.appliedPayload.sectionId ?? e.rowId);
        const meta = planMeta.sectionMeta.find((s) => s.sectionId === sectionId);
        const categoryKey = coworkHistoryCategoryKey(e.domain, e.toolId);
        const categoryLabel = coworkHistoryCategoryLabel(
          e.domain,
          e.toolId,
          meta?.title
        );
        return {
          logId: e.id,
          rowId: e.rowId,
          toolId: e.toolId,
          domain: e.domain,
          categoryKey,
          categoryLabel,
          subjectFullName: e.subjectFullName,
          detail: e.detail,
          undoStatus: e.undoStatus,
          undoBlockedReason: e.undoBlockedReason
        };
      });

      const historyBatch: CoworkHistoryBatch = {
        planId: batch.planId,
        batchId: batch.batchId,
        summary: planMeta.summary,
        domain: planMeta.domain,
        actorUserId: batch.entries[0]?.actorUserId ?? auth.userId,
        appliedAt: batch.appliedAt,
        sections: [...sectionCounts.values()],
        entries,
        categories: []
      };
      historyBatch.categories = buildCoworkHistoryBatchCategories(historyBatch);

      resultBatches.push(historyBatch);
    }

    const totalBatches = batchMap.size;
    const grouped = groupCoworkHistoryBatchesByMonth(resultBatches);
    const { months, totalMonths } = paginateCoworkHistoryMonths(grouped, page, pageSize);

    return {
      from: fromIso,
      to: toIso,
      page,
      pageSize,
      totalMonths,
      totalBatches,
      months
    };
  }

  async undo(auth: AuthContext, body: CoworkUndoRequest): Promise<CoworkUndoResult> {
    return this.undoService.undo(auth, body);
  }

  async undoBulk(auth: AuthContext, body: CoworkBulkUndoRequest): Promise<CoworkBulkUndoResult> {
    return this.undoService.undoBulk(auth, body);
  }

  async cancel(auth: AuthContext, body: CoworkCancelRequest): Promise<CoworkPlanDto> {
    const me = await this.store.getUser(auth.userId);
    const cancelled = await this.plans.cancelPlan(body.planId, me.companyId);
    await this.coworkRequests.markCancelledByPlanId(body.planId, me.companyId, auth.userId);
    await this.audit.append({
      companyId: me.companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "cowork_cancel",
      inputForFingerprint: { planId: body.planId },
      outcome: "ok"
    });
    return cancelled;
  }

  private async persistApplyLog(input: {
    companyId: string;
    planId: string;
    batchId: string;
    actorUserId: string;
    row: CoworkPlanRow;
    planSummary: string;
    sectionMeta: Array<{ sectionId: string; domain: CoworkDomain; toolId?: string; title: string }>;
  }) {
    const undoMeta = this.undoService.buildLogUndoMeta(input.row.toolId);
    const entity = this.resolveEntityFromRow(input.row);
    return this.applyLog.append({
      companyId: input.companyId,
      planId: input.planId,
      batchId: input.batchId,
      rowId: input.row.id,
      actorUserId: input.actorUserId,
      toolId: input.row.toolId,
      domain: input.row.domain,
      subjectUserId: input.row.userId || null,
      subjectFullName: input.row.fullName,
      entityType: entity.type,
      entityId: entity.id,
      previousState: entity.previousState,
      appliedPayload: {
        ...input.row.payload,
        sectionId: input.row.sectionId,
        planSummary: input.planSummary
      },
      detail: input.row.detail,
      undoStatus: undoMeta.undoStatus,
      undoBlockedReason: undoMeta.undoBlockedReason
    });
  }

  private resolveEntityFromRow(row: CoworkPlanRow): {
    type: string | null;
    id: string | null;
    previousState: Record<string, unknown> | null;
  } {
    const p = row.payload;
    const previousState =
      p._coworkPreviousState && typeof p._coworkPreviousState === "object"
        ? (p._coworkPreviousState as Record<string, unknown>)
        : p.previousState && typeof p.previousState === "object"
          ? (p.previousState as Record<string, unknown>)
          : null;

    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (p[k] != null && String(p[k]).trim()) {
          return String(p[k]);
        }
      }
      return null;
    };

    switch (row.toolId) {
      case "create_leave_plan":
        return { type: "leave_plan", id: pick("leaveId"), previousState };
      case "create_smartworking_request":
        return { type: "smartworking_request", id: pick("requestId"), previousState };
      case "create_travel_request":
        return { type: "travel_request", id: pick("travelId", "requestId"), previousState };
      case "create_sickness_report":
        return { type: "sickness_event", id: pick("sicknessId"), previousState };
      case "create_meeting_room_booking":
        return { type: "meeting_room_booking", id: pick("bookingId"), previousState };
      case "approve_pending_leaves":
        return { type: "leave_plan", id: pick("leaveId"), previousState };
      case "approve_pending_smartworking":
        return { type: "smartworking_request", id: pick("requestId"), previousState };
      case "extend_approved_requests":
        return { type: "smartworking_request", id: pick("requestId"), previousState };
      case "create_shift_batch":
        return { type: "shift", id: pick("shiftId"), previousState };
      case "create_expense_claim":
        return { type: "expense_claim", id: pick("claimId"), previousState };
      case "approve_pending_expenses":
        return { type: "expense_claim", id: pick("claimId"), previousState };
      case "update_contract_sw_clause":
        return { type: "hr_contract", id: pick("contractId"), previousState };
      default:
        return { type: row.toolId || null, id: pick("entityId"), previousState };
    }
  }

  /** Retrocompat: singolo dominio con priorità accordi > richieste > contratti. */
  classifyDomain(message: string): CoworkDomain {
    const domains = this.classifyDomains(message);
    const executable = domains.find(
      (d) =>
        d === "smartworking_agreements" ||
        d === "smartworking_requests" ||
        d === "employment_contracts"
    );
    if (executable) {
      return executable;
    }
    if (domains.includes("training")) {
      return "training";
    }
    return domains[0] ?? "unknown";
  }

  /** Tutti i domini riconosciuti nel messaggio (multi-sezione). */
  classifyDomains(message: string): CoworkDomain[] {
    const m = message.toLowerCase();
    const domains: CoworkDomain[] = [];
    const agreement = /\baccord|policy|polic|annuale\b/.test(m);
    const requests = /\brichiest|estend|period|remot|endday\b/.test(m) && !/\bapprov.*ferie\b/.test(m);
    const contracts = /\bcontratt|clausol|firm|ccnl\b/.test(m);
    const training = /\bformazion|cors|training\b/.test(m);
    const calendar = /\bcalend|agenda|evento|sala|riunion|prenot|turno\b/.test(m);
    const timeOff =
      /\bferie|permess|rol|malatt|assenz|trasfert\b/.test(m) ||
      (/\bapprov\b/.test(m) && /\bferie|smart|remote|spes\b/.test(m));
    const lifecycle = /\boffboard|uscita|dimission\b/.test(m);
    const compensation = /\bcedolin|payroll|stipend|pubblica.*busta\b/.test(m);
    const generic = /\bspes|rimborso|innovation|pipeline ai\b/.test(m);

    if (agreement) {
      domains.push("smartworking_agreements");
    }
    if (requests) {
      domains.push("smartworking_requests");
    }
    if (contracts) {
      domains.push("employment_contracts");
    }
    if (training) {
      domains.push("training");
    }
    if (calendar) {
      domains.push("calendar");
    }
    if (timeOff) {
      domains.push("time_off");
    }
    if (lifecycle) {
      domains.push("lifecycle");
    }
    if (compensation) {
      domains.push("compensation");
    }
    if (/\bpayroll|cedolin|busta paga\b/.test(m)) {
      domains.push("payroll");
    }
    if (/\bbudget personale|personnel budget\b/.test(m)) {
      domains.push("personnel_budget");
    }
    if (/\brecruit|linkedin|selezione|candidat\b/.test(m)) {
      domains.push("recruiting");
    }
    if (/\bpolicy aziendal|corporate polic\b/.test(m)) {
      domains.push("corporate_policies");
    }
    if (/\blicenz|license|power bi|chatgpt\b/.test(m)) {
      domains.push("third_party_licenses");
    }
    if (/\bexport anagraf|import dipendent|admin export\b/.test(m)) {
      domains.push("admin");
    }
    if (generic) {
      domains.push("generic");
    }
    if (domains.length === 0) {
      return ["unknown"];
    }
    return domains;
  }

  /** Tool hint da keyword (prima del planner LLM). */
  classifyToolHints(message: string): string[] {
    const m = message.toLowerCase();
    const hints: string[] = [];
    const push = (id: string) => {
      if (!hints.includes(id)) {
        hints.push(id);
      }
    };

    if (/\bprenot|sala|riunion|evento calend|inserisc.*calend|agenda\b/.test(m)) {
      push("create_meeting_room_booking");
    }
    if (/\bannulla.*prenot|cancel.*booking\b/.test(m)) {
      push("cancel_meeting_room_booking");
    }
    if (/\bferie|permess|rol\b/.test(m) && !/\bapprov\b/.test(m)) {
      push("create_leave_plan");
    }
    if (/\bremote|smart\s*work|lavoro da casa\b/.test(m) && !/\baccord|estend|approv\b/.test(m)) {
      push("create_smartworking_request");
    }
    if (/\btrasfert/.test(m)) {
      push("create_travel_request");
    }
    if (/\bmalatt/.test(m)) {
      push("create_sickness_report");
    }
    if (/\bapprov.*ferie|\bferie.*approv/.test(m)) {
      push("approve_pending_leaves");
    }
    if (/\bapprov.*(smart|remote)|\b(smart|remote).*approv/.test(m)) {
      push("approve_pending_smartworking");
    }
    if (/\baccord|rinnov.*smart|policy.*smart/.test(m)) {
      push("renew_agreements");
    }
    if (/\bestend.*richiest|richiest.*approv.*fine/.test(m)) {
      push("extend_approved_requests");
    }
    if (/\bcontratt|clausol.*smart|ccnl/.test(m)) {
      push("update_contract_sw_clause");
    }
    if (/\bturno|shift\b/.test(m)) {
      push("create_shift_batch");
    }
    if (/\boffboard|uscita|dimission/.test(m)) {
      push("start_offboarding");
    }
    if (/\bmonte ferie|allowance|giorni ferie/.test(m)) {
      push("update_leave_allowance");
    }
    if (/\bpubblica.*cedolin|cedolin.*periodo|payroll.*pubblic/.test(m)) {
      push("publish_payslips_period");
    }
    if (/\bgenera.*cedolin|batch.*cedolin|cedolin.*batch\b/.test(m)) {
      push("payroll_batch_generate");
    }
    if (/\bbenchmark.*ral|stima.*ral|ral.*stima\b/.test(m)) {
      push("compensation_benchmark_estimate");
    }
    if (/\bbudget personale|budget ral\b/.test(m)) {
      push("personnel_budget_adjust");
    }
    if (/\blinkedin|sync.*recruit\b/.test(m)) {
      push("recruiting_linkedin_sync");
    }
    if (/\bpolicy aziendal|comunica.*policy\b/.test(m)) {
      push("corporate_policy_publish");
    }
    if (/\bexport.*anagraf|anteprima export\b/.test(m)) {
      push("export_employees_preview");
    }
    if (/\bassegna.*licenz|licenz.*software\b/.test(m)) {
      push("third_party_license_assign");
    }
    if (/\bnota spes|spesa|rimbors/.test(m) && !/\bapprov/.test(m)) {
      push("create_expense_claim");
    }
    if (/\bapprov.*spes/.test(m)) {
      push("approve_pending_expenses");
    }
    if (/\binnovation|pipeline ai|job ai\b/.test(m)) {
      push("create_innovation_job");
    }
    if (/\bformazion|cors/.test(m)) {
      push("training_batch");
      if (/\bsingol|un corso|iscri/.test(m)) {
        push("assign_training_course");
      }
    }
    if (/\bonboard.*candidat|candidat.*onboard/.test(m)) {
      push("start_onboarding_from_candidate");
    }
    if (/\bpromemoria.*onboard|onboard.*promemoria|wizard.*onboard/.test(m)) {
      push("onboarding_wizard_reminder");
    }
    if (/\bdocument|vault|allegat/.test(m) && /\bcaric|registr|upload/.test(m)) {
      push("upload_employee_document");
    }
    if (/\bdocument|vault/.test(m) && /\bpromemoria|lettura|ack/.test(m)) {
      push("link_document_ack");
    }
    if (/\bexport.*calendario|calendario.*team|vista calendario\b/.test(m)) {
      push("sync_team_calendar_view");
    }
    if (/\btimbratur|presenz|qr.*batch|batch.*timbr/.test(m)) {
      push("attendance_qr_batch");
    }
    if (/\bpolicy aziendal|corporate policy|comunica.*policy/.test(m)) {
      push("corporate_policy_publish");
    }

    return hints;
  }

  private capSectionsToRows(sections: CoworkPlanSection[], cappedRows: CoworkPlanRow[]): CoworkPlanSection[] {
    const rowIds = new Set(cappedRows.map((r) => r.id));
    return sections
      .map((sec) => ({
        ...sec,
        rows: sec.rows.filter((r) => rowIds.has(r.id))
      }))
      .filter((sec) => sec.rows.length > 0);
  }
}

export { COWORK_PLAN_TTL_MS, ForbiddenException };
