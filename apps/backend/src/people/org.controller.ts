import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsString } from "class-validator";
import { RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class DelegationDto {
  @IsString()
  managerId!: string;

  @IsString()
  delegateManagerId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

@Controller("org")
@UseGuards(NexaPermissionGuard)
export class OrgController {
  constructor(private readonly store: HrDataStore) {}

  @Get("chart")
  @RequireNexaPermissions("nexa.org:read")
  async chart(
    @Query("costCenterId") costCenterId?: string,
    @Query("role") role?: string
  ): Promise<unknown> {
    let r: string | undefined;
    if (role === "superuser" || role === "user") {
      r = role;
    } else if (role === "admin") {
      r = "superuser";
    } else if (role === "employee" || role === "team_lead") {
      r = "user";
    } else {
      r = undefined;
    }
    return this.store.getOrgChart({
      costCenterId: costCenterId?.trim() || undefined,
      role: r
    });
  }

  /** Centri di costo → team di lavoro → albero gerarchica (manager). */
  @Get("structure")
  @RequireNexaPermissions("nexa.org:read")
  async structure(): Promise<unknown> {
    return this.store.getOrgStructure();
  }

  @Get("approver-chain")
  @RequireNexaPermissions("nexa.org:read")
  async approverChain(@Query("userId") userId: string): Promise<unknown> {
    return { userId, chain: await this.store.getApproverChainForUser(userId) };
  }

  @Post("delegation")
  @UseGuards(RoleGuard)
  @RequireRole("superuser")
  @RequireNexaPermissions("nexa.org:write")
  async delegation(@Body() dto: DelegationDto): Promise<unknown> {
    return this.store.addDelegation(dto.managerId, dto.delegateManagerId, dto.from, dto.to);
  }
}
