import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString } from "class-validator";
import { RoleGuard } from "./auth";
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

function optionalCostCenterCodeTransform(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const s = String(value).trim();
  return s.length === 0 ? undefined : s;
}

class CreateCostCenterDto {
  @IsOptional()
  @Transform(({ value }) => optionalCostCenterCodeTransform(value))
  @IsString()
  code?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}

class CreateWorkTeamDto {
  @IsString()
  name!: string;
}

class PatchWorkTeamDto {
  @IsOptional()
  @IsString()
  name?: string;
}

class SetWorkTeamMembersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

class SetWorkTeamLeadDto {
  @IsString()
  userId!: string;

  @IsString()
  roleId!: string;
}

class UpdateCostCenterDto {
  @IsOptional()
  @Transform(({ value }) => optionalCostCenterCodeTransform(value))
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  companyId?: string | null;
}

@Controller("admin")
@UseGuards(RoleGuard, NexaPermissionGuard)
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

  @Get("cost-centers/:costCenterId/teams")
  @RequireNexaPermissions("nexa.admin_cost_centers:read")
  listWorkTeams(@Param("costCenterId") costCenterId: string): unknown {
    return this.store.listWorkTeamsByCostCenter(costCenterId);
  }

  @Post("cost-centers/:costCenterId/teams")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  createWorkTeam(@Param("costCenterId") costCenterId: string, @Body() dto: CreateWorkTeamDto): unknown {
    return this.store.createWorkTeam(costCenterId, dto.name);
  }

  @Patch("work-teams/:teamId")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  patchWorkTeam(@Param("teamId") teamId: string, @Body() dto: PatchWorkTeamDto): unknown {
    return this.store.updateWorkTeam(teamId, dto);
  }

  @Patch("work-teams/:teamId/members")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  setWorkTeamMembers(@Param("teamId") teamId: string, @Body() dto: SetWorkTeamMembersDto): unknown {
    return this.store.setWorkTeamMembers(teamId, dto.userIds);
  }

  @Patch("work-teams/:teamId/lead")
  @RequireNexaPermissions("nexa.admin_cost_centers:write")
  setWorkTeamLead(@Param("teamId") teamId: string, @Body() dto: SetWorkTeamLeadDto): unknown {
    return this.store.setTeamLead(teamId, dto.userId, dto.roleId);
  }
}
