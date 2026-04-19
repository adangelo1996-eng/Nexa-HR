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
  /** Retribuzione base mensile da anagrafica (sola lettura per dipendente). */
  baseSalaryMonthly?: number;
  iban?: string;
  bankName?: string;
  bicSwift?: string;
  accountHolder?: string;
  dailyTargetSeconds?: number;
  vacationAllowanceDays?: number;
  /** Data assunzione (YYYY-MM-DD), da anagrafica */
  hireDate?: string;
  jurisdiction?: "IT";
  /** Presente dopo GET /users/me */
  isSynapseSuperuser?: boolean;
  /** Console `/admin`: solo account Synapse (`SYNAPSE_SUPERUSER_EMAILS`, es. admin@synapse.com). */
  canNexaAdmin?: boolean;
  /** HR esteso: payroll, budget, export presenze oltre centro HR (`nexa.admin_users:read`, superuser, Synapse admin). */
  canAccessHrExtendedConsole?: boolean;
  /** Calendario lavoro / workflow con privilegi team (approvazioni, lead, HR esteso). */
  canAccessHrWorkflowExtras?: boolean;
  /** Export report presenze dalla pagina Report HR. */
  canExportAttendanceReports?: boolean;
  /** Export mensile e modifica timbrature altrui (admin / centro HR) */
  canManageTeamAttendance?: boolean;
  /** Responsabile nominato su almeno un `work_team` (GET /users/me). */
  isTeamResponsible?: boolean;
  /** Almeno un dipendente con `managerId` = utente corrente. */
  hasDirectReports?: boolean;
  workTeamIdsWhereLead?: string[];
  /** Area payroll Hebb (/payroll-hebb): solo superuser o console admin (`canAccessPayrollArea` da backend). */
  canAccessPayrollArea?: boolean;
  /** Modifica profilo fiscale/contratto IT da `/settings`: solo superuser o HR esteso. */
  canEditSelfPayrollProfileIt?: boolean;

  fiscalCode?: string | null;
  maritalStatus?: string | null;
  dependentsChildren?: number;
  dependentSpouse?: boolean;
  disabilityFlag?: boolean;
  taxDomicileMunicipalityIt?: string | null;
  taxDomicileSameAsResidence?: boolean;
  payMonthsPerYear?: number;
  annualGrossSalary?: number | null;
  partTimeModality?: string | null;
  ccnlCode?: string | null;
  ccnlLevel?: string | null;
  legalCategory?: string | null;
  contractEndDate?: string | null;
  fixedSupplementMonthly?: number | null;
  garnishmentMonthlyEstimate?: number | null;
  fringeBenefitYtdEuros?: number | null;
  contractFixedTerm?: boolean;
  taxRegion?: string;
  taxMunicipalityIt?: string;
  /** Da impostazioni aziendali (`company_settings`), solo lettura per dipendente. */
  companyCcnl?: string | null;
  /** Permesso catalogo budget (backend); la sezione `/personnel-budget` in UI è mostrata solo con `canNexaAdmin`. */
  canAccessPersonnelBudgetArea?: boolean;
  /** Recap operativo HR (`/hr-recap`): report HR o console HR estesa. */
  canAccessHrRecapDashboard?: boolean;
  /**
   * LLM OpenAI disponibile su questo backend (`NEXA_AI_OPENAI_ENABLED` + `OPENAI_API_KEY`).
   * Da `GET /users/me` / login.
   */
  nexaAiOpenAiEnabled?: boolean;
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

/** Console `/admin`: solo se il backend imposta `canNexaAdmin` (account Synapse allowlist). */
export function sessionCanNexaAdmin(
  u: Pick<SessionUser, "canNexaAdmin"> | null | undefined
): boolean {
  return u?.canNexaAdmin === true;
}

/**
 * Vista note spese per dipendente (`/expenses/org`): console Synapse, HR esteso,
 * o stesso perimetro workflow HR (responsabili team / approvazioni).
 */
export function sessionCanViewOrgExpenseClaims(
  u: Pick<
    SessionUser,
    | "canNexaAdmin"
    | "canAccessHrExtendedConsole"
    | "role"
    | "canAccessHrWorkflowExtras"
    | "isTeamResponsible"
  > | null | undefined
): boolean {
  if (!u) {
    return false;
  }
  if (sessionCanNexaAdmin(u) || u.canAccessHrExtendedConsole === true) {
    return true;
  }
  return sessionCanSeeApprovalsAndHrExtras(u);
}

/** Vista HR (workflow, calendario team): superuser, flag backend, o responsabile team (fallback se sessione vecchia). */
export function sessionCanSeeApprovalsAndHrExtras(
  u: Pick<SessionUser, "role" | "canAccessHrWorkflowExtras" | "isTeamResponsible"> | null | undefined
): boolean {
  if (!u) {
    return false;
  }
  if (normalizeStoredRole(u.role) === "superuser") {
    return true;
  }
  if (u.canAccessHrWorkflowExtras === true) {
    return true;
  }
  return u.isTeamResponsible === true;
}

/** Pannello manager: HR esteso / Synapse admin, workflow HR, lead team o manager con report diretti. */
export function sessionCanAccessManagerPanel(
  u: Pick<
    SessionUser,
    | "role"
    | "canAccessHrWorkflowExtras"
    | "isTeamResponsible"
    | "hasDirectReports"
    | "canAccessHrExtendedConsole"
    | "canNexaAdmin"
  > | null | undefined
): boolean {
  if (!u) {
    return false;
  }
  if (normalizeStoredRole(u.role) === "superuser") {
    return true;
  }
  if (u.canNexaAdmin === true || u.canAccessHrExtendedConsole === true) {
    return true;
  }
  if (u.canAccessHrWorkflowExtras === true) {
    return true;
  }
  if (u.isTeamResponsible === true) {
    return true;
  }
  return u.hasDirectReports === true;
}

/** Calcolo/simulazione cedolino (`/payroll-hebb`): solo se il backend ha `canAccessPayrollArea` (superuser o console admin). */
export function sessionCanAccessPayrollArea(
  u: Pick<SessionUser, "canAccessPayrollArea"> | null | undefined
): boolean {
  return u?.canAccessPayrollArea === true;
}

/** Permesso catalogo budget dal backend; la sezione UI `/personnel-budget` è riservata alla console admin (`sessionCanNexaAdmin`). */
export function sessionCanAccessPersonnelBudgetArea(
  u: Pick<SessionUser, "canAccessPersonnelBudgetArea"> | null | undefined
): boolean {
  return u?.canAccessPersonnelBudgetArea === true;
}

export function sessionCanAccessHrRecapDashboard(
  u: Pick<SessionUser, "canAccessHrRecapDashboard" | "canNexaAdmin"> | null | undefined
): boolean {
  return u?.canAccessHrRecapDashboard === true || u?.canNexaAdmin === true;
}

/** Ricerca dipendenti e pagina recap: admin Synapse, HR esteso o recap operativo. */
export function sessionCanOpenEmployeeRecapPage(
  u: Pick<SessionUser, "canNexaAdmin" | "canAccessHrExtendedConsole" | "canAccessHrRecapDashboard"> | null | undefined
): boolean {
  if (!u) {
    return false;
  }
  return (
    sessionCanNexaAdmin(u) ||
    u.canAccessHrExtendedConsole === true ||
    sessionCanAccessHrRecapDashboard(u)
  );
}

/**
 * Scheda dipendente `/employee/:id`: self, superuser, Synapse admin / HR esteso / recap HR, o manager diretto del soggetto.
 * Solo navigazione UI; il server continua a validare PATCH e dati sensibili.
 */
export function sessionCanViewEmployeeProfile(
  viewer: Pick<
    SessionUser,
    "id" | "role" | "canNexaAdmin" | "canAccessHrExtendedConsole" | "canAccessHrRecapDashboard"
  > | null | undefined,
  subject: { userId: string; managerId?: string | null }
): boolean {
  if (!viewer) {
    return false;
  }
  if (viewer.id === subject.userId) {
    return true;
  }
  if (normalizeStoredRole(viewer.role) === "superuser") {
    return true;
  }
  if (sessionCanOpenEmployeeRecapPage(viewer)) {
    return true;
  }
  const mid = subject.managerId?.trim();
  if (mid && mid === viewer.id) {
    return true;
  }
  return false;
}

/** Link a centri di costo / team in area admin organizzazione. */
export function sessionCanUseAdminOrgDeepLinks(
  u: Pick<SessionUser, "canNexaAdmin" | "canAccessHrExtendedConsole"> | null | undefined
): boolean {
  if (!u) {
    return false;
  }
  return sessionCanNexaAdmin(u) || u.canAccessHrExtendedConsole === true;
}

/** Modifica anagrafica completa (PATCH /users/:id): allineato al backend (console Synapse + permessi scrittura). */
export function sessionCanEditEmployeeAdminFields(
  u: Pick<SessionUser, "canNexaAdmin"> | null | undefined
): boolean {
  return sessionCanNexaAdmin(u);
}

/** Centro AI HR e raffinamento LLM opzionale (narrative): solo se il backend espone il flag a true. */
export function sessionCanUseNexaAiOpenAiLlm(
  u: Pick<SessionUser, "nexaAiOpenAiEnabled"> | null | undefined
): boolean {
  return u?.nexaAiOpenAiEnabled === true;
}

/** Timbrature altrui / azioni HR su presenze: HR esteso o centro HR (`canManageTeamAttendance`). */
export function sessionCanHrExtendedOrTeamAttendance(
  u: Pick<SessionUser, "canAccessHrExtendedConsole" | "canManageTeamAttendance"> | null | undefined
): boolean {
  return u?.canAccessHrExtendedConsole === true || u?.canManageTeamAttendance === true;
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
  document.cookie = `${COOKIE_KEY}=1; path=/; max-age=1800; samesite=lax${secure}`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }
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
  // Best-effort server logout to revoke refresh token cookie.
  try {
    const env = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
    const origin = (env && env.length > 0 ? env : "http://localhost:4000").replace(/\/+$/, "");
    const apiBase = origin.endsWith("/api") ? origin : `${origin}/api`;
    void fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
  } catch {
    // no-op
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; secure" : "";
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax${secure}`;
}
