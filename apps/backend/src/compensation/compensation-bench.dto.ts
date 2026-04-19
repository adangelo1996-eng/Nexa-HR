import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CompensationBenchEstimateDto {
  @IsIn(["recruit", "org", "manual"])
  roleSource!: "recruit" | "org" | "manual";

  @IsOptional()
  @IsString()
  recruitPositionId?: string;

  /** Titolo ruolo se roleSource = manual */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  roleTitleManual?: string;

  /** Comune, provincia o area (testo libero) */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(45)
  seniorityYears!: number;
}
