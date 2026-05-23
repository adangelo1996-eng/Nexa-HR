import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { User } from "@payday/domain";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { assertHebbUserMessageAllowed } from "../ai-hr/ai-hr-message-policy";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import {
  COWORK_MAX_ROWS,
  COWORK_PLAN_TTL_MS,
  SCHEMA_COWORK_PLAN,
  SCHEMA_COWORK_PLANNER
} from "./cowork.constants";
import { CoworkPlanHydrationService } from "./cowork-plan-hydration.service";
import { CoworkPlannerService } from "./cowork-planner.service";
import { CoworkPlansStore } from "./cowork-plans.store";
import { CoworkExecutorRegistry } from "./executors/cowork-executor.registry";
import type {
  CoworkApplyRequest,
  CoworkApplyResult,
  CoworkClarificationResponse,
  CoworkDomain,
  CoworkPlanDto,
  CoworkPlanRequest,
  CoworkPlanResponse,
  CoworkPlanRow,
  CoworkPlanSection
} from "./cowork.types";

@Injectable()
export class CoworkOrchestratorService {
  constructor(
    private readonly store: HrDataStore,
    private readonly plans: CoworkPlansStore,
    private readonly audit: AiAuditService,
    private readonly executors: CoworkExecutorRegistry,
    private readonly hydration: CoworkPlanHydrationService,
    private readonly planner: CoworkPlannerService
  ) {}

  async plan(auth: AuthContext, body: CoworkPlanRequest): Promise<CoworkPlanResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || auth.tenantId || "comp-1";
    const message = body.message?.trim();
    if (!message) {
      throw new BadRequestException("Messaggio richiesto");
    }

    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === companyId);
    assertHebbUserMessageAllowed(message, companyUsers);

    const regexDomains = this.classifyDomains(message);
    const scopeUsers = this.hydration.filterScopeUsers(companyUsers, body.costCenterId, body.teamId);
    if (scopeUsers.length === 0) {
      throw new BadRequestException("Nessun dipendente nel perimetro selezionato");
    }

    let interpret = this.planner.regexFallbackInterpret(regexDomains, scopeUsers.length, message, false, 0);

    if (this.planner.isLlmAvailable()) {
      interpret = await this.planner.interpret({
        companyId,
        actorUserId: auth.userId,
        message,
        scopeUsers,
        costCenterId: body.costCenterId,
        teamId: body.teamId,
        conversationHistory: body.conversationHistory,
        regexDomains
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

    const rowsByDomain = new Map<CoworkDomain, CoworkPlanRow[]>();
    for (const spec of interpret.sections) {
      if (spec.domain === "training" || spec.domain === "unknown") {
        continue;
      }
      const built = await this.hydration.buildRows(spec.domain, companyId, scopeUsers, message);
      rowsByDomain.set(spec.domain, built);
    }

    const { sections, rows } = this.hydration.buildSectionsFromSpecs(interpret.sections, rowsByDomain);
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

    for (const row of stored.rows) {
      if (!selected.has(row.id)) {
        nextRows.push(row);
        continue;
      }
      if (row.status === "applied") {
        nextRows.push(row);
        continue;
      }
      const rowDomain = row.domain ?? stored.domain;
      const result = await this.executors.executeRow(ctx, rowDomain, row);
      nextRows.push(result);
    }

    const appliedCount = nextRows.filter((r) => selected.has(r.id) && r.status === "applied").length;
    const errorCount = nextRows.filter((r) => selected.has(r.id) && r.status === "error").length;
    const allSelectedDone = nextRows
      .filter((r) => selected.has(r.id))
      .every((r) => r.status === "applied" || r.status === "skipped");

    const status = allSelectedDone && errorCount === 0 ? "applied" : "partial";
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
      rows: nextRows,
      sections,
      appliedCount,
      errorCount
    };
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
    const requests = /\brichiest|estend|period|approv|remot|endday\b/.test(m);
    const contracts = /\bcontratt|clausol|firm|ccnl\b/.test(m);
    const training = /\bformazion|cors|training\b/.test(m);

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
    if (domains.length === 0) {
      return ["unknown"];
    }
    return domains;
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
