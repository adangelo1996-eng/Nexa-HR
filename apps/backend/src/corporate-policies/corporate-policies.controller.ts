import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { CorporatePoliciesService } from "./corporate-policies.service";

const MAX_B64 = 14_000_000;

class UploadCorporatePolicyDto {
  @IsString()
  @MaxLength(512)
  title!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  originalName?: string;

  @IsString()
  bodyBase64!: string;
}

@Controller("corporate-policies")
@UseGuards(NexaPermissionGuard)
export class CorporatePoliciesController {
  constructor(
    private readonly policies: CorporatePoliciesService,
    private readonly store: HrDataStore
  ) {}

  @Get()
  @RequireNexaPermissions("nexa.corporate_policies:read")
  async list(@CurrentAuth() auth: AuthContext) {
    const me = await this.store.getUser(auth.userId);
    const items = await this.policies.list(me.companyId);
    return { items };
  }

  @Get(":id/file")
  @RequireNexaPermissions("nexa.corporate_policies:read")
  async download(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<StreamableFile> {
    const me = await this.store.getUser(auth.userId);
    const { buffer, mimeType, downloadName } = await this.policies.getFile(me.companyId, id);
    return new StreamableFile(buffer, {
      type: mimeType,
      disposition: `attachment; filename="${encodeURIComponent(downloadName)}"`
    });
  }

  @Post("upload")
  async upload(@CurrentAuth() auth: AuthContext, @Body() dto: UploadCorporatePolicyDto) {
    await this.policies.assertCanManagePolicies(auth.userId, auth.role);
    if (dto.bodyBase64.length > MAX_B64) {
      throw new BadRequestException("File troppo grande per upload inline");
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(dto.bodyBase64, "base64");
    } catch {
      throw new BadRequestException("bodyBase64 non valido");
    }
    const me = await this.store.getUser(auth.userId);
    const row = await this.policies.upload({
      companyId: me.companyId,
      actorUserId: auth.userId,
      title: dto.title,
      description: dto.description,
      buffer: buf,
      mimeType: dto.mimeType?.trim() || "application/pdf",
      originalName: dto.originalName?.trim() || "document"
    });
    return { item: row };
  }
}
