import { Injectable, UnauthorizedException } from "@nestjs/common";
import { sign, verify, type JwtPayload } from "jsonwebtoken";
import type { AuthRole } from "./auth";
import { HrDataStore } from "./hr-data.store";

type SupabaseAuthJwt = JwtPayload & { email?: string };

interface LoginUser {
  id: string;
  email: string;
  fullName: string;
  role: AuthRole;
}

@Injectable()
export class AuthService {
  constructor(private readonly store: HrDataStore) {}

  async login(email: string, password: string): Promise<{ token: string; user: LoginUser }> {
    const users = (await this.store.listUsers()) as LoginUser[];
    const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException("Credenziali non valide");
    }

    const expectedPassword = this.getPasswordForRole(user.role);
    if (password !== expectedPassword) {
      throw new UnauthorizedException("Credenziali non valide");
    }

    const secret = process.env.AUTH_JWT_SECRET ?? "dev-payday-secret-change-me";

    const token = sign({ role: user.role }, secret, { subject: user.id, expiresIn: "12h" });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    };
  }

  /**
   * Dopo Google / Microsoft (Azure) su Supabase Auth: verifica il JWT access_token
   * e, se l'email coincide con un utente in anagrafica, emette il JWT applicativo.
   */
  async loginWithSupabaseAccessToken(accessToken: string): Promise<{ token: string; user: LoginUser }> {
    const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();
    if (!supabaseJwtSecret) {
      throw new UnauthorizedException("OAuth non configurato sul server");
    }

    let payload: SupabaseAuthJwt;
    try {
      payload = verify(accessToken, supabaseJwtSecret, { algorithms: ["HS256"] }) as SupabaseAuthJwt;
    } catch {
      throw new UnauthorizedException("Token OAuth non valido o scaduto");
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const iss = typeof payload.iss === "string" ? payload.iss : undefined;
    if (supabaseUrl && iss) {
      const expectedIss = `${supabaseUrl}/auth/v1`;
      if (iss !== expectedIss) {
        throw new UnauthorizedException("Token OAuth non valido");
      }
    }

    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!email) {
      throw new UnauthorizedException("Email non disponibile dal provider OAuth");
    }

    const users = (await this.store.listUsers()) as LoginUser[];
    const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException("Nessun account HR associato a questa email");
    }

    const secret = process.env.AUTH_JWT_SECRET ?? "dev-payday-secret-change-me";
    const token = sign({ role: user.role }, secret, { subject: user.id, expiresIn: "12h" });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    };
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
