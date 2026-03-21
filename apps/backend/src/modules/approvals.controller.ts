import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { CurrentAuth, RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";

class ApprovalListQuery {
  @IsOptional()
  @IsIn(["pending", "approved", "rejected"])
  status?: "pending" | "approved" | "rejected";
}

@Controller("approvals")
@UseGuards(RoleGuard)
@RequireRole("manager_controllo_gestione")
export class ApprovalsController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  async list(
    @CurrentAuth() auth: { userId: string },
    @Query() query: ApprovalListQuery
  ): Promise<unknown> {
    return this.store.listApprovalsForUser(auth.userId, query.status);
  }

  @Patch(":approvalId/approve")
  async approve(
    @CurrentAuth() auth: { userId: string },
    @Param("approvalId") approvalId: string
  ): Promise<unknown> {
    return this.store.approveByApprovalId(approvalId, auth.userId);
  }

  @Patch(":approvalId/reject")
  async reject(
    @CurrentAuth() auth: { userId: string },
    @Param("approvalId") approvalId: string
  ): Promise<unknown> {
    return this.store.rejectByApprovalId(approvalId, auth.userId);
  }
}
