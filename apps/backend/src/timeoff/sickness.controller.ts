import {
  Body,
  Controller,
  Delete,
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
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";

class SicknessDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;
}

@Controller("sickness")
@UseGuards(NexaPermissionGuard)
export class SicknessController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Patch("events/:id")
  async updateEvent(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: SicknessDto
  ): Promise<unknown> {
    if (auth.role !== "admin") {
      const sickW = await this.permissions.userHasAll(auth.userId, ["nexa.sickness:write"]);
      const apprW = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:write"]);
      const ev = await this.store.getSickness(id);
      if (ev.userId === auth.userId) {
        if (!sickW) {
          throw new ForbiddenException("Permessi insufficienti per modificare le proprie comunicazioni");
        }
      } else {
        if (!apprW || auth.role !== "team_lead" || !(await this.store.isManagerOf(auth.userId, ev.userId))) {
          throw new ForbiddenException(
            "Puoi modificare solo le richieste dei dipendenti di cui sei responsabile (e solo in attesa)"
          );
        }
      }
    }
    return this.store.updateSicknessEvent(id, auth.userId, dto.fromDate, dto.toDate, auth.role);
  }

  @Delete("events/:id")
  async removeEvent(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    if (auth.role !== "admin") {
      const sickW = await this.permissions.userHasAll(auth.userId, ["nexa.sickness:write"]);
      const apprW = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:write"]);
      const ev = await this.store.getSickness(id);
      if (ev.userId === auth.userId) {
        if (!sickW) {
          throw new ForbiddenException("Permessi insufficienti");
        }
      } else {
        if (!apprW || auth.role !== "team_lead" || !(await this.store.isManagerOf(auth.userId, ev.userId))) {
          throw new ForbiddenException("Operazione non consentita");
        }
      }
    }
    await this.store.cancelPendingSicknessEvent(id, auth.userId, auth.role);
    return { ok: true };
  }

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
  async approve(@Param("id") id: string, @CurrentAuth() auth: AuthContext): Promise<unknown> {
    const sickness = await this.store.getSickness(id);
    if (
      auth.role !== "admin" &&
      !(await this.store.isManagerOf(auth.userId, sickness.userId))
    ) {
      throw new ForbiddenException("Manager non autorizzato per questo dipendente");
    }
    return this.store.approveSickness(id, auth.userId);
  }

  @Patch("reject/:id")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(@Param("id") id: string, @CurrentAuth() auth: AuthContext): Promise<unknown> {
    const sickness = await this.store.getSickness(id);
    if (
      auth.role !== "admin" &&
      !(await this.store.isManagerOf(auth.userId, sickness.userId))
    ) {
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
