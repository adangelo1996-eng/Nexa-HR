import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceTeamService } from "./attendance-team.service";
import { QrClockController } from "./qr-clock.controller";

@Module({
  controllers: [AttendanceController, QrClockController],
  providers: [AttendanceTeamService],
  exports: [AttendanceTeamService]
})
export class WorkforceModule {}
