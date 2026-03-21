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

export type AuthRole = "admin" | "manager_controllo_gestione" | "employee";

export interface AuthContext {
  userId: string;
  role: AuthRole;
}

export const AUTH_ROLE_KEY = "auth-role";
export const RequireRole = (role: AuthContext["role"]) => SetMetadata(AUTH_ROLE_KEY, role);

interface TokenPayload {
  sub: string;
  role: AuthRole;
}

const VALID_ROLES = ["admin", "manager_controllo_gestione", "employee"] as const;

function isValidRole(role: string): role is AuthRole {
  return VALID_ROLES.includes(role as AuthRole);
}

function fromLegacyHeaders(request: Request): AuthContext | undefined {
  const userId = request.headers["x-user-id"];
  const role = request.headers["x-role"];
  if (typeof userId !== "string" || typeof role !== "string") {
    return undefined;
  }
  if (!isValidRole(role)) {
    throw new BadRequestException("Ruolo non valido");
  }
  return { userId, role };
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
  if (!payload?.sub || typeof payload.sub !== "string" || !payload.role || !isValidRole(payload.role)) {
    throw new UnauthorizedException("Token non valido");
  }
  return { userId: payload.sub, role: payload.role };
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
    if (auth.role !== requiredRole && auth.role !== "admin") {
      throw new ForbiddenException("Permessi insufficienti");
    }
    return true;
  }
}
