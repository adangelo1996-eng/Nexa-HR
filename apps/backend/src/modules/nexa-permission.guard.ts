import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { getAuthContext, type AuthContext } from "./auth";
import { PermissionsService } from "./permissions.service";

export const NEXA_PERMISSIONS_KEY = "nexa_permissions";

export const RequireNexaPermissions = (...permissions: string[]) =>
  SetMetadata(NEXA_PERMISSIONS_KEY, permissions);

@Injectable()
export class NexaPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(NEXA_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const auth: AuthContext = getAuthContext(request);
    if (auth.role === "admin") {
      return true;
    }
    const ok = await this.permissions.userHasAll(auth.userId, required);
    if (!ok) {
      throw new ForbiddenException("Permessi insufficienti");
    }
    return true;
  }
}
