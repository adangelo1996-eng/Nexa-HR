import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { CurrentAuth, type AuthContext, type AuthRole } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { AiHrService } from "./ai-hr.service";

class AssistantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @IsString()
  @MaxLength(256)
  page?: string;
}

class NlRunDto {
  @IsString()
  @MaxLength(120)
  queryId!: string;
}

class NlSaveViewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsString()
  @MaxLength(120)
  queryId!: string;
}

class TriageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  text!: string;
}

@Controller("ai/hr")
@UseGuards(NexaPermissionGuard)
export class AiHrController {
  constructor(private readonly aiHr: AiHrService) {}

  @Post("assistant")
  @RequireNexaPermissions("nexa.ai_assistant:read")
  postAssistant(
    @CurrentAuth() auth: AuthContext,
    @Body() body: AssistantDto
  ): Promise<{ reply: string; sources: string[] }> {
    return this.aiHr.assistant({ userId: auth.userId, role: auth.role as AuthRole }, body);
  }

  @Get("nl-query/catalog")
  @RequireNexaPermissions("nexa.ai_nl_query:read")
  getNlCatalog(): ReturnType<AiHrService["nlQueryCatalog"]> {
    return this.aiHr.nlQueryCatalog();
  }

  @Post("nl-query/run")
  @RequireNexaPermissions("nexa.ai_nl_query:read")
  postNlRun(
    @CurrentAuth() auth: AuthContext,
    @Body() body: NlRunDto
  ): ReturnType<AiHrService["nlQueryRun"]> {
    return this.aiHr.nlQueryRun({ userId: auth.userId, role: auth.role as AuthRole }, body);
  }

  @Post("nl-query/save-view")
  @RequireNexaPermissions("nexa.ai_nl_query:write")
  postNlSaveView(
    @CurrentAuth() auth: AuthContext,
    @Body() body: NlSaveViewDto
  ): ReturnType<AiHrService["nlQuerySaveView"]> {
    return this.aiHr.nlQuerySaveView({ userId: auth.userId, role: auth.role as AuthRole }, body);
  }

  @Post("anomalies")
  @RequireNexaPermissions("nexa.ai_anomalies:read")
  postAnomalies(@CurrentAuth() auth: AuthContext): ReturnType<AiHrService["anomalies"]> {
    return this.aiHr.anomalies({ userId: auth.userId, role: auth.role as AuthRole });
  }

  @Post("triage")
  @RequireNexaPermissions("nexa.ai_triage:read")
  postTriage(
    @CurrentAuth() auth: AuthContext,
    @Body() body: TriageDto
  ): ReturnType<AiHrService["triage"]> {
    return this.aiHr.triage({ userId: auth.userId, role: auth.role as AuthRole }, body);
  }
}
