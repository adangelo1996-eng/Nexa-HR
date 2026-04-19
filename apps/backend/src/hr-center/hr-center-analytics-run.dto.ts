import { IsIn, IsOptional, IsString } from "class-validator";

export type HrCenterAnalyticsDeepDive = "none" | "master_data" | "budget_turnover";

export class HrCenterAnalyticsRunDto {
  @IsOptional()
  @IsIn(["company", "cost_center", "team", "employee"])
  focus?: "company" | "cost_center" | "team" | "employee";

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(["none", "master_data", "budget_turnover"])
  deepDive?: HrCenterAnalyticsDeepDive;
}
