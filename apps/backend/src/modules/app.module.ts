import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApprovalsController } from "./approvals.controller";
import { AttendanceController } from "./attendance.controller";
import { AuditInterceptor } from "./audit.interceptor";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AdminController } from "./admin.controller";
import { HrDataStore } from "./hr-data.store";
import { LeaveController } from "./leave.controller";
import { OrgController } from "./org.controller";
import { PayrollController } from "./payroll.controller";
import { SicknessController } from "./sickness.controller";
import { UserController } from "./user.controller";

@Module({
  controllers: [
    AuthController,
    AdminController,
    UserController,
    AttendanceController,
    ApprovalsController,
    LeaveController,
    SicknessController,
    OrgController,
    PayrollController
  ],
  providers: [
    HrDataStore,
    AuthService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor
    }
  ]
})
export class AppModule {}
