"use client";

import { clearSession, getSessionUser, saveSession, type SessionUser, type UserRole } from "./auth-session";

export interface Payslip {
  id: string;
  userId: string;
  period: string;
  grossSalary?: number;
  lines?: Array<{ code: string; description: string; amount: number }>;
  netSalary: number;
  isNew?: boolean;
  status?: "draft" | "published";
  publishedAt?: string | null;
  variablePeriod?: string | null;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  managerId?: string;
  companyId: string;
  roleId?: string;
  costCenterId?: string;
  teamId?: string | null;
  contractType?: string;
  weeklyContractHours?: number;
  /** Deprecato; backend azzera sempre (usare fiscalCode). */
  avsNumber?: string | null;
  iban?: string;
  bankName?: string;
  bicSwift?: string;
  accountHolder?: string;
  dailyTargetSeconds?: number;
  vacationAllowanceDays?: number;
  birthDate?: string;
  /** Data assunzione YYYY-MM-DD */
  hireDate?: string;
  phone?: string;
  address?: string;
  baseSalaryMonthly?: number;
  taxCanton?: string;
  taxMunicipality?: string;
  jurisdiction?: "IT";
  taxRegion?: string;
  taxMunicipalityIt?: string;
  profilePhotoPath?: string;
  payrollItSector?: string | null;
  payrollEmployerInpsPercent?: number | null;
  payrollInailPermille?: number | null;
  payrollTfrDivisor?: number | null;
  payrollAtecoCode?: string | null;
  payrollInailRiskDescription?: string | null;
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
  /** Opzionali da GET /users/me (non sempre presenti su liste). */
  isTeamResponsible?: boolean;
  workTeamIdsWhereLead?: string[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}

export type PermissionCategoryId = "nexa_hr" | "plasticity" | "soma" | "hub";

export interface PermissionDefinition {
  id: string;
  category: PermissionCategoryId;
  resourceKey: string;
  suffix: "read" | "write";
  labelIt: string;
  descriptionReadIt: string;
  descriptionWriteIt: string;
}

export interface PermissionCatalogResponse {
  nexa_hr: PermissionDefinition[];
  plasticity: PermissionDefinition[];
  soma: PermissionDefinition[];
  hub: PermissionDefinition[];
}

export interface ImportCellError {
  row: number;
  field: string;
  message: string;
}

export interface ImportHistoryItem {
  id: string;
  kind: "validate" | "apply";
  category: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  rowCount: number;
  createdCount?: number | null;
  errorCount: number;
  fileSizeBytes?: number | null;
  fileName?: string | null;
  errorsSnapshot?: ImportCellError[];
  actorUserId?: string | null;
  actorEmail?: string | null;
  auditMeta?: Record<string, unknown>;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  companyId?: string;
  payrollItSector?: string | null;
  payrollDefaultInailPermille?: number | null;
}

export interface WorkTeamDto {
  id: string;
  costCenterId: string;
  name: string;
  leadUserId?: string | null;
}

/** Impostazioni aziendali (admin). */
export interface CompanySettingsDto {
  companyId: string;
  /** 1–12: mese di inizio anno di riferimento (es. 4 = anno societario da aprile). */
  fiscalYearStartMonth: number;
  companyLegalName: string;
  companyVatNumber: string;
  companyRegistrationInfo: string;
  /** CCNL di riferimento per il tenant (testo o codice). */
  companyCcnl: string;
  defaultCurrency: string;
  weeklyFullTimeHours: number;
  /** Mensilità per riparto budget (12–14). */
  payrollInstallmentMonths: number;
  customVariables: Record<string, string>;
}

export type CompanySettingsPatch = Partial<Omit<CompanySettingsDto, "companyId">>;

export interface OrgNode {
  id: string;
  label: string;
  role: UserRole;
  costCenterId?: string;
  /** Da catalogo ruoli */
  roleName?: string;
  costCenterName?: string;
  email?: string;
  managerId?: string;
}

export interface OrgEdge {
  from: string;
  to: string;
}

export interface OrgChartResponse {
  nodes: OrgNode[];
  edges: OrgEdge[];
}

/** Nodo ricorsivo per organigramma strutturale (CDC → team). */
export interface OrgStructureTreeNode {
  id: string;
  fullName: string;
  email?: string;
  role: string;
  roleName?: string;
  managerId?: string;
  reports: OrgStructureTreeNode[];
}

export interface OrgStructureTeam {
  id: string;
  name: string;
  leadUserId?: string | null;
  tree: OrgStructureTreeNode[];
}

export interface OrgStructureCostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  teams: OrgStructureTeam[];
  /** Persone del CDC senza team valido o senza teamId. */
  unteamedTree: OrgStructureTreeNode[];
}

export interface OrgStructureResponse {
  costCenters: OrgStructureCostCenter[];
}

export interface TimeEntry {
  id: string;
  userId: string;
  type: "clock_in" | "clock_out";
  at: string;
  source?: "app" | "web" | "qr";
  geo?: { lat: number; lon: number; accuracyM?: number; capturedAt?: string };
  deviceId?: string;
}

export interface WorkdaySummary {
  userId: string;
  date: string;
  minutesWorked: number;
  /** Preferire per ore lavorate se valorizzato dal backend. */
  workedSeconds?: number;
  overtimeSeconds?: number;
  mode: "office" | "smartworking";
}

export interface AttendanceStatus {
  date: string;
  hasOpenClockIn: boolean;
  isRunning: boolean;
  nextType: "clock_in" | "clock_out";
  entriesCount: number;
  minutesWorked: number;
  workedSeconds: number;
  overtimeSeconds: number;
  dailyTargetSeconds: number;
  remainingSeconds: number;
  firstClockInAt?: string;
}

export interface AttendanceOvertimeAggregates {
  referenceDate: string;
  day: { overtimeSeconds: number; overtimeHours: number };
  week: { overtimeSeconds: number; overtimeHours: number };
  month: { overtimeSeconds: number; overtimeHours: number };
  year: { overtimeSeconds: number; overtimeHours: number };
}

export interface LeavePlan {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: "draft" | "pending" | "approved" | "rejected";
  version: number;
  kind?: "annual" | "rol";
}

export interface LeaveBalance {
  userId: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  residualDays: number;
}

export interface ApprovalItem {
  id: string;
  entityId: string;
  type: "leave" | "sickness" | "smartworking" | "travel";
  requestedBy: string;
  approverId?: string;
  approverName?: string;
  status: "pending" | "approved" | "rejected";
  at: string;
  startDate?: string;
  endDate?: string;
  requesterName?: string;
  requesterPhotoUrl?: string | null;
  leaveKind?: "annual" | "rol";
  residualAnnualLeaveDays?: number;
  requestedCalendarDays?: number;
  smartworkingWeekUsed?: number;
  smartworkingWeekQuota?: number;
  smartworkingMonthUsed?: number;
  smartworkingMonthQuota?: number;
  note?: string | null;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  managerId?: string;
  companyId: string;
  roleId: string;
  costCenterId: string;
  contractType: string;
  weeklyContractHours: number;
  /** Codice fiscale (16 caratteri alfanumerici). */
  fiscalCode: string;
  iban: string;
  bankName: string;
  bicSwift: string;
  accountHolder: string;
  vacationAllowanceDays: number;
  birthDate: string;
  hireDate: string;
  phone: string;
  address: string;
  baseSalaryMonthly?: number;
  taxCanton?: string;
  taxMunicipality?: string;
  jurisdiction?: "IT";
  taxRegion?: string;
  taxMunicipalityIt?: string;
  payrollItSector?: string | null;
  payrollEmployerInpsPercent?: number | null;
  payrollInailPermille?: number | null;
  payrollTfrDivisor?: number | null;
  payrollAtecoCode?: string | null;
  payrollInailRiskDescription?: string | null;
  /** Assegnazione team (solo admin console). */
  teamId?: string | null;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  role?: UserRole;
  managerId?: string;
  roleId?: string;
  costCenterId?: string;
  contractType?: string;
  weeklyContractHours?: number;
  fiscalCode?: string | null;
  iban?: string;
  bankName?: string;
  bicSwift?: string;
  accountHolder?: string;
  vacationAllowanceDays?: number;
  birthDate?: string;
  hireDate?: string;
  phone?: string;
  address?: string;
  baseSalaryMonthly?: number;
  taxCanton?: string;
  taxMunicipality?: string;
  jurisdiction?: "IT";
  taxRegion?: string;
  taxMunicipalityIt?: string;
  payrollItSector?: string | null;
  payrollEmployerInpsPercent?: number | null;
  payrollInailPermille?: number | null;
  payrollTfrDivisor?: number | null;
  payrollAtecoCode?: string | null;
  payrollInailRiskDescription?: string | null;
  profilePhotoPath?: string | null;
  /** Assegnazione team (solo admin console). */
  teamId?: string | null;
}

interface ApiValidationErrorItem {
  property: string;
  message: string;
}

interface ApiErrorPayload {
  message?: string | string[] | Record<string, unknown>;
  errors?: ApiValidationErrorItem[];
}

function getApiBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const origin = env && env.length > 0 ? env : "http://localhost:4000";
  const withoutTrailingSlash = origin.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/api") ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
}

function buildApiUrl(path: string): string {
  return `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function getAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

const __nativeFetch = globalThis.fetch.bind(globalThis);

// Shadow global fetch inside this module to ensure:
// - credentials: "include" for backend API (cookie-based refresh)
// - silent refresh on 401 for authed requests
async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : "url" in input
          ? String(input.url)
          : String(input);

  const apiBase = getApiBaseUrl();
  const isBackendApi = urlStr.startsWith(apiBase);
  if (!isBackendApi) {
    return __nativeFetch(input, init);
  }

  const withCreds: RequestInit = { ...init, credentials: "include" };
  const res = await __nativeFetch(urlStr, withCreds);

  const headers = new Headers(withCreds.headers);
  const hasBearer = headers.has("Authorization");
  const isRefreshCall = urlStr.startsWith(buildApiUrl("/auth/refresh"));
  const isLogoutCall = urlStr.startsWith(buildApiUrl("/auth/logout"));
  if (!hasBearer || isRefreshCall || isLogoutCall) {
    return res;
  }

  if (res.status !== 401) {
    return res;
  }

  try {
    const refresh = await __nativeFetch(buildApiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include"
    });
    if (!refresh.ok) {
      clearSession();
      return res;
    }
    const payload = (await refresh.json()) as { token: string; user: SessionUser };
    if (payload?.token && payload?.user) {
      saveSession(payload.token, payload.user);
      headers.set("Authorization", `Bearer ${payload.token}`);
      const retry = await __nativeFetch(urlStr, { ...withCreds, headers });
      return retry;
    }
  } catch {
    // fall through: keep original 401
  }
  clearSession();
  return res;
}

/** True se le timbrature passano dall'Edge Supabase (API Nest team non disponibili). */
export function nexaUsesSupabaseAttendance(): boolean {
  const v = process.env.NEXT_PUBLIC_NEXA_USE_SUPABASE_ATTENDANCE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function getSupabaseFunctionsBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL richiesto per le Edge Functions");
  }
  return `${base}/functions/v1`;
}

function supabaseEdgeHeaders(token: string): Record<string, string> {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  if (anon) {
    headers.apikey = anon;
  }
  return headers;
}

async function fetchPaydayAttendance(
  token: string,
  searchParams: Record<string, string | undefined>,
  init?: RequestInit
): Promise<Response> {
  const url = new URL(`${getSupabaseFunctionsBaseUrl()}/payday-attendance`);
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined && v !== "") {
      url.searchParams.set(k, v);
    }
  }
  return fetch(url.toString(), {
    ...init,
    headers: {
      ...supabaseEdgeHeaders(token),
      ...(init?.headers as Record<string, string> | undefined)
    }
  });
}

async function parseError(response: Response): Promise<never> {
  let detail = `Errore API (${response.status})`;
  let fieldErrors: ApiValidationErrorItem[] | undefined;
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      fieldErrors = payload.errors;
      detail = payload.errors.map((e) => `${e.property}: ${e.message}`).join("; ");
    } else if (Array.isArray(payload.message)) {
      detail = payload.message.join(", ");
    } else if (typeof payload.message === "string") {
      detail = payload.message;
    } else if (payload.message && typeof payload.message === "object") {
      const msg = payload.message as { errors?: ApiValidationErrorItem[]; message?: string };
      if (Array.isArray(msg.errors) && msg.errors.length > 0) {
        fieldErrors = msg.errors;
        detail = msg.errors.map((e) => `${e.property}: ${e.message}`).join("; ");
      } else if (typeof msg.message === "string") {
        detail = msg.message;
      }
    }
  } catch {
    // no-op
  }
  const err = new Error(detail) as Error & { fieldErrors?: ApiValidationErrorItem[] };
  err.fieldErrors = fieldErrors;
  throw err;
}

export async function login(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();
  const response = await fetch(buildApiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { token: string; user: SessionUser };
}

export async function loginWithSynapseSso(synapseSsoToken: string): Promise<{ token: string; user: SessionUser }> {
  const response = await fetch(buildApiUrl("/auth/sso"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ synapseSsoToken })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { token: string; user: SessionUser };
}

export async function fetchCurrentUser(token: string): Promise<SessionUser> {
  const response = await fetch(buildApiUrl("/users/me"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    const cached = getSessionUser();
    if (cached) {
      return cached;
    }
    await parseError(response);
  }
  const me = (await response.json()) as SessionUser;
  if (typeof window !== "undefined") {
    saveSession(token, me);
  }
  return me;
}

export type PayrollProfileItPatch = Partial<{
  fiscalCode: string | null;
  maritalStatus: string | null;
  dependentsChildren: number;
  dependentSpouse: boolean;
  disabilityFlag: boolean;
  taxDomicileMunicipalityIt: string | null;
  taxDomicileSameAsResidence: boolean;
  taxRegion: string;
  taxMunicipalityIt: string;
  payMonthsPerYear: number;
  annualGrossSalary: number | null;
  partTimeModality: string | null;
  ccnlCode: string | null;
  ccnlLevel: string | null;
  legalCategory: string | null;
  contractEndDate: string | null;
  fixedSupplementMonthly: number | null;
  garnishmentMonthlyEstimate: number | null;
  fringeBenefitYtdEuros: number | null;
  contractFixedTerm: boolean;
}>;

export async function patchMyPayrollProfileIt(
  token: string,
  patch: PayrollProfileItPatch
): Promise<SessionUser> {
  const response = await fetch(buildApiUrl("/users/me/payroll-profile-it"), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const user = (await response.json()) as SessionUser;
  if (typeof window !== "undefined") {
    saveSession(token, user);
  }
  return user;
}

/** Risposta motore Hebb (simulazione cedolino IT, senza persistenza). */
export type HebbSimulatePayrollLine = { code: string; description: string; amount: number };
export type HebbSimulatePayrollResult = {
  lines: HebbSimulatePayrollLine[];
  grossAdjusted: number;
  netSalary: number;
};

export async function postHebbSimulateIt(
  token: string,
  body: {
    userId?: string;
    period?: string;
    grossMonthlySalaryOverride?: number;
    usePreviousMonthVariables?: boolean;
  }
): Promise<HebbSimulatePayrollResult> {
  const response = await fetch(buildApiUrl("/ai/hebb-hr/simulate-it"), {
    method: "POST",
    headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as HebbSimulatePayrollResult;
}

export type PayrollBatchRowResult = {
  userId: string;
  payslipId?: string;
  ok: boolean;
  error?: string;
};

export async function postPayrollBatchGenerate(
  token: string,
  body: { period: string; usePreviousMonthVariables?: boolean }
): Promise<{ results: PayrollBatchRowResult[] }> {
  const response = await fetch(buildApiUrl("/payroll/batch-generate"), {
    method: "POST",
    headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { results: PayrollBatchRowResult[] };
}

export async function fetchPayslipDrafts(token: string, period: string): Promise<Payslip[]> {
  const response = await fetch(
    buildApiUrl(`/payroll/payslips/drafts?period=${encodeURIComponent(period)}`),
    { headers: getAuthHeaders(token) }
  );
  if (!response.ok) {
    await parseError(response);
  }
  const body = (await response.json()) as { items: Payslip[] };
  return body.items ?? [];
}

export async function publishPayrollPeriod(token: string, period: string): Promise<{ updated: number }> {
  const response = await fetch(buildApiUrl("/payroll/payslips/publish"), {
    method: "POST",
    headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ period })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { updated: number };
}

export async function fetchCompanySettings(token: string): Promise<CompanySettingsDto> {
  const response = await fetch(buildApiUrl("/company/settings"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as CompanySettingsDto;
}

export async function patchCompanySettings(
  token: string,
  patch: CompanySettingsPatch
): Promise<CompanySettingsDto> {
  const response = await fetch(buildApiUrl("/company/settings"), {
    method: "PATCH",
    headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as CompanySettingsDto;
}

export async function fetchPayslips(token: string, query?: { months?: number }): Promise<Payslip[]> {
  const q = query?.months != null ? `?months=${encodeURIComponent(String(query.months))}` : "";
  const response = await fetch(buildApiUrl(`/payroll/payslips${q}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const body = (await response.json()) as Payslip[] | { items: Payslip[] };
  return Array.isArray(body) ? body : body.items;
}

export async function markPayslipReadApi(token: string, payslipId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/payroll/payslips/${encodeURIComponent(payslipId)}/read`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
}

export interface PayslipImportPreviewResult {
  excerpt: string;
  textLength: number;
  suggestedPeriod: string | null;
  netHints: string[];
}

export async function postPayslipImportPreview(token: string, file: File): Promise<PayslipImportPreviewResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(buildApiUrl("/payroll/payslips/import/pdf-preview"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PayslipImportPreviewResult>;
}

export async function postPayslipImportCommit(
  token: string,
  file: File,
  payload: { userId: string; period: string; netSalary?: number; grossSalary?: number }
): Promise<Payslip> {
  const body = new FormData();
  body.append("file", file);
  body.append("userId", payload.userId);
  body.append("period", payload.period);
  if (payload.netSalary != null) body.append("netSalary", String(payload.netSalary));
  if (payload.grossSalary != null) body.append("grossSalary", String(payload.grossSalary));
  const response = await fetch(buildApiUrl("/payroll/payslips/import/pdf-commit"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<Payslip>;
}

export async function fetchUsers(token: string): Promise<User[]> {
  const response = await fetch(buildApiUrl("/users"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as User[];
}

export async function createUser(token: string, payload: CreateUserPayload): Promise<User> {
  const response = await fetch(buildApiUrl("/users"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as User;
}

export async function updateUser(token: string, userId: string, payload: UpdateUserPayload): Promise<User> {
  const response = await fetch(buildApiUrl(`/users/${encodeURIComponent(userId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as User;
}

export async function fetchOrgChart(
  token: string,
  filters?: { costCenterId?: string; role?: UserRole }
): Promise<OrgChartResponse> {
  const q = new URLSearchParams();
  if (filters?.costCenterId) {
    q.set("costCenterId", filters.costCenterId);
  }
  if (filters?.role) {
    q.set("role", filters.role);
  }
  const qs = q.toString();
  const response = await fetch(buildApiUrl(`/org/chart${qs ? `?${qs}` : ""}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as OrgChartResponse;
}

export async function fetchOrgStructure(token: string): Promise<OrgStructureResponse> {
  const response = await fetch(buildApiUrl("/org/structure"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as OrgStructureResponse;
}

export type ClockPayload = {
  type: "clock_in" | "clock_out";
  source?: "app" | "web" | "qr";
  geo?: { lat: number; lon: number; accuracyM?: number; capturedAt?: string };
  deviceId?: string;
};

export async function clock(token: string, type: "clock_in" | "clock_out", extra?: Omit<ClockPayload, "type">): Promise<TimeEntry> {
  const body: ClockPayload = {
    type,
    source: extra?.source ?? "web",
    ...(extra?.geo ? { geo: { ...extra.geo, capturedAt: new Date().toISOString() } } : {}),
    ...(extra?.deviceId ? { deviceId: extra.deviceId } : {})
  };
  if (nexaUsesSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, { action: "clock" }, {
      method: "POST",
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as TimeEntry;
  }
  const response = await fetch(buildApiUrl("/attendance/clock"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TimeEntry;
}

/** Imposta modalità giornata (sede / remote working, enum `smartworking`) sui riepiloghi presenza — senza flusso di approvazione. */
export async function setAttendanceWorkMode(
  token: string,
  date: string,
  mode: "office" | "smartworking"
): Promise<unknown> {
  const response = await fetch(buildApiUrl("/attendance/mode"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ date: date.slice(0, 10), mode })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return response.json();
}

export type FetchAttendanceEntriesOpts = { date?: string; userId?: string; month?: string };

export async function fetchAttendanceEntries(
  token: string,
  opts?: string | FetchAttendanceEntriesOpts
): Promise<TimeEntry[]> {
  const o: FetchAttendanceEntriesOpts = typeof opts === "string" ? { date: opts } : (opts ?? {});
  if (nexaUsesSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, {
      action: "entries",
      date: o.date ?? undefined
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as TimeEntry[];
  }
  const params = new URLSearchParams();
  if (o.date) {
    params.set("date", o.date);
  }
  if (o.month) {
    params.set("month", o.month);
  }
  if (o.userId) {
    params.set("userId", o.userId);
  }
  const q = params.toString();
  const response = await fetch(buildApiUrl(`/attendance/entries${q ? `?${q}` : ""}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TimeEntry[];
}

export type FetchAttendanceSummaryOpts = { date?: string; userId?: string };

export async function fetchAttendanceSummary(
  token: string,
  opts?: string | FetchAttendanceSummaryOpts
): Promise<WorkdaySummary[]> {
  const o: FetchAttendanceSummaryOpts = typeof opts === "string" ? { date: opts } : (opts ?? {});
  if (nexaUsesSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, {
      action: "summary",
      date: o.date ?? undefined
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as WorkdaySummary[];
  }
  const params = new URLSearchParams();
  if (o.date) {
    params.set("date", o.date);
  }
  if (o.userId) {
    params.set("userId", o.userId);
  }
  const q = params.toString();
  const response = await fetch(buildApiUrl(`/attendance/summary${q ? `?${q}` : ""}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as WorkdaySummary[];
}

export async function fetchAttendanceStatus(token: string, date?: string): Promise<AttendanceStatus> {
  if (nexaUsesSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, {
      action: "status",
      date: date ?? undefined
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as AttendanceStatus;
  }
  const search = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(buildApiUrl(`/attendance/status${search}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as AttendanceStatus;
}

export async function fetchAttendanceOvertimeAggregates(
  token: string,
  date?: string
): Promise<AttendanceOvertimeAggregates> {
  if (nexaUsesSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, {
      action: "aggregates",
      date: date ?? undefined
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as AttendanceOvertimeAggregates;
  }
  const search = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(buildApiUrl(`/attendance/aggregates${search}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as AttendanceOvertimeAggregates;
}

export interface TeamAttendanceUserPicker {
  id: string;
  fullName: string;
  email: string;
}

export async function fetchAttendanceTeamUsers(token: string): Promise<TeamAttendanceUserPicker[]> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error(
      "La gestione timbrature di squadra non è disponibile quando le timbrature usano Supabase Edge."
    );
  }
  const response = await fetch(buildApiUrl("/attendance/team/users"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TeamAttendanceUserPicker[];
}

export interface AttendanceDayBoardRow {
  userId: string;
  fullName: string;
  email: string;
  firstClockIn: string | null;
  lastClockOut: string | null;
  workdayMode: "office" | "smartworking" | null;
  statusLabels: string[];
  alerts: string[];
}

export interface AttendanceDayBoardResponse {
  day: string;
  costCenters: Array<{
    id: string;
    label: string;
    teams: Array<{
      id: string;
      label: string;
      rows: AttendanceDayBoardRow[];
    }>;
  }>;
}

export type FetchAttendanceDayBoardOpts = { date?: string; costCenterIds?: string[] };

export async function fetchAttendanceDayBoard(
  token: string,
  opts?: string | FetchAttendanceDayBoardOpts
): Promise<AttendanceDayBoardResponse> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error(
      "La vista giornaliera team non è disponibile quando le timbrature usano Supabase Edge."
    );
  }
  const o: FetchAttendanceDayBoardOpts = typeof opts === "string" ? { date: opts } : (opts ?? {});
  const params = new URLSearchParams();
  if (o.date) {
    params.set("date", o.date);
  }
  if (o.costCenterIds?.length) {
    params.set("costCenterIds", o.costCenterIds.join(","));
  }
  const qs = params.toString();
  const response = await fetch(buildApiUrl(`/attendance/team/day-board${qs ? `?${qs}` : ""}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as AttendanceDayBoardResponse;
}

export async function fetchAttendanceDayBoardCostCenters(
  token: string
): Promise<Array<{ id: string; label: string }>> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error(
      "I filtri CDC board non sono disponibili quando le timbrature usano Supabase Edge."
    );
  }
  const response = await fetch(buildApiUrl("/attendance/team/day-board/cost-centers"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const body = (await response.json()) as { costCenters: Array<{ id: string; label: string }> };
  return body.costCenters;
}

export async function downloadAttendanceDayBoardExport(
  token: string,
  opts: { date: string; costCenterIds?: string[] }
): Promise<void> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error(
      "L'export giornaliero non è disponibile quando le timbrature usano Supabase Edge."
    );
  }
  const params = new URLSearchParams();
  params.set("date", opts.date.slice(0, 10));
  if (opts.costCenterIds?.length) {
    params.set("costCenterIds", opts.costCenterIds.join(","));
  }
  const url = buildApiUrl(`/attendance/team/day-board/export?${params.toString()}`);
  const response = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `nexa-presenze-giorno-${opts.date.slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadAttendanceMonthExport(token: string, month: string): Promise<void> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error(
      "L'export mensile non è disponibile quando le timbrature usano Supabase Edge."
    );
  }
  const url = buildApiUrl(`/attendance/entries/export?month=${encodeURIComponent(month)}`);
  const response = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `nexa-timbrature-${month}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export async function patchTimeEntry(
  token: string,
  entryId: string,
  body: { at?: string; type?: "clock_in" | "clock_out" }
): Promise<TimeEntry> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error("Modifica timbrature non disponibile con Supabase Edge.");
  }
  const response = await fetch(buildApiUrl(`/attendance/entries/${encodeURIComponent(entryId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TimeEntry;
}

export async function deleteTimeEntry(token: string, entryId: string): Promise<void> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error("Eliminazione timbrature non disponibile con Supabase Edge.");
  }
  const response = await fetch(buildApiUrl(`/attendance/entries/${encodeURIComponent(entryId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
}

export async function createTeamTimeEntry(
  token: string,
  payload: { userId: string; type: "clock_in" | "clock_out"; at?: string }
): Promise<TimeEntry> {
  if (nexaUsesSupabaseAttendance()) {
    throw new Error("Inserimento timbrature non disponibile con Supabase Edge.");
  }
  const response = await fetch(buildApiUrl("/attendance/team/entries"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TimeEntry;
}

export async function fetchAdminRoles(token: string): Promise<Role[]> {
  const response = await fetch(buildApiUrl("/admin/roles"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as Role[];
}

export async function createAdminRole(
  token: string,
  payload: { name: string; description?: string; permissions?: string[] }
): Promise<Role> {
  const response = await fetch(buildApiUrl("/admin/roles"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as Role;
}

export async function updateAdminRole(
  token: string,
  roleId: string,
  payload: { name?: string; description?: string; permissions?: string[] }
): Promise<Role> {
  const response = await fetch(buildApiUrl(`/admin/roles/${roleId}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as Role;
}

export async function deleteAdminRole(token: string, roleId: string): Promise<Role> {
  const response = await fetch(buildApiUrl(`/admin/roles/${roleId}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as Role;
}

export async function fetchAdminCostCenters(token: string): Promise<CostCenter[]> {
  const response = await fetch(buildApiUrl("/admin/cost-centers"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as CostCenter[];
}

export async function createAdminCostCenter(
  token: string,
  payload: {
    code?: string;
    name: string;
    description?: string;
    payrollItSector?: string | null;
    payrollDefaultInailPermille?: number | null;
  }
): Promise<CostCenter> {
  const response = await fetch(buildApiUrl("/admin/cost-centers"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as CostCenter;
}

export async function updateAdminCostCenter(
  token: string,
  costCenterId: string,
  payload: {
    code?: string;
    name?: string;
    description?: string;
    payrollItSector?: string | null;
    payrollDefaultInailPermille?: number | null;
  }
): Promise<CostCenter> {
  const response = await fetch(buildApiUrl(`/admin/cost-centers/${costCenterId}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as CostCenter;
}

export async function deleteAdminCostCenter(token: string, costCenterId: string): Promise<CostCenter> {
  const response = await fetch(buildApiUrl(`/admin/cost-centers/${costCenterId}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as CostCenter;
}

export async function fetchAdminWorkTeams(token: string, costCenterId: string): Promise<WorkTeamDto[]> {
  const response = await fetch(buildApiUrl(`/admin/cost-centers/${encodeURIComponent(costCenterId)}/teams`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as WorkTeamDto[];
}

export async function createAdminWorkTeam(
  token: string,
  costCenterId: string,
  name: string
): Promise<WorkTeamDto> {
  const response = await fetch(buildApiUrl(`/admin/cost-centers/${encodeURIComponent(costCenterId)}/teams`), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ name })
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as WorkTeamDto;
}

export async function patchAdminWorkTeam(
  token: string,
  teamId: string,
  payload: { name?: string }
): Promise<WorkTeamDto> {
  const response = await fetch(buildApiUrl(`/admin/work-teams/${encodeURIComponent(teamId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as WorkTeamDto;
}

export async function setAdminWorkTeamMembers(
  token: string,
  teamId: string,
  userIds: string[]
): Promise<User[]> {
  const response = await fetch(buildApiUrl(`/admin/work-teams/${encodeURIComponent(teamId)}/members`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ userIds })
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as User[];
}

export async function setAdminWorkTeamLead(
  token: string,
  teamId: string,
  userId: string,
  roleId: string
): Promise<{ team: WorkTeamDto; lead: User }> {
  const response = await fetch(buildApiUrl(`/admin/work-teams/${encodeURIComponent(teamId)}/lead`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ userId, roleId })
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { team: WorkTeamDto; lead: User };
}

export async function fetchPermissionCatalog(token: string): Promise<PermissionCatalogResponse> {
  const response = await fetch(buildApiUrl("/admin/permission-catalog"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as PermissionCatalogResponse;
}

export type ImportCategory =
  | "users"
  | "cost_centers"
  | "roles"
  | "leave_allowances"
  | "user_managers"
  | "user_payroll_anagrafica";

export async function downloadImportTemplate(token: string, category: ImportCategory): Promise<Blob> {
  const response = await fetch(buildApiUrl(`/admin/import/template?category=${encodeURIComponent(category)}`), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    await parseError(response);
  }
  return response.blob();
}

export async function validateImportFile(
  token: string,
  category: ImportCategory,
  file: File
): Promise<{ errors: ImportCellError[]; rows: unknown[] }> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(
    buildApiUrl(`/admin/import/validate?category=${encodeURIComponent(category)}`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body
    }
  );
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { errors: ImportCellError[]; rows: unknown[] };
}

export async function applyImport(
  token: string,
  category: ImportCategory,
  rows: unknown[]
): Promise<{ created: number; errors: ImportCellError[] }> {
  const response = await fetch(buildApiUrl("/admin/import/apply"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ category, rows })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { created: number; errors: ImportCellError[] };
}

export async function fetchImportHistory(token: string): Promise<ImportHistoryItem[]> {
  const response = await fetch(buildApiUrl("/admin/import/history"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as ImportHistoryItem[];
}

export type AdminExportFieldDef = { id: string; label: string; requires?: string[] };

export async function fetchAdminExportFields(token: string): Promise<{ fields: AdminExportFieldDef[] }> {
  const response = await fetch(buildApiUrl("/admin/export/fields"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { fields: AdminExportFieldDef[] };
}

export type AdminExportPreview = {
  columnIds: string[];
  columns: Array<{ id: string; label: string }>;
  rows: Array<Record<string, string | number | null>>;
};

export async function postAdminExportPreview(
  token: string,
  body: { fields: string[]; competencePeriod?: string }
): Promise<AdminExportPreview> {
  const response = await fetch(buildApiUrl("/admin/export/preview"), {
    method: "POST",
    headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as AdminExportPreview;
}

export async function downloadAdminExportXlsx(
  token: string,
  body: { fields: string[]; competencePeriod?: string }
): Promise<void> {
  const response = await fetch(buildApiUrl("/admin/export/xlsx"), {
    method: "POST",
    headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexa-hr-export-dipendenti.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type EmployeeExcelPreviewRow = {
  row: number;
  action: "create" | "update";
  userLabel: string;
  changes: string[];
};

export type EmployeeExcelValidateResponse = {
  errors: ImportCellError[];
  preview: EmployeeExcelPreviewRow[];
};

export type EmployeeExcelApplyResponse = {
  applied: number;
  created: number;
  updated: number;
  log: string[];
  errors: ImportCellError[];
};

export async function downloadEmployeeExcelNewUsersTemplate(
  token: string,
  rows: number = 5
): Promise<void> {
  const req = new URL(buildApiUrl("/admin/employee-excel/new-users-template"));
  req.searchParams.set("rows", String(Math.min(200, Math.max(1, rows))));
  const response = await fetch(req.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    await parseError(response);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexa-hr-template-nuovi-dipendenti.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function validateEmployeeExcel(
  token: string,
  file: File
): Promise<EmployeeExcelValidateResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(buildApiUrl("/admin/employee-excel/validate"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as EmployeeExcelValidateResponse;
}

export async function applyEmployeeExcel(
  token: string,
  file: File
): Promise<EmployeeExcelApplyResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(buildApiUrl("/admin/employee-excel/apply"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as EmployeeExcelApplyResponse;
}

export async function fetchPayrollCompetenceUnlock(
  token: string,
  period: string
): Promise<{ period: string; firstCalculableDate: string; calculableToday: boolean }> {
  const response = await fetch(
    buildApiUrl(`/payroll/competence-unlock?period=${encodeURIComponent(period)}`),
    { headers: getAuthHeaders(token) }
  );
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as {
    period: string;
    firstCalculableDate: string;
    calculableToday: boolean;
  };
}

export async function createLeavePlan(
  token: string,
  payload: Pick<LeavePlan, "startDate" | "endDate"> & { kind?: "annual" | "rol"; userId?: string }
): Promise<LeavePlan> {
  const response = await fetch(buildApiUrl("/leave/plan"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as LeavePlan;
}

export async function updateLeavePlan(
  token: string,
  leaveId: string,
  payload: Pick<LeavePlan, "startDate" | "endDate"> & { kind?: "annual" | "rol" }
): Promise<LeavePlan> {
  const response = await fetch(buildApiUrl(`/leave/plan/${encodeURIComponent(leaveId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as LeavePlan;
}

export async function cancelPendingLeavePlan(token: string, leaveId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/leave/plan/${encodeURIComponent(leaveId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
}

export async function fetchLeavePlans(token: string): Promise<LeavePlan[]> {
  const response = await fetch(buildApiUrl("/leave/plan"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as LeavePlan[];
}

export async function fetchLeaveBalance(token: string, year: number): Promise<LeaveBalance> {
  const response = await fetch(buildApiUrl(`/leave/balance?year=${year}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as LeaveBalance;
}

export async function setLeaveAllowance(token: string, userId: string, allocatedDays: number): Promise<LeaveBalance> {
  const response = await fetch(buildApiUrl(`/leave/balance/${encodeURIComponent(userId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ allocatedDays })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as LeaveBalance;
}

export async function fetchApprovals(
  token: string,
  status?: "pending" | "approved" | "rejected"
): Promise<ApprovalItem[]> {
  const search = status ? `?status=${status}` : "";
  const response = await fetch(buildApiUrl(`/approvals${search}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as ApprovalItem[];
}

export async function approveApproval(token: string, approvalId: string): Promise<ApprovalItem> {
  const response = await fetch(buildApiUrl(`/approvals/${approvalId}/approve`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as ApprovalItem;
}

export async function rejectApproval(
  token: string,
  approvalId: string,
  payload?: { reason?: string }
): Promise<ApprovalItem> {
  const response = await fetch(buildApiUrl(`/approvals/${approvalId}/reject`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload ?? {})
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as ApprovalItem;
}

/** Richiesta remote working (endpoint `/smartworking/*`, stato dominio `smartworking`). */
export interface SmartworkingRequestDto {
  id: string;
  userId: string;
  day: string;
  note?: string | null;
  status: "pending" | "approved" | "rejected";
  approverId?: string | null;
  decisionAt?: string | null;
  rejectReason?: string | null;
  createdAt: string;
}

export async function fetchSmartworkingMe(token: string): Promise<{
  balance: { used: number; quota: number };
  items: SmartworkingRequestDto[];
}> {
  const response = await fetch(buildApiUrl("/smartworking/me"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as { balance: { used: number; quota: number }; items: SmartworkingRequestDto[] };
}

export async function createSmartworkingRequest(
  token: string,
  payload: { day: string; note?: string; userId?: string }
): Promise<SmartworkingRequestDto> {
  const response = await fetch(buildApiUrl("/smartworking/request"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as SmartworkingRequestDto;
}

export async function cancelSmartworkingRequest(token: string, requestId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/smartworking/request/${encodeURIComponent(requestId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function updateSmartworkingRequest(
  token: string,
  requestId: string,
  payload: { day: string; note?: string }
): Promise<SmartworkingRequestDto> {
  const response = await fetch(buildApiUrl(`/smartworking/request/${encodeURIComponent(requestId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as SmartworkingRequestDto;
}

export type TravelRequestDto = SmartworkingRequestDto;

export async function createTravelRequest(
  token: string,
  payload: { day: string; note?: string; userId?: string }
): Promise<TravelRequestDto> {
  const response = await fetch(buildApiUrl("/travel/request"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TravelRequestDto;
}

export async function cancelTravelRequest(token: string, requestId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/travel/request/${encodeURIComponent(requestId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function updateTravelRequest(
  token: string,
  requestId: string,
  payload: { day: string; note?: string }
): Promise<TravelRequestDto> {
  const response = await fetch(buildApiUrl(`/travel/request/${encodeURIComponent(requestId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TravelRequestDto;
}

export async function reportSickness(
  token: string,
  payload: { fromDate: string; toDate: string; userId?: string },
  document?: File | null
): Promise<unknown> {
  const fd = new FormData();
  fd.append("fromDate", payload.fromDate);
  fd.append("toDate", payload.toDate);
  if (payload.userId) fd.append("userId", payload.userId);
  if (document) fd.append("document", document);
  const response = await fetch(buildApiUrl("/sickness/report"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  if (!response.ok) {
    await parseError(response);
  }
  return response.json();
}

export async function updateSicknessEvent(
  token: string,
  sicknessId: string,
  payload: { fromDate: string; toDate: string }
): Promise<unknown> {
  const response = await fetch(buildApiUrl(`/sickness/events/${encodeURIComponent(sicknessId)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return response.json();
}

export async function cancelPendingSicknessEvent(token: string, sicknessId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/sickness/events/${encodeURIComponent(sicknessId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
}

export async function fetchSmartworkingPending(token: string): Promise<SmartworkingRequestDto[]> {
  const response = await fetch(buildApiUrl("/smartworking/pending"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const body = (await response.json()) as { items: SmartworkingRequestDto[] };
  return body.items;
}

export async function approveSmartworkingRequest(token: string, id: string): Promise<SmartworkingRequestDto> {
  const response = await fetch(buildApiUrl(`/smartworking/${encodeURIComponent(id)}/approve`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as SmartworkingRequestDto;
}

export async function rejectSmartworkingRequest(
  token: string,
  id: string,
  reason?: string
): Promise<SmartworkingRequestDto> {
  const response = await fetch(buildApiUrl(`/smartworking/${encodeURIComponent(id)}/reject`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ reason })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as SmartworkingRequestDto;
}

export async function generatePayslip(
  token: string,
  userId: string,
  period: string
): Promise<Payslip> {
  const response = await fetch(buildApiUrl(`/payroll/${userId}/${period}/generate`), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as Payslip;
}

export async function downloadPayslipPdf(token: string, userId: string, period: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/payroll/${userId}/${period}/pdf`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `nexa-hr-cedolino-${userId}-${period}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
}

export interface CalendarEventDto {
  id: string;
  kind:
    | "leave"
    | "sickness"
    | "shift"
    | "deadline"
    | "smartworking"
    | "office"
    | "holiday"
    | "rol"
    | "travel"
    | "room_booking";
  title: string;
  start: string;
  end?: string;
  userId?: string;
  meta?: Record<string, unknown>;
}

export interface MeetingRoomDto {
  id: string;
  name: string;
  location: string | null;
  seats: number | null;
  hasScreen: boolean;
  hasProjector: boolean;
  hasWhiteboard: boolean;
  hasVideoConference: boolean;
  extraFeatures: string[];
}

export async function fetchMeetingRooms(token: string): Promise<MeetingRoomDto[]> {
  const response = await fetch(buildApiUrl("/meeting-rooms"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: MeetingRoomDto[] };
  return body.items ?? [];
}

export async function createMeetingRoom(
  token: string,
  input: {
    name: string;
    location?: string;
    seats?: number;
    hasScreen?: boolean;
    hasProjector?: boolean;
    hasWhiteboard?: boolean;
    hasVideoConference?: boolean;
    extraFeatures?: string[];
  }
): Promise<{ id: string }> {
  const response = await fetch(buildApiUrl("/meeting-rooms"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { item: { id: string } };
  return { id: String(body.item.id) };
}

export async function fetchMeetingRoomBookingEvents(
  token: string,
  from?: string,
  to?: string
): Promise<CalendarEventDto[]> {
  const q =
    from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : "";
  const response = await fetch(buildApiUrl(`/meeting-rooms/bookings${q}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { events: CalendarEventDto[] };
  return body.events ?? [];
}

export async function createMeetingRoomBooking(
  token: string,
  roomId: string,
  input: { startsAt: string; endsAt: string; title?: string }
): Promise<CalendarEventDto> {
  const response = await fetch(buildApiUrl(`/meeting-rooms/${roomId}/bookings`), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { event: CalendarEventDto };
  return body.event;
}

export async function cancelMeetingRoomBooking(token: string, bookingId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/meeting-rooms/bookings/${bookingId}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export interface UserNotificationDto {
  id: string;
  userId: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
  kind?: string;
  /** Path in-app (es. /workflow/approvals?approvalId=…). */
  actionPath?: string;
}

export interface EmployeeDocumentDto {
  id: string;
  userId: string;
  kind: "contract" | "payslip" | "personal" | "other";
  title: string;
  mimeType?: string;
  storagePath?: string;
  createdAt: string;
  uploadedBy?: string;
}

export interface ExpenseClaimDto {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  description: string;
  expenseDate?: string;
  expenseType?: string;
  hasReceipt?: boolean;
  receiptSha256?: string | null;
  ocrSuggestedCents?: number | null;
  legalArchivalAt?: string | null;
  kmDistance?: number;
  status: string;
  createdAt: string;
  payslipPeriod?: string;
  appliedPayslipId?: string;
  managerApprovedBy?: string | null;
  managerApprovedAt?: string | null;
  hrApprovedBy?: string | null;
  hrApprovedAt?: string | null;
}

export interface ExpenseWorkflowRowDto {
  claim: ExpenseClaimDto;
  requesterName: string;
  requesterPhotoUrl?: string | null;
  firstLineManagerName: string | null;
}

export interface ExpenseWorkflowDto {
  toApproveManager: ExpenseWorkflowRowDto[];
  toApproveHr: ExpenseWorkflowRowDto[];
  mine: ExpenseWorkflowRowDto[];
}

export async function fetchUserCalendar(
  token: string,
  from?: string,
  to?: string
): Promise<CalendarEventDto[]> {
  const q =
    from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : "";
  const response = await fetch(buildApiUrl(`/users/me/calendar${q}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { events: CalendarEventDto[] };
  return body.events;
}

export interface TeamWorkCalendarRowUser {
  id: string;
  fullName: string;
}

export async function fetchMeTeamWorkCalendar(
  token: string,
  from?: string,
  to?: string
): Promise<{ users: TeamWorkCalendarRowUser[]; events: CalendarEventDto[] }> {
  const q =
    from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : "";
  const response = await fetch(buildApiUrl(`/users/me/team-work-calendar${q}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { users: TeamWorkCalendarRowUser[]; events: CalendarEventDto[] };
}

export async function fetchHrWorkCalendar(
  token: string,
  query?: { from?: string; to?: string; userIds?: string[] }
): Promise<CalendarEventDto[]> {
  const q = new URLSearchParams();
  if (query?.from) q.set("from", query.from);
  if (query?.to) q.set("to", query.to);
  if (query?.userIds?.length) q.set("userIds", query.userIds.join(","));
  const qs = q.toString();
  const response = await fetch(buildApiUrl(`/hr/work-calendar${qs ? `?${qs}` : ""}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { events: CalendarEventDto[] };
  return body.events;
}

export async function fetchUserProfilePhotoUrl(token: string, userId: string): Promise<string | null> {
  const response = await fetch(buildApiUrl(`/users/${encodeURIComponent(userId)}/profile-photo-url`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { url: string | null };
  return body.url;
}

export async function uploadUserProfilePhoto(token: string, userId: string, file: File): Promise<User> {
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch(buildApiUrl(`/users/${encodeURIComponent(userId)}/profile-photo`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as User;
}

export async function fetchUserNotifications(
  token: string,
  limit?: number
): Promise<UserNotificationDto[]> {
  const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : "";
  const response = await fetch(buildApiUrl(`/users/me/notifications${q}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: UserNotificationDto[] };
  return body.items;
}

export async function markUserNotificationRead(
  token: string,
  notificationId: string
): Promise<UserNotificationDto> {
  const response = await fetch(buildApiUrl(`/users/me/notifications/${notificationId}/read`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as UserNotificationDto;
}

export async function deleteUserNotification(token: string, notificationId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/users/me/notifications/${encodeURIComponent(notificationId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function deleteAllUserNotifications(token: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/users/me/notifications`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function uploadDocumentToVault(
  token: string,
  payload: {
    title: string;
    kind: EmployeeDocumentDto["kind"];
    mimeType?: string;
    bodyBase64?: string;
    targetUserId?: string;
  }
): Promise<EmployeeDocumentDto> {
  const response = await fetch(buildApiUrl("/documents/vault"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<EmployeeDocumentDto>;
}

export interface RecruitPositionDto {
  id: string;
  company_id: string;
  title: string;
  job_description: string;
  status: "open" | "closed";
  created_at: string;
  job_code?: string;
  due_date?: string | null;
}

export interface RecruitCandidateDto {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  created_at: string;
  privacy_notice_version?: string | null;
  consent_recorded_at?: string | null;
}

export interface RecruitCandidateDocumentDto {
  id: string;
  candidate_id: string;
  kind: "cv" | "other";
  label: string;
  created_at: string;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
}

export interface RecruitPipelineStageDto {
  id: string;
  pipeline_id: string;
  stage_order: number;
  name: string;
  stage_kind: string;
}

export interface RecruitCandidateStageStateDto {
  id: string;
  candidate_id: string;
  position_id: string;
  current_stage_id: string;
  status: "in_progress" | "passed" | "failed";
  updated_at: string;
}

export async function fetchRecruitPositions(token: string): Promise<RecruitPositionDto[]> {
  const response = await fetch(buildApiUrl("/recruiting/positions"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: RecruitPositionDto[] };
  return body.items ?? [];
}

export async function createRecruitPosition(
  token: string,
  payload: { title: string; jobDescription: string; dueDate?: string | null }
): Promise<RecruitPositionDto> {
  const response = await fetch(buildApiUrl("/recruiting/positions"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<RecruitPositionDto>;
}

export async function deleteRecruitPosition(token: string, id: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/recruiting/positions/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function fetchRecruitCandidates(token: string): Promise<RecruitCandidateDto[]> {
  const response = await fetch(buildApiUrl("/recruiting/candidates"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: RecruitCandidateDto[] };
  return body.items ?? [];
}

export async function createRecruitCandidate(
  token: string,
  payload: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    notes?: string;
    privacyNoticeVersion?: string;
    consentRecordedAt?: string;
  }
): Promise<RecruitCandidateDto> {
  const response = await fetch(buildApiUrl("/recruiting/candidates"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<RecruitCandidateDto>;
}

export async function deleteRecruitCandidate(token: string, candidateId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/recruiting/candidates/${encodeURIComponent(candidateId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function exportRecruitCandidateJson(
  token: string,
  candidateId: string
): Promise<Record<string, unknown>> {
  const response = await fetch(buildApiUrl(`/recruiting/candidates/${encodeURIComponent(candidateId)}/export`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function fetchRecruitCandidateDocuments(
  token: string,
  candidateId: string
): Promise<RecruitCandidateDocumentDto[]> {
  const response = await fetch(
    buildApiUrl(`/recruiting/candidates/${encodeURIComponent(candidateId)}/documents`),
    { headers: getAuthHeaders(token) }
  );
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: RecruitCandidateDocumentDto[] };
  return body.items ?? [];
}

export async function uploadRecruitCandidateDocument(
  token: string,
  candidateId: string,
  file: File,
  options?: { kind?: "cv" | "other"; label?: string }
): Promise<RecruitCandidateDocumentDto> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", options?.kind ?? "cv");
  if (options?.label?.trim()) {
    fd.set("label", options.label.trim());
  }
  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  const response = await fetch(
    buildApiUrl(`/recruiting/candidates/${encodeURIComponent(candidateId)}/documents`),
    { method: "POST", headers, body: fd }
  );
  if (!response.ok) await parseError(response);
  return response.json() as Promise<RecruitCandidateDocumentDto>;
}

export async function deleteRecruitCandidateDocument(token: string, documentId: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/recruiting/documents/${encodeURIComponent(documentId)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export function recruitCandidateDocumentDownloadUrl(documentId: string): URL {
  return new URL(buildApiUrl(`/recruiting/documents/${encodeURIComponent(documentId)}/file`));
}

export async function downloadRecruitCandidateDocumentFile(
  token: string,
  documentId: string,
  filename: string
): Promise<void> {
  const url = recruitCandidateDocumentDownloadUrl(documentId).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) await parseError(response);
  const blob = await response.blob();
  const a = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = filename || "document";
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export async function fetchRecruitCandidateDetail(
  token: string,
  candidateId: string
): Promise<{
  candidate: RecruitCandidateDto;
  states: Array<{
    state_id: string;
    position_id: string;
    position_title: string;
    current_stage_id: string;
    status: "in_progress" | "passed" | "failed";
    updated_at: string;
  }>;
}> {
  const response = await fetch(buildApiUrl(`/recruiting/candidates/${encodeURIComponent(candidateId)}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{
    candidate: RecruitCandidateDto;
    states: Array<{
      state_id: string;
      position_id: string;
      position_title: string;
      current_stage_id: string;
      status: "in_progress" | "passed" | "failed";
      updated_at: string;
    }>;
  }>;
}

export async function attachRecruitCandidateToPosition(
  token: string,
  payload: { candidateId: string; positionId: string }
): Promise<RecruitCandidateStageStateDto> {
  const response = await fetch(buildApiUrl("/recruiting/attach"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<RecruitCandidateStageStateDto>;
}

export async function fetchRecruitBoard(
  token: string,
  positionId: string
): Promise<{
  position: { id: string; title: string };
  stages: RecruitPipelineStageDto[];
  items: Array<{
    state: RecruitCandidateStageStateDto;
    candidate: RecruitCandidateDto;
    can_undo_last_move: boolean;
  }>;
}> {
  const response = await fetch(buildApiUrl(`/recruiting/board/${encodeURIComponent(positionId)}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{
    position: { id: string; title: string };
    stages: RecruitPipelineStageDto[];
    items: Array<{
      state: RecruitCandidateStageStateDto;
      candidate: RecruitCandidateDto;
      can_undo_last_move: boolean;
    }>;
  }>;
}

export async function moveRecruitCandidateStage(
  token: string,
  payload: { stateId: string; nextStageId: string }
): Promise<RecruitCandidateStageStateDto> {
  const response = await fetch(buildApiUrl(`/recruiting/state/${encodeURIComponent(payload.stateId)}/move`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ nextStageId: payload.nextStageId })
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<RecruitCandidateStageStateDto>;
}

export async function decideRecruitCandidate(
  token: string,
  payload: { stateId: string; status: "in_progress" | "passed" | "failed" }
): Promise<RecruitCandidateStageStateDto> {
  const response = await fetch(buildApiUrl(`/recruiting/state/${encodeURIComponent(payload.stateId)}/decision`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ status: payload.status })
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<RecruitCandidateStageStateDto>;
}

export async function undoRecruitLastMove(
  token: string,
  stateId: string
): Promise<RecruitCandidateStageStateDto> {
  const response = await fetch(buildApiUrl(`/recruiting/state/${encodeURIComponent(stateId)}/undo-move`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<RecruitCandidateStageStateDto>;
}

export type RecruitOnboardingRowDto = {
  state_id: string;
  position_id: string;
  position_title: string;
  candidate: RecruitCandidateDto;
  status: string;
  updated_at: string;
};

export async function fetchRecruitOnboardingBoard(token: string): Promise<{ items: RecruitOnboardingRowDto[] }> {
  const primary = await fetch(buildApiUrl("/hr-recap/recruiting-onboarding"), { headers: getAuthHeaders(token) });
  if (primary.ok) {
    return primary.json() as Promise<{ items: RecruitOnboardingRowDto[] }>;
  }
  if (primary.status === 403) {
    const fallback = await fetch(buildApiUrl("/recruiting/onboarding"), { headers: getAuthHeaders(token) });
    if (!fallback.ok) await parseError(fallback);
    return fallback.json() as Promise<{ items: RecruitOnboardingRowDto[] }>;
  }
  return await parseError(primary);
}

export type HrRecapSummaryDto = {
  totalEmployed: number;
  active: number;
  hrOnboarding: number;
  offboarding: number;
  contractsToSign: number;
  recruitingOnboardingCandidates: number;
};

export type HrRecapTaskDto = {
  id: string;
  kind: "approval" | "expense_hr" | "contract_sign";
  title: string;
  subtitle?: string;
  dueAt: string | null;
  href: string;
  notifyUserId: string | null;
};

export async function fetchHrRecapSummary(token: string): Promise<HrRecapSummaryDto> {
  const response = await fetch(buildApiUrl("/hr-recap/summary"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<HrRecapSummaryDto>;
}

export async function fetchHrRecapTasks(token: string): Promise<{ tasks: HrRecapTaskDto[] }> {
  const response = await fetch(buildApiUrl("/hr-recap/tasks"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{ tasks: HrRecapTaskDto[] }>;
}

export async function postHrRecapReminder(token: string, taskId: string): Promise<{ ok: true }> {
  const response = await fetch(buildApiUrl("/hr-recap/reminders"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ taskId })
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{ ok: true }>;
}

export async function fetchHrRecapPeople(
  token: string,
  category: "active" | "hr_onboarding" | "offboarding" | "contracts_pending"
): Promise<{
  users?: Array<{ id: string; fullName: string; email: string; employmentState?: string }>;
  contracts?: Array<{ id: string; title: string; recruit_candidate_id: string | null; updated_at: string }>;
}> {
  const q = new URLSearchParams({ category });
  const response = await fetch(buildApiUrl(`/hr-recap/people?${q.toString()}`), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{
    users?: Array<{ id: string; fullName: string; email: string; employmentState?: string }>;
    contracts?: Array<{ id: string; title: string; recruit_candidate_id: string | null; updated_at: string }>;
  }>;
}

export type HrStandardContractStatus = "draft" | "approved" | "exported";

export interface HrStandardContractDto {
  id: string;
  title: string;
  status: HrStandardContractStatus;
  createdAt: string;
  updatedAt: string;
  party: Record<string, unknown>;
  blocks: unknown[];
  lastExportedDocumentId?: string;
  recruitCandidateId?: string;
  recruitPositionId?: string;
  signedAt?: string;
  signatures?: Record<string, unknown>;
}

export async function fetchHrStandardContracts(token: string): Promise<HrStandardContractDto[]> {
  const response = await fetch(buildApiUrl("/hr-contracts"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: HrStandardContractDto[] };
  return body.items ?? [];
}

export async function fetchHrStandardContract(token: string, id: string): Promise<HrStandardContractDto> {
  const response = await fetch(buildApiUrl(`/hr-contracts/${encodeURIComponent(id)}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<HrStandardContractDto>;
}

export type CreateHrStandardContractPayload = {
  title: string;
  party: Record<string, unknown>;
  blocks: unknown[];
  recruitCandidateId?: string;
  recruitPositionId?: string;
};

export async function createHrStandardContract(
  token: string,
  payload: CreateHrStandardContractPayload
): Promise<HrStandardContractDto> {
  const response = await fetch(buildApiUrl("/hr-contracts"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<HrStandardContractDto>;
}

export type PatchHrStandardContractPayload = {
  title?: string;
  party?: Record<string, unknown>;
  blocks?: unknown[];
  status?: HrStandardContractStatus;
  lastExportedDocumentId?: string;
};

export async function patchHrStandardContract(
  token: string,
  id: string,
  payload: PatchHrStandardContractPayload
): Promise<HrStandardContractDto> {
  const response = await fetch(buildApiUrl(`/hr-contracts/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<HrStandardContractDto>;
}

export async function deleteHrStandardContract(token: string, id: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/hr-contracts/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function exportHrStandardContractPdf(token: string, id: string): Promise<HrStandardContractDto> {
  const response = await fetch(buildApiUrl(`/hr-contracts/${encodeURIComponent(id)}/export`), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<HrStandardContractDto>;
}

export async function signHrStandardContract(
  token: string,
  id: string,
  payload: { companySignerName: string; employeeSignerName: string }
): Promise<HrStandardContractDto> {
  const response = await fetch(buildApiUrl(`/hr-contracts/${encodeURIComponent(id)}/sign`), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<HrStandardContractDto>;
}

export async function fetchHrStandardContractVersions(
  token: string,
  id: string
): Promise<Array<{ version: number; created_at: string; note: string }>> {
  const response = await fetch(buildApiUrl(`/hr-contracts/${encodeURIComponent(id)}/versions`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: Array<{ version: number; created_at: string; note: string }> };
  return body.items ?? [];
}

export async function restoreHrStandardContractVersion(
  token: string,
  id: string,
  version: number
): Promise<HrStandardContractDto> {
  const response = await fetch(
    buildApiUrl(`/hr-contracts/${encodeURIComponent(id)}/restore/${encodeURIComponent(String(version))}`),
    { method: "POST", headers: getAuthHeaders(token) }
  );
  if (!response.ok) await parseError(response);
  return response.json() as Promise<HrStandardContractDto>;
}

export type ThirdPartyCostFrequency = "monthly" | "annual" | "one_time" | "other";

export interface ThirdPartyLicenseDto {
  id: string;
  companyId: string;
  toolName: string;
  licensePlan: string;
  seatsPurchased: number;
  costAmountCents: number;
  costFrequency: ThirdPartyCostFrequency;
  costCenterId: string | null;
  renewalDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  activeSeatsCount: number;
}

export interface ThirdPartyLicenseAssignmentDto {
  id: string;
  companyId: string;
  userId: string;
  licenseId: string;
  status: "active" | "inactive";
  assignedAt: string | null;
  revokedAt: string | null;
  notes: string;
  userFullName: string;
  toolName: string;
  licensePlan: string;
}

export async function fetchThirdPartyLicenses(token: string): Promise<ThirdPartyLicenseDto[]> {
  const response = await fetch(buildApiUrl("/third-party-licenses"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: ThirdPartyLicenseDto[] };
  return body.items ?? [];
}

export async function fetchThirdPartyAssignments(token: string): Promise<ThirdPartyLicenseAssignmentDto[]> {
  const response = await fetch(buildApiUrl("/third-party-licenses/assignments"), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: ThirdPartyLicenseAssignmentDto[] };
  return body.items ?? [];
}

export async function fetchThirdPartyAssignmentsForUser(
  token: string,
  userId: string
): Promise<ThirdPartyLicenseAssignmentDto[]> {
  const response = await fetch(
    buildApiUrl(`/third-party-licenses/assignments/user/${encodeURIComponent(userId)}`),
    { headers: getAuthHeaders(token) }
  );
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: ThirdPartyLicenseAssignmentDto[] };
  return body.items ?? [];
}

export type CreateThirdPartyLicensePayload = {
  toolName: string;
  licensePlan: string;
  seatsPurchased: number;
  costAmountCents: number;
  costFrequency: ThirdPartyCostFrequency;
  costCenterId?: string;
  renewalDate?: string;
  notes?: string;
};

export async function createThirdPartyLicense(
  token: string,
  payload: CreateThirdPartyLicensePayload
): Promise<ThirdPartyLicenseDto> {
  const response = await fetch(buildApiUrl("/third-party-licenses"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<ThirdPartyLicenseDto>;
}

export type PatchThirdPartyLicensePayload = Partial<CreateThirdPartyLicensePayload>;

export async function patchThirdPartyLicense(
  token: string,
  id: string,
  payload: PatchThirdPartyLicensePayload
): Promise<ThirdPartyLicenseDto> {
  const response = await fetch(buildApiUrl(`/third-party-licenses/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<ThirdPartyLicenseDto>;
}

export async function deleteThirdPartyLicense(token: string, id: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/third-party-licenses/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export type SyncThirdPartyAssignmentItem = {
  licenseId: string;
  status: "active" | "inactive";
  assignedAt?: string | null;
  notes?: string;
};

export async function syncThirdPartyAssignmentsForUser(
  token: string,
  userId: string,
  items: SyncThirdPartyAssignmentItem[]
): Promise<ThirdPartyLicenseAssignmentDto[]> {
  const response = await fetch(
    buildApiUrl(`/third-party-licenses/assignments/user/${encodeURIComponent(userId)}`),
    {
      method: "PUT",
      headers: getAuthHeaders(token),
      body: JSON.stringify({ items })
    }
  );
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: ThirdPartyLicenseAssignmentDto[] };
  return body.items ?? [];
}

export async function fetchExpenseClaims(
  token: string,
  scope: "self" | "team" = "self"
): Promise<ExpenseClaimDto[]> {
  const response = await fetch(buildApiUrl(`/expenses?scope=${scope}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items: ExpenseClaimDto[] };
  return body.items;
}

export async function fetchExpenseWorkflow(token: string): Promise<ExpenseWorkflowDto> {
  const response = await fetch(buildApiUrl("/expenses/workflow"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ExpenseWorkflowDto;
}

export async function fetchExpenseClaimReceipt(token: string, claimId: string): Promise<Blob> {
  const response = await fetch(buildApiUrl(`/expenses/${encodeURIComponent(claimId)}/receipt`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.blob();
}

export type CreateExpenseClaimPayload = {
  amountCents: number;
  currency: string;
  description: string;
  expenseDate: string;
  expenseType: string;
  receiptBase64?: string;
  receiptMime?: "image/jpeg" | "image/png" | "image/webp";
  ocrRawText?: string;
  ocrSuggestedCents?: number;
  kmDistance?: number;
};

export async function createExpenseClaim(
  token: string,
  payload: CreateExpenseClaimPayload
): Promise<ExpenseClaimDto> {
  const response = await fetch(buildApiUrl(`/expenses`), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ExpenseClaimDto;
}

export async function createExpenseClaimsBatch(
  token: string,
  items: CreateExpenseClaimPayload[]
): Promise<{ items: ExpenseClaimDto[] }> {
  const response = await fetch(buildApiUrl(`/expenses/batch`), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ items })
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { items: ExpenseClaimDto[] };
}

export async function downloadExpenseReceiptsArchiveZip(
  token: string,
  query?: { from?: string; to?: string; status?: string }
): Promise<Blob> {
  const q = new URLSearchParams();
  if (query?.from) {
    q.set("from", query.from);
  }
  if (query?.to) {
    q.set("to", query.to);
  }
  if (query?.status) {
    q.set("status", query.status);
  }
  const qs = q.toString();
  const response = await fetch(buildApiUrl(`/expenses/receipts/zip${qs ? `?${qs}` : ""}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return response.blob();
}

export async function downloadExpenseReceiptsBatchZip(
  token: string,
  claimIds: string[]
): Promise<Blob> {
  const response = await fetch(buildApiUrl(`/expenses/receipts/zip`), {
    method: "POST",
    headers: { ...getAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ claimIds })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return response.blob();
}

export async function approveExpenseClaim(token: string, id: string): Promise<ExpenseClaimDto> {
  const response = await fetch(buildApiUrl(`/expenses/${id}/approve`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ExpenseClaimDto;
}

export async function rejectExpenseClaim(token: string, id: string): Promise<ExpenseClaimDto> {
  const response = await fetch(buildApiUrl(`/expenses/${id}/reject`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ExpenseClaimDto;
}

export async function deleteExpenseClaim(token: string, id: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/expenses/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
}

export async function fetchQrClockToken(token: string): Promise<{ token: string; expiresInSec: number }> {
  const response = await fetch(buildApiUrl(`/attendance/qr-token`), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { token: string; expiresInSec: number };
}

export async function fetchPeopleInsights(
  token: string
): Promise<{ items: Array<{ userId: string; fullName: string; score: number; reasons: string[] }> }> {
  const response = await fetch(buildApiUrl("/analytics/people-insights"), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    items: Array<{ userId: string; fullName: string; score: number; reasons: string[] }>;
  };
}

export type TurnoverRetentionItem = {
  userId: string;
  fullName: string;
  costCenterId: string | null;
  score: number;
  confidence: number;
  reasons: string[];
  signals: Record<string, number>;
  modelVersion: string;
  runId: string;
  computedAt: string;
};

export async function fetchTurnoverRetention(
  token: string,
  options?: { costCenterId?: string; trendWeeks?: number }
): Promise<{
  items: TurnoverRetentionItem[];
  trend: Array<{ weekStart: string; avgScore: number; sampleSize: number }>;
  companyId: string;
  modelVersion: string;
  costCenters: Array<{ id: string; label: string }>;
}> {
  const params = new URLSearchParams();
  if (options?.costCenterId) {
    params.set("costCenterId", options.costCenterId);
  }
  if (options?.trendWeeks != null) {
    params.set("trendWeeks", String(options.trendWeeks));
  }
  const q = params.toString();
  const response = await fetch(buildApiUrl(`/analytics/turnover-retention${q ? `?${q}` : ""}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    items: TurnoverRetentionItem[];
    trend: Array<{ weekStart: string; avgScore: number; sampleSize: number }>;
    companyId: string;
    modelVersion: string;
    costCenters: Array<{ id: string; label: string }>;
  };
}

export async function postTurnoverRetentionRefresh(
  token: string
): Promise<{ inserted: number; runId: string; computedAt: string }> {
  const response = await fetch(buildApiUrl("/analytics/turnover-retention/refresh"), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { inserted: number; runId: string; computedAt: string };
}

export async function fetchHrAlerts(
  token: string,
  status?: "open" | "ack" | "dismissed"
): Promise<{
  items: Array<{
    id: string;
    companyId: string;
    ruleKey: string;
    severity: string;
    title: string;
    body: string;
    metricPayload: Record<string, unknown>;
    dedupeKey: string;
    status: string;
    createdAt: string;
    acknowledgedAt: string | null;
    acknowledgedByUserId: string | null;
  }>;
}> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await fetch(buildApiUrl(`/analytics/hr-alerts${q}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    items: Array<{
      id: string;
      companyId: string;
      ruleKey: string;
      severity: string;
      title: string;
      body: string;
      metricPayload: Record<string, unknown>;
      dedupeKey: string;
      status: string;
      createdAt: string;
      acknowledgedAt: string | null;
      acknowledgedByUserId: string | null;
    }>;
  };
}

export async function postHrAlertsEvaluate(token: string): Promise<{ created: number; notified: number }> {
  const response = await fetch(buildApiUrl("/analytics/hr-alerts/evaluate"), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { created: number; notified: number };
}

export async function postHrAlertAck(token: string, alertId: string): Promise<{ ok: true }> {
  const response = await fetch(buildApiUrl(`/analytics/hr-alerts/${encodeURIComponent(alertId)}/ack`), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { ok: true };
}

export async function fetchProcessCycleMetrics(token: string): Promise<{
  companyId: string;
  windowDays: number;
  samples: { leave: number; expense: number; onboarding: number };
  medianHoursLeaveApproval: number | null;
  medianDaysExpenseToPaid: number | null;
  medianDaysOnboarding: number | null;
  note: string;
}> {
  const response = await fetch(buildApiUrl("/analytics/process-cycle-times"), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    companyId: string;
    windowDays: number;
    samples: { leave: number; expense: number; onboarding: number };
    medianHoursLeaveApproval: number | null;
    medianDaysExpenseToPaid: number | null;
    medianDaysOnboarding: number | null;
    note: string;
  };
}

export async function fetchHitlProposals(token: string): Promise<{
  items: Array<{
    id: string;
    kind: string;
    status: string;
    rationale: string;
    payload: Record<string, unknown>;
    createdAt: string;
    decidedAt: string | null;
    actorUserId: string;
    decidedByUserId: string | null;
  }>;
}> {
  const response = await fetch(buildApiUrl("/analytics/hitl/proposals"), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    items: Array<{
      id: string;
      kind: string;
      status: string;
      rationale: string;
      payload: Record<string, unknown>;
      createdAt: string;
      decidedAt: string | null;
      actorUserId: string;
      decidedByUserId: string | null;
    }>;
  };
}

export async function postHitlProposal(
  token: string,
  body: { kind: string; payload: Record<string, unknown>; rationale: string }
): Promise<{ id: string }> {
  const response = await fetch(buildApiUrl("/analytics/hitl/proposals"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { id: string };
}

export async function postHitlProposalDecision(
  token: string,
  proposalId: string,
  approve: boolean
): Promise<{ id: string; status: string }> {
  const response = await fetch(
    buildApiUrl(`/analytics/hitl/proposals/${encodeURIComponent(proposalId)}/decision`),
    {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify({ approve })
    }
  );
  if (!response.ok) await parseError(response);
  return (await response.json()) as { id: string; status: string };
}

export async function fetchSuiteAggregateEvents(token: string): Promise<{
  items: Array<{
    id: string;
    direction: string;
    consumers: readonly string[];
    description: string;
  }>;
}> {
  const response = await fetch(buildApiUrl("/integrations/suite/aggregate-events"), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    items: Array<{
      id: string;
      direction: string;
      consumers: readonly string[];
      description: string;
    }>;
  };
}

export async function fetchSkillsGap(
  token: string,
  roleId?: string
): Promise<{
  items: Array<{
    roleId: string;
    roleName: string;
    skillId: string;
    skillCode: string;
    skillName: string;
    minLevel: number;
    avgUserLevel: number;
    gap: number;
    headcountInRole: number;
  }>;
}> {
  const q = roleId?.trim() ? `?roleId=${encodeURIComponent(roleId.trim())}` : "";
  const response = await fetch(buildApiUrl(`/analytics/skills-gap${q}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    items: Array<{
      roleId: string;
      roleName: string;
      skillId: string;
      skillCode: string;
      skillName: string;
      minLevel: number;
      avgUserLevel: number;
      gap: number;
      headcountInRole: number;
    }>;
  };
}

export async function fetchManagerCopilot(token: string): Promise<{
  pendingTotal: number;
  pendingByType: Partial<Record<"leave" | "sickness" | "smartworking" | "travel", number>>;
  teamHeadcount: number;
  teamSmartworkingPending: number;
  teamTurnoverAvgScore: number | null;
  topPendingPreview: Array<{ type: string; requesterName?: string; at: string }>;
  routes: {
    approvals: string;
    smartworking: string;
    insights: string;
    workforcePlanning: string;
  };
}> {
  const response = await fetch(buildApiUrl("/analytics/manager-copilot"), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    pendingTotal: number;
    pendingByType: Partial<Record<"leave" | "sickness" | "smartworking" | "travel", number>>;
    teamHeadcount: number;
    teamSmartworkingPending: number;
    teamTurnoverAvgScore: number | null;
    topPendingPreview: Array<{ type: string; requesterName?: string; at: string }>;
    routes: {
      approvals: string;
      smartworking: string;
      insights: string;
      workforcePlanning: string;
    };
  };
}

export async function fetchHrCenterMeta(token: string): Promise<{
  canAccess: boolean;
  llmActive: boolean;
  scopeMode?: "company" | "team";
  costCenterOptions?: Array<{ id: string; label: string }>;
  teamOptions?: Array<{ id: string; label: string; costCenterId: string }>;
}> {
  const response = await fetch(buildApiUrl("/hr-center/meta"), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    canAccess: boolean;
    llmActive: boolean;
    scopeMode?: "company" | "team";
    costCenterOptions?: Array<{ id: string; label: string }>;
    teamOptions?: Array<{ id: string; label: string; costCenterId: string }>;
  };
}

export type HrCenterAnalyticsRunBody = {
  focus?: "company" | "cost_center" | "team" | "employee";
  costCenterId?: string;
  teamId?: string;
  userId?: string;
  deepDive?: "none" | "master_data" | "budget_turnover";
};

export type HrCenterAnalyticsDataset = {
  scope: string;
  analysisFocus: "company" | "cost_center" | "team" | "employee";
  analysisLabel: string;
  analysisDeepDive?: "master_data" | "budget_turnover";
  byCostCenter: Array<{
    costCenterId: string;
    costCenterName?: string;
    headcount: number;
    monthlyGrossSum: number;
  }>;
  totals: { headcount: number; monthlyGrossSum: number; avgWeeklyContractHours: number };
  disclaimer: string;
};

export type HrCenterAnalyticsReportEnvelope = {
  executiveSummary: string;
  strategicInsights: string[];
  costCenterNarratives: Array<{
    costCenterId: string;
    headline: string;
    analysis: string;
    suggestion: string;
  }>;
  priorities: Array<{ title: string; rationale: string; nextStep: string }>;
  expertClosingNote: string;
  methodologyNote: string;
};

export async function postHrCenterAnalytics(
  token: string,
  body: HrCenterAnalyticsRunBody = {}
): Promise<{
  dataset: HrCenterAnalyticsDataset;
  report: { envelope: HrCenterAnalyticsReportEnvelope } | Record<string, unknown>;
  llm: { active: boolean; refineApplied: boolean };
  privacy: { schemaVersion: string; tokenCount: number };
}> {
  const response = await fetch(buildApiUrl("/hr-center/analytics/run"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    dataset: HrCenterAnalyticsDataset;
    report: { envelope: HrCenterAnalyticsReportEnvelope } | Record<string, unknown>;
    llm: { active: boolean; refineApplied: boolean };
    privacy: { schemaVersion: string; tokenCount: number };
  };
}

export async function postHrCenterContractDraft(token: string): Promise<{
  facts: Record<string, unknown>;
  narrative: unknown;
  llm: { active: boolean; refineApplied: boolean };
  privacy: { schemaVersion: string; tokenCount: number };
}> {
  const response = await fetch(buildApiUrl("/hr-center/contracts/draft"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({})
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    facts: Record<string, unknown>;
    narrative: unknown;
    llm: { active: boolean; refineApplied: boolean };
    privacy: { schemaVersion: string; tokenCount: number };
  };
}

export async function postHrCenterRecap(
  token: string,
  targetUserId?: string
): Promise<{
  facts: Record<string, unknown>;
  narrative: unknown;
  llm: { active: boolean; refineApplied: boolean };
  privacy: { schemaVersion: string; tokenCount: number };
}> {
  const response = await fetch(buildApiUrl("/hr-center/recap/run"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ targetUserId: targetUserId ?? undefined })
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    facts: Record<string, unknown>;
    narrative: unknown;
    llm: { active: boolean; refineApplied: boolean };
    privacy: { schemaVersion: string; tokenCount: number };
  };
}

export async function postAnalyticsNarrative(
  token: string,
  body: { topic: string; payload: Record<string, unknown>; useLlm?: boolean }
): Promise<{
  title: string;
  bullets: string[];
  summary: string;
  llmApplied: boolean;
  templateOnly: boolean;
}> {
  const response = await fetch(buildApiUrl("/analytics/narrative"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    title: string;
    bullets: string[];
    summary: string;
    llmApplied: boolean;
    templateOnly: boolean;
  };
}

export async function postAnalyticsHitlProposalDraft(
  token: string,
  body: { intent: string; useLlm?: boolean }
): Promise<{
  kind: string;
  title: string;
  rationale: string;
  checklist: string[];
  llmApplied: boolean;
}> {
  const response = await fetch(buildApiUrl("/analytics/hitl/proposal-draft"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    kind: string;
    title: string;
    rationale: string;
    checklist: string[];
    llmApplied: boolean;
  };
}

export async function fetchPayrollForecast(
  token: string,
  months?: number
): Promise<{ series: Array<{ month: string; costEur: number }> }> {
  const q = months != null ? `?months=${months}` : "";
  const response = await fetch(buildApiUrl(`/analytics/forecast-payroll${q}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { series: Array<{ month: string; costEur: number }> };
}

export type WorkforceCockpitScenario = "base" | "growth" | "freeze" | "custom";

export async function fetchWorkforceCockpit(
  token: string,
  scenario: WorkforceCockpitScenario,
  months?: number,
  custom?: { fteDelta?: number; monthlyFlatDeltaEur?: number; seriesScalePercent?: number }
): Promise<{
  scenario: WorkforceCockpitScenario;
  summary: { headcount: number; monthlyPayrollMassEur: number; pendingExpenseCount: number };
  series: Array<{ month: string; costEur: number }>;
  custom?: { fteDelta: number; monthlyFlatDeltaEur: number; seriesScalePercent: number };
}> {
  const params = new URLSearchParams({ scenario });
  if (months != null) params.set("months", String(months));
  if (scenario === "custom" && custom) {
    if (custom.fteDelta != null) params.set("fteDelta", String(custom.fteDelta));
    if (custom.monthlyFlatDeltaEur != null) params.set("monthlyFlatDeltaEur", String(custom.monthlyFlatDeltaEur));
    if (custom.seriesScalePercent != null) params.set("seriesScalePercent", String(custom.seriesScalePercent));
  }
  const response = await fetch(buildApiUrl(`/analytics/workforce-cockpit?${params.toString()}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    scenario: WorkforceCockpitScenario;
    summary: { headcount: number; monthlyPayrollMassEur: number; pendingExpenseCount: number };
    series: Array<{ month: string; costEur: number }>;
    custom?: { fteDelta: number; monthlyFlatDeltaEur: number; seriesScalePercent: number };
  };
}

export async function postPayrollWhatIf(
  token: string,
  body: {
    userId?: string;
    period?: string;
    grossMonthlySalaryOverride?: number;
    usePreviousMonthVariables?: boolean;
  }
): Promise<{
  netSalary: number;
  grossSalary?: number;
  lines: Array<{ code: string; description: string; amount: number }>;
  [key: string]: unknown;
}> {
  const response = await fetch(buildApiUrl("/analytics/payroll-what-if"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(body)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    netSalary: number;
    grossSalary?: number;
    lines: Array<{ code: string; description: string; amount: number }>;
    [key: string]: unknown;
  };
}

export async function fetchAttendanceReport(
  token: string,
  from: string,
  to: string
): Promise<{
  rows: Array<{ userId: string; fullName: string; date: string; type: string; at: string }>;
}> {
  const response = await fetch(
    buildApiUrl(`/reports/attendance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    { headers: getAuthHeaders(token) }
  );
  if (!response.ok) await parseError(response);
  return (await response.json()) as {
    rows: Array<{ userId: string; fullName: string; date: string; type: string; at: string }>;
  };
}

export type ShiftProposalDto = { id: string; userId: string; startAt: string; endAt: string };

export async function fetchShiftProposals(
  token: string,
  weekStart: string
): Promise<{ items: ShiftProposalDto[] }> {
  const response = await fetch(
    buildApiUrl(`/scheduling/proposals?weekStart=${encodeURIComponent(weekStart)}`),
    { headers: getAuthHeaders(token) }
  );
  if (!response.ok) await parseError(response);
  return (await response.json()) as { items: ShiftProposalDto[] };
}

export async function submitLifecycleOffboard(
  token: string,
  targetUserId: string,
  checklist: Record<string, boolean>
): Promise<unknown> {
  const response = await fetch(buildApiUrl(`/lifecycle/offboard/${encodeURIComponent(targetUserId)}`), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ checklist })
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export interface PersonnelBudgetMoney {
  ral: number;
  overtime: number;
  travel: number;
  inps: number;
  inail: number;
  tfr: number;
  totalCompanyCost: number;
}

export interface PersonnelBudgetRow {
  userId: string;
  fullName: string;
  costCenterId: string | null;
  costCenterName?: string;
  budget: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
  actual: PersonnelBudgetMoney;
  suggestedBudget?: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
}

export interface PersonnelBudgetDepartment {
  costCenterId: string | null;
  costCenterName: string;
  sortOrder: number;
  rows: PersonnelBudgetRow[];
}

export interface PersonnelBudgetSnapshot {
  year: number;
  month: number;
  period: string;
  departments: PersonnelBudgetDepartment[];
}

export async function fetchPersonnelBudget(
  token: string,
  year?: number,
  month?: number
): Promise<PersonnelBudgetSnapshot> {
  const q = new URLSearchParams();
  if (year != null) q.set("year", String(year));
  if (month != null) q.set("month", String(month));
  const s = q.toString();
  const response = await fetch(buildApiUrl(`/hr/personnel-budget${s ? `?${s}` : ""}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PersonnelBudgetSnapshot>;
}

export async function downloadPersonnelBudgetActualExport(
  token: string,
  year?: number,
  month?: number
): Promise<Blob> {
  const q = new URLSearchParams();
  if (year != null) q.set("year", String(year));
  if (month != null) q.set("month", String(month));
  const s = q.toString();
  const response = await fetch(buildApiUrl(`/hr/personnel-budget/export-actual.xlsx${s ? `?${s}` : ""}`), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) await parseError(response);
  return response.blob();
}

export async function patchPersonnelBudgetCostCenterOrder(
  token: string,
  payload: { year: number; order: Array<{ costCenterId: string; sortOrder: number }> }
): Promise<void> {
  const response = await fetch(buildApiUrl("/hr/personnel-budget/cost-center-order"), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
}

export async function patchPersonnelBudgetCells(
  token: string,
  payload: {
    year: number;
    month: number;
    cells: Array<{
      userId: string;
      budgetRal?: number | null;
      budgetOvertime?: number | null;
      budgetTravel?: number | null;
      budgetInps?: number | null;
      budgetInail?: number | null;
      budgetTfr?: number | null;
    }>;
  }
): Promise<void> {
  const response = await fetch(buildApiUrl("/hr/personnel-budget/cells"), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
}

export type PersonnelBudgetYearStatusKind = "draft" | "approved";

export interface PersonnelBudgetYearStatusDto {
  companyId: string;
  year: number;
  status: PersonnelBudgetYearStatusKind;
  approvedAt: string | null;
  approvedByUserId: string | null;
}

export interface PersonnelBudgetAnnualMatrixRow {
  userId: string;
  fullName: string;
  costCenterId: string | null;
  costCenterName?: string;
  teamId: string | null;
  teamName?: string;
  months: Array<{
    month: number;
    budget: {
      ral: number | null;
      overtime: number | null;
      travel: number | null;
      inps: number | null;
      inail: number | null;
      tfr: number | null;
    };
  }>;
}

export interface PersonnelBudgetAnnualMatrixResult {
  year: number;
  yearStatus: PersonnelBudgetYearStatusDto;
  payrollInstallmentMonths: number;
  rows: PersonnelBudgetAnnualMatrixRow[];
}

export async function fetchPersonnelBudgetYearStatus(
  token: string,
  year?: number
): Promise<PersonnelBudgetYearStatusDto> {
  const q = new URLSearchParams();
  if (year != null) q.set("year", String(year));
  const s = q.toString();
  const response = await fetch(buildApiUrl(`/hr/personnel-budget/year-status${s ? `?${s}` : ""}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PersonnelBudgetYearStatusDto>;
}

export async function postPersonnelBudgetYearApprove(token: string, year: number): Promise<PersonnelBudgetYearStatusDto> {
  const response = await fetch(buildApiUrl(`/hr/personnel-budget/year-status/approve?year=${year}`), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PersonnelBudgetYearStatusDto>;
}

export async function fetchPersonnelBudgetAnnualMatrix(
  token: string,
  year?: number
): Promise<PersonnelBudgetAnnualMatrixResult> {
  const q = new URLSearchParams();
  if (year != null) q.set("year", String(year));
  const s = q.toString();
  const response = await fetch(buildApiUrl(`/hr/personnel-budget/annual-matrix${s ? `?${s}` : ""}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PersonnelBudgetAnnualMatrixResult>;
}

export async function postPersonnelBudgetApplyProRata(
  token: string,
  year: number
): Promise<{ monthsPatched: number; users: number }> {
  const response = await fetch(buildApiUrl(`/hr/personnel-budget/apply-pro-rata?year=${year}`), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{ monthsPatched: number; users: number }>;
}

export interface PersonnelBudgetForecastRow extends PersonnelBudgetRow {
  forecast: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
}

export interface PersonnelBudgetForecastDepartment {
  costCenterId: string | null;
  costCenterName: string;
  sortOrder: number;
  rows: PersonnelBudgetForecastRow[];
}

export interface PersonnelBudgetForecastSnapshot {
  year: number;
  month: number;
  period: string;
  departments: PersonnelBudgetForecastDepartment[];
}

export async function fetchPersonnelBudgetForecastSnapshot(
  token: string,
  year?: number,
  month?: number
): Promise<PersonnelBudgetForecastSnapshot> {
  const q = new URLSearchParams();
  if (year != null) q.set("year", String(year));
  if (month != null) q.set("month", String(month));
  const s = q.toString();
  const response = await fetch(buildApiUrl(`/hr/personnel-budget/forecast-snapshot${s ? `?${s}` : ""}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PersonnelBudgetForecastSnapshot>;
}

export async function patchPersonnelBudgetForecastCells(
  token: string,
  payload: {
    year: number;
    month: number;
    cells: Array<{
      userId: string;
      forecastRal?: number | null;
      forecastOvertime?: number | null;
      forecastTravel?: number | null;
      forecastInps?: number | null;
      forecastInail?: number | null;
      forecastTfr?: number | null;
    }>;
  }
): Promise<void> {
  const response = await fetch(buildApiUrl("/hr/personnel-budget/forecast-cells"), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
}

export type PersonnelBudgetAnalysisCategory =
  | "ral"
  | "overtime"
  | "travel"
  | "inps"
  | "inail"
  | "tfr"
  | "totalCompanyCost";

export interface PersonnelBudgetAnalysisVarianceRow {
  category: PersonnelBudgetAnalysisCategory;
  userId: string | null;
  fullName: string | null;
  actual: number;
  budget: number;
  forecast: number;
  varianceBf: number;
  variancePct: number | null;
  exceedsThreshold: boolean;
}

export interface PersonnelBudgetAnalysisNoteDto {
  id: string;
  companyId: string;
  year: number;
  month: number;
  category: string;
  subjectUserId: string;
  comment: string;
  authorId: string;
  updatedAt: string;
}

export interface PersonnelBudgetAnalysisResult {
  year: number;
  month: number;
  thresholdPct: number;
  thresholdAbs: number;
  totals: {
    actual: PersonnelBudgetMoney;
    budget: PersonnelBudgetMoney;
    forecast: PersonnelBudgetMoney;
  };
  variances: PersonnelBudgetAnalysisVarianceRow[];
  notes: PersonnelBudgetAnalysisNoteDto[];
}

export async function fetchPersonnelBudgetAnalysis(
  token: string,
  opts?: { year?: number; month?: number; thresholdPct?: number; thresholdAbs?: number }
): Promise<PersonnelBudgetAnalysisResult> {
  const q = new URLSearchParams();
  if (opts?.year != null) q.set("year", String(opts.year));
  if (opts?.month != null) q.set("month", String(opts.month));
  if (opts?.thresholdPct != null) q.set("thresholdPct", String(opts.thresholdPct));
  if (opts?.thresholdAbs != null) q.set("thresholdAbs", String(opts.thresholdAbs));
  const s = q.toString();
  const response = await fetch(buildApiUrl(`/hr/personnel-budget/analysis${s ? `?${s}` : ""}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PersonnelBudgetAnalysisResult>;
}

export async function patchPersonnelBudgetAnalysisNote(
  token: string,
  payload: {
    year: number;
    month: number;
    category: string;
    subjectUserId: string;
    comment: string;
  }
): Promise<PersonnelBudgetAnalysisNoteDto> {
  const response = await fetch(buildApiUrl("/hr/personnel-budget/analysis/note"), {
    method: "PATCH",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<PersonnelBudgetAnalysisNoteDto>;
}

export interface CorporatePolicyDocumentDto {
  id: string;
  company_id: string;
  title: string;
  description: string;
  mime_type: string | null;
  byte_size: number | null;
  version: number;
  created_by_user_id: string | null;
  created_at: string;
}

export async function fetchCorporatePolicies(token: string): Promise<CorporatePolicyDocumentDto[]> {
  const response = await fetch(buildApiUrl("/corporate-policies"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { items?: CorporatePolicyDocumentDto[] };
  return body.items ?? [];
}

export async function uploadCorporatePolicy(
  token: string,
  payload: {
    title: string;
    description: string;
    mimeType?: string;
    originalName?: string;
    bodyBase64: string;
  }
): Promise<CorporatePolicyDocumentDto> {
  const response = await fetch(buildApiUrl("/corporate-policies/upload"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { item: CorporatePolicyDocumentDto };
  return body.item;
}

export async function downloadCorporatePolicyBlob(token: string, documentId: string): Promise<Blob> {
  const response = await fetch(buildApiUrl(`/corporate-policies/${encodeURIComponent(documentId)}/file`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.blob();
}

export interface AiNlCatalogEntryDto {
  id: string;
  label: string;
  description: string;
  requiredPermissions: string[];
}

export interface AiHrCatalogResponseDto {
  queries: AiNlCatalogEntryDto[];
  capabilities: { llmActive: boolean };
}

export async function fetchAiNlQueryCatalog(token: string): Promise<AiHrCatalogResponseDto> {
  const response = await fetch(buildApiUrl("/ai/hr/nl-query/catalog"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { queries?: AiNlCatalogEntryDto[]; capabilities?: { llmActive?: boolean } };
  return {
    queries: body.queries ?? [],
    capabilities: { llmActive: body.capabilities?.llmActive === true }
  };
}

export type AiAssistantScopeMode = "self" | "user" | "team" | "cost_center";

export interface AiAssistantScopePayload {
  mode: AiAssistantScopeMode;
  userId?: string;
  teamId?: string;
  costCenterId?: string;
}

export interface AiAssistantScopeOptionsDto {
  modesAllowed: AiAssistantScopeMode[];
  managedUsers?: { userId: string; label: string }[];
  teams?: { teamId: string; name: string; costCenterId: string }[];
  costCenters?: { costCenterId: string; label: string }[];
}

export async function fetchAiAssistantScopeOptions(token: string): Promise<AiAssistantScopeOptionsDto> {
  const response = await fetch(buildApiUrl("/ai/hr/assistant/scope-options"), { headers: getAuthHeaders(token) });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<AiAssistantScopeOptionsDto>;
}

export async function fetchAiAssistantOrgUsers(
  token: string,
  q: string
): Promise<{ users: { userId: string; label: string }[] }> {
  const params = new URLSearchParams({ q });
  const response = await fetch(buildApiUrl(`/ai/hr/assistant/org-users?${params.toString()}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{ users: { userId: string; label: string }[] }>;
}

export interface AiAssistantResponseMeta {
  llm: { configured: boolean; refineApplied: boolean };
  privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
}

export async function postAiAssistant(
  token: string,
  payload: { message: string; page?: string; scope?: AiAssistantScopePayload }
): Promise<{ reply: string; sources: string[] } & AiAssistantResponseMeta> {
  const response = await fetch(buildApiUrl("/ai/hr/assistant"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as Record<string, unknown>;
  const reply = typeof body.reply === "string" ? body.reply : "";
  const sources = Array.isArray(body.sources) ? (body.sources as string[]) : [];
  const llmRaw = body.llm as Record<string, unknown> | undefined;
  const privRaw = body.privacy as Record<string, unknown> | undefined;
  return {
    reply,
    sources,
    llm: {
      configured: llmRaw?.configured === true,
      refineApplied: llmRaw?.refineApplied === true
    },
    privacy: {
      pseudonymizedTokenCount:
        typeof privRaw?.pseudonymizedTokenCount === "number" ? privRaw.pseudonymizedTokenCount : 0,
      schemaVersion: typeof privRaw?.schemaVersion === "string" ? privRaw.schemaVersion : ""
    }
  };
}

export async function postAiNlQueryRun(
  token: string,
  payload: { queryId: string }
): Promise<{ queryId: string; table: Record<string, unknown>[]; summary: string }> {
  const response = await fetch(buildApiUrl("/ai/hr/nl-query/run"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{ queryId: string; table: Record<string, unknown>[]; summary: string }>;
}

export async function postAiNlQuerySaveView(
  token: string,
  payload: { label: string; queryId: string }
): Promise<{ ok: boolean; label: string; queryId: string }> {
  const response = await fetch(buildApiUrl("/ai/hr/nl-query/save-view"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{ ok: boolean; label: string; queryId: string }>;
}

export async function postAiAnomalies(token: string): Promise<{
  items: { code: string; severity: string; message: string }[];
  explanation: string;
}> {
  const response = await fetch(buildApiUrl("/ai/hr/anomalies"), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{
    items: { code: string; severity: string; message: string }[];
    explanation: string;
  }>;
}

export async function postAiTriage(
  token: string,
  payload: { text: string }
): Promise<{ category: string; priority: string; rationale: string; suggestedPath: string | null }> {
  const response = await fetch(buildApiUrl("/ai/hr/triage"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json() as Promise<{
    category: string;
    priority: string;
    rationale: string;
    suggestedPath: string | null;
  }>;
}
