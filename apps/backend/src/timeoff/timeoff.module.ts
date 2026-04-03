import { Module } from "@nestjs/common";
import { ApprovalsController } from "./approvals.controller";
import { LeaveController } from "./leave.controller";
import { SicknessController } from "./sickness.controller";
import { SmartworkingController } from "./smartworking.controller";
import { TravelController } from "./travel.controller";

@Module({
  controllers: [LeaveController, SicknessController, ApprovalsController, SmartworkingController, TravelController]
})
export class TimeoffModule {}
