import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { isSynapseSuperuserEmail } from "./synapse-superuser";
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { CurrentAuth, RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "./nexa-permission.guard";

class AssignRoleDto {
  @IsString()
  userId!: string;

  @IsIn(["admin", "manager_controllo_gestione", "employee"])
  role!: "admin" | "manager_controllo_gestione" | "employee";
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

  @IsIn(["admin", "manager_controllo_gestione", "employee"])
  role!: "admin" | "manager_controllo_gestione" | "employee";

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
  avsNumber?: string;

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
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
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
  @IsIn(["admin", "manager_controllo_gestione", "employee"])
  role?: "admin" | "manager_controllo_gestione" | "employee";

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
  avsNumber?: string;

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
}

@Controller("users")
export class UserController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("manager_controllo_gestione")
  @RequireNexaPermissions("nexa.admin_users:read")
  async list(): Promise<unknown> {
    return this.store.listUsers();
  }

  @Get("me")
  async me(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const user = await this.store.getUser(auth.userId);
    return { ...user, isSynapseSuperuser: isSynapseSuperuserEmail(user.email) };
  }

  @Get("roles")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("admin")
  @RequireNexaPermissions("nexa.admin_roles:read")
  roles(): unknown {
    return this.store.listRoles();
  }

  @Patch("assign-role")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("admin")
  @RequireNexaPermissions("nexa.admin_users:write")
  async assignRole(@Body() dto: AssignRoleDto): Promise<unknown> {
    return this.store.assignRole(dto.userId, dto.role);
  }

  @Post()
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("admin")
  @RequireNexaPermissions("nexa.admin_users:write")
  async create(@Body() dto: CreateUserDto): Promise<unknown> {
    return this.store.createUser(dto);
  }

  @Patch(":userId")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("admin")
  @RequireNexaPermissions("nexa.admin_users:write")
  async update(@Param("userId") userId: string, @Body() dto: UpdateUserDto): Promise<unknown> {
    return this.store.updateUser(userId, dto);
  }

  @Patch(":userId/manager")
  @UseGuards(RoleGuard, NexaPermissionGuard)
  @RequireRole("admin")
  @RequireNexaPermissions("nexa.admin_users:write")
  async updateManager(
    @Param("userId") userId: string,
    @Body() dto: { managerId?: string }
  ): Promise<unknown> {
    return this.store.updateUserManager(userId, dto.managerId);
  }
}
