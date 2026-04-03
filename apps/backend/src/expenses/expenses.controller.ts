import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import type { ExpenseClaim } from "@payday/domain";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

class CreateExpenseDto {
  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsString()
  currency!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  kmDistance?: number;
}

@Controller("expenses")
@UseGuards(NexaPermissionGuard)
export class ExpensesController {
  constructor(private readonly store: HrDataStore) {}

  @Get()
  @RequireNexaPermissions("nexa.expenses:read")
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("scope") scope?: string
  ): Promise<{ items: ExpenseClaim[] }> {
    const s = scope === "team" ? "team" : "self";
    if (s === "team" && auth.role !== "superuser") {
      const managed = await this.store.listManagedMemberIdsForApprover(auth.userId);
      if (managed.size <= 1) {
        throw new ForbiddenException("Scope team non consentito");
      }
    }
    const items = await this.store.listExpenseClaimsForRequester(auth.userId, auth.role, s);
    return { items };
  }

  @Post()
  @RequireNexaPermissions("nexa.expenses:write")
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateExpenseDto): Promise<ExpenseClaim> {
    return this.store.createExpenseClaim(auth.userId, dto);
  }

  @Patch(":id/approve")
  @RequireNexaPermissions("nexa.approvals:write")
  async approve(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ExpenseClaim> {
    return this.store.approveExpenseClaim(id, auth.userId);
  }

  @Patch(":id/reject")
  @RequireNexaPermissions("nexa.approvals:write")
  async reject(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ExpenseClaim> {
    return this.store.rejectExpenseClaim(id, auth.userId);
  }
}
