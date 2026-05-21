import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFileSync } from "fs";
import { join } from "path";
import type { AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { AiAuditService } from "./ai-audit.service";
import {
  AI_HR_ROUTE_HINTS,
  getNexaHrConversationalAgentSystemPrompt,
  NEXA_HR_AGENT_ID,
  NEXA_HR_AGENT_VERSION,
  NEXA_HR_PLATFORM_NAV
} from "./ai-hr-agent";
import { assertHebbUserMessageAllowed } from "./ai-hr-message-policy";
import { AiHrService, type AssistantScopePayload } from "./ai-hr.service";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";
import {
  applyHebbPageContextToRecord,
  normalizeHebbPageContext,
  type HebbPageContext,
  type HebbPageContextDto
} from "./hebb-page-context";
import {
  parsePlatformAgentStructured,
  structuredToPlainReply,
  tryParseStructuredFromText,
  type PlatformAgentStructured
} from "./platform-agent-structured";

const SCHEMA_PLATFORM_AGENT = "ai_platform_agent_v1";

export type PlatformAgentTurn = { role: "user" | "assistant"; content: string };
export type { PlatformAgentStructured } from "./platform-agent-structured";

export type MultiSourceArea = "Presenze" | "Budget" | "Formazione" | "Approvazioni";

export type MultiSourceDomainFact = {
  area: MultiSourceArea;
  available: boolean;
  summary: Record<string, unknown>;
};

export type MultiSourceFactsEnvelope = {
  generatedAt: string;
  mode: "lite" | "expanded";
  domains: MultiSourceDomainFact[];
};

type BudgetVarianceBand = "within" | "warning" | "critical" | "unknown";

function budgetVarianceBand(pct: number | null): BudgetVarianceBand {
  if (pct == null || !Number.isFinite(pct)) {
    return "unknown";
  }
  const abs = Math.abs(pct);
  if (abs < 5) {
    return "within";
  }
  if (abs < 10) {
    return "warning";
  }
  return "critical";
}

export function isDeepenRequest(message: string, deepenFlag?: boolean): boolean {
  if (deepenFlag === true) {
    return true;
  }
  return /approfondisci|approfondimento|più dettagli|piu dettagli|espandi|dimmi di più|dimmi di piu|vai più a fondo|vai piu a fondo/i.test(
    message.trim()
  );
}

export function isBroadCrossDomainQuestion(message: string): boolean {
  const m = message.toLowerCase();
  const domainPatterns = [
    /presenz|timbratur|straordinari|assenz|smart\s*working/i,
    /budget|costi|economico|varianza|forecast/i,
    /formazion|corsi|training|obblig/i,
    /approv|ferie|permess|workflow|in sospeso/i,
    /turnover|retention|analytics|panoramica|complessiv|incrocia|confronta|collega/i
  ];
  const hits = domainPatterns.filter((re) => re.test(m)).length;
  if (hits >= 2) {
    return true;
  }
  return /\b(cosa devo|cosa fare oggi|priorit|urgent|urgenz|situazione generale|quadro d'insieme|overview|360)\b/i.test(
    m
  );
}

@Injectable()
export class NexaPlatformAgentService implements OnModuleInit {
  private readonly logger = new Logger(NexaPlatformAgentService.name);
  private knowledgeMd = "";

  constructor(
    private readonly aiHr: AiHrService,
    private readonly store: HrDataStore,
    private readonly gateway: AiPrivacyGateway,
    private readonly audit: AiAuditService,
    private readonly permissions: PermissionsService,
    private readonly openAi: AiOpenAiRefinementService
  ) {}

  onModuleInit(): void {
    const candidates = [
      join(process.cwd(), "docs", "nexa-agent-knowledge.md"),
      join(process.cwd(), "..", "..", "docs", "nexa-agent-knowledge.md")
    ];
    for (const p of candidates) {
      try {
        this.knowledgeMd = readFileSync(p, "utf8").trim();
        this.logger.log(`Nexa Guide knowledge loaded (${this.knowledgeMd.length} chars) from ${p}`);
        return;
      } catch {
        /* try next */
      }
    }
    this.logger.warn("Nexa Guide knowledge file not found; agent uses nav catalog only.");
  }

  /** Aggregati read-only da più domini (senza PII) per sintesi cross-source. */
  async buildMultiSourceFacts(
    auth: { userId: string; role: AuthRole },
    companyId: string,
    scope: AssistantScopePayload | undefined,
    pageContext: HebbPageContext | null,
    options?: { expand?: boolean }
  ): Promise<{ facts: MultiSourceFactsEnvelope; sources: string[] }> {
    void scope;
    const cid = (companyId || pageContext?.companyId || "").trim();
    const expand = options?.expand === true;
    const sources: string[] = [];
    const domains: MultiSourceDomainFact[] = [];
    const now = new Date();

    const [canReportsHr, canAttendance, canApprovals, canBudget] = await Promise.all([
      this.permissions.userHasAll(auth.userId, ["nexa.reports_hr:read"]),
      this.permissions.userHasAll(auth.userId, ["nexa.attendance:read"]),
      this.permissions.userHasAll(auth.userId, ["nexa.approvals:read"]),
      this.permissions.userHasAll(auth.userId, ["nexa.personnel_budget:read"])
    ]);
    const me = await this.store.getUser(auth.userId);
    const hrExtended = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email ?? "");
    const includeBudget = canBudget || hrExtended || (canReportsHr && auth.role === "superuser");

    if ((canReportsHr || canAttendance) && cid) {
      try {
        const agg = await this.store.getProductivityAbsenteeismAggregate(cid);
        sources.push("attendance_aggregate");
        const summary: Record<string, unknown> = {
          headcount: agg.headcount,
          overtimeHoursMonth: agg.overtimeHoursMonth,
          absenceDaysMonth: agg.absenceDaysMonth,
          smartworkingDaysMonth: agg.smartworkingDaysMonth,
          avgMinutesWorkedPerDay: agg.avgMinutesWorkedPerDay
        };
        if (expand) {
          summary.topCostCentersByAbsence = [...agg.byCostCenter]
            .sort((a, b) => b.absenceDays - a.absenceDays)
            .slice(0, 3)
            .map((c) => ({ label: c.label, absenceDays: c.absenceDays, headcount: c.headcount }));
          summary.topCostCentersByOvertimeHint = agg.note;
        }
        domains.push({ area: "Presenze", available: true, summary });
      } catch (e) {
        this.logger.warn(`multi-source presenze: ${e instanceof Error ? e.message : String(e)}`);
        domains.push({ area: "Presenze", available: false, summary: {} });
      }
    } else {
      domains.push({ area: "Presenze", available: false, summary: { reason: "permesso_assente" } });
    }

    if (includeBudget && cid) {
      try {
        const analysis = await this.store.getPersonnelBudgetAnalysis(
          cid,
          now.getFullYear(),
          now.getMonth() + 1,
          5,
          500
        );
        const act = analysis.totals.actual.totalCompanyCost ?? 0;
        const bud = analysis.totals.budget.totalCompanyCost ?? 0;
        const variancePct = bud > 0 ? Math.round(((act - bud) / bud) * 1000) / 10 : null;
        sources.push("personnel_budget");
        const summary: Record<string, unknown> = {
          variancePct,
          varianceBand: budgetVarianceBand(variancePct),
          actualTotalRounded: Math.round(act),
          budgetTotalRounded: Math.round(bud)
        };
        if (expand) {
          summary.topVariances = analysis.variances
            .filter((v) => v.exceedsThreshold)
            .slice(0, 4)
            .map((v) => ({
              category: v.category,
              variancePct: v.variancePct,
              exceedsThreshold: v.exceedsThreshold
            }));
        }
        domains.push({ area: "Budget", available: true, summary });
      } catch (e) {
        this.logger.warn(`multi-source budget: ${e instanceof Error ? e.message : String(e)}`);
        domains.push({ area: "Budget", available: false, summary: {} });
      }
    } else {
      domains.push({ area: "Budget", available: false, summary: { reason: "permesso_assente" } });
    }

    if ((canReportsHr || hrExtended) && cid) {
      try {
        const training = await this.countTrainingAggregate(cid);
        sources.push("training_assignments");
        const summary: Record<string, unknown> = {
          overdueCount: training.overdue,
          percentComplete: training.percentComplete
        };
        if (expand) {
          summary.totalAssignments = training.total;
          summary.inProgressCount = training.inProgress;
          summary.completedCount = training.completed;
        }
        domains.push({ area: "Formazione", available: true, summary });
      } catch (e) {
        this.logger.warn(`multi-source formazione: ${e instanceof Error ? e.message : String(e)}`);
        domains.push({ area: "Formazione", available: false, summary: {} });
      }
    } else {
      domains.push({ area: "Formazione", available: false, summary: { reason: "permesso_assente" } });
    }

    if (canApprovals) {
      try {
        const pending = await this.store.listApprovalsForUser(auth.userId, "pending");
        sources.push("pending_approvals");
        const pendingByType: Record<string, number> = {};
        for (const p of pending) {
          const k = String(p.type ?? "other");
          pendingByType[k] = (pendingByType[k] ?? 0) + 1;
        }
        const summary: Record<string, unknown> = {
          pendingCount: pending.length
        };
        if (expand) {
          summary.pendingByType = pendingByType;
        }
        domains.push({ area: "Approvazioni", available: true, summary });
      } catch (e) {
        this.logger.warn(`multi-source approvazioni: ${e instanceof Error ? e.message : String(e)}`);
        domains.push({ area: "Approvazioni", available: false, summary: {} });
      }
    } else {
      domains.push({ area: "Approvazioni", available: false, summary: { reason: "permesso_assente" } });
    }

    return {
      facts: {
        generatedAt: now.toISOString(),
        mode: expand ? "expanded" : "lite",
        domains
      },
      sources
    };
  }

  private async countTrainingAggregate(companyId: string): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
    percentComplete: number;
  }> {
    const sb = this.store.getServiceRoleClient();
    if (!sb) {
      return { total: 0, completed: 0, inProgress: 0, overdue: 0, percentComplete: 0 };
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb
      .from("training_assignments")
      .select("status, due_date")
      .eq("company_id", companyId)
      .limit(5000);
    if (error) {
      this.logger.warn(`training_assignments aggregate: ${error.message}`);
      return { total: 0, completed: 0, inProgress: 0, overdue: 0, percentComplete: 0 };
    }
    const rows = (data ?? []) as Array<{ status?: string; due_date?: string }>;
    const total = rows.length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const overdue = rows.filter((r) => r.status !== "completed" && (r.due_date ?? "") < today).length;
    const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, overdue, percentComplete };
  }

  async chat(
    auth: { userId: string; role: AuthRole },
    body: {
      message: string;
      page?: string | null;
      history?: PlatformAgentTurn[];
      scope?: AssistantScopePayload;
      pageContext?: HebbPageContextDto | null;
      deepen?: boolean;
    }
  ): Promise<{
    reply: string;
    structured: PlatformAgentStructured | null;
    sources: string[];
    llm: { configured: boolean; refineApplied: boolean };
    privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
  }> {
    const me = await this.store.getUser(auth.userId);
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);
    assertHebbUserMessageAllowed(body.message, companyUsers);

    const history = (body.history ?? [])
      .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-12)
      .map((t) => ({ role: t.role, content: t.content.trim().slice(0, 2000) }));

    const deepen = isDeepenRequest(body.message, body.deepen);
    const broad = isBroadCrossDomainQuestion(body.message) || deepen;

    const assistantOut = await this.aiHr.assistant(auth, {
      message: body.message,
      page: body.page,
      scope: body.scope,
      pageContext: body.pageContext
    });

    const pageContext = normalizeHebbPageContext(body.pageContext);
    let multiSourceSources: string[] = [];
    let multiSourceFacts: MultiSourceFactsEnvelope | null = null;
    if (broad || deepen) {
      const ms = await this.buildMultiSourceFacts(auth, me.companyId, body.scope, pageContext, {
        expand: deepen
      });
      multiSourceFacts = ms.facts;
      multiSourceSources = ms.sources;
    }

    if (!this.openAi.isActive()) {
      const structuredFallback = tryParseStructuredFromText(assistantOut.reply);
      return {
        ...assistantOut,
        structured: structuredFallback,
        reply: structuredFallback
          ? structuredToPlainReply(structuredFallback, assistantOut.reply.split("\n")[0])
          : assistantOut.reply,
        sources: [...assistantOut.sources, ...multiSourceSources]
      };
    }

    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const perms = await this.permissions.getExpandedPermissionsForUserId(auth.userId);
      const envelope: Record<string, unknown> = {
        message: body.message,
        history,
        replySeed: assistantOut.reply,
        routeHints: AI_HR_ROUTE_HINTS,
        platformCapabilities: NEXA_HR_PLATFORM_NAV,
        agent: { id: NEXA_HR_AGENT_ID, version: NEXA_HR_AGENT_VERSION },
        knowledgeExcerpt: this.knowledgeMd.slice(0, 12000),
        permissionsSummary: [...perms].slice(0, 48),
        deepenMode: deepen,
        crossDomainQuestion: broad
      };
      if (multiSourceFacts) {
        envelope.multiSourceFacts = multiSourceFacts;
      }
      applyHebbPageContextToRecord(envelope, pageContext, body.page ?? null);
      const envelopePayload = { envelope };
      const pseudo = await this.gateway.toModelPayload(sessionId, envelopePayload, SCHEMA_PLATFORM_AGENT);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_PLATFORM_AGENT);
      let reply = assistantOut.reply;
      let structured: PlatformAgentStructured | null = null;
      let refineApplied = false;
      if (refined.ok && refined.data && typeof refined.data === "object") {
        const refinedEnvelope = (refined.data as { envelope?: Record<string, unknown> }).envelope;
        const envReply = typeof refinedEnvelope?.reply === "string" ? refinedEnvelope.reply.trim() : "";
        structured = parsePlatformAgentStructured(refinedEnvelope ?? null);
        if (structured) {
          reply = structuredToPlainReply(structured, envReply || undefined);
          refineApplied = true;
        } else if (envReply) {
          reply = envReply;
          structured = tryParseStructuredFromText(envReply);
          refineApplied = true;
        }
      }
      const auditSources = [
        "assistant_snapshot",
        "nexa_agent_knowledge",
        "platform_nav",
        ...multiSourceSources
      ];
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "platform_agent",
        schemaVersion: SCHEMA_PLATFORM_AGENT,
        sessionId,
        inputForFingerprint: {
          messageLen: body.message.length,
          historyLen: history.length,
          page: pageContext?.currentPath ?? body.page,
          userRole: pageContext?.userRole,
          deepen,
          crossDomain: broad
        },
        dataSources: auditSources,
        responseSizeBytes: Buffer.byteLength(reply, "utf8"),
        outcome: refineApplied ? "llm" : "template"
      });
      return {
        reply,
        structured,
        sources: [...assistantOut.sources, "platform_agent", "nexa_agent_knowledge", ...multiSourceSources],
        llm: { configured: true, refineApplied },
        privacy: {
          pseudonymizedTokenCount: pseudo.tokenCount,
          schemaVersion: SCHEMA_PLATFORM_AGENT
        }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  getSystemPromptPreview(): string {
    return getNexaHrConversationalAgentSystemPrompt();
  }
}
