import {
  BadRequestException,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  SetMetadata
} from "@nestjs/common";
import { verify } from "jsonwebtoken";
import type { Request } from "express";

export type AuthRole = "superuser" | "user";

export interface AuthContext {
  userId: string;
  role: AuthRole;
  tenantId?: string;
}

export const AUTH_ROLE_KEY = "auth-role";
export const RequireRole = (role: AuthContext["role"]) => SetMetadata(AUTH_ROLE_KEY, role);

interface TokenPayload {
  sub: string;
  role: AuthRole;
  tenantId?: string;
}

/** Accetta JWT ancora con ruoli legacy fino a scadenza / re-login. */
function normalizeRoleFromToken(role: string): AuthRole | null {
  if (role === "superuser" || role === "user") {
    return role;
  }
  if (role === "admin") {
    return "superuser";
  }
  if (role === "employee" || role === "team_lead") {
    return "user";
  }
  return null;
}

function fromLegacyHeaders(request: Request): AuthContext | undefined {
  const allowLegacy =
    process.env.ALLOW_LEGACY_AUTH_HEADERS === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.ALLOW_LEGACY_AUTH_HEADERS !== "false");
  if (!allowLegacy) {
    return undefined;
  }
  const userId = request.headers["x-user-id"];
  const role = request.headers["x-role"];
  if (typeof userId !== "string" || typeof role !== "string") {
    return undefined;
  }
  const norm = normalizeRoleFromToken(role);
  if (!norm) {
    throw new BadRequestException("Ruolo non valido");
  }
  return { userId, role: norm };
}

function fromBearerToken(request: Request): AuthContext | undefined {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return undefined;
  }
  const token = header.slice("Bearer ".length).trim();
  const secret = process.env.AUTH_JWT_SECRET ?? "dev-payday-secret-change-me";
  let payload: TokenPayload;
  try {
    payload = verify(token, secret, { algorithms: ["HS256"] }) as TokenPayload;
  } catch {
    throw new UnauthorizedException("Token non valido o scaduto");
  }
  if (!payload?.sub || typeof payload.sub !== "string" || !payload.role) {
    throw new UnauthorizedException("Token non valido");
  }
  const norm = normalizeRoleFromToken(payload.role);
  if (!norm) {
    throw new UnauthorizedException("Token non valido");
  }
  return { userId: payload.sub, role: norm, tenantId: payload.tenantId };
}

export function getAuthContext(request: Request): AuthContext {
  const fromToken = fromBearerToken(request);
  if (fromToken) {
    return fromToken;
  }
  const fromHeaders = fromLegacyHeaders(request);
  if (fromHeaders) {
    return fromHeaders;
  }
  throw new UnauthorizedException("Autenticazione richiesta");
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return getAuthContext(request);
  }
);

@Injectable()
export class RoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRole = Reflect.getMetadata(AUTH_ROLE_KEY, context.getHandler()) as
      | AuthContext["role"]
      | undefined;
    if (!requiredRole) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const auth = getAuthContext(request);
    if (auth.role === "superuser") {
      return true;
    }
    if (requiredRole === "user") {
      if (auth.role === "user") {
        return true;
      }
      throw new ForbiddenException("Permessi insufficienti");
    }
    throw new ForbiddenException("Permessi insufficienti");
  }
}
