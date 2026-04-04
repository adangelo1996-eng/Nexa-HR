import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { verify } from "jsonwebtoken";
import { HrDataStore } from "../platform/hr-data.store";
import { getAuthJwtSecret } from "../platform/auth-jwt-secret";

class ClockQrDto {
  @IsString()
  token!: string;

  @IsIn(["clock_in", "clock_out"])
  type!: "clock_in" | "clock_out";

  @IsOptional()
  @IsISO8601()
  at?: string;
}

interface QrPayload {
  sub: string;
  typ?: string;
}

/**
 * Timbratura tramite token QR (senza sessione Bearer): il token è firmato da POST /attendance/qr-token.
 */
@Controller("attendance")
export class QrClockController {
  constructor(private readonly store: HrDataStore) {}

  @Post("qr/clock")
  async clockFromQr(@Body() dto: ClockQrDto): Promise<unknown> {
    const secret = getAuthJwtSecret();
    let payload: QrPayload;
    try {
      payload = verify(dto.token, secret, { algorithms: ["HS256"] }) as QrPayload;
    } catch {
      throw new UnauthorizedException("Token QR non valido o scaduto");
    }
    if (!payload?.sub || payload.typ !== "attendance_qr") {
      throw new UnauthorizedException("Token QR non valido");
    }
    return this.store.addTimeEntry(payload.sub, dto.type, dto.at, { source: "qr" });
  }
}
