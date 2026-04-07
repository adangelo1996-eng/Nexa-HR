import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { isSynapseSuperuserEmail } from "../platform/synapse-superuser";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { AttendanceTeamService } from "../workforce/attendance-team.service";
import { PermissionsService } from "../platform/permissions.service";

const PAYROLL_IT_SECTORS = [
  "industry",
  "commerce",
  "services",
  "tourism",
  "credit_insurance",
  "agriculture",
  "custom"
] as const;

class AssignRoleDto {
  @IsString()
  userId!: string;

  @IsIn(["superuser", "user"])
  role!: "superuser" | "user";
}

class CreateUserDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsIn(["superuser", "user"])
  role!: "superuser" | "user";

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsString()
  companyId!: string;

  @IsString()
  roleId!: string;

  @IsString()
  costCenterId!: string;

  @IsNumber()
  @Min(1)
  @Max(80)
  weeklyContractHours!: number;

  @IsString()
  contractType!: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bicSwift?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  vacationAllowanceDays?: number;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalaryMonthly?: number;

  @IsOptional()
  @IsIn(["IT"])
  jurisdiction?: "IT";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxMunicipalityIt?: string;

  @IsOptional()
  @IsIn(PAYROLL_IT_SECTORS as unknown as string[])
  payrollItSector?: (typeof PAYROLL_IT_SECTORS)[number] | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(40)
  payrollEmployerInpsPercent?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  payrollInailPermille?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  payrollTfrDivisor?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  payrollAtecoCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  payrollInailRiskDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  fiscalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  maritalStatus?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  dependentsChildren?: number;

  @IsOptional()
  @IsBoolean()
  dependentSpouse?: boolean;

  @IsOptional()
  @IsBoolean()
  disabilityFlag?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxDomicileMunicipalityIt?: string | null;

  @IsOptional()
  @IsBoolean()
  taxDomicileSameAsResidence?: boolean;

  @IsOptional()
  @IsIn([12, 13, 14])
  payMonthsPerYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualGrossSalary?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  partTimeModality?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ccnlCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ccnlLevel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  legalCategory?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contractEndDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedSupplementMonthly?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  garnishmentMonthlyEstimate?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fringeBenefitYtdEuros?: number | null;

  @IsOptional()
  @IsBoolean()
  contractFixedTerm?: boolean;

  /** Team di lavoro (solo console admin; opzionale in creazione). */
  @IsOptional()
  @IsString()
  teamId?: string | null;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsIn(["superuser", "user"])
  role?: "superuser" | "user";

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(80)
  weeklyContractHours?: number;

  @IsOptional()
  @IsString()
  contractType?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bicSwift?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  vacationAllowanceDays?: number;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  /** Assegnazione team (solo console admin). */
  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalaryMonthly?: number;

  @IsOptional()
  @IsIn(["IT"])
  jurisdiction?: "IT";

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxMunicipalityIt?: string;

  @IsOptional()
  @IsIn(PAYROLL_IT_SECTORS as unknown as string[])
  payrollItSector?: (typeof PAYROLL_IT_SECTORS)[number] | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(40)
  payrollEmployerInpsPercent?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  payrollInailPermille?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  payrollTfrDivisor?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  payrollAtecoCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  payrollInailRiskDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  profilePhotoPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  fiscalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  maritalStatus?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  dependentsChildren?: number;

  @IsOptional()
  @IsBoolean()
  dependentSpouse?: boolean;

  @IsOptional()
  @IsBoolean()
  disabilityFlag?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxDomicileMunicipalityIt?: string | null;

  @IsOptional()
  @IsBoolean()
  taxDomicileSameAsResidence?: boolean;

  @IsOptional()
  @IsIn([12, 13, 14])
  payMonthsPerYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualGrossSalary?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  partTimeModality?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ccnlCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ccnlLevel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  legalCategory?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contractEndDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedSupplementMonthly?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  garnishmentMonthlyEstimate?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fringeBenefitYtdEuros?: number | null;

  @IsOptional()
  @IsBoolean()
  contractFixedTerm?: boolean;
}

/** Anagrafica / profilo fisco-contratto IT: aggiornabile solo da admin/HR (non dal dipendente). */
class PatchMePayrollProfileItDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  fiscalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  maritalStatus?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  dependentsChildren?: number;

  @IsOptional()
  @IsBoolean()
  dependentSpouse?: boolean;

  @IsOptional()
  @IsBoolean()
  disabilityFlag?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxDomicileMunicipalityIt?: string | null;

  @IsOptional()
  @IsBoolean()
  taxDomicileSameAsResidence?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxMunicipalityIt?: string;

  @IsOptional()
  @IsIn([12, 13, 14])
  payMonthsPerYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualGrossSalary?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  partTimeModality?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ccnlCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ccnlLevel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  legalCategory?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contractEndDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedSupplementMonthly?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  garnishmentMonthlyEstimate?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fringeBenefitYtdEuros?: number | null;

  @IsOptional()
  @IsBoolean()
  contractFixedTerm?: boolean;
}

@Controller("users")
export class UserController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly attendanceTeam: AttendanceTeamService
  ) {}

  @Get()
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.admin_users:read")
  async list(): Promise<unknown> {
    return this.store.listUsers();
  }

  @Patch("me/payroll-profile-it")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  async patchMyPayrollProfileIt(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PatchMePayrollProfileItDto
  ): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    const canEdit =
      auth.role === "superuser" ||
      (await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, user.email));
    if (!canEdit) {
      throw new ForbiddenException(
        "Il profilo fiscale e contrattuale è gestito solo da amministratori o HR. Contatta l'ufficio HR per modifiche."
      );
    }
    return this.store.updateUser(auth.userId, dto);
  }

  @Get("me")
  async me(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    const canNexaAdmin = await this.permissions.canAccessNexaAdminUi(auth.userId, auth.role, user.email);
    const canAccessHrExtendedConsole = await this.permissions.canAccessHrExtendedConsole(
      auth.userId,
      auth.role,
      user.email
    );
    const canManageTeamAttendance = await this.attendanceTeam.canManageTeamAttendance(auth.userId);
    const workTeamIdsWhereLead = await this.store.listWorkTeamIdsWhereUserIsLead(auth.userId);
    const canAccessHrWorkflowExtras = await this.permissions.canAccessHrWorkflowExtras(
      auth.userId,
      auth.role,
      user.email,
      workTeamIdsWhereLead.length > 0
    );
    const canExportAttendanceReports = await this.permissions.canExportAttendanceReports(
      auth.userId,
      auth.role,
      user.email,
      canManageTeamAttendance
    );
    /** Calcolo/simulazione cedolino: superuser, Synapse admin, o `nexa.admin_users:read`. */
    const canAccessPayrollArea = auth.role === "superuser" || canAccessHrExtendedConsole;
    const canAccessPersonnelBudgetArea =
      auth.role === "superuser" ||
      canAccessHrExtendedConsole ||
      (await this.permissions.userHasExplicitReadCatalogKey(auth.userId, "nexa.personnel_budget:read"));
    const canEditSelfPayrollProfileIt = auth.role === "superuser" || canAccessHrExtendedConsole;
    const companyRow = await this.store.getCompanySettings(user.companyId);
    return {
      ...user,
      isSynapseSuperuser: isSynapseSuperuserEmail(user.email),
      canNexaAdmin,
      canAccessHrExtendedConsole,
      canEditSelfPayrollProfileIt,
      canAccessHrWorkflowExtras,
      canExportAttendanceReports,
      canManageTeamAttendance,
      isTeamResponsible: workTeamIdsWhereLead.length > 0,
      workTeamIdsWhereLead,
      canAccessPayrollArea,
      canAccessPersonnelBudgetArea,
      companyCcnl: companyRow.companyCcnl?.trim() || null
    };
  }

  @Get("me/calendar")
  async calendar(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from?: string,
    @Query("to") to?: string
  ): Promise<{ events: Awaited<ReturnType<HrDataStore["getUserCalendar"]>> }> {
    return { events: await this.store.getUserCalendar(auth.userId, from, to) };
  }

  @Get("me/team-work-calendar")
  async teamWorkCalendar(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from?: string,
    @Query("to") to?: string
  ): Promise<Awaited<ReturnType<HrDataStore["getCostCenterWorkCalendarForRequester"]>>> {
    return this.store.getCostCenterWorkCalendarForRequester(auth.userId, from, to);
  }

  @Get("me/profile-photo-url")
  async myProfilePhotoUrl(
    @CurrentAuth() auth: AuthContext
  ): Promise<{ url: string | null }> {
    const url = await this.store.getEmployeeProfilePhotoSignedUrl(auth.userId, auth.role, auth.userId);
    return { url };
  }

  @Get("me/notifications")
  async notifications(
    @CurrentAuth() auth: AuthContext,
    @Query("limit") limit?: string
  ): Promise<{ items: Awaited<ReturnType<HrDataStore["listUserNotifications"]>> }> {
    const cap = limit ? Number(limit) : 50;
    return { items: await this.store.listUserNotifications(auth.userId, cap) };
  }

  @Patch("me/notifications/:id/read")
  async markNotificationRead(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string
  ): Promise<unknown> {
    return this.store.markUserNotificationRead(auth.userId, id);
  }

  @Delete("me/notifications/:id")
  async deleteNotification(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string
  ): Promise<{ ok: true }> {
    await this.store.deleteUserNotification(auth.userId, id);
    return { ok: true };
  }

  @Delete("me/notifications")
  async deleteAllNotifications(@CurrentAuth() auth: AuthContext): Promise<{ ok: true }> {
    await this.store.deleteAllUserNotifications(auth.userId);
    return { ok: true };
  }

  @Get("roles")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("superuser")
  @RequireNexaPermissions("nexa.admin_roles:read")
  roles(): unknown {
    return this.store.listRoles();
  }

  @Patch("assign-role")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("superuser")
  @RequireNexaPermissions("nexa.admin_users:write")
  async assignRole(@Body() dto: AssignRoleDto): Promise<unknown> {
    return this.store.assignRole(dto.userId, dto.role);
  }

  @Post()
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("superuser")
  @RequireNexaPermissions("nexa.admin_users:write")
  async create(@Body() dto: CreateUserDto): Promise<unknown> {
    return this.store.createUser(dto, { skipTeamLeadLinkValidation: true });
  }

  @Post(":userId/profile-photo")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("superuser")
  @RequireNexaPermissions("nexa.admin_users:write")
  @UseInterceptors(FileInterceptor("file"))
  async uploadProfilePhoto(
    @Param("userId") userId: string,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<unknown> {
    if (!file?.buffer) {
      throw new BadRequestException("File mancante");
    }
    return this.store.uploadEmployeeProfilePhoto(userId, file.buffer, file.mimetype || "image/jpeg");
  }

  @Get(":userId/profile-photo-url")
  async profilePhotoUrl(
    @CurrentAuth() auth: AuthContext,
    @Param("userId") userId: string
  ): Promise<{ url: string | null }> {
    const url = await this.store.getEmployeeProfilePhotoSignedUrl(auth.userId, auth.role, userId);
    return { url };
  }

  @Patch(":userId")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("superuser")
  @RequireNexaPermissions("nexa.admin_users:write")
  async update(@Param("userId") userId: string, @Body() dto: UpdateUserDto): Promise<unknown> {
    return this.store.updateUser(userId, dto, { skipTeamLeadLinkValidation: true });
  }

  @Patch(":userId/manager")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("superuser")
  @RequireNexaPermissions("nexa.admin_users:write")
  async updateManager(
    @Param("userId") userId: string,
    @Body() dto: { managerId?: string }
  ): Promise<unknown> {
    return this.store.updateUserManager(userId, dto.managerId);
  }
}
