import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentAuth, RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";
import {
  assertImportSuperuser,
  ImportService,
  IMPORT_MAX_FILE_BYTES
} from "./import.service";
import { NexaPermissionGuard, RequireNexaPermissions } from "./nexa-permission.guard";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

@Controller("admin/import")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("admin")
export class ImportController {
  constructor(
    private readonly store: HrDataStore,
    private readonly importService: ImportService
  ) {}

  @Get("template")
  @RequireNexaPermissions("nexa.import:read")
  async template(
    @Query("category") category: string,
    @CurrentAuth() auth: { userId: string }
  ): Promise<StreamableFile> {
    await assertImportSuperuser(this.store, auth.userId);
    this.importService.assertRateLimit(auth.userId);
    if (category !== "users" && category !== "cost_centers" && category !== "roles") {
      throw new BadRequestException("category deve essere users | cost_centers | roles");
    }
    const buf = await this.importService.buildTemplate(category);
    return new StreamableFile(buf, {
      type: XLSX_MIME,
      disposition: `attachment; filename="nexa-import-${category}-template.xlsx"`
    });
  }

  @Post("validate")
  @RequireNexaPermissions("nexa.import:read")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: IMPORT_MAX_FILE_BYTES }
    })
  )
  async validate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("category") category: string,
    @CurrentAuth() auth: { userId: string }
  ): Promise<unknown> {
    await assertImportSuperuser(this.store, auth.userId);
    this.importService.assertRateLimit(auth.userId);
    if (!file?.buffer?.length) {
      throw new BadRequestException("File mancante");
    }
    if (file.mimetype !== XLSX_MIME) {
      throw new BadRequestException("Tipo file non consentito (solo .xlsx)");
    }
    this.importService.assertXlsxMagic(file.buffer);
    if (category === "users") {
      return this.importService.validateUsers(file.buffer);
    }
    if (category === "cost_centers") {
      return this.importService.validateCostCenters(file.buffer);
    }
    if (category === "roles") {
      return this.importService.validateRoles(file.buffer);
    }
    throw new BadRequestException("category deve essere users | cost_centers | roles");
  }

  @Post("apply")
  @RequireNexaPermissions("nexa.import:write")
  async apply(
    @Body() body: { category?: string; rows?: unknown[] },
    @CurrentAuth() auth: { userId: string }
  ): Promise<unknown> {
    await assertImportSuperuser(this.store, auth.userId);
    this.importService.assertRateLimit(auth.userId);
    const category = body.category;
    const rows = body.rows;
    if (category !== "users" && category !== "cost_centers" && category !== "roles") {
      throw new BadRequestException("category deve essere users | cost_centers | roles");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException("Nessuna riga da importare");
    }
    if (category === "users") {
      return this.importService.applyUsers(rows as never, auth.userId);
    }
    if (category === "cost_centers") {
      return this.importService.applyCostCenters(rows as never, auth.userId);
    }
    return this.importService.applyRoles(rows as never, auth.userId);
  }

  @Get("history")
  @RequireNexaPermissions("nexa.import:read")
  async history(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    await assertImportSuperuser(this.store, auth.userId);
    this.importService.assertRateLimit(auth.userId);
    return this.importService.listHistory();
  }
}
