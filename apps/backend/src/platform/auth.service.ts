import { Injectable, UnauthorizedException } from "@nestjs/common";
import { sign } from "jsonwebtoken";
import type { AuthRole } from "./auth";
import { getAuthJwtSecret } from "./auth-jwt-secret";
import { userCanManageTeamAttendance } from "./hr-attendance-access.util";
import { HrDataStore } from "./hr-data.store";
import { isNexaAiOpenAiLlmEnabled } from "./nexa-ai-llm-env";
import { PermissionsService } from "./permissions.service";
import crypto from "node:crypto";
import type { Request, Response } from "express";

interface LoginUser {
  id: string;
  email: string;
  fullName: string;
  role: AuthRole;
  tenantId: string;
  companyId?: string;
  canNexaAdmin: boolean;
  canAccessHrExtendedConsole: boolean;
  canAccessHrWorkflowExtras: boolean;
  canExportAttendanceReports: boolean;
  canAccessPayrollArea: boolean;
  canAccessPersonnelBudgetArea: boolean;
  /** LLM OpenAI attivo su questo ambiente (stesso criterio di `GET /users/me`). */
  nexaAiOpenAiEnabled: boolean;
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
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
  }

  private newRefreshToken(): string {
    return crypto.randomBytes(32).toString("base64url");
  }

  private refreshExpiresAt(): string {
    const ms = 7 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms).toISOString();
  }

  private isHttpsRequest(req: Request): boolean {
    const xfProto = String(req.headers["x-forwarded-proto"] ?? "").toLowerCase();
    if (xfProto === "https") return true;
    // fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyReq = req as any;
    return Boolean(anyReq.secure) || String(anyReq.protocol ?? "").toLowerCase() === "https";
  }

  private getCookie(req: Request, name: string): string | null {
    const raw = String(req.headers.cookie ?? "");
    if (!raw) return null;
    const parts = raw.split(";").map((p) => p.trim());
    for (const p of parts) {
      if (!p) continue;
      const eq = p.indexOf("=");
      if (eq < 0) continue;
      const k = p.slice(0, eq).trim();
      if (k !== name) continue;
      return decodeURIComponent(p.slice(eq + 1));
    }
    return null;
  }

  private async mintRefreshTokenForUser(userId: string): Promise<string> {
    const token = this.newRefreshToken();
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = this.refreshExpiresAt();
    const sb = this.sb();
    const { error } = await sb.from("auth_refresh_tokens").insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt
    });
    if (error) {
      throw new UnauthorizedException("Impossibile creare sessione");
    }
    return token;
  }

  private async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    const sb = this.sb();
    await sb
      .from("auth_refresh_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("revoked_at", null);
  }

  setRefreshCookie(opts: { req: Request; res: Response; refreshToken: string }): void {
    const secure = this.isHttpsRequest(opts.req);
    const sameSite = secure ? "none" : "lax";
    const maxAgeSec = 7 * 24 * 60 * 60;
    // express 5 res.cookie is available if cookie-parser is used; use setHeader to avoid deps.
    const cookie = [
      `nexa_hr_refresh=${encodeURIComponent(opts.refreshToken)}`,
      "Path=/",
      `Max-Age=${maxAgeSec}`,
      "HttpOnly",
      "SameSite=" + (sameSite === "none" ? "None" : "Lax"),
      secure ? "Secure" : ""
    ]
      .filter(Boolean)
      .join("; ");
    opts.res.setHeader("Set-Cookie", cookie);
  }

  clearRefreshCookie(opts: { req: Request; res: Response }): void {
    const secure = this.isHttpsRequest(opts.req);
    const sameSite = secure ? "none" : "lax";
    const cookie = [
      "nexa_hr_refresh=",
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "SameSite=" + (sameSite === "none" ? "None" : "Lax"),
      secure ? "Secure" : ""
    ]
      .filter(Boolean)
      .join("; ");
    opts.res.setHeader("Set-Cookie", cookie);
  }

  private async buildLoginCapabilityFlags(user: {
    id: string;
    role: AuthRole;
    email: string;
  }): Promise<
    Pick<
      LoginUser,
      | "canNexaAdmin"
      | "canAccessHrExtendedConsole"
      | "canAccessHrWorkflowExtras"
      | "canExportAttendanceReports"
      | "canAccessPayrollArea"
      | "canAccessPersonnelBudgetArea"
      | "nexaAiOpenAiEnabled"
    >
  > {
    const canNexaAdmin = await this.permissions.canAccessNexaAdminUi(user.id, user.role, user.email);
    const canAccessHrExtendedConsole = await this.permissions.canAccessHrExtendedConsole(
      user.id,
      user.role,
      user.email
    );
    const canManageTeamAttendance = await userCanManageTeamAttendance(this.store, user.id);
    const workTeamIdsWhereLead = await this.store.listWorkTeamIdsWhereUserIsLead(user.id);
    const canAccessHrWorkflowExtras = await this.permissions.canAccessHrWorkflowExtras(
      user.id,
      user.role,
      user.email,
      workTeamIdsWhereLead.length > 0
    );
    const canExportAttendanceReports = await this.permissions.canExportAttendanceReports(
      user.id,
      user.role,
      user.email,
      canManageTeamAttendance
    );
    const canAccessPayrollArea = user.role === "superuser" || canAccessHrExtendedConsole;
    const canAccessPersonnelBudgetArea =
      user.role === "superuser" ||
      canAccessHrExtendedConsole ||
      (await this.permissions.userHasExplicitReadCatalogKey(user.id, "nexa.personnel_budget:read"));
    return {
      canNexaAdmin,
      canAccessHrExtendedConsole,
      canAccessHrWorkflowExtras,
      canExportAttendanceReports,
      canAccessPayrollArea,
      canAccessPersonnelBudgetArea,
      nexaAiOpenAiEnabled: isNexaAiOpenAiLlmEnabled()
    };
  }

  async login(email: string, password: string): Promise<{ token: string; refreshToken: string; user: LoginUser }> {
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
      const expectedPassword = this.getLegacySharedPassword();
      if (password !== expectedPassword) {
        throw new UnauthorizedException("Credenziali non valide");
      }
    }

    const secret = getAuthJwtSecret();

    const tenantId = user.companyId || "synapse-default";
    const token = sign({ role: user.role, tenantId }, secret, { subject: user.id, expiresIn: "12h" });
    const caps = await this.buildLoginCapabilityFlags(user);
    const refreshToken = await this.mintRefreshTokenForUser(user.id);
    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId,
        companyId: user.companyId,
        ...caps
      }
    };
  }

  async loginWithSynapseSso(
    synapseSsoToken: string
  ): Promise<{ token: string; refreshToken: string; user: LoginUser }> {
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

    const secret = getAuthJwtSecret();
    const token = sign({ role: user.role, tenantId }, secret, { subject: user.id, expiresIn: "12h" });
    const caps = await this.buildLoginCapabilityFlags(user);
    const refreshToken = await this.mintRefreshTokenForUser(user.id);
    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId,
        companyId: user.companyId,
        ...caps
      }
    };
  }

  async refreshFromCookie(req: Request): Promise<{ token: string; refreshToken: string; user: LoginUser }> {
    const refreshToken = this.getCookie(req, "nexa_hr_refresh");
    if (!refreshToken) {
      throw new UnauthorizedException("Autenticazione richiesta");
    }
    const tokenHash = this.hashRefreshToken(refreshToken);
    const nowIso = new Date().toISOString();
    const sb = this.sb();
    const { data, error } = await sb
      .from("auth_refresh_tokens")
      .select("id, user_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error || !data) {
      throw new UnauthorizedException("Autenticazione richiesta");
    }
    if ((data as { revoked_at?: string | null }).revoked_at) {
      throw new UnauthorizedException("Autenticazione richiesta");
    }
    const expiresAt = String((data as { expires_at: string }).expires_at);
    if (expiresAt <= nowIso) {
      throw new UnauthorizedException("Autenticazione richiesta");
    }
    const userId = String((data as { user_id: string }).user_id);
    // rotate: revoke old + mint new
    await this.revokeRefreshToken(refreshToken);
    const newRefresh = await this.mintRefreshTokenForUser(userId);

    const user = (await this.store.findUserById(userId)) as LoginUser | null;
    if (!user) {
      throw new UnauthorizedException("Autenticazione richiesta");
    }
    const secret = getAuthJwtSecret();
    const tenantId = user.companyId || "synapse-default";
    const token = sign({ role: user.role, tenantId }, secret, { subject: user.id, expiresIn: "12h" });
    const caps = await this.buildLoginCapabilityFlags(user);
    return {
      token,
      refreshToken: newRefresh,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId,
        companyId: user.companyId,
        ...caps
      }
    };
  }

  async revokeFromCookie(req: Request): Promise<void> {
    const refreshToken = this.getCookie(req, "nexa_hr_refresh");
    if (!refreshToken) return;
    await this.revokeRefreshToken(refreshToken);
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

  /** Password unica (demo / legacy) se non usi Supabase Auth sul backend. Default: Synapse2026. */
  private getLegacySharedPassword(): string {
    return (
      process.env.AUTH_SHARED_PASSWORD?.trim() ||
      process.env.AUTH_PASSWORD?.trim() ||
      "Synapse2026"
    );
  }
}
