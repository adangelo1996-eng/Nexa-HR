import { Injectable } from "@nestjs/common";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import {
  COWORK_CONVERSATION_HISTORY_MAX,
  COWORK_DOMAIN_LABELS,
  COWORK_EXAMPLE_PROMPTS,
  COWORK_PLANNER_CONFIDENCE_THRESHOLD,
  COWORK_TOOL_CATALOG,
  SCHEMA_COWORK_PLANNER
} from "./cowork.constants";
import { CoworkPlanHydrationService, type ScopeUser } from "./cowork-plan-hydration.service";
import type {
  CoworkDomain,
  CoworkPlannerInterpretResult,
  CoworkPlannerLlmEnvelope,
  CoworkPlannerSectionSpec
} from "./cowork.types";

const EXECUTABLE_DOMAINS = new Set<CoworkDomain>([
  "smartworking_agreements",
  "smartworking_requests",
  "employment_contracts"
]);

@Injectable()
export class CoworkPlannerService {
  constructor(
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly hydration: CoworkPlanHydrationService
  ) {}

  isLlmAvailable(): boolean {
    return this.openAi.isActive();
  }

  async interpret(params: {
    companyId: string;
    actorUserId: string;
    message: string;
    scopeUsers: ScopeUser[];
    costCenterId?: string;
    teamId?: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    regexDomains: CoworkDomain[];
  }): Promise<CoworkPlannerInterpretResult> {
    const { companyId, actorUserId, message, scopeUsers, costCenterId, teamId, conversationHistory, regexDomains } =
      params;

    const domainsForAggregates = this.uniqueDomains([
      ...regexDomains.filter((d) => d !== "unknown"),
      ...Object.values(COWORK_TOOL_CATALOG).map((t) => t.domain)
    ]);

    const aggregatesByDomain: Record<string, Record<string, unknown>> = {};
    for (const domain of domainsForAggregates) {
      aggregatesByDomain[domain] = await this.hydration.buildAggregates(domain, companyId, scopeUsers);
    }

    const availableTools = Object.entries(COWORK_TOOL_CATALOG).map(([tool, meta]) => ({
      tool,
      domain: meta.domain,
      labelIt: meta.labelIt,
      hintIt: meta.hintIt,
      executable: meta.executable
    }));

    const conversationTail = (conversationHistory ?? [])
      .slice(-COWORK_CONVERSATION_HISTORY_MAX)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 500) }));

    const primary =
      regexDomains.find((d) => EXECUTABLE_DOMAINS.has(d)) ?? regexDomains[0] ?? "unknown";
    const plannerSeed = {
      summary: `Piano ${COWORK_DOMAIN_LABELS[primary] ?? primary} per ${scopeUsers.length} dipendenti nel perimetro.`
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
        return this.regexFallbackInterpret(regexDomains, scopeUsers.length, message, false, tokenCount);
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
            : [...COWORK_EXAMPLE_PROMPTS];
        return {
          kind: "clarification",
          message:
            (typeof env.clarification_message === "string" && env.clarification_message.trim()) ||
            "Per procedere ho bisogno di un chiarimento sulla richiesta.",
          suggestions,
          confidence,
          llmApplied: true,
          tokenCount
        };
      }

      const sections = this.normalizePlannerSections(env.sections, regexDomains);
      if (sections.length === 0) {
        return this.regexFallbackInterpret(regexDomains, scopeUsers.length, message, true, tokenCount);
      }

      const onlyTraining =
        sections.length > 0 && sections.every((s) => s.domain === "training");
      if (onlyTraining) {
        return {
          kind: "clarification",
          message:
            (typeof env.clarification_message === "string" && env.clarification_message.trim()) ||
            "Il dominio formazione batch è in arrivo: al momento Cowork supporta accordi SW, estensione richieste e contratti con clausola agile.",
          suggestions: [...COWORK_EXAMPLE_PROMPTS],
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
        sections: sections.filter((s) => s.domain !== "training"),
        llmApplied: true,
        tokenCount
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  regexFallbackInterpret(
    regexDomains: CoworkDomain[],
    scopeCount: number,
    message: string,
    llmAttempted: boolean,
    tokenCount: number
  ): CoworkPlannerInterpretResult {
    const executable = regexDomains.filter((d) => EXECUTABLE_DOMAINS.has(d));
    const uniqueExecutable = this.uniqueDomains(executable);

    if (uniqueExecutable.length === 0) {
      const onlyTraining = regexDomains.includes("training") && !regexDomains.some((d) => EXECUTABLE_DOMAINS.has(d));
      return {
        kind: "clarification",
        message: onlyTraining
          ? "Il dominio formazione batch è in arrivo. Puoi usare accordi SW, estensione richieste approvate o contratti con clausola smart working."
          : "Non ho riconosciuto un'operazione supportata. Prova con uno degli esempi o specifica accordi, richieste o contratti.",
        suggestions: [...COWORK_EXAMPLE_PROMPTS],
        confidence: 0,
        llmApplied: llmAttempted,
        tokenCount
      };
    }

    const sections: CoworkPlannerSectionSpec[] = uniqueExecutable.map((domain) => ({
      tool: this.defaultToolForDomain(domain),
      domain,
      title: COWORK_DOMAIN_LABELS[domain] ?? domain
    }));

    const summary =
      sections.length > 1
        ? `Piano con ${sections.length} area/e operative e ${scopeCount} dipendenti nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`
        : `Piano ${COWORK_DOMAIN_LABELS[sections[0]!.domain] ?? sections[0]!.domain} per ${scopeCount} dipendenti nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`;

    return {
      kind: "sections",
      summary,
      sections,
      llmApplied: llmAttempted,
      tokenCount
    };
  }

  private normalizePlannerSections(
    raw: CoworkPlannerLlmEnvelope["sections"],
    regexDomains: CoworkDomain[]
  ): CoworkPlannerSectionSpec[] {
    const out: CoworkPlannerSectionSpec[] = [];
    const seenDomains = new Set<CoworkDomain>();

    for (const item of raw ?? []) {
      const tool = typeof item.tool === "string" ? item.tool.trim() : "";
      const catalog = tool ? COWORK_TOOL_CATALOG[tool] : undefined;
      let domain = catalog?.domain;
      if (!domain && typeof item.domain === "string") {
        domain = this.asDomain(item.domain) ?? undefined;
      }
      if (!domain || domain === "unknown") {
        continue;
      }
      if (seenDomains.has(domain)) {
        continue;
      }
      seenDomains.add(domain);
      out.push({
        tool: tool || this.defaultToolForDomain(domain),
        domain,
        title:
          (typeof item.title === "string" && item.title.trim()) ||
          this.hydration.sectionTitleForDomain(domain)
      });
    }

    if (out.length > 0) {
      return out;
    }

    return regexDomains
      .filter((d) => d !== "unknown" && d !== "training")
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .map((domain) => ({
        tool: this.defaultToolForDomain(domain),
        domain,
        title: this.hydration.sectionTitleForDomain(domain)
      }));
  }

  private defaultToolForDomain(domain: CoworkDomain): string {
    if (domain === "smartworking_agreements") return "renew_agreements";
    if (domain === "smartworking_requests") return "extend_approved_requests";
    if (domain === "employment_contracts") return "update_contract_sw_clause";
    return "training_batch";
  }

  private asDomain(value: string): CoworkDomain | null {
    const v = value.trim() as CoworkDomain;
    if (
      v === "smartworking_agreements" ||
      v === "smartworking_requests" ||
      v === "employment_contracts" ||
      v === "training" ||
      v === "unknown"
    ) {
      return v;
    }
    return null;
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
