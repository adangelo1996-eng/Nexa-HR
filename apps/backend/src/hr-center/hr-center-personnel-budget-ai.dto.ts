import { IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";

export class HrCenterPersonnelBudgetAiDto {
  @IsIn(["two_periods", "abc"])
  mode!: "two_periods" | "abc";

  @ValidateIf((o: HrCenterPersonnelBudgetAiDto) => o.mode === "two_periods")
  @IsInt()
  @Min(2020)
  @Max(2100)
  yearA?: number;

  @ValidateIf((o: HrCenterPersonnelBudgetAiDto) => o.mode === "two_periods")
  @IsInt()
  @Min(1)
  @Max(12)
  monthA?: number;

  @ValidateIf((o: HrCenterPersonnelBudgetAiDto) => o.mode === "two_periods")
  @IsInt()
  @Min(2020)
  @Max(2100)
  yearB?: number;

  @ValidateIf((o: HrCenterPersonnelBudgetAiDto) => o.mode === "two_periods")
  @IsInt()
  @Min(1)
  @Max(12)
  monthB?: number;

  @ValidateIf((o: HrCenterPersonnelBudgetAiDto) => o.mode === "abc")
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @ValidateIf((o: HrCenterPersonnelBudgetAiDto) => o.mode === "abc")
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
