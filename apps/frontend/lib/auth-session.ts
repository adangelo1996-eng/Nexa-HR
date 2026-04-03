"use client";

export type UserRole = "superuser" | "user";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId?: string;
  managerId?: string;
  companyId?: string;
  roleId?: string;
  costCenterId?: string;
  contractType?: string;
  weeklyContractHours?: number;
  avsNumber?: string;
  iban?: string;
  bankName?: string;
  bicSwift?: string;
  accountHolder?: string;
  dailyTargetSeconds?: number;
  vacationAllowanceDays?: number;
  /** Data assunzione (YYYY-MM-DD), da anagrafica */
  hireDate?: string;
  /** Presente dopo GET /users/me */
  isSynapseSuperuser?: boolean;
  /** Area /admin (ruoli, centri di costo, utenti con permessi adeguati) */
  canNexaAdmin?: boolean;
  /** Export mensile e modifica timbrature altrui (admin / centro HR) */
  canManageTeamAttendance?: boolean;
  /** Responsabile nominato su almeno un `work_team` (GET /users/me). */
  isTeamResponsible?: boolean;
  workTeamIdsWhereLead?: string[];
}

function normalizeStoredRole(role: unknown): UserRole {
  const r = String(role ?? "user");
  if (r === "superuser" || r === "user") {
    return r;
  }
  if (r === "admin") {
    return "superuser";
  }
  return "user";
}

/** Accesso UI admin Nexa: flag dal backend o fallback ruolo `superuser`. */
export function sessionCanNexaAdmin(
  u: Pick<SessionUser, "role" | "canNexaAdmin"> | null | undefined
): boolean {
  if (!u) {
    return false;
  }
  if (u.canNexaAdmin === true) {
    return true;
  }
  if (u.canNexaAdmin === false) {
    return false;
  }
  return normalizeStoredRole(u.role) === "superuser";
}

/** Vista HR (workflow, ecc.): superuser, console admin, o responsabile team. */
export function sessionCanSeeApprovalsAndHrExtras(
  u: Pick<SessionUser, "role" | "canNexaAdmin" | "isTeamResponsible"> | null | undefined
): boolean {
  if (!u) {
    return false;
  }
  if (normalizeStoredRole(u.role) === "superuser") {
    return true;
  }
  if (u.canNexaAdmin) {
    return true;
  }
  return u.isTeamResponsible === true;
}

/** Solo 401 / token: non sloggare su 403 permessi o errori di rete. */
export function shouldClearSessionOnUnauthorizedApiError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : "";
  return /\(401\)|Token non valido|Autenticazione richiesta|scaduto/i.test(msg);
}

const TOKEN_KEY = "nexa_hr_auth_token";
const USER_KEY = "nexa_hr_auth_user";
const COOKIE_KEY = "nexa_hr_token";

export function saveSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; secure" : "";
  document.cookie = `${COOKIE_KEY}=1; path=/; max-age=43200; samesite=lax${secure}`;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    return {
      ...parsed,
      role: normalizeStoredRole(parsed.role)
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; secure" : "";
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax${secure}`;
}
