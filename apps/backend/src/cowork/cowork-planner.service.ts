import { Injectable } from "@nestjs/common";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import type { AuthContext } from "../platform/auth";
import {
  COWORK_AREA_LABELS,
  COWORK_CONVERSATION_HISTORY_MAX,
  COWORK_DOMAIN_LABELS,
  COWORK_EXAMPLE_PROMPTS,
  COWORK_PLANNER_CONFIDENCE_THRESHOLD,
  SCHEMA_COWORK_PLANNER
} from "./cowork.constants";
import { CoworkPermissionsService } from "./cowork-permissions.service";
import { CoworkPlanHydrationService, type ScopeUser } from "./cowork-plan-hydration.service";
import { defaultToolForArea, getCoworkTool } from "./cowork-tool-catalog";
import type {
  CoworkAreaId,
  CoworkDomain,
  CoworkPlannerInterpretResult,
  CoworkPlannerLlmEnvelope,
  CoworkPlannerSectionSpec,
  CoworkToolDef
} from "./cowork.types";

const LEGACY_DOMAIN_TOOLS: Record<string, string> = {
  smartworking_agreements: "renew_agreements",
  smartworking_requests: "extend_approved_requests",
  employment_contracts: "update_contract_sw_clause",
  training: "training_batch"
};

@Injectable()
export class CoworkPlannerService {
  constructor(
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly hydration: CoworkPlanHydrationService,
    private readonly coworkPermissions: CoworkPermissionsService
  ) {}

  isLlmAvailable(): boolean {
    return this.openAi.isActive();
  }

  async interpret(params: {
    auth: AuthContext;
    companyId: string;
    actorUserId: string;
    message: string;
    scopeUsers: ScopeUser[];
    costCenterId?: string;
    teamId?: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    regexDomains: CoworkDomain[];
    regexToolHints: string[];
  }): Promise<CoworkPlannerInterpretResult> {
    const {
      auth,
      companyId,
      actorUserId,
      message,
      scopeUsers,
      costCenterId,
      teamId,
      conversationHistory,
      regexDomains,
      regexToolHints
    } = params;

    const allowedTools = await this.coworkPermissions.filterToolsForActor(auth);

    const domainsForAggregates = this.uniqueDomains([
      ...regexDomains.filter((d) => d !== "unknown"),
      ...allowedTools.map((t) => t.domain)
    ]);

    const aggregatesByDomain: Record<string, Record<string, unknown>> = {};
    for (const domain of domainsForAggregates) {
      aggregatesByDomain[domain] = await this.hydration.buildAggregates(domain, companyId, scopeUsers);
    }

    const availableTools = allowedTools.map((t) => ({
      tool: t.id,
      areaId: t.areaId,
      domain: t.domain,
      labelIt: t.labelIt,
      hintIt: t.hintIt,
      executable: t.executable
    }));

    const conversationTail = (conversationHistory ?? [])
      .slice(-COWORK_CONVERSATION_HISTORY_MAX)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 500) }));

    const primaryTool =
      regexToolHints.find((id) => allowedTools.some((t) => t.id === id && t.executable)) ??
      regexToolHints[0] ??
      allowedTools.find((t) => t.executable)?.id ??
      "renew_agreements";
    const primaryMeta = getCoworkTool(primaryTool);
    const plannerSeed = {
      summary: `Piano ${primaryMeta?.labelIt ?? COWORK_DOMAIN_LABELS[regexDomains[0] ?? "unknown"]} per ${scopeUsers.length} dipendenti nel perimetro.`
    };

    let tokenCount = 0;
    const { sessionId } = await this.gateway.beginSession(companyId, actorUserId);
    try {
      const envelope = {
        envelope: {
          facts: {
            message,
            scopeCount: scopeUsers.length,
            filters: {
              costCenterId: costCenterId ?? null,
              teamId: teamId ?? null
            },
            regexDomainHints: regexDomains,
            regexToolHints,
            aggregatesByDomain,
            availableTools,
            conversationTail
          },
          plannerSeed
        }
      };

      const pseudo = await this.gateway.toModelPayload(sessionId, envelope, SCHEMA_COWORK_PLANNER);
      tokenCount = pseudo.tokenCount;

      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_COWORK_PLANNER);
      if (!refined.ok || !refined.data || typeof refined.data !== "object") {
        return this.regexFallbackInterpret(
          regexDomains,
          regexToolHints,
          allowedTools,
          scopeUsers.length,
          message,
          false,
          tokenCount
        );
      }

      const env = (refined.data as { envelope?: CoworkPlannerLlmEnvelope }).envelope ?? {};
      const confidence =
        typeof env.confidence === "number" && Number.isFinite(env.confidence)
          ? Math.max(0, Math.min(1, env.confidence))
          : 0.7;

      if (env.needs_clarification || confidence < COWORK_PLANNER_CONFIDENCE_THRESHOLD) {
        const suggestions =
          Array.isArray(env.suggestions) && env.suggestions.length > 0
            ? env.suggestions.filter((s): s is string => typeof s === "string").slice(0, 6)
            : this.clarificationSuggestions(allowedTools);
        return {
          kind: "clarification",
          message:
            (typeof env.clarification_message === "string" && env.clarification_message.trim()) ||
            "Per procedere ho bisogno di un chiarimento: indica area operativa (calendario, ferie, accordi SW, contratti, payroll, offboarding, …).",
          suggestions,
          confidence,
          llmApplied: true,
          tokenCount
        };
      }

      const sections = this.normalizePlannerSections(env.sections, regexDomains, regexToolHints, allowedTools);
      if (sections.length === 0) {
        return this.regexFallbackInterpret(
          regexDomains,
          regexToolHints,
          allowedTools,
          scopeUsers.length,
          message,
          true,
          tokenCount
        );
      }

      const executableSections = sections.filter((s) => {
        const tool = getCoworkTool(s.tool);
        return tool?.executable === true;
      });

      if (executableSections.length === 0) {
        const disabled = sections.map((s) => getCoworkTool(s.tool)?.disabledMessageIt).find(Boolean);
        return {
          kind: "clarification",
          message:
            disabled ??
            "Le operazioni richieste non sono ancora applicabili da Cowork: scegli un'azione dalla lista o riformula.",
          suggestions: this.clarificationSuggestions(allowedTools),
          confidence,
          llmApplied: true,
          tokenCount
        };
      }

      const summary =
        (typeof env.summary === "string" && env.summary.trim()) ||
        plannerSeed.summary;

      return {
        kind: "sections",
        summary,
        sections: executableSections,
        llmApplied: true,
        tokenCount
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  regexFallbackInterpret(
    regexDomains: CoworkDomain[],
    regexToolHints: string[],
    allowedTools: CoworkToolDef[],
    scopeCount: number,
    message: string,
    llmAttempted: boolean,
    tokenCount: number
  ): CoworkPlannerInterpretResult {
    const allowedIds = new Set(allowedTools.map((t) => t.id));
    const toolCandidates = regexToolHints.filter((id) => allowedIds.has(id));
    for (const domain of regexDomains) {
      const legacy = LEGACY_DOMAIN_TOOLS[domain];
      if (legacy && allowedIds.has(legacy) && !toolCandidates.includes(legacy)) {
        toolCandidates.push(legacy);
      }
    }

    const executableTools = toolCandidates
      .map((id) => getCoworkTool(id))
      .filter((t): t is CoworkToolDef => Boolean(t?.executable));

    if (executableTools.length === 0) {
      const areaHints = this.areaHintsFromMessage(message);
      const areaSuggestions = areaHints
        .map((a) => COWORK_AREA_LABELS[a])
        .filter(Boolean)
        .slice(0, 4);
      return {
        kind: "clarification",
        message:
          areaSuggestions.length > 0
            ? `Ho individuato le aree: ${areaSuggestions.join(", ")}. Specifica l'operazione (es. prenota sala, ferie, accordi SW, approva richieste).`
            : "Non ho riconosciuto un'operazione supportata nel tuo perimetro permessi. Scegli un esempio o indica calendario, ferie, accordi, contratti o payroll.",
        suggestions: this.clarificationSuggestions(allowedTools),
        confidence: 0,
        llmApplied: llmAttempted,
        tokenCount
      };
    }

    const sections: CoworkPlannerSectionSpec[] = executableTools.map((tool) => ({
      tool: tool.id,
      domain: tool.domain,
      areaId: tool.areaId,
      title: tool.labelIt
    }));

    const summary =
      sections.length > 1
        ? `Piano con ${sections.length} operazioni e ${scopeCount} dipendenti nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`
        : `Piano ${sections[0]!.title} per ${scopeCount} dipendenti nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`;

    return {
      kind: "sections",
      summary,
      sections,
      llmApplied: llmAttempted,
      tokenCount
    };
  }

  areaHintsFromMessage(message: string): CoworkAreaId[] {
    const m = message.toLowerCase();
    const areas: CoworkAreaId[] = [];
    if (/\bcalend|agenda|evento|sala|riunion|prenot|turno\b/.test(m)) {
      areas.push("calendar");
    }
    if (/\bferie|permess|rol|malatt|assenz|remote|smart|trasfert|approv\b/.test(m)) {
      areas.push("time_off");
    }
    if (/\baccord|policy\b/.test(m)) {
      areas.push("smartworking_agreements");
    }
    if (/\brichiest|estend|remot\b/.test(m)) {
      areas.push("smartworking_requests");
    }
    if (/\bcontratt|clausol|ccnl\b/.test(m)) {
      areas.push("employment_contracts");
    }
    if (/\bformazion|cors\b/.test(m)) {
      areas.push("training");
    }
    if (/\bcedolin|payroll|stipend|ral\b/.test(m)) {
      areas.push("payroll");
    }
    if (/\bbudget personale|personnel budget\b/.test(m)) {
      areas.push("personnel_budget");
    }
    if (/\brecruit|linkedin|selezione\b/.test(m)) {
      areas.push("recruiting");
    }
    if (/\bpolicy aziendal|corporate polic\b/.test(m)) {
      areas.push("corporate_policies");
    }
    if (/\blicenz|license\b/.test(m)) {
      areas.push("third_party_licenses");
    }
    if (/\bexport anagraf|admin export\b/.test(m)) {
      areas.push("admin");
    }
    if (/\boffboard|uscita|dimission\b/.test(m)) {
      areas.push("lifecycle");
    }
    if (/\bonboard|inserimento\b/.test(m)) {
      areas.push("onboarding");
    }
    if (/\bspes|rimborso|nota spes\b/.test(m)) {
      areas.push("generic");
    }
    if (/\breport|analytics|kpi\b/.test(m)) {
      areas.push("analytics");
    }
    return areas;
  }

  private clarificationSuggestions(allowedTools: CoworkToolDef[]): string[] {
    const fromTools = allowedTools
      .filter((t) => t.executable)
      .slice(0, 4)
      .map((t) => t.labelIt);
    if (fromTools.length >= 2) {
      return fromTools;
    }
    return [...COWORK_EXAMPLE_PROMPTS].slice(0, 5);
  }

  private normalizePlannerSections(
    raw: CoworkPlannerLlmEnvelope["sections"],
    regexDomains: CoworkDomain[],
    regexToolHints: string[],
    allowedTools: CoworkToolDef[]
  ): CoworkPlannerSectionSpec[] {
    const allowedIds = new Set(allowedTools.map((t) => t.id));
    const out: CoworkPlannerSectionSpec[] = [];
    const seenTools = new Set<string>();

    for (const item of raw ?? []) {
      const tool = typeof item.tool === "string" ? item.tool.trim() : "";
      if (!tool || !allowedIds.has(tool) || seenTools.has(tool)) {
        continue;
      }
      const catalog = getCoworkTool(tool)!;
      seenTools.add(tool);
      out.push({
        tool,
        domain: catalog.domain,
        areaId: catalog.areaId,
        title:
          (typeof item.title === "string" && item.title.trim()) ||
          this.hydration.sectionTitleForDomain(catalog.domain, catalog.labelIt)
      });
    }

    if (out.length > 0) {
      return out;
    }

    for (const hint of regexToolHints) {
      if (!allowedIds.has(hint) || seenTools.has(hint)) {
        continue;
      }
      const catalog = getCoworkTool(hint);
      if (!catalog) {
        continue;
      }
      seenTools.add(hint);
      out.push({
        tool: hint,
        domain: catalog.domain,
        areaId: catalog.areaId,
        title: catalog.labelIt
      });
    }

    if (out.length > 0) {
      return out;
    }

    for (const domain of regexDomains) {
      if (domain === "unknown") {
        continue;
      }
      const toolId = LEGACY_DOMAIN_TOOLS[domain] ?? defaultToolForArea(domain as CoworkAreaId);
      if (!toolId || !allowedIds.has(toolId) || seenTools.has(toolId)) {
        continue;
      }
      const catalog = getCoworkTool(toolId);
      if (!catalog) {
        continue;
      }
      seenTools.add(toolId);
      out.push({
        tool: toolId,
        domain: catalog.domain,
        areaId: catalog.areaId,
        title: catalog.labelIt
      });
    }

    return out;
  }

  private uniqueDomains(domains: CoworkDomain[]): CoworkDomain[] {
    const seen = new Set<CoworkDomain>();
    const out: CoworkDomain[] = [];
    for (const d of domains) {
      if (!seen.has(d)) {
        seen.add(d);
        out.push(d);
      }
    }
    return out;
  }
}
