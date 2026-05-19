import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Ip,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf
} from "class-validator";
import type { Request } from "express";
import { CurrentAuth, type AuthContext } from "../../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../../platform/nexa-permission.guard";
import { LinkedInJobSyncService } from "./linkedin-job-sync.service";
import { verifyLinkedInWebhookSignature } from "./linkedin-webhook.signature";

type RequestWithRawBody = Request & { rawBody?: Buffer };

class LinkedInTestIngestDto {
  @IsUUID()
  jobId!: string;

  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? undefined : value))
  @ValidateIf((_, v) => v != null && v !== "")
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  resumeUrl?: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}

@Controller("recruiting")
export class RecruitingLinkedInController {
  constructor(private readonly linkedInSync: LinkedInJobSyncService) {}

  @Get("integrations/linkedin/status")
  @UseGuards(NexaPermissionGuard)
  @RequireNexaPermissions("nexa.recruiting:read")
  integrationStatus(): ReturnType<LinkedInJobSyncService["getIntegrationStatus"]> {
    return this.linkedInSync.getIntegrationStatus();
  }

  @Get("integrations/linkedin/config")
  @UseGuards(NexaPermissionGuard)
  @RequireNexaPermissions("nexa.recruiting:read")
  integrationConfig(
    @CurrentAuth() auth: AuthContext,
    @Query("publicApiBaseUrl") publicApiBaseUrl?: string
  ): ReturnType<LinkedInJobSyncService["getUiConfig"]> {
    return this.linkedInSync.getUiConfig(auth.tenantId ?? "comp-1", publicApiBaseUrl);
  }

  @Post("integrations/linkedin/test-ingest")
  @UseGuards(NexaPermissionGuard)
  @RequireNexaPermissions("nexa.recruiting:write")
  async testIngest(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: LinkedInTestIngestDto
  ): Promise<{ ok: true; action: string; result: unknown }> {
    const companyId = auth.tenantId ?? "comp-1";
    const result = await this.linkedInSync.ingestNormalizedCandidate({
      companyId,
      jobId: dto.jobId,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email,
      linkedinUrl: dto.linkedinUrl,
      resumeUrl: dto.resumeUrl,
      externalId: dto.externalId ?? `test-${Date.now()}`
    });
    await this.linkedInSync.recordIntegrationEvent({
      companyId,
      eventType: "candidate.apply.test",
      externalId: dto.externalId ?? null,
      positionId: result.positionId,
      payload: { candidateId: result.candidateId, stateId: result.stateId, source: "admin_test" }
    });
    return { ok: true, action: "test_ingest", result };
  }

  @Get("positions/:id")
  @UseGuards(NexaPermissionGuard)
  @RequireNexaPermissions("nexa.recruiting:read")
  async getPosition(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    return this.linkedInSync.getPosition(auth.tenantId ?? "comp-1", id);
  }

  @Post("positions/:id/linkedin/publish")
  @UseGuards(NexaPermissionGuard)
  @RequireNexaPermissions("nexa.recruiting:write")
  async publishToLinkedIn(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    return this.linkedInSync.publishPositionToLinkedIn(auth.tenantId ?? "comp-1", id);
  }

  @Post("positions/:id/linkedin/sync")
  @UseGuards(NexaPermissionGuard)
  @RequireNexaPermissions("nexa.recruiting:write")
  async syncNow(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    return this.linkedInSync.publishPositionToLinkedIn(auth.tenantId ?? "comp-1", id);
  }

  @Post("integrations/linkedin/webhook")
  async linkedInWebhook(
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
    @Ip() ip: string
  ): Promise<unknown> {
    const secret = process.env.LINKEDIN_WEBHOOK_SECRET?.trim() ?? "";
    if (!secret || secret.length < 16) {
      throw new ForbiddenException("Webhook LinkedIn non configurato (LINKEDIN_WEBHOOK_SECRET)");
    }
    this.linkedInSync.consumeWebhookRateLimit(ip || "unknown");
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    if (!verifyLinkedInWebhookSignature(req, raw, secret)) {
      throw new UnauthorizedException("Firma webhook non valida");
    }
    return this.linkedInSync.handleWebhookPayload(body);
  }
}
