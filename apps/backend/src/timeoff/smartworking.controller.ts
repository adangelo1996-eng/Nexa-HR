import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Patch, Param, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, Matches, ValidateIf } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";
import { RemoteWorkPolicyService } from "../smartworking/remote-work-policy.service";

const SMARTWORKING_MAX_RANGE_DAYS = 14;

class CreateSwDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day!: string;

  @IsOptional()
  @ValidateIf((o: CreateSwDto) => Boolean(o.endDay?.trim()))
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDay?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Solo `superuser`: registra la richiesta per un altro dipendente (calendario HR). */
  @IsOptional()
  @IsString()
  userId?: string;
}

@Controller("smartworking")
@UseGuards(NexaPermissionGuard)
export class SmartworkingController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly remoteWorkPolicy: RemoteWorkPolicyService
  ) {}

  @Get("me")
  @RequireNexaPermissions("nexa.attendance:read")
  async me(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const month = new Date().toISOString().slice(0, 7);
    const [balance, items, limits] = await Promise.all([
      this.store.getSmartworkingMonthlyBalance(auth.userId),
      this.store.listMySmartworking(auth.userId),
      this.remoteWorkPolicy.getEffectiveLimitsForUser(auth.userId, month)
    ]);
    return {
      balance,
      items,
      allowedRemoteDaysPerWeek: limits.allowedRemoteDaysPerWeek,
      allowedRemoteDaysPerMonth: limits.allowedRemoteDaysPerMonth,
      allowedRemoteDaysPerYear: limits.allowedRemoteDaysPerYear,
      maxRequestRangeDays: SMARTWORKING_MAX_RANGE_DAYS,
      policyYear: limits.policyYear,
      limitsSource: limits.source,
      sourceContractId: limits.sourceContractId ?? null
    };
  }

  @Post("request")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.attendance:write")
  async request(@CurrentAuth() auth: AuthContext, @Body() dto: CreateSwDto): Promise<unknown> {
    let targetUserId = auth.userId;
    const proxy = dto.userId?.trim();
    if (proxy && proxy !== auth.userId) {
      if (auth.role !== "superuser") {
        throw new ForbiddenException("Solo un superuser può registrare remote working per altri utenti.");
      }
      targetUserId = proxy;
    }
    return this.store.createSmartworkingRequest(targetUserId, dto.day, dto.note, auth.role, dto.endDay);
  }

  @Delete("request/:id")
  async cancelRequest(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    if (auth.role !== "superuser") {
      const row = await this.store.findSmartworkingRequestById(id);
      if (!row) {
        throw new NotFoundException();
      }
      const attendW = await this.permissions.userHasAll(auth.userId, ["nexa.attendance:write"]);
      const apprW = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:write"]);
      if (row.userId === auth.userId) {
        if (!attendW) {
          throw new ForbiddenException();
        }
      } else {
        const canManage =
          (await this.store.isManagerOf(auth.userId, row.userId)) ||
          (await this.store.isUserLeadOfTeamContaining(auth.userId, row.userId));
        if (!apprW || !canManage) {
          throw new ForbiddenException();
        }
      }
    }
    await this.store.cancelSmartworkingRequest(auth.userId, id, auth.role);
    return { ok: true };
  }

  @Patch("request/:id")
  async updateRequest(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: CreateSwDto
  ): Promise<unknown> {
    if (auth.role !== "superuser") {
      const row = await this.store.findSmartworkingRequestById(id);
      if (!row) {
        throw new NotFoundException();
      }
      const attendW = await this.permissions.userHasAll(auth.userId, ["nexa.attendance:write"]);
      const apprW = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:write"]);
      if (row.userId === auth.userId) {
        if (!attendW) {
          throw new ForbiddenException();
        }
      } else {
        const canManage =
          (await this.store.isManagerOf(auth.userId, row.userId)) ||
          (await this.store.isUserLeadOfTeamContaining(auth.userId, row.userId));
        if (!apprW || !canManage) {
          throw new ForbiddenException();
        }
      }
    }
    return this.store.updateSmartworkingRequest(auth.userId, id, dto.day, dto.note, auth.role, dto.endDay);
  }

  @Get("pending")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.approvals:read")
  async pending(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    if (auth.role === "superuser") {
      return { items: await this.store.listAllPendingSmartworkingRequests() };
    }
    return { items: await this.store.listPendingSmartworkingForManager(auth.userId) };
  }

  @Patch(":id/approve")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@CurrentAuth() auth: { userId: string }, @Param("id") id: string): Promise<unknown> {
    return this.store.decideSmartworkingRequest(id, auth.userId, true);
  }

  @Patch(":id/reject")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(
    @CurrentAuth() auth: { userId: string },
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ): Promise<unknown> {
    return this.store.decideSmartworkingRequest(id, auth.userId, false, body?.reason);
  }
}
