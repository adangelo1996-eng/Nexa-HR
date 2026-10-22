import { Global, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AdminController } from "./admin.controller";
import { AdminEmployeeExcelService } from "./admin-employee-excel.service";
import { AuditInterceptor } from "./audit.interceptor";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DatabasePoolService } from "./database-pool.service";
import { HrDataStore } from "./hr-data.store";
import { ImportController } from "./import.controller";
import { ImportService } from "./import.service";
import { NexaPermissionGuard } from "./nexa-permission.guard";
import { PermissionsService } from "./permissions.service";
import { SearchController } from "./search.controller";
import { SynapseAdminConsoleGuard } from "./synapse-admin-console.guard";
import { TenantPackController } from "./tenant-pack.controller";
import { TenantPackGuard } from "./tenant-pack.guard";
import { TenantPackService } from "./tenant-pack.service";
import { TenantPackStore } from "./tenant-pack.store";

@Global()
@Module({
  controllers: [AuthController, AdminController, ImportController, SearchController, TenantPackController],
  providers: [
    HrDataStore,
    DatabasePoolService,
    AdminEmployeeExcelService,
    ImportService,
    AuthService,
    PermissionsService,
    NexaPermissionGuard,
    SynapseAdminConsoleGuard,
    TenantPackStore,
    TenantPackService,
    { provide: APP_GUARD, useClass: TenantPackGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  ],
  exports: [
    HrDataStore,
    DatabasePoolService,
    AdminEmployeeExcelService,
    ImportService,
    AuthService,
    PermissionsService,
    NexaPermissionGuard,
    SynapseAdminConsoleGuard,
    TenantPackService
  ]
})
export class PlatformModule {}
