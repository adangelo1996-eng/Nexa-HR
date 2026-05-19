import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from "class-validator";

export class HiringSimulatorAgevolazioniDto {
  @IsOptional()
  @IsBoolean()
  female?: boolean;

  @IsOptional()
  @IsBoolean()
  under36?: boolean;

  @IsOptional()
  @IsBoolean()
  southZes?: boolean;

  @IsOptional()
  @IsBoolean()
  naspi?: boolean;

  @IsOptional()
  @IsBoolean()
  protectedCategories?: boolean;

  @IsOptional()
  @IsString()
  otherNotes?: string;
}

export class HiringSimulatorBenefitsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  welfareAnnualEuros?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mealVouchersMonthlyEuros?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  smartWorkingMonthlyEuros?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherBenefitsMonthlyEuros?: number;
}

export class HiringSimulatorInputDto {
  @IsIn(["ral", "net"])
  mode!: "ral" | "net";

  @IsNumber()
  @Min(1)
  @Max(48)
  weeklyContractHours!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(48)
  weeklyFullTimeHours?: number;

  @IsIn([12, 13, 14])
  payMonthsPerYear!: 12 | 13 | 14;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualGrossSalaryEuros?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetNetMonthlyEuros?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => HiringSimulatorAgevolazioniDto)
  agevolazioni?: HiringSimulatorAgevolazioniDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => HiringSimulatorBenefitsDto)
  benefits?: HiringSimulatorBenefitsDto;

  @IsOptional()
  @IsString()
  ccnlCode?: string;

  @IsOptional()
  @IsString()
  ccnlLevel?: string;

  @IsOptional()
  @IsString()
  contractType?: string;

  @IsOptional()
  @IsString()
  roleTitle?: string;

  @IsOptional()
  @IsString()
  location?: string;
}

export class HiringSimulatorAdviseDto extends HiringSimulatorInputDto {
  @IsIn(["criteria", "agevolazioni", "benefits", "validate"])
  phase!: "criteria" | "agevolazioni" | "benefits" | "validate";

  @IsOptional()
  @IsString()
  userQuestion?: string;
}

export class HiringSimulatorSaveScenarioDto extends HiringSimulatorInputDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  id?: string;
}

export class HiringSimulatorDeleteScenarioDto {
  @IsString()
  id!: string;
}
