import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import { CurrentAuth, RequireRole, RoleGuard } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class ApprovalListQuery {
  @IsOptional()
  @IsIn(["pending", "approved", "rejected"])
  status?: "pending" | "approved" | "rejected";
}

class RejectApprovalBody {
  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller("approvals")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("manager_controllo_gestione")
export class ApprovalsController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  @RequireNexaPermissions("nexa.approvals:read")
  async list(
    @CurrentAuth() auth: { userId: string },
    @Query() query: ApprovalListQuery
  ): Promise<unknown> {
    return this.store.listApprovalsForUser(auth.userId, query.status);
  }

  @Patch(":approvalId/approve")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(
    @CurrentAuth() auth: { userId: string },
    @Param("approvalId") approvalId: string
  ): Promise<unknown> {
    return this.store.approveByApprovalId(approvalId, auth.userId);
  }

  @Patch(":approvalId/reject")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(
    @CurrentAuth() auth: { userId: string },
    @Param("approvalId") approvalId: string,
    @Body() body: RejectApprovalBody
  ): Promise<unknown> {
    return this.store.rejectByApprovalId(approvalId, auth.userId, body?.reason);
  }
}
