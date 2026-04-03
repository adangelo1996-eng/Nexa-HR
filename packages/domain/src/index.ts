/** Tipi dominio Nexa HR (canonici per backend e client). */

export type RoleName = "admin" | "team_lead" | "employee";

export type JurisdictionCode = "CH" | "IT";

export type ClockChannel = "app" | "web" | "qr" | "nfc" | "digital_badge";

export interface GeoFix {
  lat: number;
  lon: number;
  /** Metri, opzionale */
  accuracyM?: number;
  capturedAt?: string;
}

export interface Role {
  id: string;
  /** Nome ruolo anagrafica (può essere custom oltre RoleName legacy). */
  name: string;
  description?: string;
  permissions: string[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  /**
   * Ruolo accesso piattaforma. `team_lead` è valido solo se l’utente è il `leadUserId`
   * di un `work_team` e il proprio `teamId` coincide con quel team (nomina da CDC → Team).
   */
  role: RoleName;
  managerId?: string;
  companyId: string;
  roleId?: string;
  costCenterId?: string;
  /** Team di lavoro (sotto il centro di costo); per i team lead deve coincidere con il team di cui sono responsabili. */
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
  hireDate?: string;
  phone?: string;
  address?: string;
  /** Profilo fiscale principale (estendere per multi-sede). */
  jurisdiction?: JurisdictionCode;
  /** Stipendio lordo mensile base per calcolo cedolino. */
  baseSalaryMonthly?: number;
  /** Cantone fiscale dichiarativo (calcolo CH). */
  taxCanton?: string;
  taxMunicipality?: string;
  /** Regione IT (addizionale regionale). */
  taxRegion?: string;
  /** Comune residenza IT (addizionale comunale). */
  taxMunicipalityIt?: string;
  /** Path oggetto in bucket Storage (foto profilo). */
  profilePhotoPath?: string | null;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  companyId?: string;
}

export interface WorkTeam {
  id: string;
  costCenterId: string;
  name: string;
  leadUserId?: string | null;
}

export interface TimeEntry {
  id: string;
  userId: string;
  type: "clock_in" | "clock_out";
  at: string;
  source?: ClockChannel;
  geo?: GeoFix;
  deviceId?: string;
}

export type WorkMode = "office" | "smartworking";

export interface WorkdaySummary {
  userId: string;
  date: string;
  minutesWorked: number;
  workedSeconds?: number;
  overtimeSeconds?: number;
  mode: WorkMode;
}

export type LeaveStatus = "draft" | "pending" | "approved" | "rejected";

/** Piano assenza: ferie annuali o permesso ROL (non scala saldo ferie). */
export type LeavePlanKind = "annual" | "rol";

export interface LeavePlan {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  version: number;
  kind?: LeavePlanKind;
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
  status: LeaveStatus;
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

/** Turno pianificato (scheduling). */
export interface Shift {
  id: string;
  userId: string;
  startAt: string;
  endAt: string;
  /** Codice maggiorazione es. night, holiday */
  premiumCode?: string;
  status?: "scheduled" | "confirmed" | "cancelled";
}

export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "paid";

/** Nota spesa / rimborso km. */
export interface ExpenseClaim {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  description: string;
  kmDistance?: number;
  status: ExpenseStatus;
  createdAt: string;
  payslipPeriod?: string;
  appliedPayslipId?: string;
}

export type EmployeeDocumentKind = "contract" | "payslip" | "personal" | "other";

export interface EmployeeDocument {
  id: string;
  userId: string;
  kind: EmployeeDocumentKind;
  title: string;
  mimeType?: string;
  storagePath?: string;
  createdAt: string;
  uploadedBy?: string;
}

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface OnboardingStatus {
  userId: string;
  phase: "preboarding" | "active" | "completed";
  checklist: OnboardingChecklistItem[];
  updatedAt: string;
}

export type InnovationJobStatus = "queued" | "running" | "completed" | "failed";

export interface InnovationJob {
  id: string;
  userId: string;
  module: string;
  payload: Record<string, unknown>;
  status: InnovationJobStatus;
  createdAt: string;
  result?: Record<string, unknown>;
}

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
  kind?: string;
}

export interface CalendarEvent {
  id: string;
  kind: "leave" | "sickness" | "shift" | "deadline" | "smartworking" | "holiday" | "rol";
  title: string;
  start: string;
  end?: string;
  /** Per viste team (calendario HR aggregato). */
  userId?: string;
  meta?: Record<string, unknown>;
}

export interface CompanyHoliday {
  id: string;
  companyId: string;
  day: string;
  name: string;
}
