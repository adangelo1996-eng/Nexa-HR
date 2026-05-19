import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf
} from "class-validator";
import { memoryStorage } from "multer";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { LinkedInJobSyncService } from "./linkedin/linkedin-job-sync.service";
import { RecruitCvScreenService } from "./recruit-cv-screen.service";
import { RecruitingService } from "./recruiting.service";

class CreatePositionDto {
  @IsString()
  @MaxLength(140)
  title!: string;

  @IsString()
  jobDescription!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsBoolean()
  publishToLinkedIn?: boolean;
}

class CreateCandidateDto {
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
  @Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? undefined : value))
  @ValidateIf((_, v) => v != null && v !== "")
  @IsString()
  @MaxLength(40)
  @Matches(/^\+?[0-9][0-9\s().\-/]{4,39}$/, { message: "Telefono non valido" })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  privacyNoticeVersion?: string;

  @IsOptional()
  @IsDateString()
  consentRecordedAt?: string;
}

class AttachCandidateDto {
  @IsString()
  candidateId!: string;

  @IsString()
  positionId!: string;
}

class MoveStageDto {
  @IsString()
  nextStageId!: string;
}

class DecideDto {
  @IsIn(["in_progress", "passed", "failed"])
  status!: "in_progress" | "passed" | "failed";
}

class ScreenCvDto {
  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  cvText?: string;
}

class ScreenCvBatchDto {
  @IsString()
  positionId!: string;

  @IsString({ each: true })
  candidateIds!: string[];
}

@Controller("recruiting")
@UseGuards(NexaPermissionGuard)
export class RecruitingController {
  constructor(
    private readonly svc: RecruitingService,
    private readonly linkedInSync: LinkedInJobSyncService,
    private readonly cvScreen: RecruitCvScreenService
  ) {}

  @Get("positions")
  @RequireNexaPermissions("nexa.recruiting:read")
  async listPositions(@CurrentAuth() auth: AuthContext): Promise<{ items: unknown[] }> {
    const tenantId = auth.tenantId ?? "comp-1";
    const items = await this.svc.listPositions(tenantId);
    return { items };
  }

  @Post("positions")
  @RequireNexaPermissions("nexa.recruiting:write")
  async createPosition(@CurrentAuth() auth: AuthContext, @Body() dto: CreatePositionDto): Promise<unknown> {
    const companyId = auth.tenantId ?? "comp-1";
    const created = await this.svc.createPosition({
      companyId,
      title: dto.title,
      jobDescription: dto.jobDescription,
      createdByUserId: auth.userId,
      dueDate: dto.dueDate ?? null,
      location: dto.location?.trim() ? dto.location.trim() : null
    });
    if (dto.publishToLinkedIn) {
      return this.linkedInSync.publishPositionToLinkedIn(companyId, created.id);
    }
    void this.linkedInSync.maybeAutoPublishOnCreate(companyId, created.id);
    return created;
  }

  @Delete("positions/:id")
  @RequireNexaPermissions("nexa.recruiting:write")
  async deletePosition(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.svc.deleteOpenPosition(auth.tenantId ?? "comp-1", id);
    return { ok: true };
  }

  @Get("candidates")
  @RequireNexaPermissions("nexa.recruiting:read")
  async listCandidates(
    @CurrentAuth() auth: AuthContext,
    @Query("minScore") minScoreRaw?: string,
    @Query("sortByScore") sortByScore?: string
  ): Promise<{ items: unknown[] }> {
    const minScore =
      minScoreRaw != null && minScoreRaw.trim() !== "" ? Number(minScoreRaw) : undefined;
    const items = await this.svc.listCandidates(auth.tenantId ?? "comp-1", {
      minScore: Number.isFinite(minScore) ? minScore : undefined,
      sortByScore: sortByScore === "asc" || sortByScore === "desc" ? sortByScore : undefined
    });
    return { items };
  }

  @Get("candidates/:id/export")
  @RequireNexaPermissions("nexa.recruiting:read")
  async exportCandidate(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<unknown> {
    return this.svc.exportCandidateJson(auth.tenantId ?? "comp-1", id);
  }

  @Get("candidates/:id/documents")
  @RequireNexaPermissions("nexa.recruiting:read")
  async listDocs(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ items: unknown[] }> {
    const items = await this.svc.listCandidateDocuments(auth.tenantId ?? "comp-1", id);
    return { items };
  }

  @Get("candidates/:id")
  @RequireNexaPermissions("nexa.recruiting:read")
  async getCandidate(@Param("id") id: string): Promise<unknown> {
    const candidate = await this.svc.getCandidate(id);
    const states = await this.svc.listCandidateStates(id);
    return { candidate, states };
  }

  @Post("candidates")
  @RequireNexaPermissions("nexa.recruiting:write")
  async createCandidate(@CurrentAuth() auth: AuthContext, @Body() dto: CreateCandidateDto): Promise<unknown> {
    return this.svc.createCandidate({
      companyId: auth.tenantId ?? "comp-1",
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      notes: dto.notes ?? "",
      createdByUserId: auth.userId,
      privacyNoticeVersion: dto.privacyNoticeVersion ?? null,
      consentRecordedAt: dto.consentRecordedAt ?? null
    });
  }

  @Delete("candidates/:id")
  @RequireNexaPermissions("nexa.recruiting:write")
  async deleteCandidate(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    await this.svc.deleteCandidate(auth.tenantId ?? "comp-1", id);
    return { ok: true };
  }

  @Post("attach")
  @RequireNexaPermissions("nexa.recruiting:write")
  async attach(@CurrentAuth() auth: AuthContext, @Body() dto: AttachCandidateDto): Promise<unknown> {
    return this.svc.attachCandidateToPosition({
      companyId: auth.tenantId ?? "comp-1",
      candidateId: dto.candidateId,
      positionId: dto.positionId,
      actorUserId: auth.userId
    });
  }

  @Get("board/:positionId")
  @RequireNexaPermissions("nexa.recruiting:read")
  async board(@Param("positionId") positionId: string): Promise<unknown> {
    return this.svc.listPipelineBoard(positionId);
  }

  @Get("onboarding")
  @RequireNexaPermissions("nexa.recruiting:read")
  async onboarding(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    const items = await this.svc.listOnboardingCandidatesForCompany(auth.tenantId ?? "comp-1");
    return { items };
  }

  @Patch("state/:stateId/move")
  @RequireNexaPermissions("nexa.recruiting:write")
  async move(
    @CurrentAuth() auth: AuthContext,
    @Param("stateId") stateId: string,
    @Body() dto: MoveStageDto
  ): Promise<unknown> {
    return this.svc.moveCandidateToStage({ stateId, nextStageId: dto.nextStageId, actorUserId: auth.userId });
  }

  @Patch("state/:stateId/decision")
  @RequireNexaPermissions("nexa.recruiting:write")
  async decide(
    @CurrentAuth() auth: AuthContext,
    @Param("stateId") stateId: string,
    @Body() dto: DecideDto
  ): Promise<unknown> {
    return this.svc.setCandidateDecision({ stateId, status: dto.status, actorUserId: auth.userId });
  }

  @Patch("state/:stateId/undo-move")
  @RequireNexaPermissions("nexa.recruiting:write")
  async undoMove(@CurrentAuth() auth: AuthContext, @Param("stateId") stateId: string): Promise<unknown> {
    return this.svc.undoLastStageMove({ stateId, actorUserId: auth.userId });
  }

  @Post("candidates/screen-cv-batch")
  @RequireNexaPermissions("nexa.recruiting:write")
  async screenCvBatch(@CurrentAuth() auth: AuthContext, @Body() dto: ScreenCvBatchDto): Promise<unknown> {
    return this.cvScreen.screenCandidateCvBatch(auth, {
      positionId: dto.positionId,
      candidateIds: dto.candidateIds ?? []
    });
  }

  @Post("candidates/:id/screen-cv")
  @RequireNexaPermissions("nexa.recruiting:write")
  async screenCv(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: ScreenCvDto
  ): Promise<unknown> {
    return this.cvScreen.screenCandidateCv(auth, {
      candidateId: id,
      positionId: dto.positionId,
      cvText: dto.cvText
    });
  }

  @Post("candidates/:candidateId/documents")
  @RequireNexaPermissions("nexa.recruiting:write")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 }
    })
  )
  async uploadDoc(
    @CurrentAuth() auth: AuthContext,
    @Param("candidateId") candidateId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("kind") kindRaw?: string,
    @Body("label") label?: string
  ): Promise<unknown> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("File mancante");
    }
    const kind = kindRaw === "other" ? "other" : "cv";
    return this.svc.uploadCandidateDocument({
      companyId: auth.tenantId ?? "comp-1",
      candidateId,
      actorUserId: auth.userId,
      buffer: file.buffer,
      originalName: file.originalname || "upload",
      mimeType: file.mimetype || "application/octet-stream",
      kind,
      label: label?.trim() ? label.trim() : undefined
    });
  }

  @Delete("documents/:documentId")
  @RequireNexaPermissions("nexa.recruiting:write")
  async deleteDoc(@CurrentAuth() auth: AuthContext, @Param("documentId") documentId: string): Promise<{ ok: true }> {
    await this.svc.deleteCandidateDocument(auth.tenantId ?? "comp-1", documentId);
    return { ok: true };
  }

  @Get("documents/:documentId/file")
  @RequireNexaPermissions("nexa.recruiting:read")
  async docFile(
    @CurrentAuth() auth: AuthContext,
    @Param("documentId") documentId: string
  ): Promise<StreamableFile> {
    const { buffer, mimeType, downloadName } = await this.svc.getCandidateDocumentFile(
      auth.tenantId ?? "comp-1",
      documentId
    );
    return new StreamableFile(buffer, {
      type: mimeType,
      disposition: `attachment; filename="${downloadName.replace(/"/g, "")}"`
    });
  }
}

