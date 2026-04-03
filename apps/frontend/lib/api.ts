"use client";

import { getSessionUser, saveSession, type SessionUser, type UserRole } from "./auth-session";

export interface Payslip {
  id: string;
  userId: string;
  period: string;
  grossSalary?: number;
  lines?: Array<{ code: string; description: string; amount: number }>;
  netSalary: number;
  isNew?: boolean;
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
  avsNumber?: string;
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
  jurisdiction?: "CH" | "IT";
  taxRegion?: string;
  taxMunicipalityIt?: string;
  profilePhotoPath?: string;
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
}

export interface WorkTeamDto {
  id: string;
  costCenterId: string;
  name: string;
  leadUserId?: string | null;
}

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

export interface TimeEntry {
  id: string;
  userId: string;
  type: "clock_in" | "clock_out";
  at: string;
  source?: "app" | "web" | "qr" | "nfc" | "digital_badge";
  geo?: { lat: number; lon: number; accuracyM?: number; capturedAt?: string };
  deviceId?: string;
}

export interface WorkdaySummary {
  userId: string;
  date: string;
  minutesWorked: number;
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
  type: "leave" | "sickness";
  requestedBy: string;
  approverId?: string;
  status: "pending" | "approved" | "rejected";
  at: string;
  startDate?: string;
  endDate?: string;
  requesterName?: string;
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
  avsNumber: string;
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
  jurisdiction?: "CH" | "IT";
  taxRegion?: string;
  taxMunicipalityIt?: string;
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
  avsNumber?: string;
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
  jurisdiction?: "CH" | "IT";
  taxRegion?: string;
  taxMunicipalityIt?: string;
  profilePhotoPath?: string | null;
  /** Assegnazione team (solo admin console). */
  teamId?: string | null;
}

interface ApiErrorPayload {
  message?: string | string[];
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
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (Array.isArray(payload.message)) {
      detail = payload.message.join(", ");
    } else if (payload.message) {
      detail = payload.message;
    }
  } catch {
    // no-op
  }
  throw new Error(detail);
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
  const response = await fetch(buildApiUrl(`/users/${userId}`), {
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

export type ClockPayload = {
  type: "clock_in" | "clock_out";
  source?: "app" | "web" | "qr" | "nfc" | "digital_badge";
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
  payload: { code?: string; name: string; description?: string }
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
  payload: { code?: string; name?: string; description?: string }
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
  | "user_managers";

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

export async function createLeavePlan(
  token: string,
  payload: Pick<LeavePlan, "startDate" | "endDate"> & { kind?: "annual" | "rol" }
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
  const response = await fetch(buildApiUrl(`/leave/balance/${userId}`), {
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
  payload: { day: string; note?: string }
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

export async function reportSickness(
  token: string,
  payload: { fromDate: string; toDate: string },
  document?: File | null
): Promise<unknown> {
  const fd = new FormData();
  fd.append("fromDate", payload.fromDate);
  fd.append("toDate", payload.toDate);
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
  kind: "leave" | "sickness" | "shift" | "deadline" | "smartworking" | "holiday" | "rol";
  title: string;
  start: string;
  end?: string;
  userId?: string;
  meta?: Record<string, unknown>;
}

export interface UserNotificationDto {
  id: string;
  userId: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
  kind?: string;
}

export interface ExpenseClaimDto {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  description: string;
  kmDistance?: number;
  status: string;
  createdAt: string;
  payslipPeriod?: string;
  appliedPayslipId?: string;
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

export async function createExpenseClaim(
  token: string,
  payload: { amountCents: number; currency: string; description: string; kmDistance?: number }
): Promise<ExpenseClaimDto> {
  const response = await fetch(buildApiUrl(`/expenses`), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as ExpenseClaimDto;
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

export async function fetchQrClockToken(token: string): Promise<{ token: string; expiresInSec: number }> {
  const response = await fetch(buildApiUrl(`/attendance/qr-token`), {
    method: "POST",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { token: string; expiresInSec: number };
}

export async function clockNfcPublic(payload: {
  token: string;
  type: "clock_in" | "clock_out";
  at?: string;
}): Promise<unknown> {
  const response = await fetch(buildApiUrl("/clock/nfc"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) await parseError(response);
  return response.json();
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

export async function fetchPayrollForecast(
  token: string,
  months?: number
): Promise<{ series: Array<{ month: string; costChf: number }> }> {
  const q = months != null ? `?months=${months}` : "";
  const response = await fetch(buildApiUrl(`/analytics/forecast-payroll${q}`), {
    headers: getAuthHeaders(token)
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { series: Array<{ month: string; costChf: number }> };
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

export async function fetchShiftProposals(token: string, weekStart: string): Promise<{ items: unknown[] }> {
  const response = await fetch(
    buildApiUrl(`/scheduling/proposals?weekStart=${encodeURIComponent(weekStart)}`),
    { headers: getAuthHeaders(token) }
  );
  if (!response.ok) await parseError(response);
  return (await response.json()) as { items: unknown[] };
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
