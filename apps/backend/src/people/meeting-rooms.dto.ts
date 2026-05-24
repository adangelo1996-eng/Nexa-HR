import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from "class-validator";

const MIN_BOOKING_MS = 15 * 60 * 1000;
const MAX_BOOKING_MS = 12 * 60 * 60 * 1000;

@ValidatorConstraint({ name: "meetingRoomBookingTimeRange", async: false })
class MeetingRoomBookingTimeRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments): boolean {
    const dto = args?.object as CreateMeetingRoomBookingDto | undefined;
    if (!dto?.startsAt?.trim() || !dto?.endsAt?.trim()) {
      return false;
    }
    const startMs = new Date(dto.startsAt).getTime();
    const endMs = new Date(dto.endsAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return false;
    }
    const duration = endMs - startMs;
    return duration >= MIN_BOOKING_MS && duration <= MAX_BOOKING_MS;
  }

  defaultMessage(): string {
    return "Intervallo non valido: la fine deve essere dopo l'inizio (min 15 min, max 12 ore).";
  }
}

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

  @Validate(MeetingRoomBookingTimeRangeConstraint)
  private readonly _timeRange!: never;

  @IsOptional()
  @IsString()
  title?: string;

  /** Colleghi da invitare (multi-select). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  inviteeUserIds?: string[];

  /** Email esterne (non in anagrafica). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  inviteeEmails?: string[];
}

export { MIN_BOOKING_MS, MAX_BOOKING_MS };
