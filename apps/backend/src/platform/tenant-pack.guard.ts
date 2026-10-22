import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { capabilityForNexaApiPath } from "@payday/domain";
import type { Request } from "express";
import { getAuthContext } from "./auth";
import { HrDataStore } from "./hr-data.store";
import { TenantPackService } from "./tenant-pack.service";

@Injectable()
export class TenantPackGuard implements CanActivate {
  constructor(
    private readonly packs: TenantPackService,
    private readonly store: HrDataStore
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = String(request.originalUrl ?? request.url ?? "");
    const path = raw.split("?")[0] ?? raw;
    const capabilityId = capabilityForNexaApiPath(path);
    if (!capabilityId) {
      return true;
    }
    if (path.startsWith("/api/auth")) {
      return true;
    }
    let userId: string;
    try {
      userId = getAuthContext(request).userId;
    } catch {
      return true;
    }
    try {
      const user = await this.store.getUser(userId);
      const pack = await this.packs.getEffective(user.companyId);
      if (!this.packs.isEnabled(pack, capabilityId)) {
        throw new ForbiddenException("Modulo non incluso nel pacchetto standard del tenant");
      }
    } catch (e) {
      if (e instanceof ForbiddenException) {
        throw e;
      }
      return true;
    }
    return true;
  }
}
