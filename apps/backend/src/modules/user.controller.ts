import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { CurrentAuth, RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";

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

  @IsIn(["admin", "manager_controllo_gestione", "employee"])
  role!: "admin" | "manager_controllo_gestione" | "employee";

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsString()
  companyId!: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

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
  @UseGuards(RoleGuard)
  @RequireRole("manager_controllo_gestione")
  async list(): Promise<unknown> {
    return this.store.listUsers();
  }

  @Get("me")
  async me(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    return this.store.getUser(auth.userId);
  }

  @Get("roles")
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  roles(): unknown {
    return this.store.listRoles();
  }

  @Patch("assign-role")
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  async assignRole(@Body() dto: AssignRoleDto): Promise<unknown> {
    return this.store.assignRole(dto.userId, dto.role);
  }

  @Post()
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  async create(@Body() dto: CreateUserDto): Promise<unknown> {
    return this.store.createUser(dto);
  }

  @Patch(":userId")
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  async update(@Param("userId") userId: string, @Body() dto: UpdateUserDto): Promise<unknown> {
    return this.store.updateUser(userId, dto);
  }

  @Patch(":userId/manager")
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  async updateManager(
    @Param("userId") userId: string,
    @Body() dto: { managerId?: string }
  ): Promise<unknown> {
    return this.store.updateUserManager(userId, dto.managerId);
  }
}
