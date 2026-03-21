"use client";

export type UserRole = "admin" | "manager_controllo_gestione" | "employee";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
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
    return JSON.parse(raw) as SessionUser;
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
