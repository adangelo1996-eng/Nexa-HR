import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsDateString } from "class-validator";
import { CurrentAuth, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class SicknessDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;
}

@Controller("sickness")
@UseGuards(NexaPermissionGuard)
export class SicknessController {
  constructor(private readonly store: HrDataStore) {}

  @Post("report")
  @RequireNexaPermissions("nexa.sickness:write")
  @UseInterceptors(FileInterceptor("document"))
  async report(
    @CurrentAuth() auth: { userId: string },
    @Body() dto: SicknessDto,
    @UploadedFile() document?: Express.Multer.File
  ): Promise<unknown> {
    const ext = document?.originalname.split(".").pop()?.toLowerCase();
    if (ext && !["pdf", "jpg", "jpeg"].includes(ext)) {
      throw new Error("Formato documento non supportato");
    }
    return this.store.createSicknessEvent({
      userId: auth.userId,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      documentUrl: document ? `/uploads/${document.originalname}` : "/uploads/missing-document"
    });
  }

  @Patch("approve/:id")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@Param("id") id: string, @CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const sickness = await this.store.getSickness(id);
    if (!(await this.store.isManagerOf(auth.userId, sickness.userId))) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.approveSickness(id, auth.userId);
  }

  @Patch("reject/:id")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(@Param("id") id: string, @CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const sickness = await this.store.getSickness(id);
    if (!(await this.store.isManagerOf(auth.userId, sickness.userId))) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.rejectSickness(id, auth.userId);
  }

  @Get("events")
  @RequireNexaPermissions("nexa.sickness:read")
  async list(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    return this.store.listSickness(auth.userId);
  }
}
