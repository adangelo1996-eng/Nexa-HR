import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AdminController } from "./admin.controller";
import { AuditInterceptor } from "./audit.interceptor";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { HrDataStore } from "./hr-data.store";
import { ImportController } from "./import.controller";
import { ImportService } from "./import.service";
import { NexaPermissionGuard } from "./nexa-permission.guard";
import { PermissionsService } from "./permissions.service";

@Global()
@Module({
  controllers: [AuthController, AdminController, ImportController],
  providers: [
    HrDataStore,
    ImportService,
    AuthService,
    PermissionsService,
    NexaPermissionGuard,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  ],
  exports: [HrDataStore, ImportService, AuthService, PermissionsService, NexaPermissionGuard]
})
export class PlatformModule {}
