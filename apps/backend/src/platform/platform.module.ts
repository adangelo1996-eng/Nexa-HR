import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AdminController } from "./admin.controller";
import { AdminEmployeeExcelService } from "./admin-employee-excel.service";
import { AuditInterceptor } from "./audit.interceptor";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { HrDataStore } from "./hr-data.store";
import { ImportController } from "./import.controller";
import { ImportService } from "./import.service";
import { NexaPermissionGuard } from "./nexa-permission.guard";
import { PermissionsService } from "./permissions.service";
import { SearchController } from "./search.controller";
import { SynapseAdminConsoleGuard } from "./synapse-admin-console.guard";

@Global()
@Module({
  controllers: [AuthController, AdminController, ImportController, SearchController],
  providers: [
    HrDataStore,
    AdminEmployeeExcelService,
    ImportService,
    AuthService,
    PermissionsService,
    NexaPermissionGuard,
    SynapseAdminConsoleGuard,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  ],
  exports: [
    HrDataStore,
    AdminEmployeeExcelService,
    ImportService,
    AuthService,
    PermissionsService,
    NexaPermissionGuard,
    SynapseAdminConsoleGuard
  ]
})
export class PlatformModule {}
