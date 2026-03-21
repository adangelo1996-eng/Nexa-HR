import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import { RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";

class CreateRoleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

class CreateCostCenterDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateCostCenterDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller("admin")
@UseGuards(RoleGuard)
@RequireRole("admin")
export class AdminController {
  constructor(private readonly store: HrDataStore) {}

  @Get("roles")
  listRoles(): unknown {
    return this.store.listRoles();
  }

  @Post("roles")
  createRole(@Body() dto: CreateRoleDto): unknown {
    return this.store.createRole(dto);
  }

  @Patch("roles/:roleId")
  updateRole(@Param("roleId") roleId: string, @Body() dto: UpdateRoleDto): unknown {
    return this.store.updateRole(roleId, dto);
  }

  @Delete("roles/:roleId")
  deleteRole(@Param("roleId") roleId: string): unknown {
    return this.store.deleteRole(roleId);
  }

  @Get("cost-centers")
  listCostCenters(): unknown {
    return this.store.listCostCenters();
  }

  @Post("cost-centers")
  createCostCenter(@Body() dto: CreateCostCenterDto): unknown {
    return this.store.createCostCenter(dto);
  }

  @Patch("cost-centers/:costCenterId")
  updateCostCenter(
    @Param("costCenterId") costCenterId: string,
    @Body() dto: UpdateCostCenterDto
  ): unknown {
    return this.store.updateCostCenter(costCenterId, dto);
  }

  @Delete("cost-centers/:costCenterId")
  deleteCostCenter(@Param("costCenterId") costCenterId: string): unknown {
    return this.store.deleteCostCenter(costCenterId);
  }
}

