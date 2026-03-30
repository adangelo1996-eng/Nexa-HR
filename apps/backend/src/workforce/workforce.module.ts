import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceTeamService } from "./attendance-team.service";
import { NfcClockController } from "./nfc-clock.controller";
import { QrClockController } from "./qr-clock.controller";

@Module({
  controllers: [AttendanceController, QrClockController, NfcClockController],
  providers: [AttendanceTeamService],
  exports: [AttendanceTeamService]
})
export class WorkforceModule {}
