import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { IsIn, IsISO8601, IsOptional, IsString, Length } from "class-validator";
import { HrDataStore } from "../platform/hr-data.store";

class NfcClockDto {
  @IsString()
  @Length(16, 16)
  token!: string;

  @IsIn(["clock_in", "clock_out"])
  type!: "clock_in" | "clock_out";

  @IsOptional()
  @IsISO8601()
  at?: string;
}

/** Timbratura tramite badge NFC (token 16 caratteri registrato su utente). */
@Controller("clock")
export class NfcClockController {
  constructor(private readonly store: HrDataStore) {}

  @Post("nfc")
  async nfc(@Body() dto: NfcClockDto): Promise<unknown> {
    const userId = await this.store.getUserIdByNfcToken(dto.token);
    if (!userId) {
      throw new UnauthorizedException("Token NFC non valido");
    }
    return this.store.addTimeEntry(userId, dto.type, dto.at, { source: "nfc" });
  }
}
