import { Injectable, UnauthorizedException } from "@nestjs/common";
import { sign } from "jsonwebtoken";
import type { AuthRole } from "./auth";
import { HrDataStore } from "./hr-data.store";
import crypto from "node:crypto";

interface LoginUser {
  id: string;
  email: string;
  fullName: string;
  role: AuthRole;
  tenantId: string;
  companyId?: string;
}

interface SynapseSsoPayload {
  email: string;
  tenantId: string;
  app: string;
  issuedAt: number;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly store: HrDataStore) {}

  async login(email: string, password: string): Promise<{ token: string; user: LoginUser }> {
    const user = (await this.store.findUserByEmail(email)) as LoginUser | null;
    if (!user) {
      throw new UnauthorizedException("Credenziali non valide");
    }

    const supabasePasswordMode = Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
    if (supabasePasswordMode) {
      const ok = await this.store.verifySupabasePassword(email, password);
      if (!ok) {
        throw new UnauthorizedException("Credenziali non valide");
      }
    } else {
      const expectedPassword = this.getPasswordForRole(user.role);
      if (password !== expectedPassword) {
        throw new UnauthorizedException("Credenziali non valide");
      }
    }

    const secret = process.env.AUTH_JWT_SECRET ?? "dev-payday-secret-change-me";

    const tenantId = user.companyId || "synapse-default";
    const token = sign({ role: user.role, tenantId }, secret, { subject: user.id, expiresIn: "12h" });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId
      }
    };
  }

  async loginWithSynapseSso(synapseSsoToken: string): Promise<{ token: string; user: LoginUser }> {
    const payload = this.verifySynapseToken(synapseSsoToken);
    if (payload.app !== "nexa") {
      throw new UnauthorizedException("Token SSO non valido per Nexa HR");
    }
    const user = (await this.store.findUserByEmail(payload.email)) as LoginUser | null;
    if (!user) {
      throw new UnauthorizedException("Utente non provisionato su Nexa HR");
    }

    const userTenant = (user.companyId || "").trim();
    const payloadTenant = (payload.tenantId || "").trim();
    if (userTenant && payloadTenant && userTenant !== payloadTenant) {
      throw new UnauthorizedException("Tenant non coerente con utente Nexa HR");
    }
    const tenantId = userTenant || payloadTenant || "synapse-default";

    const secret = process.env.AUTH_JWT_SECRET ?? "dev-payday-secret-change-me";
    const token = sign({ role: user.role, tenantId }, secret, { subject: user.id, expiresIn: "12h" });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId
      }
    };
  }

  private verifySynapseToken(token: string): SynapseSsoPayload {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) {
      throw new UnauthorizedException("Token SSO non valido");
    }
    const key = process.env.APP_SSO_SHARED_KEY ?? "";
    if (!key) {
      throw new UnauthorizedException("SSO non configurato");
    }
    const expected = crypto.createHmac("sha256", key).update(encoded).digest("base64url");
    const signatureBuf = Buffer.from(signature, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (signatureBuf.length !== expectedBuf.length) {
      throw new UnauthorizedException("Token SSO non valido");
    }
    if (!crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
      throw new UnauthorizedException("Token SSO non valido");
    }

    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SynapseSsoPayload;
      const now = Math.floor(Date.now() / 1000);
      if (!payload.email || !payload.tenantId || !payload.app || !payload.expiresAt || payload.expiresAt <= now) {
        throw new UnauthorizedException("Token SSO scaduto o incompleto");
      }
      return payload;
    } catch {
      throw new UnauthorizedException("Token SSO non decodificabile");
    }
  }

  private getPasswordForRole(role: AuthRole): string {
    if (role === "admin") {
      return process.env.AUTH_ADMIN_PASSWORD ?? "AdminPayday123!";
    }
    if (role === "manager_controllo_gestione") {
      return process.env.AUTH_MANAGER_PASSWORD ?? "ManagerPayday123!";
    }
    return process.env.AUTH_EMPLOYEE_PASSWORD ?? "EmployeePayday123!";
  }
}
