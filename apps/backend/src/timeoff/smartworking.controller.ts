import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Patch, Param, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, Matches } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";

class CreateSwDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller("smartworking")
@UseGuards(NexaPermissionGuard)
export class SmartworkingController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Get("me")
  @RequireNexaPermissions("nexa.attendance:read")
  async me(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const [balance, items] = await Promise.all([
      this.store.getSmartworkingMonthlyBalance(auth.userId),
      this.store.listMySmartworking(auth.userId)
    ]);
    return { balance, items };
  }

  @Post("request")
  @UseGuards(RoleGuard)
  @RequireRole("employee")
  @RequireNexaPermissions("nexa.attendance:write")
  async request(@CurrentAuth() auth: AuthContext, @Body() dto: CreateSwDto): Promise<unknown> {
    return this.store.createSmartworkingRequest(auth.userId, dto.day, dto.note, auth.role);
  }

  @Delete("request/:id")
  async cancelRequest(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    if (auth.role !== "admin") {
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
        if (!apprW || auth.role !== "team_lead" || !(await this.store.isManagerOf(auth.userId, row.userId))) {
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
    if (auth.role !== "admin") {
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
        if (!apprW || auth.role !== "team_lead" || !(await this.store.isManagerOf(auth.userId, row.userId))) {
          throw new ForbiddenException();
        }
      }
    }
    return this.store.updateSmartworkingRequest(auth.userId, id, dto.day, dto.note, auth.role);
  }

  @Get("pending")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:read")
  async pending(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    if (auth.role === "admin") {
      return { items: await this.store.listAllPendingSmartworkingRequests() };
    }
    return { items: await this.store.listPendingSmartworkingForManager(auth.userId) };
  }

  @Patch(":id/approve")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@CurrentAuth() auth: { userId: string }, @Param("id") id: string): Promise<unknown> {
    return this.store.decideSmartworkingRequest(id, auth.userId, true);
  }

  @Patch(":id/reject")
  @UseGuards(RoleGuard)
  @RequireRole("team_lead")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(
    @CurrentAuth() auth: { userId: string },
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ): Promise<unknown> {
    return this.store.decideSmartworkingRequest(id, auth.userId, false, body?.reason);
  }
}
