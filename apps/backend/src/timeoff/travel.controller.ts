import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, Matches } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";

class CreateTravelDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller("travel")
@UseGuards(NexaPermissionGuard)
export class TravelController {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  @Get("me")
  @RequireNexaPermissions("nexa.attendance:read")
  async me(@CurrentAuth() auth: { userId: string }): Promise<unknown> {
    const items = await this.store.listMyTravel(auth.userId);
    return { items };
  }

  @Post("request")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.attendance:write")
  async request(@CurrentAuth() auth: AuthContext, @Body() dto: CreateTravelDto): Promise<unknown> {
    return this.store.createTravelRequest(auth.userId, dto.day, dto.note, auth.role);
  }

  @Delete("request/:id")
  async cancelRequest(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<{ ok: true }> {
    if (auth.role !== "superuser") {
      const row = await this.store.findTravelRequestById(id);
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
    await this.store.cancelTravelRequest(auth.userId, id, auth.role);
    return { ok: true };
  }

  @Patch("request/:id")
  async updateRequest(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: CreateTravelDto
  ): Promise<unknown> {
    if (auth.role !== "superuser") {
      const row = await this.store.findTravelRequestById(id);
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
    return this.store.updateTravelRequest(auth.userId, id, dto.day, dto.note, auth.role);
  }

  @Get("pending")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.approvals:read")
  async pending(@CurrentAuth() auth: AuthContext): Promise<unknown> {
    if (auth.role === "superuser") {
      return { items: await this.store.listAllPendingTravelRequests() };
    }
    return { items: await this.store.listPendingTravelForManager(auth.userId) };
  }

  @Patch(":id/approve")
  @UseGuards(RoleGuard)
  @RequireRole("user")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@CurrentAuth() auth: { userId: string }, @Param("id") id: string): Promise<unknown> {
    return this.store.decideTravelRequest(id, auth.userId, true);
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
    return this.store.decideTravelRequest(id, auth.userId, false, body?.reason);
  }
}
