import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrCenterAnalyticsRunDto } from "./hr-center-analytics-run.dto";
import { HrCenterPersonnelBudgetAiDto } from "./hr-center-personnel-budget-ai.dto";
import { HrCenterRecapBodyDto } from "./hr-center-recap-body.dto";
import { HrCenterService } from "./hr-center.service";

@Controller("hr-center")
@UseGuards(RoleGuard)
@RequireRole("user")
export class HrCenterController {
  constructor(private readonly hrCenter: HrCenterService) {}

  @Get("meta")
  meta(@CurrentAuth() auth: AuthContext): ReturnType<HrCenterService["getMeta"]> {
    return this.hrCenter.getMeta(auth);
  }

  @Post("analytics/run")
  postAnalytics(
    @CurrentAuth() auth: AuthContext,
    @Body() body: HrCenterAnalyticsRunDto
  ): ReturnType<HrCenterService["runAnalytics"]> {
    return this.hrCenter.runAnalytics(auth, body ?? {});
  }

  @Post("contracts/draft")
  postContractDraft(@CurrentAuth() auth: AuthContext): ReturnType<HrCenterService["runContractDraft"]> {
    return this.hrCenter.runContractDraft(auth);
  }

  @Post("personnel-budget-report/run")
  postPersonnelBudgetReport(
    @CurrentAuth() auth: AuthContext,
    @Body() body: HrCenterPersonnelBudgetAiDto
  ): ReturnType<HrCenterService["runPersonnelBudgetAiReport"]> {
    return this.hrCenter.runPersonnelBudgetAiReport(auth, body);
  }

  @Post("recap/run")
  postRecap(
    @CurrentAuth() auth: AuthContext,
    @Body() body: HrCenterRecapBodyDto
  ): ReturnType<HrCenterService["runRecap"]> {
    return this.hrCenter.runRecap(auth, body);
  }
}
