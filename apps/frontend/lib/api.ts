"use client";

import { getSessionUser, type SessionUser, type UserRole } from "./auth-session";

export interface Payslip {
  id: string;
  userId: string;
  period: string;
  grossSalary?: number;
  lines?: Array<{ code: string; description: string; amount: number }>;
  netSalary: number;
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
  phone?: string;
  address?: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface OrgNode {
  id: string;
  label: string;
  role: UserRole;
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
  role: UserRole;
  managerId?: string;
  companyId: string;
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
  phone?: string;
  address?: string;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  fullName?: string;
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
  phone?: string;
  address?: string;
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

function useSupabaseAttendance(): boolean {
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
  return (await response.json()) as SessionUser;
}

export async function fetchPayslips(token: string): Promise<Payslip[]> {
  const response = await fetch(buildApiUrl("/payroll/payslips"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as Payslip[];
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

export async function fetchOrgChart(token: string): Promise<OrgChartResponse> {
  const response = await fetch(buildApiUrl("/org/chart"), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as OrgChartResponse;
}

export async function clock(token: string, type: "clock_in" | "clock_out"): Promise<TimeEntry> {
  if (useSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, { action: "clock" }, {
      method: "POST",
      body: JSON.stringify({ type })
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as TimeEntry;
  }
  const response = await fetch(buildApiUrl("/attendance/clock"), {
    method: "POST",
    headers: getAuthHeaders(token),
    body: JSON.stringify({ type })
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TimeEntry;
}

export async function fetchAttendanceEntries(token: string, date?: string): Promise<TimeEntry[]> {
  if (useSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, {
      action: "entries",
      date: date ?? undefined
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as TimeEntry[];
  }
  const search = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(buildApiUrl(`/attendance/entries${search}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TimeEntry[];
}

export async function fetchAttendanceSummary(token: string, date?: string): Promise<WorkdaySummary[]> {
  if (useSupabaseAttendance()) {
    const response = await fetchPaydayAttendance(token, {
      action: "summary",
      date: date ?? undefined
    });
    if (!response.ok) {
      await parseError(response);
    }
    return (await response.json()) as WorkdaySummary[];
  }
  const search = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(buildApiUrl(`/attendance/summary${search}`), {
    method: "GET",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as WorkdaySummary[];
}

export async function fetchAttendanceStatus(token: string, date?: string): Promise<AttendanceStatus> {
  if (useSupabaseAttendance()) {
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
  if (useSupabaseAttendance()) {
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
  payload: { code: string; name: string; description?: string }
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

export async function createLeavePlan(
  token: string,
  payload: Pick<LeavePlan, "startDate" | "endDate">
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

export async function rejectApproval(token: string, approvalId: string): Promise<ApprovalItem> {
  const response = await fetch(buildApiUrl(`/approvals/${approvalId}/reject`), {
    method: "PATCH",
    headers: getAuthHeaders(token)
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as ApprovalItem;
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
