export interface User {
  id: string;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  role: "admin" | "manager_controllo_gestione" | "employee";
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
  workedSeconds?: number;
  overtimeSeconds?: number;
  mode: "office" | "smartworking";
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

export interface SicknessEvent {
  id: string;
  userId: string;
  fromDate: string;
  toDate: string;
  documentUrl: string;
  status: "draft" | "pending" | "approved" | "rejected";
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

export interface ApprovalView {
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

export interface SwissTaxProfile {
  canton: string;
  municipality: string;
  permitType: "B" | "C" | "G" | "L";
  companyType: string;
  companySite: string;
}
