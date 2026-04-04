/** Tipi dominio Nexa HR (canonici per backend e client). */

/** Ruolo accesso piattaforma (JWT / `users.role`). Il “responsabile team” non è un valore qui: vive in `work_teams.leadUserId`. */
export type RoleName = "superuser" | "user";

export type JurisdictionCode = "IT";

export type ClockChannel = "app" | "web" | "qr";

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
  /** Ruolo accesso piattaforma: `superuser` oppure `user`. */
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
  /** Campi legacy anagrafica (non usati dal motore payroll Italia). */
  taxCanton?: string;
  taxMunicipality?: string;
  /** Regione IT (addizionale regionale). */
  taxRegion?: string;
  /** Comune residenza IT (addizionale comunale). */
  taxMunicipalityIt?: string;
  /** Path oggetto in bucket Storage (foto profilo). */
  profilePhotoPath?: string | null;
  /** Settore preset IVS datore IT (vedi engine payroll-it-rules). */
  payrollItSector?: string | null;
  /** Override % IVS datore totale (es. 24.48). */
  payrollEmployerInpsPercent?: number | null;
  /** Premio INAIL permille su lordo mensile. */
  payrollInailPermille?: number | null;
  /** Divisore accantonamento TFR (default 13.5). */
  payrollTfrDivisor?: number | null;
  /** Codice Ateco (riferimento rischio / tariffa). */
  payrollAtecoCode?: string | null;
  /** Descrizione rischio mansione / tariffa INAIL. */
  payrollInailRiskDescription?: string | null;

  /** Codice fiscale (IT). */
  fiscalCode?: string | null;
  /** Stato civile (es. single, married, divorced, widowed, civil_union). */
  maritalStatus?: string | null;
  dependentsChildren?: number;
  dependentSpouse?: boolean;
  disabilityFlag?: boolean;
  /** Comune domicilio fiscale IT (se diverso da residenza). */
  taxDomicileMunicipalityIt?: string | null;
  taxDomicileSameAsResidence?: boolean;
  /** Mensilità contrattuali 12 / 13 / 14. */
  payMonthsPerYear?: number;
  /** RAL lorda annua (con `payMonthsPerYear` definisce stipendio mensile). */
  annualGrossSalary?: number | null;
  /** full | horizontal | vertical | mixed (part-time). */
  partTimeModality?: string | null;
  ccnlCode?: string | null;
  ccnlLevel?: string | null;
  /** operaio | impiegato | quadro | dirigente */
  legalCategory?: string | null;
  contractEndDate?: string | null;
  fixedSupplementMonthly?: number | null;
  garnishmentMonthlyEstimate?: number | null;
  fringeBenefitYtdEuros?: number | null;
  /** Contratto determinato (detrazioni art.13 semplificate). */
  contractFixedTerm?: boolean;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  companyId?: string;
  /** Default settore preset IVS datore (IT) per il reparto. */
  payrollItSector?: string | null;
  /** Default premio INAIL in permille per dipendenti senza valore in anagrafica. */
  payrollDefaultInailPermille?: number | null;
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

export type PayslipWorkflowStatus = "draft" | "published";

export interface Payslip {
  id: string;
  userId: string;
  period: string;
  grossSalary: number;
  netSalary: number;
  lines: PayslipLine[];
  pdfUrl: string;
  /** Bozza (solo HR/Admin) o pubblicato al dipendente. Default published per retrocompatibilità. */
  status?: PayslipWorkflowStatus;
  publishedAt?: string | null;
  publishedByUserId?: string | null;
  computedAt?: string | null;
  /** Mese YYYY-MM usato per variabili (straordinari, ferie, …) se diverso dalla competenza. */
  variablePeriod?: string | null;
}

export interface ApprovalView {
  id: string;
  entityId: string;
  type: "leave" | "sickness" | "smartworking" | "travel";
  requestedBy: string;
  approverId?: string;
  status: "pending" | "approved" | "rejected";
  at: string;
  startDate?: string;
  endDate?: string;
  requesterName?: string;
  /** URL firmata foto profilo (se consentita al richiedente lista). */
  requesterPhotoUrl?: string | null;
  leaveKind?: "annual" | "rol";
  /** Saldo ferie annuali residuo al momento della consultazione (solo ferie annue). */
  residualAnnualLeaveDays?: number;
  /** Giorni calendario richiesti (ferie/ROL/malattia). */
  requestedCalendarDays?: number;
  /** Smart working: giorni già occupati nella settimana ISO del giorno richiesto. */
  smartworkingWeekUsed?: number;
  smartworkingWeekQuota?: number;
  /** Smart working: quota mensile (come da policy aziendale). */
  smartworkingMonthUsed?: number;
  smartworkingMonthQuota?: number;
  note?: string | null;
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
  /** Path in-app (es. /workflow/approvals?approvalId=...). */
  actionPath?: string;
}

export interface CalendarEvent {
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
    | "travel";
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
