import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, ArrayNotEmpty, Min, ValidateIf } from "class-validator";
import { Type } from "class-transformer";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { COWORK_EXAMPLE_PROMPTS } from "./cowork.constants";
import { CoworkOrchestratorService } from "./cowork-orchestrator.service";
import type {
  CoworkApplyRequest,
  CoworkBulkUndoRequest,
  CoworkCancelRequest,
  CoworkPlanRequest,
  CoworkUndoRequest
} from "./cowork.types";

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

class CoworkUndoDtoBody {
  @ValidateIf((o: CoworkUndoDtoBody) => !o.planId && !o.rowId)
  @IsString()
  logId?: string;

  @ValidateIf((o: CoworkUndoDtoBody) => !o.logId)
  @IsString()
  planId?: string;

  @ValidateIf((o: CoworkUndoDtoBody) => !o.logId)
  @IsString()
  rowId?: string;
}

class CoworkHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

class CoworkCancelDtoBody implements CoworkCancelRequest {
  @IsString()
  planId!: string;
}

class CoworkBulkUndoDtoBody {
  @ValidateIf((o: CoworkBulkUndoDtoBody) => !o.planId && !o.batchId && !o.category)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  logIds?: string[];

  @ValidateIf((o: CoworkBulkUndoDtoBody) => !o.logIds?.length)
  @IsString()
  planId?: string;

  @ValidateIf((o: CoworkBulkUndoDtoBody) => !o.logIds?.length)
  @IsString()
  batchId?: string;

  @ValidateIf((o: CoworkBulkUndoDtoBody) => !o.logIds?.length)
  @IsString()
  category?: string;
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

  @Get("history")
  @RequireNexaPermissions("nexa.lifecycle:read")
  async history(@CurrentAuth() auth: AuthContext, @Query() query: CoworkHistoryQueryDto): Promise<unknown> {
    return this.orchestrator.history(auth, query);
  }

  @Post("undo")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async undo(@CurrentAuth() auth: AuthContext, @Body() body: CoworkUndoDtoBody): Promise<unknown> {
    if (body.logId) {
      return this.orchestrator.undo(auth, { logId: body.logId });
    }
    if (body.planId && body.rowId) {
      return this.orchestrator.undo(auth, { planId: body.planId, rowId: body.rowId });
    }
    return this.orchestrator.undo(auth, body as CoworkUndoRequest);
  }

  @Post("undo/bulk")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async undoBulk(@CurrentAuth() auth: AuthContext, @Body() body: CoworkBulkUndoDtoBody): Promise<unknown> {
    if (body.logIds?.length) {
      return this.orchestrator.undoBulk(auth, { logIds: body.logIds });
    }
    if (body.planId && body.batchId && body.category) {
      return this.orchestrator.undoBulk(auth, {
        planId: body.planId,
        batchId: body.batchId,
        category: body.category
      });
    }
    return this.orchestrator.undoBulk(auth, body as CoworkBulkUndoRequest);
  }

  @Post("cancel")
  @RequireNexaPermissions("nexa.lifecycle:write")
  async cancel(@CurrentAuth() auth: AuthContext, @Body() body: CoworkCancelDtoBody): Promise<unknown> {
    return this.orchestrator.cancel(auth, body);
  }
}
