import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CompensationBenchEstimateDto {
  @IsIn(["recruit", "org", "org_select", "manual"])
  roleSource!: "recruit" | "org" | "org_select" | "manual";

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

  /** Se `roleSource` = `org_select`: id ruolo da elenco organico (tabella ruoli aziendali). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  orgRoleId?: string;

  /** CCNL di riferimento (testo libero o codice breve), opzionale — contestualizza la fascia RAL. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ccnlCode?: string;
}
