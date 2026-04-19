import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";

export class HrCenterRecapBodyDto {
  /** @deprecated Usare userIds / filtri centro e team. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetUserId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  costCenterIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  teamIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  userIds?: string[];
}
