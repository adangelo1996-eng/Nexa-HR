import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested
} from "class-validator";
import { CurrentAuth, type AuthContext, type AuthRole } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { AssistantScopeBodyDto } from "./hebb-mate.dto-shared";
import { HebbMateService } from "./hebb-mate.service";
import type { HebbMateCapabilityId, HebbMateContractKind, HebbMateDocumentKind } from "./hebb-mate.types";

class MateChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @IsOptional()
  @IsIn([
    "contract_generation",
    "document_generation",
    "cv_screening",
    "document_email",
    "reports",
    "skill_suggestions",
    "automation_proposals"
  ])
  capability?: HebbMateCapabilityId;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsString()
  candidateId?: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsIn(["employment", "remote_working"])
  contractKind?: HebbMateContractKind;

  @IsOptional()
  @IsIn(["certificate_attendance", "certificate_training", "smartworking_letter", "employment_letter", "generic"])
  documentKind?: HebbMateDocumentKind;
}

class MateApplyDto {
  @IsString()
  proposalId!: string;
}

class MateUndoDto {
  @IsString()
  logId!: string;
}

class MateContractDto {
  @ValidateNested()
  @Type(() => AssistantScopeBodyDto)
  scope!: AssistantScopeBodyDto;

  @IsIn(["employment", "remote_working"])
  contractKind!: HebbMateContractKind;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  requestSummary?: string;
}

class MateDocumentDto {
  @ValidateNested()
  @Type(() => AssistantScopeBodyDto)
  scope!: AssistantScopeBodyDto;

  @IsIn(["certificate_attendance", "certificate_training", "smartworking_letter", "employment_letter", "generic"])
  documentKind!: HebbMateDocumentKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleHint?: string;
}

class MateCvScreenDto {
  @IsString()
  candidateId!: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  cvText?: string;
}

class MateDocumentEmailDto {
  @IsString()
  documentId!: string;

  @IsString()
  targetUserId!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(2000)
  body!: string;
}

class MateReportDto {
  @ValidateNested()
  @Type(() => AssistantScopeBodyDto)
  scope!: AssistantScopeBodyDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

class MateSkillsDto {
  @ValidateNested()
  @Type(() => AssistantScopeBodyDto)
  scope!: AssistantScopeBodyDto;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

class MateAutomationDto {
  @ValidateNested()
  @Type(() => AssistantScopeBodyDto)
  scope!: AssistantScopeBodyDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsString()
  workArea?: string;
}

@Controller("ai/hr/mate")
@UseGuards(NexaPermissionGuard)
export class HebbMateController {
  constructor(private readonly mate: HebbMateService) {}

  @Get("capabilities")
  @RequireNexaPermissions("nexa.lifecycle:read")
  getCapabilities(@CurrentAuth() auth: AuthContext) {
    return this.mate.listCapabilities({ userId: auth.userId, role: auth.role as AuthRole });
  }

  @Post("chat")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postChat(@CurrentAuth() auth: AuthContext, @Body() body: MateChatDto) {
    return this.mate.chat(auth, body);
  }

  @Post("apply")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postApply(@CurrentAuth() auth: AuthContext, @Body() body: MateApplyDto) {
    return this.mate.apply(auth, body.proposalId);
  }

  @Post("cancel")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postCancel(@CurrentAuth() auth: AuthContext, @Body() body: MateApplyDto) {
    return this.mate.cancelProposal(auth, body.proposalId);
  }

  @Post("undo")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postUndo(@CurrentAuth() auth: AuthContext, @Body() body: MateUndoDto) {
    return this.mate.undo(auth, body.logId);
  }

  @Get("history")
  @RequireNexaPermissions("nexa.lifecycle:read")
  getHistory(@CurrentAuth() auth: AuthContext) {
    return this.mate.listHistory(auth);
  }

  @Post("contracts/generate")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postGenerateContracts(@CurrentAuth() auth: AuthContext, @Body() body: MateContractDto) {
    return this.mate.generateContracts(auth, {
      scope: body.scope,
      contractKind: body.contractKind,
      dryRun: body.dryRun,
      requestSummary: body.requestSummary
    });
  }

  @Post("documents/generate")
  @RequireNexaPermissions("nexa.documents:write")
  postGenerateDocuments(@CurrentAuth() auth: AuthContext, @Body() body: MateDocumentDto) {
    return this.mate.generateDocuments(auth, {
      scope: body.scope,
      documentKind: body.documentKind,
      titleHint: body.titleHint
    });
  }

  @Post("cv/screen")
  @RequireNexaPermissions("nexa.recruiting:write")
  async postCvScreen(@CurrentAuth() auth: AuthContext, @Body() body: MateCvScreenDto) {
    return this.mate.chat(auth, {
      message: "Screening CV",
      capability: "cv_screening",
      candidateId: body.candidateId,
      positionId: body.positionId
    });
  }

  @Post("documents/send-email")
  @RequireNexaPermissions("nexa.documents:write")
  postSendDocumentEmail(@CurrentAuth() auth: AuthContext, @Body() body: MateDocumentEmailDto) {
    return this.mate.sendDocumentEmail(auth, body);
  }

  @Post("reports/generate")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postGenerateReport(@CurrentAuth() auth: AuthContext, @Body() body: MateReportDto) {
    return this.mate.generateReport(auth, { scope: body.scope, message: body.message });
  }

  @Post("skills/suggest")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postSuggestSkills(@CurrentAuth() auth: AuthContext, @Body() body: MateSkillsDto) {
    return this.mate.suggestSkills(auth, {
      scope: body.scope,
      roleId: body.roleId,
      message: body.message
    });
  }

  @Post("automations/propose")
  @RequireNexaPermissions("nexa.lifecycle:read")
  postProposeAutomations(@CurrentAuth() auth: AuthContext, @Body() body: MateAutomationDto) {
    return this.mate.proposeAutomations(auth, {
      scope: body.scope,
      message: body.message,
      workArea: body.workArea
    });
  }
}
