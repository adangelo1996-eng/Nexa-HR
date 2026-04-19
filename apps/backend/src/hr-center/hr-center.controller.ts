import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { CurrentAuth, type AuthContext, RequireRole, RoleGuard } from "../platform/auth";
import { HrCenterService } from "./hr-center.service";

class HrCenterRecapBodyDto {
  @IsOptional()
  @IsString()
  targetUserId?: string;
}

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
  postAnalytics(@CurrentAuth() auth: AuthContext): ReturnType<HrCenterService["runAnalytics"]> {
    return this.hrCenter.runAnalytics(auth);
  }

  @Post("contracts/draft")
  postContractDraft(@CurrentAuth() auth: AuthContext): ReturnType<HrCenterService["runContractDraft"]> {
    return this.hrCenter.runContractDraft(auth);
  }

  @Post("recap/run")
  postRecap(
    @CurrentAuth() auth: AuthContext,
    @Body() body: HrCenterRecapBodyDto
  ): ReturnType<HrCenterService["runRecap"]> {
    return this.hrCenter.runRecap(auth, body.targetUserId);
  }
}
