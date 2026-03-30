import { Module } from "@nestjs/common";
import { ApprovalsController } from "./approvals.controller";
import { LeaveController } from "./leave.controller";
import { SicknessController } from "./sickness.controller";

@Module({
  controllers: [LeaveController, SicknessController, ApprovalsController]
})
export class TimeoffModule {}
