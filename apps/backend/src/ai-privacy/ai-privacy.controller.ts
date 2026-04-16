import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Allow, IsOptional } from "class-validator";
import { isDeepStrictEqual } from "node:util";
import { AiPrivacyGateway } from "./ai-privacy-gateway.service";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";

const DEFAULT_SELF_CHECK_SAMPLE = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "mario.rossi@example.com",
    first_name: "Mario",
    last_name: "Rossi",
    phone: "+39 333 1234567"
  },
  meta: { ok: true }
};

class AiPrivacySelfCheckDto {
  @IsOptional()
  @Allow()
  sample?: unknown;
}

function collectStringLeaves(obj: unknown, minLen: number): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) {
      return;
    }
    if (typeof v === "string") {
      if (v.length >= minLen) {
        out.push(v);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        walk(x);
      }
      return;
    }
    if (typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) {
        walk(x);
      }
    }
  };
  walk(obj);
  return out;
}

/**
 * Smoke test round-trip senza chiamate LLM esterne.
 * Solo `superuser`: evita esposizione del meccanismo a utenti standard.
 */
@Controller("ai/privacy")
@UseGuards(RoleGuard)
@RequireRole("superuser")
export class AiPrivacyController {
  constructor(private readonly gateway: AiPrivacyGateway) {}

  @Post("self-check")
  async selfCheck(
    @CurrentAuth() auth: AuthContext,
    @Body() body: AiPrivacySelfCheckDto
  ): Promise<{
    roundTripOk: boolean;
    tokenCount: number;
    pseudonymizedSample: string;
    noSensitiveStringLeak: boolean;
  }> {
    const companyId = auth.tenantId?.trim() || "unknown_tenant";
    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const sample = body.sample ?? DEFAULT_SELF_CHECK_SAMPLE;
      const { pseudonymized, tokenCount } = await this.gateway.toModelPayload(sessionId, sample, "self_check_v1");
      const pseudonymizedSample = JSON.stringify(pseudonymized);
      const sensitiveLeaves = collectStringLeaves(sample, 8);
      const noSensitiveStringLeak = sensitiveLeaves.every((s) => !pseudonymizedSample.includes(s));
      const modelEcho = JSON.parse(pseudonymizedSample) as unknown;
      const restored = await this.gateway.fromModelResponse(sessionId, modelEcho);
      const roundTripOk = isDeepStrictEqual(restored, sample);
      return { roundTripOk, tokenCount, pseudonymizedSample, noSensitiveStringLeak };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }
}
