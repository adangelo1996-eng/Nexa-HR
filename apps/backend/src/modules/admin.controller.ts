import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import { RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";
import {
  HUB_PERMISSIONS,
  NEXA_HR_PERMISSIONS,
  PLASTICITY_PERMISSIONS,
  SOMA_PERMISSIONS
} from "./permission-catalog";
import { NexaPermissionGuard, RequireNexaPermissions } from "./nexa-permission.guard";

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
  @IsOptional()
  @IsString()
  code?: string;

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
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("admin")
export class AdminController {
  constructor(private readonly store: HrDataStore) {}

  @Get("permission-catalog")
  @RequireNexaPermissions("nexa.admin_roles:read")
  permissionCatalog(): unknown {
    return {
      nexa_hr: NEXA_HR_PERMISSIONS,
      plasticity: PLASTICITY_PERMISSIONS,
      soma: SOMA_PERMISSIONS,
      hub: HUB_PERMISSIONS
    };
  }

  @Get("roles")
  @RequireNexaPermissions("nexa.admin_roles:read")
  listRoles(): unknown {
    return this.store.listRoles();
  }

  @Post("roles")
  @RequireNexaPermissions("nexa.admin_roles:write")
  createRole(@Body() dto: CreateRoleDto): unknown {
    return this.store.createRole(dto);
  }

  @Patch("roles/:roleId")
  @RequireNexaPermissions("nexa.admin_roles:write")
  updateRole(@Param("roleId") roleId: string, @Body() dto: UpdateRoleDto): unknown {
    return this.store.updateRole(roleId, dto);
  }

  @Delete("roles/:roleId")
  @RequireNexaPermissions("nexa.admin_roles:write")
  deleteRole(@Param("roleId") roleId: string): unknown {
    return this.store.deleteRole(roleId);
  }

  @Get("cost-centers")
  @RequireNexaPermissions("nexa.admin_cost_centers:read")
  listCostCenters(): unknown {
    return this.store.listCostCenters();
  }

  @Post("cost-centers")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  createCostCenter(@Body() dto: CreateCostCenterDto): unknown {
    return this.store.createCostCenter(dto);
  }

  @Patch("cost-centers/:costCenterId")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  updateCostCenter(
    @Param("costCenterId") costCenterId: string,
    @Body() dto: UpdateCostCenterDto
  ): unknown {
    return this.store.updateCostCenter(costCenterId, dto);
  }

  @Delete("cost-centers/:costCenterId")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  deleteCostCenter(@Param("costCenterId") costCenterId: string): unknown {
    return this.store.deleteCostCenter(costCenterId);
  }
}
