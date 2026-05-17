import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsString } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";
import { AttendanceTeamService } from "../workforce/attendance-team.service";

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
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly attendanceTeam: AttendanceTeamService
  ) {}

  @Get("chart")
  @RequireNexaPermissions("nexa.org:read")
  async chart(
    @CurrentAuth() auth: AuthContext,
    @Query("costCenterId") costCenterId?: string,
    @Query("role") role?: string
  ): Promise<unknown> {
    const viewer = await this.store.getUser(auth.userId);
    const canHrExtended = await this.permissions.canAccessHrExtendedConsole(
      auth.userId,
      auth.role,
      viewer.email
    );
    const canRecap =
      auth.role === "superuser" ||
      canHrExtended ||
      (await this.permissions.userHasAll(auth.userId, ["nexa.reports_hr:read"]));
    const canManager = await this.attendanceTeam.canManageTeamAttendance(auth.userId);
    if (auth.role !== "superuser" && !canHrExtended && !canRecap && !canManager) {
      throw new ForbiddenException(
        "Organigramma completo riservato a HR e manager. Usa «Il mio team» per il tuo perimetro."
      );
    }
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
