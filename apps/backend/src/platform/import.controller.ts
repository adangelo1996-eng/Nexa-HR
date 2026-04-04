import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { CurrentAuth, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";
import {
  assertImportSuperuser,
  ImportService,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  type ImportCategory,
  type ImportCellError
} from "./import.service";
import { NexaPermissionGuard, RequireNexaPermissions } from "./nexa-permission.guard";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const IMPORT_CATEGORIES: ImportCategory[] = [
  "users",
  "cost_centers",
  "roles",
  "leave_allowances",
  "user_managers",
  "user_payroll_anagrafica"
];

function parseCategory(raw: string): ImportCategory {
  if (IMPORT_CATEGORIES.includes(raw as ImportCategory)) {
    return raw as ImportCategory;
  }
  throw new BadRequestException(
    `category deve essere: ${IMPORT_CATEGORIES.join(" | ")}`
  );
}

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]?.trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

@Controller("admin/import")
@UseGuards(RoleGuard, NexaPermissionGuard)
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
    const cat = parseCategory(category);
    const buf = await this.importService.buildTemplate(cat);
    return new StreamableFile(buf, {
      type: XLSX_MIME,
      disposition: `attachment; filename="nexa-import-${cat}-template.xlsx"`
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
    @CurrentAuth() auth: { userId: string },
    @Req() req: Request
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
    const cat = parseCategory(category);
    const actorUser = await this.store.getUser(auth.userId);
    const actor = { userId: auth.userId, email: actorUser.email };

    let out: { errors: ImportCellError[]; rows: unknown[] };
    if (cat === "users") {
      const v = await this.importService.validateUsers(file.buffer);
      out = { errors: v.errors, rows: v.rows };
    } else if (cat === "cost_centers") {
      const v = await this.importService.validateCostCenters(file.buffer);
      out = { errors: v.errors, rows: v.rows };
    } else if (cat === "roles") {
      const v = await this.importService.validateRoles(file.buffer);
      out = { errors: v.errors, rows: v.rows };
    } else if (cat === "leave_allowances") {
      const v = await this.importService.validateLeaveAllowances(file.buffer);
      out = { errors: v.errors, rows: v.rows };
    } else if (cat === "user_payroll_anagrafica") {
      const v = await this.importService.validateUserPayrollAnagrafica(file.buffer);
      out = { errors: v.errors, rows: v.rows };
    } else {
      const v = await this.importService.validateUserManagers(file.buffer);
      out = { errors: v.errors, rows: v.rows };
    }

    await this.importService.recordValidateAttempt({
      category: cat,
      actor,
      rowCount: out.rows.length,
      errors: out.errors,
      fileName: file.originalname,
      fileSizeBytes: file.size,
      clientIp: clientIp(req)
    });
    return out;
  }

  @Post("apply")
  @RequireNexaPermissions("nexa.import:write")
  async apply(
    @Body() body: { category?: string; rows?: unknown[] },
    @CurrentAuth() auth: { userId: string },
    @Req() req: Request
  ): Promise<unknown> {
    await assertImportSuperuser(this.store, auth.userId);
    this.importService.assertRateLimit(auth.userId);
    const category = body.category ? parseCategory(body.category) : null;
    if (!category) {
      throw new BadRequestException("category obbligatorio");
    }
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException("Nessuna riga da importare");
    }
    if (rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(`Massimo ${IMPORT_MAX_ROWS} righe per richiesta apply`);
    }
    const actorUser = await this.store.getUser(auth.userId);
    const actor = { userId: auth.userId, email: actorUser.email };
    const ip = clientIp(req);

    if (category === "users") {
      return this.importService.applyUsers(rows as never, actor, ip);
    }
    if (category === "cost_centers") {
      return this.importService.applyCostCenters(rows as never, actor, ip);
    }
    if (category === "roles") {
      return this.importService.applyRoles(rows as never, actor, ip);
    }
    if (category === "leave_allowances") {
      return this.importService.applyLeaveAllowances(rows as never, actor, ip);
    }
    if (category === "user_payroll_anagrafica") {
      return this.importService.applyUserPayrollAnagrafica(rows as never, actor, ip);
    }
    return this.importService.applyUserManagers(rows as never, actor, ip);
  }

  @Get("history")
  @RequireNexaPermissions("nexa.import:read")
  async history(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    await assertImportSuperuser(this.store, auth.userId);
    this.importService.assertRateLimit(auth.userId);
    return this.importService.listHistory();
  }
}
