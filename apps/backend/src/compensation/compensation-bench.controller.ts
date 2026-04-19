import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { CompensationBenchEstimateDto } from "./compensation-bench.dto";
import { CompensationBenchService } from "./compensation-bench.service";

@Controller("compensation/bench")
@UseGuards(NexaPermissionGuard)
export class CompensationBenchController {
  constructor(private readonly bench: CompensationBenchService) {}

  @Post("estimate")
  @RequireNexaPermissions("nexa.reports_hr:read")
  estimate(@CurrentAuth() auth: AuthContext, @Body() body: CompensationBenchEstimateDto) {
    return this.bench.estimate(auth, body);
  }
}
