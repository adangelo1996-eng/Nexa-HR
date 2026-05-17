import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { CurrentAuth, type AuthContext, type AuthRole } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { AiHrService } from "./ai-hr.service";
import { NexaPlatformAgentService, type PlatformAgentTurn } from "./nexa-platform-agent.service";

class AssistantScopeBodyDto {
  @IsIn(["self", "user", "team", "cost_center"])
  mode!: "self" | "user" | "team" | "cost_center";

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;
}

class AssistantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @IsString()
  @MaxLength(256)
  page?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantScopeBodyDto)
  scope?: AssistantScopeBodyDto;
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

class PlatformAgentChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @IsString()
  @MaxLength(256)
  page?: string;

  @IsOptional()
  history?: PlatformAgentTurn[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantScopeBodyDto)
  scope?: AssistantScopeBodyDto;
}

@Controller("ai/hr")
@UseGuards(NexaPermissionGuard)
export class AiHrController {
  constructor(
    private readonly aiHr: AiHrService,
    private readonly platformAgent: NexaPlatformAgentService
  ) {}

  @Post("assistant")
  @RequireNexaPermissions("nexa.ai_assistant:read")
  postAssistant(
    @CurrentAuth() auth: AuthContext,
    @Body() body: AssistantDto
  ): ReturnType<AiHrService["assistant"]> {
    return this.aiHr.assistant(
      { userId: auth.userId, role: auth.role as AuthRole },
      {
        message: body.message,
        page: body.page,
        scope: body.scope
      }
    );
  }

  @Get("assistant/scope-options")
  @RequireNexaPermissions("nexa.ai_assistant:read")
  getAssistantScopeOptions(@CurrentAuth() auth: AuthContext): ReturnType<AiHrService["getAssistantScopeOptions"]> {
    return this.aiHr.getAssistantScopeOptions({ userId: auth.userId, role: auth.role as AuthRole });
  }

  @Get("assistant/org-users")
  @RequireNexaPermissions("nexa.ai_assistant:read")
  searchAssistantOrgUsers(
    @CurrentAuth() auth: AuthContext,
    @Query("q") q: string
  ): ReturnType<AiHrService["searchAssistantOrgUsers"]> {
    return this.aiHr.searchAssistantOrgUsers({ userId: auth.userId, role: auth.role as AuthRole }, q ?? "");
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

  @Post("platform-agent/chat")
  @RequireNexaPermissions("nexa.ai_assistant:read")
  postPlatformAgentChat(
    @CurrentAuth() auth: AuthContext,
    @Body() body: PlatformAgentChatDto
  ): ReturnType<NexaPlatformAgentService["chat"]> {
    return this.platformAgent.chat(
      { userId: auth.userId, role: auth.role as AuthRole },
      {
        message: body.message,
        page: body.page,
        history: body.history,
        scope: body.scope
      }
    );
  }
}
