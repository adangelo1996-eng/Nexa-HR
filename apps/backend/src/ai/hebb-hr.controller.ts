import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { CurrentAuth, type AuthContext, type AuthRole, RequireRole, RoleGuard } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { HebbHrService } from "./hebb-hr.service";

class HebbSimulateItDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grossMonthlySalaryOverride?: number;

  @IsOptional()
  @IsBoolean()
  usePreviousMonthVariables?: boolean;
}

@Controller("ai/hebb-hr")
@UseGuards(RoleGuard, NexaPermissionGuard)
@RequireRole("user")
export class HebbHrController {
  constructor(private readonly hebb: HebbHrService) {}

  /** Simulazione what-if usata da «Hebb — Payroll»; la route UI dedicata simulatore assistito è stata ritirata. */
  @Post("simulate-it")
  @RequireNexaPermissions("nexa.payroll:read")
  async postSimulateIt(
    @CurrentAuth() auth: AuthContext & { role: AuthRole },
    @Body() body: HebbSimulateItDto
  ): Promise<unknown> {
    return this.hebb.simulateIt(auth, body);
  }
}
