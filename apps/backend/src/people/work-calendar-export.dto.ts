import { IsArray, IsOptional, IsString } from "class-validator";

export class WorkCalendarExportDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}
