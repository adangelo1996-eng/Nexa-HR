export type RoleName = "admin" | "manager_controllo_gestione" | "employee";

export interface Role {
  id: string;
  name: RoleName;
  permissions: string[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: RoleName;
  managerId?: string;
  companyId: string;
}

export type WorkMode = "office" | "smartworking";

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
  mode: WorkMode;
}

export type LeaveStatus = "draft" | "pending" | "approved" | "rejected";

export interface LeavePlan {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  version: number;
}

export interface SicknessEvent {
  id: string;
  userId: string;
  fromDate: string;
  toDate: string;
  documentUrl: string;
  status: LeaveStatus;
}

export interface SwissTaxProfile {
  canton: string;
  municipality: string;
  permitType: "B" | "C" | "G" | "L";
  companyType: string;
  companySite: string;
}

export interface PayslipLine {
  code: string;
  description: string;
  amount: number;
}

export interface Payslip {
  id: string;
  userId: string;
  period: string;
  grossSalary: number;
  netSalary: number;
  lines: PayslipLine[];
  pdfUrl: string;
}
