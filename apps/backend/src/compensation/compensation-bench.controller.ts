import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { CompensationBenchEstimateDto } from "./compensation-bench.dto";
import { CompensationBenchService } from "./compensation-bench.service";

@Controller("compensation/bench")
@UseGuards(NexaPermissionGuard)
export class CompensationBenchController {
  constructor(private readonly bench: CompensationBenchService) {}

  @Get("org-roles")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async listOrgRoles(): Promise<{ items: Array<{ id: string; name: string }> }> {
    const items = await this.bench.listOrgRolesForBenchmark();
    return { items };
  }

  @Post("estimate")
  @RequireNexaPermissions("nexa.reports_hr:read")
  estimate(@CurrentAuth() auth: AuthContext, @Body() body: CompensationBenchEstimateDto) {
    return this.bench.estimate(auth, body);
  }
}
