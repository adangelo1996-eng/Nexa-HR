import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { getAuthContext } from "./auth";
import { HrDataStore } from "./hr-data.store";
import { PermissionsService } from "./permissions.service";

/**
 * Limita le route `/admin/*` agli account nella allowlist Synapse (`SYNAPSE_SUPERUSER_EMAILS`).
 * Va applicato dopo `NexaPermissionGuard`: i permessi catalogo non bastano senza questo controllo.
 */
@Injectable()
export class SynapseAdminConsoleGuard implements CanActivate {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = getAuthContext(request);
    const user = await this.store.getUser(auth.userId);
    const ok = await this.permissions.canAccessNexaAdminUi(auth.userId, auth.role, user.email);
    if (!ok) {
      throw new ForbiddenException("Console amministrazione riservata all'account Synapse");
    }
    return true;
  }
}
