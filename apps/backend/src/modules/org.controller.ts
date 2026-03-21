import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsDateString, IsString } from "class-validator";
import { RequireRole, RoleGuard } from "./auth";
import { HrDataStore } from "./hr-data.store";

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
export class OrgController {
  constructor(private readonly store: HrDataStore) {}

  @Get("chart")
  async chart(): Promise<unknown> {
    return this.store.getOrgChart();
  }

  @Get("approver-chain")
  async approverChain(@Query("userId") userId: string): Promise<unknown> {
    return { userId, chain: await this.store.getApproverChainForUser(userId) };
  }

  @Post("delegation")
  @UseGuards(RoleGuard)
  @RequireRole("admin")
  async delegation(@Body() dto: DelegationDto): Promise<unknown> {
    return this.store.addDelegation(dto.managerId, dto.delegateManagerId, dto.from, dto.to);
  }
}
