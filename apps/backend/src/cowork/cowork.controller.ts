import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString, ArrayNotEmpty } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { COWORK_EXAMPLE_PROMPTS } from "./cowork.constants";
import { CoworkOrchestratorService } from "./cowork-orchestrator.service";
import type { CoworkApplyRequest, CoworkPlanRequest } from "./cowork.types";

class CoworkPlanDtoBody implements CoworkPlanRequest {
  @IsString()
  message!: string;

  @IsOptional()
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;
}

class CoworkApplyDtoBody implements CoworkApplyRequest {
  @IsString()
  planId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  selectedRowIds!: string[];
}

@Controller("cowork")
@UseGuards(NexaPermissionGuard)
export class CoworkController {
  constructor(private readonly orchestrator: CoworkOrchestratorService) {}

  @Get("meta")
  @RequireNexaPermissions("nexa.lifecycle:read")
  meta(): { examplePrompts: readonly string[] } {
    return { examplePrompts: COWORK_EXAMPLE_PROMPTS };
  }

  @Post("plan")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async plan(@CurrentAuth() auth: AuthContext, @Body() body: CoworkPlanDtoBody): Promise<unknown> {
    return this.orchestrator.plan(auth, body);
  }

  @Get("plans/:id")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async getPlan(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    return this.orchestrator.getPlan(auth, id);
  }

  @Post("apply")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async apply(@CurrentAuth() auth: AuthContext, @Body() body: CoworkApplyDtoBody): Promise<unknown> {
    return this.orchestrator.apply(auth, body);
  }
}
