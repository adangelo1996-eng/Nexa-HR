import { IsIn, IsOptional, IsString } from "class-validator";

export class AssistantScopeBodyDto {
  @IsIn(["self", "user", "team", "cost_center"])
  mode!: "self" | "user" | "team" | "cost_center";

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;
}
