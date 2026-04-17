import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateMeetingRoomDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  seats?: number;

  @IsOptional()
  @IsBoolean()
  hasScreen?: boolean;

  @IsOptional()
  @IsBoolean()
  hasProjector?: boolean;

  @IsOptional()
  @IsBoolean()
  hasWhiteboard?: boolean;

  @IsOptional()
  @IsBoolean()
  hasVideoConference?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraFeatures?: string[];
}

export class CreateMeetingRoomBookingDto {
  @IsString()
  @IsNotEmpty()
  startsAt!: string;

  @IsString()
  @IsNotEmpty()
  endsAt!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

