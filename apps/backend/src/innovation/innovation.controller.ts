import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsObject, IsOptional, IsString } from "class-validator";
import type { InnovationJob } from "@payday/domain";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class StartJobDto {
  @IsString()
  module!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

// Outbound verso LLM: usare `AiPrivacyGateway` in `src/ai-privacy`.
@Controller("innovation")
@UseGuards(NexaPermissionGuard)
export class InnovationController {
  constructor(private readonly store: HrDataStore) {}

  @Get("capabilities")
  @RequireNexaPermissions("nexa.innovation:read")
  capabilities(): { modules: string[] } {
    return {
      modules: [
        "ai_recruiting",
        "retention_ml",
        "performance_ai",
        "blockchain_signing",
        "payroll_smart_contract",
        "wellbeing",
        "ats",
        "vr_onboarding",
        "expense_ocr"
      ]
    };
  }

  @Get("jobs")
  @RequireNexaPermissions("nexa.innovation:read")
  async listJobs(
    @CurrentAuth() auth: AuthContext,
    @Query("limit") limit?: string
  ): Promise<{ items: InnovationJob[] }> {
    const cap = limit ? Number(limit) : 50;
    const items = await this.store.listInnovationJobs(auth.userId, Number.isFinite(cap) ? cap : 50);
    return { items };
  }

  @Post("jobs")
  @RequireNexaPermissions("nexa.innovation:write")
  async startJob(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: StartJobDto
  ): Promise<InnovationJob> {
    return this.store.createInnovationJob(auth.userId, dto.module, dto.payload ?? {});
  }
}
