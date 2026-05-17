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
import { assertMessageHasNoKnownPersonFullNames } from "./ai-hr-message-policy";
import { AiHrService, type AssistantScopePayload } from "./ai-hr.service";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";

const SCHEMA_PLATFORM_AGENT = "ai_platform_agent_v1";

export type PlatformAgentTurn = { role: "user" | "assistant"; content: string };

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

  async chat(
    auth: { userId: string; role: AuthRole },
    body: {
      message: string;
      page?: string | null;
      history?: PlatformAgentTurn[];
      scope?: AssistantScopePayload;
    }
  ): Promise<{
    reply: string;
    sources: string[];
    llm: { configured: boolean; refineApplied: boolean };
    privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
  }> {
    const me = await this.store.getUser(auth.userId);
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);
    assertMessageHasNoKnownPersonFullNames(body.message, companyUsers);

    const history = (body.history ?? [])
      .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-12)
      .map((t) => ({ role: t.role, content: t.content.trim().slice(0, 2000) }));

    const assistantOut = await this.aiHr.assistant(auth, {
      message: body.message,
      page: body.page,
      scope: body.scope
    });

    if (!this.openAi.isActive() || history.length === 0) {
      return assistantOut;
    }

    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const perms = await this.permissions.getExpandedPermissionsForUserId(auth.userId);
      const envelopePayload = {
        envelope: {
          message: body.message,
          page: body.page ?? null,
          history,
          replySeed: assistantOut.reply,
          routeHints: AI_HR_ROUTE_HINTS,
          platformCapabilities: NEXA_HR_PLATFORM_NAV,
          agent: { id: NEXA_HR_AGENT_ID, version: NEXA_HR_AGENT_VERSION },
          knowledgeExcerpt: this.knowledgeMd.slice(0, 12000),
          permissionsSummary: [...perms].slice(0, 48)
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, envelopePayload, SCHEMA_PLATFORM_AGENT);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_PLATFORM_AGENT);
      let reply = assistantOut.reply;
      let refineApplied = false;
      if (refined.ok && refined.data && typeof refined.data === "object") {
        const envReply = (refined.data as { envelope?: { reply?: string } }).envelope?.reply;
        if (typeof envReply === "string" && envReply.trim()) {
          reply = envReply.trim();
          refineApplied = true;
        }
      }
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "platform_agent",
        schemaVersion: SCHEMA_PLATFORM_AGENT,
        sessionId,
        inputForFingerprint: { messageLen: body.message.length, historyLen: history.length, page: body.page },
        dataSources: ["assistant_snapshot", "nexa_agent_knowledge", "platform_nav"],
        responseSizeBytes: Buffer.byteLength(reply, "utf8"),
        outcome: refineApplied ? "llm" : "template"
      });
      return {
        reply,
        sources: [...assistantOut.sources, "platform_agent", "nexa_agent_knowledge"],
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
