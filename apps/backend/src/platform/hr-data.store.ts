import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalView,
  CalendarEvent,
  CompanyHoliday,
  EmployeeDocument,
  EmployeeDocumentKind,
  ExpenseClaim,
  InnovationJob,
  InnovationJobStatus,
  LeaveBalance,
  LeavePlan,
  LeavePlanKind,
  OnboardingChecklistItem,
  OnboardingStatus,
  Payslip,
  SicknessEvent,
  Shift,
  TimeEntry,
  User,
  UserNotification,
  WorkMode,
  WorkdaySummary,
  Role,
  CostCenter,
  WorkTeam,
  ClockChannel,
  GeoFix
} from "@payday/domain";
import { calculateSwissPayroll, employerBudgetBucketsFromGrossChf } from "@payday/payroll-adapters-ch";
import { isSwissPayrollFeatureEnabled } from "./nexa-swiss-payroll-flag";
import {
  calculateItalianPayroll,
  defaultItalianRuleSet2026,
  employerBudgetBucketsFromGrossIt,
  employerRatesFromItalianProfile,
  type ItalianPayrollInput,
  type ItalianPayrollProfileEmployer,
  type PayrollItSector
} from "@payday/payroll-adapters-it";
import type { AuthRole } from "./auth";

interface ApprovalRecord {
  id: string;
  entityId: string;
  type: "leave" | "sickness" | "smartworking" | "travel";
  requestedBy: string;
  approverId?: string;
  status: "pending" | "approved" | "rejected";
  at: string;
  rejectReason?: string | null;
}

export interface SmartworkingRequestRow {
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

export type TravelRequestRow = SmartworkingRequestRow;

export interface AttendanceDayBoardRow {
  userId: string;
  fullName: string;
  email: string;
  firstClockIn: string | null;
  lastClockOut: string | null;
  workdayMode: WorkMode | null;
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

export type PersonnelBudgetMoney = {
  ral: number;
  overtime: number;
  travel: number;
  inps: number;
  inail: number;
  tfr: number;
  totalCompanyCost: number;
};

export type PersonnelBudgetRow = {
  userId: string;
  fullName: string;
  costCenterId: string | null;
  costCenterName?: string;
  budget: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
  actual: PersonnelBudgetMoney;
  /** Stima da RAL base e profilo IT (orientativa; verificare con consulente). */
  suggestedBudget?: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
};

export type PersonnelBudgetDepartment = {
  costCenterId: string | null;
  costCenterName: string;
  sortOrder: number;
  rows: PersonnelBudgetRow[];
};

export type PersonnelBudgetSnapshot = {
  year: number;
  month: number;
  period: string;
  departments: PersonnelBudgetDepartment[];
};

export type PersonnelBudgetYearStatusKind = "draft" | "approved";

export type PersonnelBudgetYearStatusDto = {
  companyId: string;
  year: number;
  status: PersonnelBudgetYearStatusKind;
  approvedAt: string | null;
  approvedByUserId: string | null;
};

export type PersonnelBudgetCellValues = {
  ral: number | null;
  overtime: number | null;
  travel: number | null;
  inps: number | null;
  inail: number | null;
  tfr: number | null;
};

export type PersonnelBudgetAnnualMatrixRow = {
  userId: string;
  fullName: string;
  costCenterId: string | null;
  costCenterName?: string;
  teamId: string | null;
  teamName?: string;
  months: Array<{
    month: number;
    budget: PersonnelBudgetCellValues;
  }>;
};

export type PersonnelBudgetAnnualMatrixResult = {
  year: number;
  yearStatus: PersonnelBudgetYearStatusDto;
  payrollInstallmentMonths: number;
  rows: PersonnelBudgetAnnualMatrixRow[];
};

export type PersonnelBudgetForecastSnapshot = {
  year: number;
  month: number;
  period: string;
  /** Come getPersonnelBudgetSnapshot ma con forecast per cella. */
  departments: Array<{
    costCenterId: string | null;
    costCenterName: string;
    sortOrder: number;
    rows: Array<
      PersonnelBudgetRow & {
        forecast: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
      }
    >;
  }>;
};

export type PersonnelBudgetAnalysisCategory = "ral" | "overtime" | "travel" | "inps" | "inail" | "tfr" | "totalCompanyCost";

export type PersonnelBudgetAnalysisVarianceRow = {
  category: PersonnelBudgetAnalysisCategory;
  userId: string | null;
  fullName: string | null;
  actual: number;
  budget: number;
  forecast: number;
  varianceBf: number;
  variancePct: number | null;
  exceedsThreshold: boolean;
};

export type PersonnelBudgetAnalysisNoteDto = {
  id: string;
  companyId: string;
  year: number;
  month: number;
  category: string;
  subjectUserId: string;
  comment: string;
  authorId: string;
  updatedAt: string;
};

export type PersonnelBudgetAnalysisResult = {
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
};

const SMARTWORKING_MONTHLY_QUOTA = 8;
/** Massimo giorni smart working richiedibili nella stessa settimana (lun–dom UTC) per dipendente. */
const SMARTWORKING_WEEKLY_QUOTA = 2;

function coercePlatformRole(role: string | undefined | null): User["role"] {
  const r = String(role ?? "user");
  if (r === "superuser" || r === "user") {
    return r;
  }
  if (r === "admin") {
    return "superuser";
  }
  if (r === "employee" || r === "team_lead") {
    return "user";
  }
  return "user";
}

/** Opzioni scrittura utente: riservate a chiamate console (API Nest). */
interface UserWriteOptions {
  skipTeamLeadLinkValidation?: boolean;
}

interface UserCreateInput {
  firstName: string;
  lastName: string;
  /** Se valorizzata, ha priorità sulla generazione automatica da nome/cognome */
  email?: string;
  role: User["role"];
  managerId?: string;
  companyId: string;
  roleId: string;
  costCenterId: string;
  teamId?: string | null;
  contractType: string;
  weeklyContractHours: number;
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
  jurisdiction?: User["jurisdiction"];
  taxRegion?: string;
  taxMunicipalityIt?: string;
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
}

interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  managerId?: string;
  role?: User["role"];
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
  jurisdiction?: User["jurisdiction"];
  taxRegion?: string;
  taxMunicipalityIt?: string;
  profilePhotoPath?: string | null;
  teamId?: string | null;
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
}

type EmployeeDocumentRow = EmployeeDocument & { bodyBase64?: string | null };

interface Delegation {
  managerId: string;
  delegateManagerId: string;
  from: string;
  to: string;
}

/** Riga tabella `nexa_import_events` (audit import). */
export interface NexaImportEventRow {
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
  errorsSnapshot?: unknown;
  actorUserId?: string | null;
  actorEmail?: string | null;
  auditMeta?: Record<string, unknown>;
}

/** Payload JSON in `company_settings.settings` (senza `companyId`). */
export interface CompanySettingsStored {
  fiscalYearStartMonth: number;
  companyLegalName: string;
  companyVatNumber: string;
  companyRegistrationInfo: string;
  defaultCurrency: string;
  weeklyFullTimeHours: number;
  /** Mensilità per riparto RAL / costi (es. 12, 13, 14). Default 12. */
  payrollInstallmentMonths: number;
  customVariables: Record<string, string>;
}

export type CompanySettingsDto = CompanySettingsStored & { companyId: string };

interface OrgStructureTreeNode {
  id: string;
  fullName: string;
  email?: string;
  role: string;
  roleName?: string;
  managerId?: string;
  reports: OrgStructureTreeNode[];
}

function buildOrgStructureManagerTree(
  people: User[],
  roleById: Map<string, Role>,
  leadUserId?: string | null
): OrgStructureTreeNode[] {
  const idSet = new Set(people.map((p) => p.id));
  const childMap = new Map<string, User[]>();
  for (const p of people) {
    childMap.set(p.id, []);
  }
  const roots: User[] = [];
  for (const p of people) {
    const mid = p.managerId?.trim();
    if (mid && idSet.has(mid)) {
      childMap.get(mid)!.push(p);
    } else {
      roots.push(p);
    }
  }
  const sortUsers = (a: User, b: User): number => a.fullName.localeCompare(b.fullName, "it");
  roots.sort(sortUsers);
  for (const arr of childMap.values()) {
    arr.sort(sortUsers);
  }
  const lid = leadUserId?.trim();
  let orderedRoots = roots;
  if (lid) {
    const ix = orderedRoots.findIndex((r) => r.id === lid);
    if (ix > 0) {
      orderedRoots = [orderedRoots[ix]!, ...orderedRoots.slice(0, ix), ...orderedRoots.slice(ix + 1)];
    }
  }
  const toDto = (u: User): OrgStructureTreeNode => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    roleName: u.roleId ? (roleById.get(u.roleId)?.name ?? u.role) : u.role,
    managerId: u.managerId ?? undefined,
    reports: (childMap.get(u.id) ?? []).map(toDto)
  });
  return orderedRoots.map(toDto);
}

@Injectable()
export class HrDataStore {
  private readonly logger = new Logger(HrDataStore.name);
  private readonly supabase?: SupabaseClient;
  private seeded = false;
  /** Evita count+seed su roles/cost_centers a ogni list (molto lento su Supabase/Render). */
  private referenceDataEnsured = false;
  private readonly users: User[] = [
    {
      id: "u-admin",
      email: "admin@synapse.com",
      fullName: "HR Admin",
      firstName: "HR",
      lastName: "Admin",
      role: "superuser",
      companyId: "comp-1",
      roleId: "r-super",
      costCenterId: "cc-1",
      weeklyContractHours: 40,
      dailyTargetSeconds: 28800,
      vacationAllowanceDays: 26
    },
    {
      id: "u-manager",
      email: "manager@synapse.com",
      fullName: "Manager Controllo",
      firstName: "Manager",
      lastName: "Controllo",
      role: "user",
      companyId: "comp-1",
      roleId: "r2",
      costCenterId: "cc-1",
      teamId: "wt-demo-hr",
      weeklyContractHours: 40,
      dailyTargetSeconds: 28800,
      vacationAllowanceDays: 24
    },
    {
      id: "u-employee",
      email: "employee@synapse.com",
      fullName: "Dipendente Demo",
      firstName: "Dipendente",
      lastName: "Demo",
      role: "user",
      managerId: "u-manager",
      companyId: "comp-1",
      roleId: "r3",
      costCenterId: "cc-2",
      weeklyContractHours: 40,
      dailyTargetSeconds: 28800,
      vacationAllowanceDays: 22
    }
  ];

  private roles: Role[] = [
    { id: "r1", name: "admin", permissions: ["*"] },
    {
      id: "r-super",
      name: "Superuser",
      description: "Tutte le autorizzazioni sul catalogo permessi",
      permissions: ["*"]
    },
    {
      id: "r2",
      name: "team_lead",
      permissions: ["approve:leave", "approve:sickness", "read:team", "read:payslip:team"]
    },
    {
      id: "r3",
      name: "employee",
      permissions: [
        "clock",
        "request:leave",
        "request:sickness",
        "read:self",
        "read:payslip:self",
        "nexa.payroll:write"
      ]
    }
  ];

  private readonly timeEntries: TimeEntry[] = [];
  private readonly workdaySummaries: WorkdaySummary[] = [];
  private readonly leavePlans: LeavePlan[] = [];
  private readonly sicknessEvents: SicknessEvent[] = [];
  private readonly approvals: ApprovalRecord[] = [];
  private readonly smartworkingRequests: SmartworkingRequestRow[] = [];
  private readonly travelRequests: TravelRequestRow[] = [];
  private readonly payslips: Payslip[] = [];
  private readonly delegations: Delegation[] = [];
  /** Fallback in-memory quando Supabase non è configurato. */
  private readonly importEventsMemory: NexaImportEventRow[] = [];
  /** Fallback in-memory: impostazioni azienda per `companyId`. */
  private readonly companySettingsMem = new Map<string, CompanySettingsStored>();
  private readonly expenseClaims: ExpenseClaim[] = [];
  private readonly shifts: Shift[] = [];
  private readonly demoCompanyHolidays: CompanyHoliday[] = [
    { id: "dh-26-01-01", companyId: "comp-1", day: "2026-01-01", name: "Capodanno" },
    { id: "dh-26-01-06", companyId: "comp-1", day: "2026-01-06", name: "Epifania" },
    { id: "dh-26-04-25", companyId: "comp-1", day: "2026-04-25", name: "Festa della Liberazione" },
    { id: "dh-26-05-01", companyId: "comp-1", day: "2026-05-01", name: "Festa del Lavoro" },
    { id: "dh-26-06-02", companyId: "comp-1", day: "2026-06-02", name: "Festa della Repubblica" },
    { id: "dh-26-08-15", companyId: "comp-1", day: "2026-08-15", name: "Ferragosto" },
    { id: "dh-26-12-25", companyId: "comp-1", day: "2026-12-25", name: "Natale" }
  ];
  private readonly employeeDocuments: EmployeeDocumentRow[] = [];
  private readonly onboardingByUser = new Map<string, OnboardingStatus>();
  private readonly innovationJobs: InnovationJob[] = [];
  private readonly userNotifications: UserNotification[] = [];
  /** Memoria dev: ordine budget CDC key `${year}|${costCenterId}` → sortOrder */
  private readonly personnelBudgetCcOrderMem = new Map<string, number>();
  private readonly workTeamsMem: WorkTeam[] = [
    {
      id: "wt-demo-hr",
      costCenterId: "cc-1",
      name: "Team HR demo",
      leadUserId: "u-manager"
    }
  ];
  /** Memoria dev: celle budget key `${year}|${month}|${userId}` */
  private readonly personnelBudgetCellsMem = new Map<
    string,
    {
      budgetRal: number | null;
      budgetOvertime: number | null;
      budgetTravel: number | null;
      budgetInps: number | null;
      budgetInail: number | null;
      budgetTfr: number | null;
    }
  >();
  /** key companyId|year */
  private readonly personnelBudgetYearStatusMem = new Map<
    string,
    { status: PersonnelBudgetYearStatusKind; approvedAt: string | null; approvedByUserId: string | null }
  >();
  /** forecast: stesso schema celle budget */
  private readonly personnelBudgetForecastMem = new Map<
    string,
    {
      forecastRal: number | null;
      forecastOvertime: number | null;
      forecastTravel: number | null;
      forecastInps: number | null;
      forecastInail: number | null;
      forecastTfr: number | null;
    }
  >();
  private readonly personnelBudgetAnalysisNotesMem = new Map<string, PersonnelBudgetAnalysisNoteDto>();
  private costCenters: CostCenter[] = [
    {
      id: "cc-1",
      code: "HR",
      name: "Risorse Umane",
      description: "Centro di costo HR"
    },
    {
      id: "cc-2",
      code: "FIN",
      name: "Finanza",
      description: "Centro di costo Finance"
    }
  ];

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceRole) {
      this.supabase = createClient(url, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
  }

  /**
   * Verifica email/password contro Supabase Auth (stesso progetto usato da Plasticity).
   * Usa un client dedicato: `signInWithPassword` sulla stessa istanza del client service_role
   * faceva persistere la sessione utente e le successive `.from()` passavano con JWT utente,
   * andando incontro a RLS su `time_entries` (errore "new row violates row-level security policy").
   */
  async verifySupabasePassword(email: string, password: string): Promise<boolean> {
    if (!this.supabase) {
      return false;
    }
    const url = process.env.SUPABASE_URL?.trim();
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (!url || !serviceRole) {
      return false;
    }
    const keyForSignIn = anonKey ?? serviceRole;
    const authOnly = createClient(url, keyForSignIn, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await authOnly.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    await authOnly.auth.signOut();
    return !error && Boolean(data.session);
  }

  private get useDb(): boolean {
    return Boolean(this.supabase);
  }

  private async ensureSeedUsers(): Promise<void> {
    if (!this.useDb || this.seeded) return;
    await this.ensureSeedReferenceData();
    const { data, error } = await this.supabase!.from("users").select("id").limit(1);
    if (error) return;
    if (!data || data.length === 0) {
      await this.supabase!.from("users").insert(this.users);
    }
    this.seeded = true;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim();
    if (!normalized) {
      return null;
    }
    await this.ensureSeedUsers();
    if (this.useDb) {
      const { data, error } = await this.supabase!
        .from("users")
        .select("*")
        .ilike("email", normalized)
        .limit(1);
      if (error) {
        return null;
      }
      const row = data?.[0] as User | undefined;
      return row ? { ...row, role: coercePlatformRole(row.role) } : null;
    }
    const mem = this.users.find((item) => item.email.toLowerCase() === normalized.toLowerCase());
    return mem ? { ...mem, role: coercePlatformRole(mem.role) } : null;
  }

  private async ensureSeedReferenceData(): Promise<void> {
    if (!this.useDb || this.referenceDataEnsured) {
      return;
    }
    const [rolesCount, centersCount] = await Promise.all([
      this.supabase!.from("roles").select("id", { count: "exact", head: true }),
      this.supabase!.from("cost_centers").select("id", { count: "exact", head: true })
    ]);
    if (!rolesCount.error && (rolesCount.count ?? 0) === 0) {
      await this.supabase!.from("roles").insert(this.roles);
    }
    if (!centersCount.error && (centersCount.count ?? 0) === 0) {
      await this.supabase!.from("cost_centers").insert(this.costCenters);
    }
    this.referenceDataEnsured = true;
  }

  private normalizeWeeklyContractHours(input?: number): number {
    if (!Number.isFinite(input)) {
      return 40;
    }
    return Math.min(80, Math.max(1, Number(input)));
  }

  private coercePayMonthsPerYear(input?: number): number {
    if (input === 12 || input === 13 || input === 14) {
      return input;
    }
    return 13;
  }

  private recomputeBaseSalaryFromRal(ral: number | null | undefined, months: number): number | undefined {
    if (ral == null || !Number.isFinite(Number(ral)) || Number(ral) <= 0) {
      return undefined;
    }
    const m = months >= 12 && months <= 14 ? months : 13;
    return Math.round((Number(ral) / m) * 100) / 100;
  }

  private computeDailyTargetSecondsFromWeekly(weeklyContractHours: number): number {
    return Math.round((weeklyContractHours / 5) * 3600);
  }

  private resolveDailyTargetSeconds(user: Pick<User, "weeklyContractHours" | "dailyTargetSeconds">): number {
    if (Number.isFinite(user.weeklyContractHours)) {
      return this.computeDailyTargetSecondsFromWeekly(this.normalizeWeeklyContractHours(user.weeklyContractHours));
    }
    return user.dailyTargetSeconds ?? 28800;
  }

  private calculateWorkedSeconds(
    entries: TimeEntry[],
    nowIso?: string
  ): { workedSeconds: number; hasOpenClockIn: boolean; firstClockInAt?: string } {
    const ordered = [...entries].sort((a, b) => a.at.localeCompare(b.at));
    let openClockInAt: string | undefined;
    let firstClockInAt: string | undefined;
    let workedSeconds = 0;

    for (const entry of ordered) {
      if (entry.type === "clock_in" && !openClockInAt) {
        openClockInAt = entry.at;
        if (!firstClockInAt) {
          firstClockInAt = entry.at;
        }
      } else if (entry.type === "clock_out" && openClockInAt) {
        const delta = Math.floor((new Date(entry.at).getTime() - new Date(openClockInAt).getTime()) / 1000);
        workedSeconds += Math.max(0, delta);
        openClockInAt = undefined;
      }
    }

    if (openClockInAt && nowIso) {
      const openDelta = Math.floor((new Date(nowIso).getTime() - new Date(openClockInAt).getTime()) / 1000);
      workedSeconds += Math.max(0, openDelta);
    }

    return { workedSeconds, hasOpenClockIn: Boolean(openClockInAt), firstClockInAt };
  }

  private weekRange(referenceDate: string): { start: string; end: string } {
    const target = new Date(`${referenceDate}T00:00:00.000Z`);
    const dayIndex = (target.getUTCDay() + 6) % 7;
    const start = new Date(target);
    start.setUTCDate(start.getUTCDate() - dayIndex);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  async listUsers(): Promise<User[]> {
    await this.ensureSeedUsers();
    if (this.useDb) {
      const { data } = await this.supabase!.from("users").select("*").order("fullName", { ascending: true });
      return ((data as User[]) ?? []).map((u) => ({ ...u, role: coercePlatformRole(u.role) }));
    }
    return this.users.map((u) => ({ ...u, role: coercePlatformRole(u.role) }));
  }

  async getUser(userId: string): Promise<User> {
    await this.ensureSeedUsers();
    if (this.useDb) {
      const { data, error } = await this.supabase!.from("users").select("*").eq("id", userId).maybeSingle();
      if (error) {
        throw new NotFoundException("Utente non trovato");
      }
      if (!data) {
        throw new NotFoundException("Utente non trovato");
      }
      const u = data as User;
      return { ...u, role: coercePlatformRole(u.role) };
    }
    const user = this.users.find((item) => item.id === userId);
    if (!user) {
      throw new NotFoundException("Utente non trovato");
    }
    return { ...user, role: coercePlatformRole(user.role) };
  }

  async listUsersByManager(managerId: string): Promise<User[]> {
    const users = await this.listUsers();
    return users.filter((item) => item.managerId === managerId);
  }

  /** Colleghi con stesso centro di costo e stessa company (ordinati per nome). */
  async listUsersByCostCenter(companyId: string, costCenterId: string): Promise<User[]> {
    const users = await this.listUsers();
    return users
      .filter((u) => u.companyId === companyId && u.costCenterId === costCenterId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }

  async listUsersByTeam(teamId: string): Promise<User[]> {
    if (this.useDb) {
      const { data, error } = await this.supabase!
        .from("users")
        .select("*")
        .eq("teamId", teamId)
        .order("fullName", { ascending: true });
      if (error) {
        throw new BadRequestException(`Lettura team utenti fallita: ${error.message}`);
      }
      let rows = ((data as User[]) ?? []).map((u) => ({ ...u, role: coercePlatformRole(u.role) }));
      try {
        const team = await this.getWorkTeam(teamId);
        const lid = team.leadUserId?.trim();
        if (lid && !rows.some((u) => u.id === lid)) {
          const lead = await this.getUser(lid);
          const sameCc = (lead.costCenterId?.trim() ?? "") === (team.costCenterId?.trim() ?? "");
          if (sameCc && (rows.length === 0 || lead.companyId === rows[0]?.companyId)) {
            rows = [...rows, { ...lead, role: coercePlatformRole(lead.role) }].sort((a, b) =>
              a.fullName.localeCompare(b.fullName, "it")
            );
          }
        }
      } catch {
        // team row assente: resta solo l’elenco per teamId
      }
      return rows;
    }
    const users = await this.listUsers();
    return users
      .filter((u) => u.teamId === teamId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }

  /**
   * Colleghi mostrati nel calendario "vista dipendente": work team se valorizzato;
   * se il team ha al massimo una persona si arricchisce con chi ha lo stesso responsabile diretto.
   * Senza team: prima i riporti diretti dello stesso manager (se almeno due persone), altrimenti tutto il centro di costo.
   */
  private async mergeUsersWithSameManager(me: User, existing: User[]): Promise<User[]> {
    const mid = me.managerId?.trim();
    const base = existing.length > 0 ? existing : [me];
    if (!mid) {
      return base;
    }
    const all = await this.listUsers();
    const idSet = new Set(base.map((p) => p.id));
    const out = [...base];
    for (const u of all) {
      if (u.companyId !== me.companyId) continue;
      if ((u.managerId?.trim() || "") !== mid) continue;
      if (!idSet.has(u.id)) {
        out.push(u);
        idSet.add(u.id);
      }
    }
    return out.sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }

  private async resolveWorkCalendarPeerUsers(me: User): Promise<User[]> {
    const companyId = me.companyId;
    let teamId = me.teamId?.trim();
    if (!teamId && me.costCenterId) {
      const teams = await this.listWorkTeamsByCostCenter(me.costCenterId);
      const asLead = teams.find((t) => (t.leadUserId?.trim() ?? "") === me.id);
      if (asLead) {
        teamId = asLead.id;
      }
    }
    if (teamId) {
      let peers = await this.listUsersByTeam(teamId);
      if (peers.length <= 1) {
        peers = await this.mergeUsersWithSameManager(me, peers);
      }
      return peers.length > 0 ? peers : [me];
    }
    const mid = me.managerId?.trim();
    let peers: User[] = [];
    if (mid) {
      const all = await this.listUsers();
      peers = all.filter(
        (u) => u.companyId === companyId && (u.managerId?.trim() || "") === mid
      );
      peers.sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
    }
    if (peers.length <= 1) {
      const cc = me.costCenterId?.trim();
      if (cc) {
        peers = await this.listUsersByCostCenter(companyId, cc);
      }
    }
    if (peers.length === 0) {
      return [me];
    }
    return peers;
  }

  /**
   * Tabella `work_teams` assente o non esposta a PostgREST (es. migrazioni 016+ non applicate sul DB).
   * In quel caso si evita di bloccare il calendario HR: si tratta come elenco team vuoto.
   */
  private isWorkTeamsUnavailableError(error: { message?: string } | null | undefined): boolean {
    const m = String(error?.message ?? "");
    if (!m.includes("work_teams")) {
      return false;
    }
    return (
      m.includes("schema cache") ||
      m.includes("Could not find the table") ||
      m.includes("does not exist") ||
      /PGRST205/i.test(m)
    );
  }

  async listWorkTeamsByCostCenter(costCenterId: string): Promise<WorkTeam[]> {
    if (this.useDb) {
      const { data, error } = await this.supabase!
        .from("work_teams")
        .select("*")
        .eq("costCenterId", costCenterId)
        .order("name", { ascending: true });
      if (error) {
        if (this.isWorkTeamsUnavailableError(error)) {
          this.logger.warn(
            `work_teams non disponibile (applica migrazioni Supabase da infra/supabase/migrations, da 016 in poi): ${error.message}`
          );
          return [];
        }
        throw new BadRequestException(`Lettura team fallita: ${error.message}`);
      }
      return ((data as Record<string, unknown>[]) ?? []).map((r) => this.mapWorkTeamRow(r));
    }
    return this.workTeamsMem.filter((t) => t.costCenterId === costCenterId);
  }

  private mapWorkTeamRow(r: Record<string, unknown>): WorkTeam {
    return {
      id: String(r.id),
      costCenterId: String(r.costCenterId),
      name: String(r.name),
      leadUserId: r.leadUserId ? String(r.leadUserId) : null
    };
  }

  async createWorkTeam(costCenterId: string, name: string): Promise<WorkTeam> {
    const center = await this.getCostCenterById(costCenterId);
    if (!center) {
      throw new BadRequestException("Centro di costo non trovato");
    }
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException("Nome team obbligatorio");
    }
    const team: WorkTeam = {
      id: `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      costCenterId,
      name: trimmed,
      leadUserId: null
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("work_teams").insert({
        id: team.id,
        costCenterId: team.costCenterId,
        name: team.name,
        leadUserId: null
      });
      if (error) {
        throw new InternalServerErrorException(`Creazione team fallita: ${error.message}`);
      }
    } else {
      this.workTeamsMem.push(team);
    }
   
    return team;
  }

  async updateWorkTeam(teamId: string, input: { name?: string }): Promise<WorkTeam> {
    const team = await this.getWorkTeam(teamId);
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        throw new BadRequestException("Nome team non valido");
      }
      team.name = trimmed;
    }
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("work_teams")
        .update({ name: team.name })
        .eq("id", teamId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento team fallito: ${error.message}`);
      }
    } else {
      const ix = this.workTeamsMem.findIndex((x) => x.id === teamId);
      if (ix >= 0) {
        this.workTeamsMem[ix] = { ...this.workTeamsMem[ix]!, name: team.name };
      }
    }
    return team;
  }

  async getWorkTeam(teamId: string): Promise<WorkTeam> {
    if (this.useDb) {
      const { data, error } = await this.supabase!.from("work_teams").select("*").eq("id", teamId).maybeSingle();
      if (error || !data) {
        throw new NotFoundException("Team non trovato");
      }
      return this.mapWorkTeamRow(data as Record<string, unknown>);
    }
    const t = this.workTeamsMem.find((x) => x.id === teamId);
    if (!t) {
      throw new NotFoundException("Team non trovato");
    }
    return { ...t };
  }

  /** Team di cui l'utente è il responsabile nominato (`work_teams.leadUserId`). */
  private async findWorkTeamByLeadUserId(userId: string): Promise<WorkTeam | null> {
    if (this.useDb) {
      const { data, error } = await this.supabase!
        .from("work_teams")
        .select("*")
        .eq("leadUserId", userId)
        .maybeSingle();
      if (error) {
        if (this.isWorkTeamsUnavailableError(error)) {
          this.logger.warn(`findWorkTeamByLeadUserId: work_teams non disponibile: ${error.message}`);
          return null;
        }
        throw new BadRequestException(`Lettura team fallita: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      return this.mapWorkTeamRow(data as Record<string, unknown>);
    }
    return this.workTeamsMem.find((t) => t.leadUserId === userId) ?? null;
  }

  private async clearWorkTeamLeadPositions(userId: string): Promise<void> {
    if (this.useDb) {
      const { error } = await this.supabase!.from("work_teams").update({ leadUserId: null }).eq("leadUserId", userId);
      if (error) {
        if (this.isWorkTeamsUnavailableError(error)) {
          this.logger.warn(`clearWorkTeamLeadPositions: work_teams non disponibile: ${error.message}`);
          return;
        }
        throw new InternalServerErrorException(`Rimozione responsabile team fallita: ${error.message}`);
      }
      return;
    }
    for (const t of this.workTeamsMem) {
      if (t.leadUserId === userId) {
        t.leadUserId = null;
      }
    }
  }

  async setWorkTeamMembers(teamId: string, memberUserIds: string[]): Promise<User[]> {
    const team = await this.getWorkTeam(teamId);
    const idSet = new Set(memberUserIds.map((id) => id.trim()).filter(Boolean));
    const previously = await this.listUsersByTeam(teamId);
    for (const u of previously) {
      if (!idSet.has(u.id)) {
        await this.updateUser(u.id, { teamId: null });
      }
    }
    for (const uid of idSet) {
      const u = await this.getUser(uid);
      if (u.costCenterId !== team.costCenterId) {
        throw new BadRequestException(`L'utente ${u.fullName} non appartiene al centro di costo del team`);
      }
      const tid = u.teamId?.trim() || null;
      const isLeadOfThisTeam = (team.leadUserId ?? "").trim() === uid.trim();
      if (tid && tid !== teamId && !isLeadOfThisTeam) {
        throw new BadRequestException(
          `${u.fullName} è già membro di un altro team di lavoro. Rimuovi l'utente da quello team (o riassegna da Anagrafica) prima di aggiungerlo qui.`
        );
      }
      await this.updateUser(uid, { teamId });
    }
    return this.listUsersByTeam(teamId);
  }

  async setTeamLead(teamId: string, userId: string, roleId: string): Promise<{ team: WorkTeam; lead: User }> {
    const team = await this.getWorkTeam(teamId);
    const lead = await this.getUser(userId);
    if (lead.costCenterId !== team.costCenterId) {
      throw new BadRequestException("Il responsabile deve essere nello stesso centro di costo del team");
    }
    const role = await this.getRoleById(roleId);
    if (!role) {
      throw new BadRequestException("Ruolo catalogo non trovato");
    }
    const employeeRole = (await this.listRoles()).find((r) => r.name.toLowerCase() === "employee");
    const employeeRoleId = employeeRole?.id ?? "r3";
    const prevLeadId = team.leadUserId ?? undefined;
    /** Prima il nuovo `leadUserId`, poi la retrocessione del vecchio lead (coerente con invarianti su `team_lead`). */
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("work_teams")
        .update({ leadUserId: userId })
        .eq("id", teamId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento lead team fallito: ${error.message}`);
      }
    } else {
      const t = this.workTeamsMem.find((x) => x.id === teamId);
      if (t) t.leadUserId = userId;
      team.leadUserId = userId;
    }
    if (prevLeadId && prevLeadId !== userId) {
      await this.updateUser(prevLeadId, { roleId: employeeRoleId });
    }
    if (lead.teamId !== teamId) {
      await this.updateUser(userId, { teamId });
    }
    const promoted = await this.updateUser(userId, { roleId });
    const peers = await this.listUsersByTeam(teamId);
    for (const m of peers) {
      if (m.id !== userId) {
        await this.updateUser(m.id, { managerId: userId });
      }
    }
    const updatedTeam = await this.getWorkTeam(teamId);
    return { team: updatedTeam, lead: promoted };
  }

  private normalizePart(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, ".");
  }

  private emailDomain(): string {
    const d = process.env.SYNAPSE_EMAIL_DOMAIN?.trim().toLowerCase();
    return d && d.length > 0 ? d.replace(/^@/, "") : "synapse.com";
  }

  private composeEmail(firstName: string, lastName: string): string {
    const localPart = `${this.normalizePart(firstName)}.${this.normalizePart(lastName)}`.replace(/\.+/g, ".");
    return `${localPart}@${this.emailDomain()}`;
  }

  private async getUniqueEmail(firstName: string, lastName: string): Promise<string> {
    const users = await this.listUsers();
    const domain = this.emailDomain();
    const base = this.composeEmail(firstName, lastName);
    if (!users.some((item) => item.email.toLowerCase() === base.toLowerCase())) {
      return base;
    }
    let suffix = 1;
    while (suffix < 5000) {
      const [local] = base.split("@");
      const candidate = `${local}${suffix}@${domain}`;
      if (!users.some((item) => item.email.toLowerCase() === candidate.toLowerCase())) {
        return candidate;
      }
      suffix += 1;
    }
    throw new BadRequestException("Impossibile generare una email univoca");
  }

  private simpleEmailRegex(): RegExp {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  }

  private async resolveCreateEmail(
    firstName: string,
    lastName: string,
    explicit?: string
  ): Promise<string> {
    const trimmed = explicit?.trim();
    if (trimmed) {
      if (!this.simpleEmailRegex().test(trimmed)) {
        throw new BadRequestException("Formato email non valido");
      }
      const users = await this.listUsers();
      const lower = trimmed.toLowerCase();
      if (users.some((item) => item.email.toLowerCase() === lower)) {
        throw new BadRequestException("Esiste gia un utente con questa email");
      }
      return trimmed;
    }
    return this.getUniqueEmail(firstName, lastName);
  }

  private computeFullName(firstName: string, lastName: string): string {
    return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").trim();
  }

  private async validateReferenceIds(roleId?: string, costCenterId?: string): Promise<void> {
    if (roleId) {
      const exists = (await this.listRoles()).some((item) => item.id === roleId);
      if (!exists) {
        throw new BadRequestException("Ruolo selezionato non valido");
      }
    }
    if (costCenterId) {
      const exists = (await this.listCostCenters()).some((item) => item.id === costCenterId);
      if (!exists) {
        throw new BadRequestException("Centro di costo selezionato non valido");
      }
    }
  }

  async createUser(input: UserCreateInput, options?: UserWriteOptions): Promise<User> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException("Nome e cognome sono obbligatori");
    }
    await this.validateReferenceIds(input.roleId, input.costCenterId);
    if (!isSwissPayrollFeatureEnabled() && input.jurisdiction === "CH") {
      throw new BadRequestException(
        "La giurisdizione payroll Svizzera è temporaneamente disattivata (usa IT o imposta NEXA_SWISS_PAYROLL_ENABLED=true)."
      );
    }
    const weeklyContractHours = this.normalizeWeeklyContractHours(input.weeklyContractHours);
    const fullName = this.computeFullName(firstName, lastName);
    const email = await this.resolveCreateEmail(firstName, lastName, input.email);
    const user: User = {
      id: `u-${Date.now()}`,
      firstName,
      lastName,
      fullName,
      email,
      role: input.role,
      managerId: input.managerId,
      companyId: input.companyId,
      roleId: input.roleId,
      costCenterId: input.costCenterId,
      teamId: input.teamId,
      contractType: input.contractType,
      weeklyContractHours,
      avsNumber: input.avsNumber,
      iban: input.iban,
      bankName: input.bankName,
      bicSwift: input.bicSwift,
      accountHolder: input.accountHolder,
      dailyTargetSeconds: this.computeDailyTargetSecondsFromWeekly(weeklyContractHours),
      vacationAllowanceDays: input.vacationAllowanceDays ?? 22,
      birthDate: input.birthDate,
      hireDate: input.hireDate,
      phone: input.phone,
      address: input.address,
      baseSalaryMonthly: input.baseSalaryMonthly,
      taxCanton: input.taxCanton,
      taxMunicipality: input.taxMunicipality,
      jurisdiction: input.jurisdiction ?? (isSwissPayrollFeatureEnabled() ? "CH" : "IT"),
      taxRegion: input.taxRegion,
      taxMunicipalityIt: input.taxMunicipalityIt,
      payrollItSector: input.payrollItSector ?? undefined,
      payrollEmployerInpsPercent: input.payrollEmployerInpsPercent ?? undefined,
      payrollInailPermille: input.payrollInailPermille ?? undefined,
      payrollTfrDivisor: input.payrollTfrDivisor ?? undefined,
      payrollAtecoCode: input.payrollAtecoCode ?? undefined,
      payrollInailRiskDescription: input.payrollInailRiskDescription ?? undefined,
      fiscalCode: input.fiscalCode ?? undefined,
      maritalStatus: input.maritalStatus ?? undefined,
      dependentsChildren: input.dependentsChildren ?? 0,
      dependentSpouse: input.dependentSpouse ?? false,
      disabilityFlag: input.disabilityFlag ?? false,
      taxDomicileMunicipalityIt: input.taxDomicileMunicipalityIt ?? undefined,
      taxDomicileSameAsResidence: input.taxDomicileSameAsResidence ?? true,
      payMonthsPerYear: this.coercePayMonthsPerYear(input.payMonthsPerYear),
      annualGrossSalary: input.annualGrossSalary ?? undefined,
      partTimeModality: input.partTimeModality ?? undefined,
      ccnlCode: input.ccnlCode ?? undefined,
      ccnlLevel: input.ccnlLevel ?? undefined,
      legalCategory: input.legalCategory ?? undefined,
      contractEndDate: input.contractEndDate ?? undefined,
      fixedSupplementMonthly: input.fixedSupplementMonthly ?? undefined,
      garnishmentMonthlyEstimate: input.garnishmentMonthlyEstimate ?? undefined,
      fringeBenefitYtdEuros: input.fringeBenefitYtdEuros ?? undefined,
      contractFixedTerm: input.contractFixedTerm ?? false
    };
    if (
      user.annualGrossSalary != null &&
      Number(user.annualGrossSalary) > 0 &&
      user.payMonthsPerYear != null
    ) {
      user.baseSalaryMonthly =
        Math.round((Number(user.annualGrossSalary) / user.payMonthsPerYear) * 100) / 100;
    }
    if (this.useDb) {
      await this.supabase!.from("users").insert(user);
      return user;
    }
    this.users.push(user);
    return user;
  }

  async updateUser(userId: string, input: UserUpdateInput, options?: UserWriteOptions): Promise<User> {
    const user = await this.getUser(userId);
    await this.validateReferenceIds(input.roleId, input.costCenterId);
    if (!isSwissPayrollFeatureEnabled() && input.jurisdiction === "CH" && user.jurisdiction !== "CH") {
      throw new BadRequestException(
        "Non è possibile impostare la giurisdizione Svizzera finché NEXA_SWISS_PAYROLL_ENABLED non è attivo."
      );
    }
    if (input.teamId !== undefined) {
      const tid = input.teamId === null || input.teamId === "" ? null : String(input.teamId).trim();
      if (tid) {
        let team: WorkTeam;
        try {
          team = await this.getWorkTeam(tid);
        } catch (e) {
          if (e instanceof NotFoundException) {
            throw new BadRequestException("Team non trovato.");
          }
          throw e;
        }
        const effCc = input.costCenterId ?? user.costCenterId;
        if (!effCc || team.costCenterId !== effCc) {
          throw new BadRequestException(
            "Il team selezionato deve appartenere al centro di costo del dipendente (allinea CDC o scegli un altro team)."
          );
        }
      }
    }
    if (input.email !== undefined) {
      const trimmed = input.email.trim();
      if (!this.simpleEmailRegex().test(trimmed)) {
        throw new BadRequestException("Formato email non valido");
      }
      const lower = trimmed.toLowerCase();
      const others = (await this.listUsers()).filter((item) => item.id !== userId);
      if (others.some((item) => item.email.toLowerCase() === lower)) {
        throw new BadRequestException("Esiste gia un utente con questa email");
      }
    }
    const weeklyContractHours =
      input.weeklyContractHours !== undefined
        ? this.normalizeWeeklyContractHours(input.weeklyContractHours)
        : this.normalizeWeeklyContractHours(user.weeklyContractHours);
    const nextFirstName = input.firstName ?? user.firstName ?? user.fullName.split(" ")[0] ?? "";
    const nextLastName = input.lastName ?? user.lastName ?? user.fullName.split(" ").slice(1).join(" ") ?? "";
    const fullName = input.fullName ?? this.computeFullName(nextFirstName, nextLastName);
    const nextEmail = input.email !== undefined ? input.email.trim() : user.email;
    const payload: User = {
      ...user,
      ...input,
      weeklyContractHours,
      dailyTargetSeconds: this.computeDailyTargetSecondsFromWeekly(weeklyContractHours),
      firstName: nextFirstName,
      lastName: nextLastName,
      fullName,
      email: nextEmail
    };
    if (input.annualGrossSalary !== undefined || input.payMonthsPerYear !== undefined) {
      const pm = this.coercePayMonthsPerYear(
        input.payMonthsPerYear !== undefined ? input.payMonthsPerYear : payload.payMonthsPerYear
      );
      payload.payMonthsPerYear = pm;
      const ral =
        input.annualGrossSalary !== undefined ? input.annualGrossSalary : payload.annualGrossSalary;
      if (ral != null && Number(ral) > 0) {
        const nextBase = this.recomputeBaseSalaryFromRal(ral, pm);
        if (nextBase !== undefined) {
          payload.baseSalaryMonthly = nextBase;
        }
      }
    }
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("users")
        .update(payload)
        .eq("id", userId)
        .select("*")
        .single();
      if (!data) {
        throw new NotFoundException("Utente non trovato");
      }
      const u = data as User;
      return { ...u, role: coercePlatformRole(u.role) };
    }
    Object.assign(user, payload);
    user.role = coercePlatformRole(payload.role);
    return user;
  }

  async updateUserManager(userId: string, managerId?: string): Promise<User> {
    if (managerId && managerId === userId) {
      throw new BadRequestException("Un utente non puo essere manager di se stesso");
    }
    return this.updateUser(userId, { managerId });
  }

  async listRoles(): Promise<Role[]> {
    await this.ensureSeedReferenceData();
    if (this.useDb) {
      const { data } = await this.supabase!.from("roles").select("*").order("name", { ascending: true });
      return (data as Role[]) ?? [];
    }
    return this.roles;
  }

  /** Una riga invece di listRoles() intera (usato da PermissionsService). */
  async getRoleById(roleId: string): Promise<Role | null> {
    await this.ensureSeedReferenceData();
    if (this.useDb) {
      const { data } = await this.supabase!.from("roles").select("*").eq("id", roleId).maybeSingle();
      return (data as Role | undefined) ?? null;
    }
    return this.roles.find((r) => r.id === roleId) ?? null;
  }

  async createRole(input: { name: string; description?: string; permissions?: string[] }): Promise<Role> {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("Nome ruolo obbligatorio");
    }
    const existing = (await this.listRoles()).find((role) => role.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      throw new BadRequestException("Ruolo gia esistente");
    }
    const role: Role = {
      id: `r-${Date.now()}`,
      name,
      description: input.description,
      permissions: input.permissions ?? []
    };
    if (this.useDb) {
      await this.supabase!.from("roles").insert(role);
      return role;
    }
    this.roles.push(role);
    return role;
  }

  async updateRole(
    roleId: string,
    input: { name?: string; description?: string; permissions?: string[] }
  ): Promise<Role> {
    const currentRoles = await this.listRoles();
    const role = currentRoles.find((item) => item.id === roleId);
    if (!role) {
      throw new NotFoundException("Ruolo non trovato");
    }
    if (input.name) {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException("Nome ruolo obbligatorio");
      }
      const duplicate = currentRoles.find(
        (item) => item.id !== roleId && item.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        throw new BadRequestException("Esiste gia un ruolo con questo nome");
      }
      role.name = name;
    }
    if (input.description !== undefined) {
      role.description = input.description;
    }
    if (input.permissions !== undefined) {
      role.permissions = input.permissions;
    }
    if (this.useDb) {
      await this.supabase!.from("roles").update(role).eq("id", roleId);
    } else {
      const memoryRole = this.roles.find((item) => item.id === roleId);
      if (memoryRole) Object.assign(memoryRole, role);
    }
    return role;
  }

  async deleteRole(roleId: string): Promise<Role> {
    const currentRoles = await this.listRoles();
    const role = currentRoles.find((item) => item.id === roleId);
    if (!role) {
      throw new NotFoundException("Ruolo non trovato");
    }
    if (role.name === "admin" || role.name === "Superuser") {
      throw new BadRequestException("Questo ruolo di sistema non puo essere eliminato");
    }
    const remainingSuperuserCatalog = currentRoles.some(
      (item) =>
        item.id !== roleId && (item.name === "Superuser" || item.name?.toLowerCase() === "admin")
    );
    if (!remainingSuperuserCatalog) {
      throw new BadRequestException("Deve esistere almeno un ruolo Superuser nel catalogo");
    }
    if (this.useDb) {
      await this.supabase!.from("roles").delete().eq("id", roleId);
    } else {
      const index = this.roles.findIndex((item) => item.id === roleId);
      if (index !== -1) this.roles.splice(index, 1);
    }
    return role;
  }

  async listCostCenters(): Promise<CostCenter[]> {
    await this.ensureSeedReferenceData();
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("cost_centers")
        .select("*")
        .order("code", { ascending: true });
      return (data as CostCenter[]) ?? [];
    }
    return this.costCenters;
  }

  private pickUniqueCostCenterCode10(existingCodes: Set<string>): string {
    for (let attempt = 0; attempt < 8000; attempt++) {
      const suffix = Math.floor(Math.random() * 10_000_000)
        .toString()
        .padStart(7, "0");
      const code = `880${suffix}`;
      if (code.length === 10 && !existingCodes.has(code.toLowerCase())) {
        return code;
      }
    }
    throw new BadRequestException("Impossibile generare un codice centro di costo univoco");
  }

  async createCostCenter(input: {
    code?: string;
    name: string;
    description?: string;
    companyId?: string;
    payrollItSector?: string | null;
    payrollDefaultInailPermille?: number | null;
  }): Promise<CostCenter> {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("Nome centro di costo obbligatorio");
    }
    const centers = await this.listCostCenters();
    const codeSet = new Set(centers.map((c) => c.code.toLowerCase()));
    let code = input.code?.trim() ?? "";
    if (!code) {
      code = this.pickUniqueCostCenterCode10(codeSet);
    } else {
      if (!/^\d{10}$/.test(code)) {
        throw new BadRequestException("Il codice deve essere esattamente 10 cifre numeriche");
      }
    }
    if (codeSet.has(code.toLowerCase())) {
      throw new BadRequestException("Esiste gia un centro di costo con questo codice");
    }
    const companyId = input.companyId?.trim();
    const costCenter: CostCenter = {
      id: `cc-${Date.now()}`,
      code,
      name,
      description: input.description,
      ...(companyId ? { companyId } : {}),
      ...(input.payrollItSector !== undefined ? { payrollItSector: input.payrollItSector } : {}),
      ...(input.payrollDefaultInailPermille !== undefined
        ? { payrollDefaultInailPermille: input.payrollDefaultInailPermille }
        : {})
    };
    if (this.useDb) {
      await this.supabase!.from("cost_centers").insert(costCenter);
      return costCenter;
    }
    this.costCenters.push(costCenter);
    return costCenter;
  }

  async updateCostCenter(
    costCenterId: string,
    input: {
      code?: string;
      name?: string;
      description?: string;
      companyId?: string | null;
      payrollItSector?: string | null;
      payrollDefaultInailPermille?: number | null;
    }
  ): Promise<CostCenter> {
    const currentCostCenters = await this.listCostCenters();
    const center = currentCostCenters.find((item) => item.id === costCenterId);
    if (!center) {
      throw new NotFoundException("Centro di costo non trovato");
    }
    if (input.code) {
      const code = input.code.trim();
      if (!code) {
        throw new BadRequestException("Codice centro di costo obbligatorio");
      }
      const duplicate = currentCostCenters.find(
        (item) => item.id !== costCenterId && item.code.toLowerCase() === code.toLowerCase()
      );
      if (duplicate) {
        throw new BadRequestException("Esiste gia un centro di costo con questo codice");
      }
      center.code = code;
    }
    if (input.name) {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException("Nome centro di costo obbligatorio");
      }
      center.name = name;
    }
    if (input.description !== undefined) {
      center.description = input.description;
    }
    if (input.companyId !== undefined) {
      const v = input.companyId?.trim();
      center.companyId = v && v.length > 0 ? v : undefined;
    }
    if (input.payrollItSector !== undefined) {
      center.payrollItSector = input.payrollItSector;
    }
    if (input.payrollDefaultInailPermille !== undefined) {
      center.payrollDefaultInailPermille = input.payrollDefaultInailPermille;
    }
    if (this.useDb) {
      await this.supabase!.from("cost_centers").update(center).eq("id", costCenterId);
    } else {
      const memoryCenter = this.costCenters.find((item) => item.id === costCenterId);
      if (memoryCenter) Object.assign(memoryCenter, center);
    }
    return center;
  }

  async deleteCostCenter(costCenterId: string): Promise<CostCenter> {
    const currentCostCenters = await this.listCostCenters();
    const center = currentCostCenters.find((item) => item.id === costCenterId);
    if (!center) {
      throw new NotFoundException("Centro di costo non trovato");
    }
    if (this.useDb) {
      await this.supabase!.from("cost_centers").delete().eq("id", costCenterId);
    } else {
      const index = this.costCenters.findIndex((item) => item.id === costCenterId);
      if (index !== -1) this.costCenters.splice(index, 1);
    }
    return center;
  }

  async assignRole(userId: string, role: User["role"]): Promise<User> {
    return this.updateUser(userId, { role }, { skipTeamLeadLinkValidation: true });
  }

  /** Superuser (stessa company) oppure `user` con `managerId` diretto o ruolo responsabile su `work_teams`. */
  private async assertCanActOnBehalfOfUser(
    actorUserId: string,
    actorRole: AuthRole,
    targetUserId: string
  ): Promise<void> {
    if (targetUserId === actorUserId) {
      return;
    }
    if (actorRole === "superuser") {
      const a = await this.getUser(actorUserId);
      const t = await this.getUser(targetUserId);
      if (a.companyId !== t.companyId) {
        throw new ForbiddenException("Azienda diversa");
      }
      return;
    }
    if (actorRole === "user") {
      if (await this.isManagerOf(actorUserId, targetUserId)) {
        return;
      }
      if (await this.isUserLeadOfTeamContaining(actorUserId, targetUserId)) {
        return;
      }
      throw new ForbiddenException("Non sei il responsabile di questo dipendente");
    }
    throw new ForbiddenException("Operazione non consentita");
  }

  async isManagerOf(managerId: string, employeeId: string): Promise<boolean> {
    const employee = (await this.listUsers()).find((item) => item.id === employeeId);
    return employee?.managerId === managerId;
  }

  /** Il membro appartiene a un team di cui `leadUserId` è responsabile nominato. */
  async isUserLeadOfTeamContaining(leadUserId: string, memberUserId: string): Promise<boolean> {
    if (leadUserId === memberUserId) {
      return false;
    }
    const member = (await this.listUsers()).find((item) => item.id === memberUserId);
    const tid = member?.teamId?.trim();
    if (!tid) {
      return false;
    }
    try {
      const team = await this.getWorkTeam(tid);
      return (team.leadUserId ?? "").trim() === leadUserId.trim();
    } catch {
      return false;
    }
  }

  async listWorkTeamIdsWhereUserIsLead(leadUserId: string): Promise<string[]> {
    if (this.useDb) {
      const { data, error } = await this.supabase!.from("work_teams").select("id").eq("leadUserId", leadUserId);
      if (error) {
        if (this.isWorkTeamsUnavailableError(error)) {
          this.logger.warn(`listWorkTeamIdsWhereUserIsLead: ${error.message}`);
          return [];
        }
        throw new BadRequestException(`Lettura team fallita: ${error.message}`);
      }
      return ((data as { id: string }[]) ?? []).map((r) => String(r.id));
    }
    return this.workTeamsMem.filter((t) => (t.leadUserId ?? "").trim() === leadUserId.trim()).map((t) => t.id);
  }

  /** Utente corrente, riporti diretti e membri dei team di cui è responsabile. */
  async listManagedMemberIdsForApprover(approverId: string): Promise<Set<string>> {
    const subs = await this.listUsersByManager(approverId);
    const ids = new Set<string>([approverId, ...subs.map((s) => s.id)]);
    const ledTeamIds = await this.listWorkTeamIdsWhereUserIsLead(approverId);
    if (ledTeamIds.length === 0) {
      return ids;
    }
    const teamIdSet = new Set(ledTeamIds);
    for (const u of await this.listUsers()) {
      const t = u.teamId?.trim();
      if (t && teamIdSet.has(t)) {
        ids.add(u.id);
      }
    }
    return ids;
  }

  private async computeClockState(userId: string, date: string): Promise<{
    hasOpenClockIn: boolean;
    isRunning: boolean;
    nextType: "clock_in" | "clock_out";
    todayEntries: TimeEntry[];
    minutesWorked: number;
    workedSeconds: number;
    overtimeSeconds: number;
    dailyTargetSeconds: number;
    remainingSeconds: number;
    firstClockInAt?: string;
  }> {
    const todayEntries = (await this.listTimeEntries(userId, { date })).sort((a, b) => a.at.localeCompare(b.at));
    const live = this.calculateWorkedSeconds(todayEntries, new Date().toISOString());
    const workedSeconds = live.workedSeconds;
    const minutesWorked = Math.floor(workedSeconds / 60);
    const user = await this.getUser(userId);
    const dailyTargetSeconds = this.resolveDailyTargetSeconds(user);
    const remainingSeconds = Math.max(0, dailyTargetSeconds - workedSeconds);
    const overtimeSeconds = Math.max(0, workedSeconds - dailyTargetSeconds);
    return {
      hasOpenClockIn: live.hasOpenClockIn,
      isRunning: live.hasOpenClockIn,
      nextType: live.hasOpenClockIn ? "clock_out" : "clock_in",
      todayEntries,
      minutesWorked,
      workedSeconds,
      overtimeSeconds,
      dailyTargetSeconds,
      remainingSeconds,
      firstClockInAt: live.firstClockInAt
    };
  }

  async getClockStatus(userId: string, date: string): Promise<{
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
  }> {
    const state = await this.computeClockState(userId, date);
    return {
      date,
      hasOpenClockIn: state.hasOpenClockIn,
      isRunning: state.isRunning,
      nextType: state.nextType,
      entriesCount: state.todayEntries.length,
      minutesWorked: state.minutesWorked,
      workedSeconds: state.workedSeconds,
      overtimeSeconds: state.overtimeSeconds,
      dailyTargetSeconds: state.dailyTargetSeconds,
      remainingSeconds: state.remainingSeconds,
      firstClockInAt: state.firstClockInAt
    };
  }

  async addTimeEntry(
    userId: string,
    type: "clock_in" | "clock_out",
    at?: string,
    meta?: { source?: ClockChannel; geo?: GeoFix; deviceId?: string }
  ): Promise<TimeEntry> {
    const atIso = at ?? new Date().toISOString();
    const day = atIso.slice(0, 10);
    const clockState = await this.computeClockState(userId, day);
    if (clockState.nextType !== type) {
      if (type === "clock_in") {
        throw new BadRequestException("Entrata gia registrata, devi timbrare uscita");
      }
      throw new BadRequestException("Devi prima timbrare entrata");
    }
    const entry: TimeEntry = {
      id: `te-${Date.now()}`,
      userId,
      type,
      at: atIso,
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.geo ? { geo: meta.geo } : {}),
      ...(meta?.deviceId ? { deviceId: meta.deviceId } : {})
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("time_entries").insert({
        id: entry.id,
        userId: entry.userId,
        type: entry.type,
        at: entry.at,
        source: entry.source ?? null,
        deviceId: entry.deviceId ?? null,
        geo: entry.geo ?? null
      });
      if (error) {
        throw new InternalServerErrorException(
          `Salvataggio timbratura fallito: ${error.message}. Controlla permessi DB/RLS sulla tabella time_entries.`
        );
      }
      await this.refreshSummary(userId, day);
      return entry;
    }
    this.timeEntries.push(entry);
    await this.refreshSummary(userId, day);
    return entry;
  }

  async listTimeEntries(userId: string, filter?: { date?: string; month?: string }): Promise<TimeEntry[]> {
    const prefix = filter?.month ? `${filter.month}-` : filter?.date;
    if (this.useDb) {
      let query = this.supabase!.from("time_entries").select("*").eq("userId", userId);
      if (filter?.month) {
        query = query.like("at", `${filter.month}%`);
      } else if (filter?.date) {
        query = query.like("at", `${filter.date}%`);
      }
      const { data } = await query;
      return ((data as TimeEntry[]) ?? []).sort((a, b) => b.at.localeCompare(a.at));
    }
    return this.timeEntries
      .filter((item) => {
        if (item.userId !== userId) {
          return false;
        }
        if (filter?.month) {
          return item.at.startsWith(filter.month);
        }
        if (filter?.date) {
          return item.at.startsWith(filter.date);
        }
        return true;
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  async listAllTimeEntriesInMonth(monthPrefix: string): Promise<TimeEntry[]> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("time_entries").select("*").like("at", `${monthPrefix}%`);
      return ((data as TimeEntry[]) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    }
    return this.timeEntries.filter((item) => item.at.startsWith(monthPrefix)).sort((a, b) => a.at.localeCompare(b.at));
  }

  /** Timbrature di più dipendenti in un singolo giorno (prefisso data su `at`). */
  async listTimeEntriesForUsersOnDay(userIds: string[], day: string): Promise<TimeEntry[]> {
    const d = day.slice(0, 10);
    if (userIds.length === 0) {
      return [];
    }
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("time_entries")
        .select("*")
        .in("userId", userIds)
        .like("at", `${d}%`);
      return ((data as TimeEntry[]) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    }
    const idSet = new Set(userIds);
    return this.timeEntries
      .filter((item) => idSet.has(item.userId) && item.at.slice(0, 10) === d)
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  async getTimeEntryById(entryId: string): Promise<TimeEntry | null> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("time_entries").select("*").eq("id", entryId).maybeSingle();
      return (data as TimeEntry | undefined) ?? null;
    }
    return this.timeEntries.find((item) => item.id === entryId) ?? null;
  }

  async getCostCenterById(costCenterId: string): Promise<CostCenter | null> {
    const list = await this.listCostCenters();
    return list.find((c) => c.id === costCenterId) ?? null;
  }

  async addTimeEntryAdmin(
    userId: string,
    type: "clock_in" | "clock_out",
    at?: string,
    meta?: { source?: ClockChannel; geo?: GeoFix; deviceId?: string }
  ): Promise<TimeEntry> {
    const atIso = at ?? new Date().toISOString();
    const day = atIso.slice(0, 10);
    const entry: TimeEntry = {
      id: `te-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type,
      at: atIso,
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.geo ? { geo: meta.geo } : {}),
      ...(meta?.deviceId ? { deviceId: meta.deviceId } : {})
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("time_entries").insert({
        id: entry.id,
        userId: entry.userId,
        type: entry.type,
        at: entry.at,
        source: entry.source ?? null,
        deviceId: entry.deviceId ?? null,
        geo: entry.geo ?? null
      });
      if (error) {
        throw new InternalServerErrorException(`Salvataggio timbratura fallito: ${error.message}`);
      }
      await this.refreshSummary(userId, day);
      return entry;
    }
    this.timeEntries.push(entry);
    await this.refreshSummary(userId, day);
    return entry;
  }

  async updateTimeEntryById(
    entryId: string,
    patch: { at?: string; type?: "clock_in" | "clock_out" }
  ): Promise<TimeEntry> {
    const existing = await this.getTimeEntryById(entryId);
    if (!existing) {
      throw new NotFoundException("Timbratura non trovata");
    }
    const oldDay = existing.at.slice(0, 10);
    const nextAt = patch.at ?? existing.at;
    const nextType = patch.type ?? existing.type;
    const newDay = nextAt.slice(0, 10);
    const updated: TimeEntry = { ...existing, at: nextAt, type: nextType };
    if (this.useDb) {
      await this.supabase!.from("time_entries").update({ at: nextAt, type: nextType }).eq("id", entryId);
    } else {
      const idx = this.timeEntries.findIndex((item) => item.id === entryId);
      if (idx !== -1) {
        this.timeEntries[idx] = updated;
      }
    }
    await this.refreshSummary(existing.userId, oldDay);
    if (newDay !== oldDay) {
      await this.refreshSummary(existing.userId, newDay);
    }
    return updated;
  }

  async deleteTimeEntryById(entryId: string): Promise<TimeEntry> {
    const existing = await this.getTimeEntryById(entryId);
    if (!existing) {
      throw new NotFoundException("Timbratura non trovata");
    }
    const day = existing.at.slice(0, 10);
    if (this.useDb) {
      await this.supabase!.from("time_entries").delete().eq("id", entryId);
    } else {
      const idx = this.timeEntries.findIndex((item) => item.id === entryId);
      if (idx !== -1) {
        this.timeEntries.splice(idx, 1);
      }
    }
    await this.refreshSummary(existing.userId, day);
    return existing;
  }

  async listWorkdaySummary(userId: string, date?: string): Promise<WorkdaySummary[]> {
    if (this.useDb) {
      let query = this.supabase!.from("workday_summaries").select("*").eq("userId", userId);
      if (date) {
        query = query.eq("date", date);
      }
      const { data } = await query;
      return ((data as WorkdaySummary[]) ?? []).sort((a, b) => b.date.localeCompare(a.date));
    }
    return this.workdaySummaries
      .filter((item) => item.userId === userId && (!date || item.date === date))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async listWorkdaySummariesInRange(userId: string, from?: string, to?: string): Promise<WorkdaySummary[]> {
    const f = from?.slice(0, 10);
    const t = to?.slice(0, 10);
    if (this.useDb) {
      let query = this.supabase!.from("workday_summaries").select("*").eq("userId", userId);
      if (f) {
        query = query.gte("date", f);
      }
      if (t) {
        query = query.lte("date", t);
      }
      const { data } = await query;
      return ((data as WorkdaySummary[]) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    }
    return this.workdaySummaries
      .filter(
        (item) =>
          item.userId === userId &&
          (!f || item.date >= f) &&
          (!t || item.date <= t)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async listCompanyHolidays(companyId: string, from?: string, to?: string): Promise<CompanyHoliday[]> {
    const f = from?.slice(0, 10);
    const t = to?.slice(0, 10);
    let rows: CompanyHoliday[];
    if (this.useDb) {
      let query = this.supabase!.from("company_holidays").select("*").eq("companyId", companyId);
      if (f) {
        query = query.gte("day", f);
      }
      if (t) {
        query = query.lte("day", t);
      }
      const { data } = await query;
      rows = (data as CompanyHoliday[]) ?? [];
    } else {
      rows = this.demoCompanyHolidays.filter((h) => h.companyId === companyId);
      if (f) {
        rows = rows.filter((h) => h.day >= f);
      }
      if (t) {
        rows = rows.filter((h) => h.day <= t);
      }
    }
    return rows.sort((a, b) => a.day.localeCompare(b.day));
  }

  async getOvertimeAggregates(
    userId: string,
    referenceDate: string,
    scope?: "week" | "month" | "year"
  ): Promise<{
    referenceDate: string;
    week: { overtimeSeconds: number; overtimeHours: number };
    month: { overtimeSeconds: number; overtimeHours: number };
    year: { overtimeSeconds: number; overtimeHours: number };
  } | { scope: "week" | "month" | "year"; overtimeSeconds: number; overtimeHours: number }> {
    const summaries = await this.listWorkdaySummary(userId);
    const { start, end } = this.weekRange(referenceDate);
    const monthPrefix = referenceDate.slice(0, 7);
    const yearPrefix = referenceDate.slice(0, 4);
    const user = await this.getUser(userId);
    const targetSeconds = this.resolveDailyTargetSeconds(user);

    const sumOvertime = (items: WorkdaySummary[]): number =>
      items.reduce((acc, item) => {
        const fallbackOvertime = Math.max(0, (item.workedSeconds ?? item.minutesWorked * 60) - targetSeconds);
        return acc + (item.overtimeSeconds ?? fallbackOvertime);
      }, 0);

    const weekOvertimeSeconds = sumOvertime(
      summaries.filter((item) => item.date >= start && item.date <= end)
    );
    const monthOvertimeSeconds = sumOvertime(
      summaries.filter((item) => item.date.startsWith(monthPrefix))
    );
    const yearOvertimeSeconds = sumOvertime(
      summaries.filter((item) => item.date.startsWith(yearPrefix))
    );

    const result = {
      referenceDate,
      week: { overtimeSeconds: weekOvertimeSeconds, overtimeHours: weekOvertimeSeconds / 3600 },
      month: { overtimeSeconds: monthOvertimeSeconds, overtimeHours: monthOvertimeSeconds / 3600 },
      year: { overtimeSeconds: yearOvertimeSeconds, overtimeHours: yearOvertimeSeconds / 3600 }
    };

    if (!scope) {
      return result;
    }

    return {
      scope,
      overtimeSeconds: result[scope].overtimeSeconds,
      overtimeHours: result[scope].overtimeHours
    };
  }

  private async refreshSummary(userId: string, date: string): Promise<void> {
    const dayEntries = (await this.listTimeEntries(userId, { date })).sort((a, b) => a.at.localeCompare(b.at));
    const workedSeconds = this.calculateWorkedSeconds(dayEntries).workedSeconds;
    const minutesWorked = Math.floor(workedSeconds / 60);
    const user = await this.getUser(userId);
    const dailyTargetSeconds = this.resolveDailyTargetSeconds(user);
    const overtimeSeconds = Math.max(0, workedSeconds - dailyTargetSeconds);

    const existing = (await this.listWorkdaySummary(userId)).find((item) => item.date === date);
    if (existing) {
      if (this.useDb) {
        await this.supabase!
          .from("workday_summaries")
          .update({ minutesWorked, workedSeconds, overtimeSeconds })
          .eq("userId", userId)
          .eq("date", date);
      } else {
        existing.minutesWorked = minutesWorked;
        existing.workedSeconds = workedSeconds;
        existing.overtimeSeconds = overtimeSeconds;
      }
      return;
    }
    const summary = {
      userId,
      date,
      minutesWorked,
      workedSeconds,
      overtimeSeconds,
      mode: "office"
    } as WorkdaySummary;
    if (this.useDb) {
      await this.supabase!.from("workday_summaries").insert(summary);
      return;
    }
    this.workdaySummaries.push(summary);
  }

  /**
   * Passando a sede, si allineano le richieste SW sullo stesso giorno (in attesa o approvate future),
   * così il calendario non mostra SW e sede in conflitto.
   */
  private async removeSmartworkingRequestsWhenSwitchingToOffice(userId: string, date: string): Promise<void> {
    const d = date.slice(0, 10);
    const today = this.calendarDateTodayIsoRome();
    const actor = await this.getUser(userId);
    const actorRole = actor.role as AuthRole;
    const reqs = await this.listMySmartworking(userId);
    for (const r of reqs) {
      const day = r.day.slice(0, 10);
      if (day !== d) continue;
      if (r.status === "rejected") continue;
      if (r.status === "pending") {
        await this.cancelSmartworkingRequest(userId, r.id, actorRole);
        continue;
      }
      if (r.status === "approved" && day > today) {
        await this.cancelSmartworkingRequest(userId, r.id, actorRole);
      }
    }
  }

  async upsertWorkMode(
    userId: string,
    date: string,
    mode: "office" | "smartworking"
  ): Promise<WorkdaySummary> {
    if (mode === "office") {
      await this.removeSmartworkingRequestsWhenSwitchingToOffice(userId, date);
    }
    if (this.useDb) {
      const list = await this.listWorkdaySummary(userId);
      const summary = list.find((item) => item.date === date);
      if (!summary) {
        const newSummary: WorkdaySummary = {
          userId,
          date,
          minutesWorked: 0,
          workedSeconds: 0,
          overtimeSeconds: 0,
          mode
        };
        await this.supabase!.from("workday_summaries").insert(newSummary);
        return newSummary;
      }
      await this.supabase!
        .from("workday_summaries")
        .update({ mode })
        .eq("userId", userId)
        .eq("date", date);
      return { ...summary, mode };
    }
    const summary = this.workdaySummaries.find((item) => item.userId === userId && item.date === date);
    if (!summary) {
      const newSummary: WorkdaySummary = {
        userId,
        date,
        minutesWorked: 0,
        workedSeconds: 0,
        overtimeSeconds: 0,
        mode
      };
      this.workdaySummaries.push(newSummary);
      return newSummary;
    }
    summary.mode = mode;
    return summary;
  }

  async createLeavePlan(
    input: Omit<LeavePlan, "id" | "status" | "version">,
    options?: { skipAnnualBalanceCheck?: boolean }
  ): Promise<LeavePlan> {
    const requestedDays = this.countCalendarDays(input.startDate, input.endDate);
    const kind: LeavePlanKind = input.kind ?? "annual";
    if (kind === "annual" && !options?.skipAnnualBalanceCheck) {
      const balance = await this.getLeaveBalance(input.userId, Number(input.startDate.slice(0, 4)));
      if (requestedDays > balance.residualDays) {
        throw new BadRequestException("Ferie insufficienti: riduci i giorni richiesti");
      }
    }
    const leave: LeavePlan = {
      id: `lv-${Date.now()}`,
      status: "pending",
      version: 1,
      ...input,
      kind
    };
    if (this.useDb) {
      await this.supabase!.from("leave_plans").insert(leave);
    } else {
      this.leavePlans.push(leave);
    }
    const approval = {
      id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      entityId: leave.id,
      type: "leave",
      requestedBy: leave.userId,
      status: "pending",
      at: new Date().toISOString()
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
    const requester = await this.getUser(leave.userId);
    const kindLabel = kind === "rol" ? "ROL" : "ferie";
    await this.notifyApproversOfRequest(
      requester,
      `Nuova richiesta ${kindLabel}`,
      `${requester.fullName}: ${leave.startDate} – ${leave.endDate}`,
      "leave_request",
      `/workflow/approvals?approvalId=${encodeURIComponent(approval.id)}`
    );
    return leave;
  }

  async updateLeavePlan(
    leaveId: string,
    startDate: string,
    endDate: string,
    actorUserId: string,
    kindInput?: LeavePlanKind,
    actorRole?: AuthRole
  ): Promise<LeavePlan> {
    const leave = await this.getLeave(leaveId);
    if (!leave) throw new NotFoundException("Piano ferie non trovato");
    const role = actorRole ?? "user";
    await this.assertCanActOnBehalfOfUser(actorUserId, role, leave.userId);
    if (leave.status === "rejected") {
      throw new BadRequestException("Questa richiesta è stata rifiutata e non è modificabile");
    }
    const isApprovedLeaveCorrection = leave.status === "approved";
    if (isApprovedLeaveCorrection) {
      if (actorUserId === leave.userId && role !== "superuser") {
        throw new BadRequestException("Le ferie approvate non possono essere modificate dal dipendente");
      }
    } else if (leave.status !== "pending") {
      throw new BadRequestException("Solo le richieste in attesa di approvazione possono essere modificate");
    }
    const year = Number(startDate.slice(0, 4));
    const requestedDays = this.countCalendarDays(startDate, endDate);
    const kind: LeavePlanKind = kindInput ?? leave.kind ?? "annual";
    if (kind === "annual" && role !== "superuser" && !isApprovedLeaveCorrection) {
      const balance = await this.getLeaveBalance(leave.userId, year);
      if (requestedDays > balance.residualDays) {
        throw new BadRequestException("Ferie insufficienti per aggiornare questa richiesta");
      }
    }
    leave.startDate = startDate;
    leave.endDate = endDate;
    leave.kind = kind;
    leave.version += 1;
    if (isApprovedLeaveCorrection) {
      if (this.useDb) {
        await this.supabase!
          .from("leave_plans")
          .update({ startDate, endDate, version: leave.version, kind: leave.kind })
          .eq("id", leaveId);
      }
      return leave;
    }
    leave.status = "pending";
    if (this.useDb) {
      await this.supabase!
        .from("leave_plans")
        .update({ startDate, endDate, version: leave.version, status: leave.status, kind: leave.kind })
        .eq("id", leaveId);
      await this.supabase!.from("approvals").delete().eq("entityId", leaveId).eq("type", "leave").eq("status", "pending");
    } else {
      const keep = this.approvals.filter(
        (a) => !(a.entityId === leaveId && a.type === "leave" && a.status === "pending")
      );
      this.approvals.length = 0;
      this.approvals.push(...keep);
    }
    const approval = {
      id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      entityId: leave.id,
      type: "leave",
      requestedBy: leave.userId,
      status: "pending",
      at: new Date().toISOString()
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
    const requester = await this.getUser(leave.userId);
    const kindLabel = (leave.kind ?? "annual") === "rol" ? "ROL" : "ferie";
    await this.notifyApproversOfRequest(
      requester,
      `Richiesta ${kindLabel} aggiornata`,
      `${requester.fullName}: ${leave.startDate} – ${leave.endDate}`,
      "leave_request",
      `/workflow/approvals?approvalId=${encodeURIComponent(approval.id)}`
    );
    return leave;
  }

  async approveLeave(leaveId: string, approverId: string, approvalRowId?: string): Promise<LeavePlan> {
    const leave = await this.getLeave(leaveId);
    if (!leave) throw new NotFoundException("Piano ferie non trovato");
    leave.status = "approved";
    const at = new Date().toISOString();
    if (this.useDb) {
      await this.supabase!.from("leave_plans").update({ status: "approved" }).eq("id", leaveId);
      const { error } = approvalRowId
        ? await this.supabase!.from("approvals").update({ status: "approved", approverId, at }).eq("id", approvalRowId)
        : await this.supabase!
            .from("approvals")
            .update({ status: "approved", approverId, at })
            .eq("entityId", leaveId)
            .eq("type", "leave")
            .eq("status", "pending");
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento approvazione ferie fallito: ${error.message}`);
      }
    } else {
      const row = this.approvals.find(
        (a) =>
          a.entityId === leaveId &&
          a.type === "leave" &&
          a.status === "pending" &&
          (approvalRowId ? a.id === approvalRowId : true)
      );
      if (row) {
        row.status = "approved";
        row.approverId = approverId;
        row.at = at;
      }
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: leave.userId,
      title: "Ferie approvate",
      body: `Periodo ${leave.startDate} – ${leave.endDate}`,
      read: false,
      createdAt: new Date().toISOString(),
      kind: "leave_approved"
    });
    return leave;
  }

  async rejectLeave(leaveId: string, approverId: string, approvalRowId?: string, rejectReason?: string): Promise<LeavePlan> {
    const leave = await this.getLeave(leaveId);
    leave.status = "rejected";
    const at = new Date().toISOString();
    const reasonPayload = { status: "rejected" as const, approverId, at, rejectReason: rejectReason?.trim() || null };
    if (this.useDb) {
      await this.supabase!.from("leave_plans").update({ status: "rejected" }).eq("id", leaveId);
      const { error } = approvalRowId
        ? await this.supabase!.from("approvals").update(reasonPayload).eq("id", approvalRowId)
        : await this.supabase!
            .from("approvals")
            .update(reasonPayload)
            .eq("entityId", leaveId)
            .eq("type", "leave")
            .eq("status", "pending");
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento rifiuto ferie fallito: ${error.message}`);
      }
    } else {
      const row = this.approvals.find(
        (a) =>
          a.entityId === leaveId &&
          a.type === "leave" &&
          a.status === "pending" &&
          (approvalRowId ? a.id === approvalRowId : true)
      );
      if (row) {
        row.status = "rejected";
        row.approverId = approverId;
        row.at = at;
        row.rejectReason = rejectReason?.trim() || null;
      }
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: leave.userId,
      title: "Ferie rifiutate",
      body: `Periodo ${leave.startDate} – ${leave.endDate}${rejectReason?.trim() ? ` — ${rejectReason.trim()}` : ""}`,
      read: false,
      createdAt: new Date().toISOString(),
      kind: "leave_rejected"
    });
    return leave;
  }

  async listLeave(userId: string): Promise<LeavePlan[]> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("leave_plans").select("*").eq("userId", userId);
      return (data as LeavePlan[]) ?? [];
    }
    return this.leavePlans.filter((item) => item.userId === userId);
  }

  async cancelPendingLeavePlan(leaveId: string, actorUserId: string, actorRole: AuthRole): Promise<void> {
    const leave = await this.getLeave(leaveId);
    await this.assertCanActOnBehalfOfUser(actorUserId, actorRole, leave.userId);
    const today = this.calendarDateTodayIsoRome();
    const start = leave.startDate.slice(0, 10);
    if (leave.status === "approved") {
      if (start <= today) {
        throw new BadRequestException(
          "Solo assenze con data di inizio futura possono essere rimosse (ferie / ROL approvate)"
        );
      }
      if (actorUserId !== leave.userId && actorRole !== "superuser") {
        throw new ForbiddenException(
          "Solo il dipendente interessato può annullare un’assenza approvata futura"
        );
      }
    } else if (leave.status !== "pending" && leave.status !== "rejected") {
      throw new BadRequestException("Solo richieste in attesa o rifiutate possono essere rimosse dal calendario");
    }
    if (this.useDb) {
      await this.supabase!.from("approvals").delete().eq("entityId", leaveId).eq("type", "leave");
      const { error } = await this.supabase!.from("leave_plans").delete().eq("id", leaveId);
      if (error) {
        throw new InternalServerErrorException(`Annullamento ferie fallito: ${error.message}`);
      }
    } else {
      const li = this.leavePlans.findIndex((l) => l.id === leaveId);
      if (li >= 0) this.leavePlans.splice(li, 1);
      for (let i = this.approvals.length - 1; i >= 0; i--) {
        const a = this.approvals[i];
        if (a.entityId === leaveId && a.type === "leave") this.approvals.splice(i, 1);
      }
    }
  }

  async cancelPendingSicknessEvent(sicknessId: string, actorUserId: string, actorRole: AuthRole): Promise<void> {
    const sickness = await this.getSickness(sicknessId);
    await this.assertCanActOnBehalfOfUser(actorUserId, actorRole, sickness.userId);
    if (sickness.status !== "pending" && sickness.status !== "rejected") {
      throw new BadRequestException("Solo richieste in attesa o rifiutate possono essere rimosse dal calendario");
    }
    if (this.useDb) {
      await this.supabase!.from("approvals").delete().eq("entityId", sicknessId).eq("type", "sickness");
      const { error } = await this.supabase!.from("sickness_events").delete().eq("id", sicknessId);
      if (error) {
        throw new InternalServerErrorException(`Annullamento malattia fallito: ${error.message}`);
      }
    } else {
      const si = this.sicknessEvents.findIndex((s) => s.id === sicknessId);
      if (si >= 0) this.sicknessEvents.splice(si, 1);
      for (let i = this.approvals.length - 1; i >= 0; i--) {
        const a = this.approvals[i];
        if (a.entityId === sicknessId && a.type === "sickness") this.approvals.splice(i, 1);
      }
    }
  }

  async getLeave(leaveId: string): Promise<LeavePlan> {
    let leave: LeavePlan | undefined;
    if (this.useDb) {
      const { data } = await this.supabase!.from("leave_plans").select("*").eq("id", leaveId).single();
      leave = (data as LeavePlan) ?? undefined;
    } else {
      leave = this.leavePlans.find((item) => item.id === leaveId);
    }
    if (!leave) throw new NotFoundException("Piano ferie non trovato");
    return leave;
  }

  async createSicknessEvent(input: Omit<SicknessEvent, "id" | "status">): Promise<SicknessEvent> {
    const sickness: SicknessEvent = { id: `sk-${Date.now()}`, status: "pending", ...input };
    if (this.useDb) {
      await this.supabase!.from("sickness_events").insert(sickness);
    } else {
      this.sicknessEvents.push(sickness);
    }
    const approval = {
      id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      entityId: sickness.id,
      type: "sickness",
      requestedBy: sickness.userId,
      status: "pending",
      at: new Date().toISOString()
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
    const requester = await this.getUser(sickness.userId);
    await this.notifyApproversOfRequest(
      requester,
      "Nuova comunicazione malattia",
      `${requester.fullName}: ${sickness.fromDate} – ${sickness.toDate}`,
      "sickness_request",
      `/workflow/approvals?approvalId=${encodeURIComponent(approval.id)}`
    );
    return sickness;
  }

  async updateSicknessEvent(
    sicknessId: string,
    actorUserId: string,
    fromDate: string,
    toDate: string,
    actorRole?: AuthRole
  ): Promise<SicknessEvent> {
    const sickness = await this.getSickness(sicknessId);
    const role = actorRole ?? "user";
    await this.assertCanActOnBehalfOfUser(actorUserId, role, sickness.userId);
    if (sickness.status === "rejected") {
      throw new BadRequestException("Questa richiesta è stata rifiutata e non è modificabile");
    }
    const isApprovedSicknessCorrection = sickness.status === "approved";
    if (isApprovedSicknessCorrection) {
      if (actorUserId === sickness.userId && role !== "superuser") {
        throw new BadRequestException("La malattia approvata non può essere modificata dal dipendente");
      }
    } else if (sickness.status !== "pending") {
      throw new BadRequestException("Solo le richieste in attesa di approvazione possono essere modificate");
    }
    this.countCalendarDays(fromDate, toDate);
    sickness.fromDate = fromDate;
    sickness.toDate = toDate;
    if (isApprovedSicknessCorrection) {
      if (this.useDb) {
        await this.supabase!.from("sickness_events").update({ fromDate, toDate }).eq("id", sicknessId);
      }
      return sickness;
    }
    if (this.useDb) {
      await this.supabase!.from("sickness_events").update({ fromDate, toDate }).eq("id", sicknessId);
      await this.supabase!.from("approvals").delete().eq("entityId", sicknessId).eq("type", "sickness").eq("status", "pending");
    } else {
      const keep = this.approvals.filter(
        (a) => !(a.entityId === sicknessId && a.type === "sickness" && a.status === "pending")
      );
      this.approvals.length = 0;
      this.approvals.push(...keep);
    }
    const at = new Date().toISOString();
    const approval = {
      id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      entityId: sickness.id,
      type: "sickness",
      requestedBy: sickness.userId,
      status: "pending",
      at
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
    const requester = await this.getUser(sickness.userId);
    await this.notifyApproversOfRequest(
      requester,
      "Comunicazione malattia aggiornata",
      `${requester.fullName}: ${sickness.fromDate} – ${sickness.toDate}`,
      "sickness_request",
      `/workflow/approvals?approvalId=${encodeURIComponent(approval.id)}`
    );
    return sickness;
  }

  async approveSickness(id: string, approverId: string, approvalRowId?: string): Promise<SicknessEvent> {
    const sickness = await this.getSickness(id);
    if (!sickness) throw new NotFoundException("Evento malattia non trovato");
    sickness.status = "approved";
    const at = new Date().toISOString();
    if (this.useDb) {
      await this.supabase!.from("sickness_events").update({ status: "approved" }).eq("id", id);
      const { error } = approvalRowId
        ? await this.supabase!.from("approvals").update({ status: "approved", approverId, at }).eq("id", approvalRowId)
        : await this.supabase!
            .from("approvals")
            .update({ status: "approved", approverId, at })
            .eq("entityId", id)
            .eq("type", "sickness")
            .eq("status", "pending");
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento approvazione malattia fallito: ${error.message}`);
      }
    } else {
      const row = this.approvals.find(
        (a) =>
          a.entityId === id &&
          a.type === "sickness" &&
          a.status === "pending" &&
          (approvalRowId ? a.id === approvalRowId : true)
      );
      if (row) {
        row.status = "approved";
        row.approverId = approverId;
        row.at = at;
      }
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: sickness.userId,
      title: "Certificato malattia approvato",
      body: `${sickness.fromDate} – ${sickness.toDate}`,
      read: false,
      createdAt: new Date().toISOString(),
      kind: "sickness_approved"
    });
    return sickness;
  }

  async rejectSickness(id: string, approverId: string, approvalRowId?: string, rejectReason?: string): Promise<SicknessEvent> {
    const sickness = await this.getSickness(id);
    sickness.status = "rejected";
    const at = new Date().toISOString();
    const reasonPayload = { status: "rejected" as const, approverId, at, rejectReason: rejectReason?.trim() || null };
    if (this.useDb) {
      await this.supabase!.from("sickness_events").update({ status: "rejected" }).eq("id", id);
      const { error } = approvalRowId
        ? await this.supabase!.from("approvals").update(reasonPayload).eq("id", approvalRowId)
        : await this.supabase!
            .from("approvals")
            .update(reasonPayload)
            .eq("entityId", id)
            .eq("type", "sickness")
            .eq("status", "pending");
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento rifiuto malattia fallito: ${error.message}`);
      }
    } else {
      const row = this.approvals.find(
        (a) =>
          a.entityId === id &&
          a.type === "sickness" &&
          a.status === "pending" &&
          (approvalRowId ? a.id === approvalRowId : true)
      );
      if (row) {
        row.status = "rejected";
        row.approverId = approverId;
        row.at = at;
        row.rejectReason = rejectReason?.trim() || null;
      }
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: sickness.userId,
      title: "Certificato malattia rifiutato",
      body: `${sickness.fromDate} – ${sickness.toDate}${rejectReason?.trim() ? ` — ${rejectReason.trim()}` : ""}`,
      read: false,
      createdAt: new Date().toISOString(),
      kind: "sickness_rejected"
    });
    return sickness;
  }

  async listSickness(userId: string): Promise<SicknessEvent[]> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("sickness_events").select("*").eq("userId", userId);
      return (data as SicknessEvent[]) ?? [];
    }
    return this.sicknessEvents.filter((item) => item.userId === userId);
  }

  async getSickness(id: string): Promise<SicknessEvent> {
    let sickness: SicknessEvent | undefined;
    if (this.useDb) {
      const { data } = await this.supabase!.from("sickness_events").select("*").eq("id", id).single();
      sickness = (data as SicknessEvent) ?? undefined;
    } else {
      sickness = this.sicknessEvents.find((item) => item.id === id);
    }
    if (!sickness) throw new NotFoundException("Evento malattia non trovato");
    return sickness;
  }

  async getOrgChart(filters?: { costCenterId?: string; role?: string }): Promise<unknown> {
    let users = await this.listUsers();
    if (filters?.costCenterId) {
      users = users.filter((u) => u.costCenterId === filters.costCenterId);
    }
    if (filters?.role) {
      users = users.filter((u) => u.role === filters.role);
    }
    const idSet = new Set(users.map((u) => u.id));
    const [roles, centers] = await Promise.all([this.listRoles(), this.listCostCenters()]);
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const ccById = new Map(centers.map((c) => [c.id, c]));
    return {
      nodes: users.map((user) => ({
        id: user.id,
        label: user.fullName,
        role: user.role,
        roleName: user.roleId ? (roleById.get(user.roleId)?.name ?? user.role) : user.role,
        costCenterId: user.costCenterId,
        costCenterName: user.costCenterId ? ccById.get(user.costCenterId)?.name : undefined,
        email: user.email,
        managerId: user.managerId ?? undefined
      })),
      edges: users
        .filter((user) => user.managerId && idSet.has(user.managerId!))
        .map((user) => ({ from: user.managerId!, to: user.id }))
    };
  }

  /** Struttura CDC → team → gerarchia manageriale (stesso permesso lettura dell’organigramma classico). */
  async getOrgStructure(): Promise<{
    costCenters: Array<{
      id: string;
      code: string;
      name: string;
      description?: string;
      teams: Array<{
        id: string;
        name: string;
        leadUserId?: string | null;
        tree: OrgStructureTreeNode[];
      }>;
      unteamedTree: OrgStructureTreeNode[];
    }>;
  }> {
    const [centers, allUsers, roles] = await Promise.all([this.listCostCenters(), this.listUsers(), this.listRoles()]);
    const roleById = new Map(roles.map((r) => [r.id, r] as const));
    const costCenters = [];
    const sortedCcs = [...centers].sort((a, b) => a.name.localeCompare(b.name, "it"));
    for (const cc of sortedCcs) {
      const teams = await this.listWorkTeamsByCostCenter(cc.id);
      const ccUsers = allUsers.filter((u) => u.costCenterId === cc.id);
      const teamIdSet = new Set(teams.map((t) => t.id));
      const teamPayloads = [];
      const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name, "it"));
      for (const team of sortedTeams) {
        const inTeam = ccUsers.filter((u) => u.teamId === team.id || u.id === team.leadUserId);
        const unique = [...new Map(inTeam.map((u) => [u.id, u])).values()];
        teamPayloads.push({
          id: team.id,
          name: team.name,
          leadUserId: team.leadUserId ?? null,
          tree: buildOrgStructureManagerTree(unique, roleById, team.leadUserId)
        });
      }
      const unteamedUsers = ccUsers.filter((u) => {
        const tid = u.teamId?.trim();
        return !tid || !teamIdSet.has(tid);
      });
      const unteamedUnique = [...new Map(unteamedUsers.map((u) => [u.id, u])).values()];
      costCenters.push({
        id: cc.id,
        code: cc.code,
        name: cc.name,
        description: cc.description,
        teams: teamPayloads,
        unteamedTree: buildOrgStructureManagerTree(unteamedUnique, roleById, null)
      });
    }
    return { costCenters };
  }

  async addDelegation(
    managerId: string,
    delegateManagerId: string,
    from: string,
    to: string
  ): Promise<Delegation> {
    const delegation = { managerId, delegateManagerId, from, to };
    if (this.useDb) {
      await this.supabase!.from("delegations").insert(delegation);
    } else {
      this.delegations.push(delegation);
    }
    return delegation;
  }

  async getApproverChainForUser(userId: string): Promise<string[]> {
    const users = await this.listUsers();
    const chain: string[] = [];
    let current = users.find((item) => item.id === userId);
    while (current?.managerId) {
      const effectiveManager = await this.getEffectiveManager(current.managerId);
      chain.push(effectiveManager);
      current = users.find((item) => item.id === current?.managerId);
    }
    return chain;
  }

  private async getEffectiveManager(managerId: string): Promise<string> {
    const now = new Date().toISOString().slice(0, 10);
    const delegations = this.useDb
      ? (((await this.supabase!.from("delegations").select("*").eq("managerId", managerId)).data ??
          []) as Delegation[])
      : this.delegations;
    const delegation = delegations.find(
      (item) => item.managerId === managerId && now >= item.from && now <= item.to
    );
    return delegation?.delegateManagerId ?? managerId;
  }

  /** Notifica il responsabile diretto (effettivo con deleghe) e tutti gli utenti con ruolo admin. */
  private async notifyApproversOfRequest(
    requester: User,
    title: string,
    body: string,
    kind: string,
    actionPath?: string
  ): Promise<void> {
    const createdAt = new Date().toISOString();
    const recipientIds = new Set<string>();
    if (requester.managerId?.trim()) {
      const managerUserId = await this.getEffectiveManager(requester.managerId);
      recipientIds.add(managerUserId);
    }
    for (const u of await this.listUsers()) {
      if (u.role === "superuser") {
        recipientIds.add(u.id);
      }
    }
    let n = 0;
    for (const userId of recipientIds) {
      await this.insertUserNotification({
        id: `n-${Date.now()}-${n++}-${Math.random().toString(36).slice(2, 10)}`,
        userId,
        title,
        body,
        read: false,
        createdAt,
        kind,
        actionPath
      });
    }
  }

  private ageFromBirthDate(birthDate?: string): number {
    if (!birthDate) return 30;
    const b = new Date(`${birthDate}T12:00:00.000Z`);
    if (Number.isNaN(b.getTime())) return 30;
    const now = new Date();
    let age = now.getUTCFullYear() - b.getUTCFullYear();
    const md = now.getUTCMonth() - b.getUTCMonth();
    if (md < 0 || (md === 0 && now.getUTCDate() < b.getUTCDate())) {
      age -= 1;
    }
    return Math.max(18, Math.min(75, age));
  }

  private italianPayrollProfileForUser(
    user: User,
    costCenter: CostCenter | null | undefined
  ): ItalianPayrollProfileEmployer {
    const su = user.payrollItSector?.trim();
    const sc = costCenter?.payrollItSector?.trim();
    const sectorRaw = su && su.length > 0 ? su : sc && sc.length > 0 ? sc : undefined;
    return {
      sector: sectorRaw != null ? (sectorRaw as PayrollItSector) : null,
      employerInpsPercent: user.payrollEmployerInpsPercent ?? null,
      inailPermille: user.payrollInailPermille ?? costCenter?.payrollDefaultInailPermille ?? null,
      tfrDivisor: user.payrollTfrDivisor ?? null
    };
  }

  private italianEmployerRatesForUser(user: User, costCenter: CostCenter | null | undefined) {
    return employerRatesFromItalianProfile(
      this.italianPayrollProfileForUser(user, costCenter),
      defaultItalianRuleSet2026
    );
  }

  /** Giurisdizione effettiva per motori payroll e budget (CH ignorato se feature disattivata). */
  private effectivePayrollJurisdiction(user: Pick<User, "jurisdiction">): "IT" | "CH" {
    if (!isSwissPayrollFeatureEnabled()) {
      return "IT";
    }
    return user.jurisdiction === "IT" ? "IT" : "CH";
  }

  private async buildItalianPayrollInputForUser(user: User, period: string): Promise<ItalianPayrollInput> {
    const grossMonthlySalary =
      user.baseSalaryMonthly != null && Number(user.baseSalaryMonthly) > 0
        ? Number(user.baseSalaryMonthly)
        : 5800;
    const overtimeAmount = await this.countMonthlyOvertimeAmount(user.id, period, grossMonthlySalary);
    const vacationDaysUsed = await this.countAnnualLeaveDaysInPeriod(user.id, period);
    const sicknessDays = await this.countSicknessDays(user.id, period);
    const smartworkingDays = await this.countSmartworkingDays(user.id, period);
    const year = Number(period.slice(0, 4));
    const balance = await this.getLeaveBalance(user.id, year);
    const costCenter =
      user.costCenterId != null ? await this.getCostCenterById(user.costCenterId) : null;
    const employerIt = this.italianEmployerRatesForUser(user, costCenter ?? undefined);
    const domicile =
      user.taxDomicileSameAsResidence === false && user.taxDomicileMunicipalityIt?.trim()
        ? user.taxDomicileMunicipalityIt.trim()
        : user.taxMunicipalityIt?.trim() || user.taxMunicipality?.trim() || "Roma";
    const payMonths = this.coercePayMonthsPerYear(user.payMonthsPerYear);
    return {
      period,
      grossMonthlySalary,
      weeklyContractHours: this.normalizeWeeklyContractHours(user.weeklyContractHours),
      age: this.ageFromBirthDate(user.birthDate),
      vacationDaysUsed,
      sicknessDays,
      smartworkingDays,
      overtimeAmount,
      taxProfile: {
        regionCode: user.taxRegion?.trim() || "LAZ",
        municipality: domicile
      },
      vacationResidualDays: balance.residualDays,
      employerContributions: {
        employerInpsRate: employerIt.employerInpsRate,
        inailRate: employerIt.inailRate,
        tfrDivisor: employerIt.tfrDivisor
      },
      payMonthsPerYear: payMonths,
      grossAnnualSalary:
        user.annualGrossSalary != null && Number(user.annualGrossSalary) > 0
          ? Number(user.annualGrossSalary)
          : undefined,
      contractFixedTerm: user.contractFixedTerm === true,
      fixedSupplementMonthly:
        user.fixedSupplementMonthly != null ? Number(user.fixedSupplementMonthly) : undefined,
      garnishmentMonthly:
        user.garnishmentMonthlyEstimate != null
          ? Math.max(0, Number(user.garnishmentMonthlyEstimate))
          : undefined
    };
  }

  /** Simulazione motore IT (senza persistenza cedolino). */
  async simulateItalianPayrollForUser(
    userId: string,
    period: string,
    overrides?: Partial<ItalianPayrollInput>
  ): Promise<ReturnType<typeof calculateItalianPayroll>> {
    const user = await this.getUser(userId);
    const base = await this.buildItalianPayrollInputForUser(user, period);
    return calculateItalianPayroll({ ...base, ...overrides });
  }

  /** Righe informative da anagrafica dipendente (importo 0), incluse nel cedolino/PDF. */
  private payslipAnagraficaLines(user: User): Payslip["lines"] {
    const out: Payslip["lines"] = [];
    const add = (code: string, description: string): void => {
      out.push({ code, description: description.slice(0, 200), amount: 0 });
    };
    if (user.hireDate?.trim()) {
      add("HIRE", `Data assunzione: ${user.hireDate.trim()}`);
    }
    if (user.contractType?.trim()) {
      add("CTR", `Tipo contratto: ${user.contractType.trim()}`);
    }
    if (user.weeklyContractHours != null && user.weeklyContractHours > 0) {
      add("HRS", `Ore contrattuali settimanali: ${user.weeklyContractHours}`);
    }
    if (user.birthDate?.trim()) {
      add("BIRTH", `Data di nascita: ${user.birthDate.trim()}`);
    }
    if (user.jurisdiction) {
      add("JUR", `Profilo payroll: ${user.jurisdiction}`);
    }
    if (user.taxRegion?.trim() || user.taxMunicipalityIt?.trim()) {
      add(
        "TAXIT",
        `Fisco IT: regione ${user.taxRegion?.trim() ?? "—"} · comune ${user.taxMunicipalityIt?.trim() ?? user.taxMunicipality?.trim() ?? "—"}`
      );
    }
    if (user.taxDomicileSameAsResidence === false && user.taxDomicileMunicipalityIt?.trim()) {
      add("DOM", `Domicilio fiscale: ${user.taxDomicileMunicipalityIt.trim()}`);
    }
    if (user.fiscalCode?.trim()) {
      add("CF", `Codice fiscale: ${user.fiscalCode.trim().slice(0, 20)}`);
    }
    if (user.annualGrossSalary != null && Number(user.annualGrossSalary) > 0) {
      add("RAL", `RAL annua indicativa: ${user.annualGrossSalary} € / ${user.payMonthsPerYear ?? 13} mens.`);
    }
    if (user.maritalStatus?.trim()) {
      add("CIV", `Stato civile: ${user.maritalStatus.trim()}`);
    }
    if ((user.dependentsChildren ?? 0) > 0) {
      add("FIG", `Figli a carico: ${user.dependentsChildren}`);
    }
    if (user.dependentSpouse) {
      add("SPO", "Coniuge a carico: sì");
    }
    if (user.legalCategory?.trim()) {
      add("CAT", `Categoria: ${user.legalCategory.trim()}`);
    }
    if (user.ccnlCode?.trim()) {
      add("CCNL", `CCNL: ${user.ccnlCode.trim().slice(0, 80)}`);
    }
    if (user.taxCanton?.trim()) {
      add(
        "TAXCH",
        `Fisco CH: ${user.taxCanton.trim()} · ${user.taxMunicipality?.trim() ?? ""}`.trim()
      );
    }
    if (user.payrollItSector?.trim()) {
      add("SECT", `Settore IVS (INPS): ${user.payrollItSector.trim()}`);
    }
    if (user.payrollEmployerInpsPercent != null) {
      add("INPSP", `IVS datore %: ${user.payrollEmployerInpsPercent}`);
    }
    if (user.payrollInailPermille != null) {
      add("INAIL", `Premio INAIL ‰: ${user.payrollInailPermille}`);
    }
    if (user.payrollTfrDivisor != null) {
      add("TFRD", `Divisore accantonamento TFR: ${user.payrollTfrDivisor}`);
    }
    if (user.payrollAtecoCode?.trim()) {
      add("ATECO", `Codice ATECO: ${user.payrollAtecoCode.trim()}`);
    }
    if (user.payrollInailRiskDescription?.trim()) {
      add("RISK", `Rischio / mansione INAIL: ${user.payrollInailRiskDescription.trim()}`);
    }
    if (user.iban?.trim()) {
      const clean = user.iban.replace(/\s+/g, "");
      const holder = user.accountHolder?.trim() || user.fullName;
      add("IBAN", `IBAN: ${clean.slice(0, 4)}…${clean.slice(-4)} (${holder})`);
    }
    if (user.bankName?.trim()) {
      add("BANK", `Istituto di credito: ${user.bankName.trim()}`);
    }
    if (user.avsNumber?.trim()) {
      add("AVS", `Numero AVS / identificativo: ${user.avsNumber.trim()}`);
    }
    if (user.phone?.trim()) {
      add("TEL", `Telefono: ${user.phone.trim()}`);
    }
    if (user.address?.trim()) {
      add("ADDR", `Indirizzo: ${user.address.trim().slice(0, 120)}`);
    }
    return out;
  }

  async generatePayslip(userId: string, period: string): Promise<Payslip> {
    const user = await this.getUser(userId);
    const grossMonthlySalary =
      user.baseSalaryMonthly != null && Number(user.baseSalaryMonthly) > 0
        ? Number(user.baseSalaryMonthly)
        : 5800;
    const overtimeAmount = await this.countMonthlyOvertimeAmount(userId, period, grossMonthlySalary);
    const vacationDaysUsed = await this.countAnnualLeaveDaysInPeriod(userId, period);
    const sicknessDays = await this.countSicknessDays(userId, period);
    const smartworkingDays = await this.countSmartworkingDays(userId, period);
    const claims = await this.listApprovedExpenseClaimsForPayslip(userId, period);
    const reimbursement =
      Math.round(claims.reduce((s, c) => s + c.amountCents, 0)) / 100;
    const jurisdiction = this.effectivePayrollJurisdiction(user);
    let result: { lines: Payslip["lines"]; grossAdjusted: number; netSalary: number };
    if (jurisdiction === "IT") {
      const input = await this.buildItalianPayrollInputForUser(user, period);
      result = calculateItalianPayroll(input);
    } else {
      const canton = (user.taxCanton?.trim() || "TI").toUpperCase();
      const municipality = user.taxMunicipality?.trim() || "Lugano";
      result = calculateSwissPayroll({
        period,
        grossMonthlySalary,
        age: this.ageFromBirthDate(user.birthDate),
        vacationDaysUsed,
        sicknessDays,
        smartworkingDays,
        overtimeAmount,
        taxProfile: {
          canton,
          municipality,
          permitType: "B" as const,
          companyType: "commerciale",
          companySite: `${canton}-SITE`
        }
      });
    }
    const extraLines = claims.map((c) => ({
      code: "RMB",
      description: `Rimborso spese: ${c.description}`.slice(0, 160),
      amount: Math.round(c.amountCents) / 100
    }));
    const lines = [...result.lines, ...this.payslipAnagraficaLines(user), ...extraLines];
    const netSalary = Math.round((result.netSalary + reimbursement) * 100) / 100;
    const payslip: Payslip = {
      id: `ps-${Date.now()}`,
      userId,
      period,
      grossSalary: result.grossAdjusted,
      netSalary,
      lines,
      pdfUrl: `/api/payroll/${userId}/${period}/pdf`
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("payslips").insert({
        id: payslip.id,
        userId: payslip.userId,
        period: payslip.period,
        grossSalary: payslip.grossSalary,
        netSalary: payslip.netSalary,
        lines: payslip.lines,
        pdfUrl: payslip.pdfUrl
      });
      if (error) {
        throw new InternalServerErrorException(`Salvataggio cedolino fallito: ${error.message}`);
      }
      await this.markExpenseClaimsPaidAfterPayslip(claims.map((c) => c.id), period, payslip.id);
    } else {
      this.payslips.push(payslip);
      for (const c of claims) {
        const row = this.expenseClaims.find((e) => e.id === c.id);
        if (row) {
          row.status = "paid";
          row.payslipPeriod = period;
          row.appliedPayslipId = payslip.id;
        }
      }
    }
    return payslip;
  }

  simulateHirePayroll(input: {
    grossMonthlySalary: number;
    period?: string;
    canton?: string;
    municipality?: string;
    age?: number;
    jurisdiction?: "CH" | "IT";
    taxRegion?: string;
    taxMunicipalityIt?: string;
    weeklyContractHours?: number;
  }): ReturnType<typeof calculateSwissPayroll> | ReturnType<typeof calculateItalianPayroll> {
    const period = input.period?.trim() || new Date().toISOString().slice(0, 7);
    const j =
      !isSwissPayrollFeatureEnabled() || input.jurisdiction === "IT" ? "IT" : "CH";
    if (j === "IT") {
      return calculateItalianPayroll({
        period,
        grossMonthlySalary: input.grossMonthlySalary,
        weeklyContractHours: input.weeklyContractHours ?? 40,
        age: input.age ?? 30,
        vacationDaysUsed: 0,
        sicknessDays: 0,
        smartworkingDays: 0,
        overtimeAmount: 0,
        taxProfile: {
          regionCode: input.taxRegion?.trim() || "LAZ",
          municipality: input.taxMunicipalityIt?.trim() || input.municipality?.trim() || "Roma"
        },
        vacationResidualDays: undefined
      });
    }
    const canton = (input.canton?.trim() || "TI").toUpperCase();
    const municipality = input.municipality?.trim() || "Lugano";
    return calculateSwissPayroll({
      period,
      grossMonthlySalary: input.grossMonthlySalary,
      age: input.age ?? 30,
      vacationDaysUsed: 0,
      sicknessDays: 0,
      smartworkingDays: 0,
      overtimeAmount: 0,
      taxProfile: {
        canton,
        municipality,
        permitType: "B",
        companyType: "commerciale",
        companySite: `${canton}-SITE`
      }
    });
  }

  async getPayslipForPeriod(userId: string, period: string): Promise<Payslip | undefined> {
    const all = await this.listPayslips(userId, userId);
    return all.find((item) => item.period === period);
  }

  /** Lettura cedolino lato service (es. budget HR) senza vincolo requester. */
  private async getPayslipForUserPeriodInternal(
    userId: string,
    period: string
  ): Promise<Payslip | undefined> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("payslips").select("*").eq("userId", userId);
      const rows = (data as Payslip[]) ?? [];
      return rows.find((item) => item.period === period);
    }
    return this.payslips.find((item) => item.userId === userId && item.period === period);
  }

  async listPayslips(requesterId: string, targetUserId?: string): Promise<Payslip[]> {
    const target = targetUserId ?? requesterId;
    if (this.useDb) {
      const { data } = await this.supabase!.from("payslips").select("*").eq("userId", target);
      return (data as Payslip[]) ?? [];
    }
    return this.payslips.filter((item) => item.userId === target);
  }

  async listPayslipsWithNewFlag(requesterId: string, targetUserId?: string): Promise<Array<Payslip & { isNew: boolean }>> {
    const rows = await this.listPayslips(requesterId, targetUserId);
    const target = targetUserId ?? requesterId;
    if (!this.useDb) {
      return rows.map((p) => ({ ...p, isNew: false }));
    }
    const { data: reads } = await this.supabase!
      .from("payslip_reads")
      .select("payslipId")
      .eq("userId", target);
    const readSet = new Set((reads ?? []).map((r: { payslipId: string }) => r.payslipId));
    return rows.map((p) => ({ ...p, isNew: !readSet.has(p.id) }));
  }

  async markPayslipRead(userId: string, payslipId: string): Promise<void> {
    if (!this.useDb) {
      return;
    }
    const now = new Date().toISOString();
    const { error } = await this.supabase!.from("payslip_reads").insert({ userId, payslipId, readAt: now });
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async listApprovalsForUser(
    requesterId: string,
    status?: "pending" | "approved" | "rejected"
  ): Promise<ApprovalView[]> {
    const requester = await this.getUser(requesterId);
    const visibleUserIds = await this.listManagedMemberIdsForApprover(requesterId);
    const allApprovals = this.useDb
      ? (((await this.supabase!.from("approvals").select("*")).data ?? []) as ApprovalRecord[])
      : this.approvals;
    let approvals = allApprovals
      .filter((item) => requester.role === "superuser" || visibleUserIds.has(item.requestedBy))
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => b.at.localeCompare(a.at));

    const leavesById = new Map<string, LeavePlan>();
    const sicknessById = new Map<string, SicknessEvent>();
    const swById = new Map<string, SmartworkingRequestRow>();
    const travelById = new Map<string, TravelRequestRow>();

    if (this.useDb) {
      const leaveIds = approvals.filter((item) => item.type === "leave").map((item) => item.entityId);
      const sicknessIds = approvals.filter((item) => item.type === "sickness").map((item) => item.entityId);
      const swIds = approvals.filter((item) => item.type === "smartworking").map((item) => item.entityId);
      const travelIds = approvals.filter((item) => item.type === "travel").map((item) => item.entityId);

      if (leaveIds.length > 0) {
        const { data } = await this.supabase!.from("leave_plans").select("*").in("id", leaveIds);
        for (const row of (data ?? []) as LeavePlan[]) {
          leavesById.set(row.id, row);
        }
      }

      if (sicknessIds.length > 0) {
        const { data } = await this.supabase!.from("sickness_events").select("*").in("id", sicknessIds);
        for (const row of (data ?? []) as SicknessEvent[]) {
          sicknessById.set(row.id, row);
        }
      }

      if (swIds.length > 0) {
        const { data } = await this.supabase!.from("smartworking_requests").select("*").in("id", swIds);
        for (const row of (data ?? []) as SmartworkingRequestRow[]) {
          swById.set(row.id, row);
        }
      }

      if (travelIds.length > 0) {
        const { data } = await this.supabase!.from("travel_requests").select("*").in("id", travelIds);
        for (const row of (data ?? []) as TravelRequestRow[]) {
          travelById.set(row.id, row);
        }
      }
    } else {
      for (const leave of this.leavePlans) {
        leavesById.set(leave.id, leave);
      }
      for (const sickness of this.sicknessEvents) {
        sicknessById.set(sickness.id, sickness);
      }
      const needSw = new Set(approvals.filter((a) => a.type === "smartworking").map((a) => a.entityId));
      for (const r of this.smartworkingRequests) {
        if (needSw.has(r.id)) {
          swById.set(r.id, r);
        }
      }
      const needTr = new Set(approvals.filter((a) => a.type === "travel").map((a) => a.entityId));
      for (const r of this.travelRequests) {
        if (needTr.has(r.id)) {
          travelById.set(r.id, r);
        }
      }
    }

    approvals = approvals.filter((item) => {
      if (item.status !== "pending") {
        return true;
      }
      if (item.type === "leave") {
        const leave = leavesById.get(item.entityId);
        return leave?.status === "pending";
      }
      if (item.type === "sickness") {
        const sickness = sicknessById.get(item.entityId);
        return sickness?.status === "pending";
      }
      if (item.type === "travel") {
        const tr = travelById.get(item.entityId);
        return tr?.status === "pending";
      }
      const sw = swById.get(item.entityId);
      return sw?.status === "pending";
    });

    const users = await this.listUsers();
    const usersById = new Map(users.map((user) => [user.id, user]));
    const photoCache = new Map<string, string | null>();
    const loadPhoto = async (uid: string): Promise<string | null> => {
      if (photoCache.has(uid)) {
        return photoCache.get(uid)!;
      }
      try {
        const url = await this.getEmployeeProfilePhotoSignedUrl(requesterId, requester.role, uid);
        photoCache.set(uid, url);
        return url;
      } catch {
        photoCache.set(uid, null);
        return null;
      }
    };

    const out: ApprovalView[] = [];
    for (const item of approvals) {
      const user = usersById.get(item.requestedBy);
      const leave = item.type === "leave" ? leavesById.get(item.entityId) : undefined;
      const sickness = item.type === "sickness" ? sicknessById.get(item.entityId) : undefined;
      const sw = item.type === "smartworking" ? swById.get(item.entityId) : undefined;
      const tr = item.type === "travel" ? travelById.get(item.entityId) : undefined;
      const requesterPhotoUrl = await loadPhoto(item.requestedBy);

      let leaveKind: "annual" | "rol" | undefined;
      let residualAnnualLeaveDays: number | undefined;
      let requestedCalendarDays: number | undefined;
      let smartworkingWeekUsed: number | undefined;
      let smartworkingWeekQuota: number | undefined;
      let smartworkingMonthUsed: number | undefined;
      let smartworkingMonthQuota: number | undefined;
      let note: string | null | undefined;

      if (leave) {
        leaveKind = (leave.kind ?? "annual") === "rol" ? "rol" : "annual";
        try {
          requestedCalendarDays = this.countCalendarDays(leave.startDate, leave.endDate);
        } catch {
          requestedCalendarDays = undefined;
        }
        if (leaveKind === "annual") {
          const year = Number(leave.startDate.slice(0, 4));
          const bal = await this.getLeaveBalance(leave.userId, year);
          residualAnnualLeaveDays = bal.residualDays;
        }
      } else if (sickness) {
        try {
          requestedCalendarDays = this.countCalendarDays(sickness.fromDate, sickness.toDate);
        } catch {
          requestedCalendarDays = undefined;
        }
      } else if (sw) {
        requestedCalendarDays = 1;
        note = sw.note ?? null;
        smartworkingWeekQuota = SMARTWORKING_WEEKLY_QUOTA;
        smartworkingWeekUsed = await this.countSmartworkingBookedDaysInWeek(sw.userId, sw.day);
        smartworkingMonthQuota = SMARTWORKING_MONTHLY_QUOTA;
        smartworkingMonthUsed = await this.countNonRejectedSmartworkingDaysInMonth(
          sw.userId,
          sw.day.slice(0, 7)
        );
      } else if (tr) {
        requestedCalendarDays = 1;
        note = tr.note ?? null;
      }

      out.push({
        id: item.id,
        entityId: item.entityId,
        type: item.type,
        requestedBy: item.requestedBy,
        approverId: item.approverId,
        status: item.status,
        at: item.at,
        requesterName: user?.fullName,
        requesterPhotoUrl,
        startDate: leave?.startDate ?? sickness?.fromDate ?? sw?.day ?? tr?.day,
        endDate: leave?.endDate ?? sickness?.toDate ?? sw?.day ?? tr?.day,
        leaveKind,
        residualAnnualLeaveDays,
        requestedCalendarDays,
        smartworkingWeekUsed,
        smartworkingWeekQuota,
        smartworkingMonthUsed,
        smartworkingMonthQuota,
        note
      });
    }
    return out;
  }

  async approveByApprovalId(approvalId: string, approverId: string): Promise<ApprovalView> {
    const approvals = await this.listApprovalsForUser(approverId);
    const approval = approvals.find((item) => item.id === approvalId);
    if (!approval) {
      throw new NotFoundException("Autorizzazione non trovata");
    }
    if (approval.type === "smartworking") {
      await this.decideSmartworkingRequest(approval.entityId, approverId, true);
      return {
        ...approval,
        status: "approved",
        approverId,
        at: new Date().toISOString()
      };
    }
    if (approval.type === "travel") {
      await this.decideTravelRequest(approval.entityId, approverId, true);
      return {
        ...approval,
        status: "approved",
        approverId,
        at: new Date().toISOString()
      };
    }
    if (approval.type === "leave") {
      await this.approveLeave(approval.entityId, approverId, approval.id);
    } else {
      await this.approveSickness(approval.entityId, approverId, approval.id);
    }
    return {
      ...approval,
      status: "approved",
      approverId,
      at: new Date().toISOString()
    };
  }

  async rejectByApprovalId(approvalId: string, approverId: string, rejectReason?: string): Promise<ApprovalView> {
    const approvals = await this.listApprovalsForUser(approverId);
    const approval = approvals.find((item) => item.id === approvalId);
    if (!approval) {
      throw new NotFoundException("Autorizzazione non trovata");
    }
    if (approval.type === "smartworking") {
      await this.decideSmartworkingRequest(approval.entityId, approverId, false, rejectReason);
      return {
        ...approval,
        status: "rejected",
        approverId,
        at: new Date().toISOString()
      };
    }
    if (approval.type === "travel") {
      await this.decideTravelRequest(approval.entityId, approverId, false, rejectReason);
      return {
        ...approval,
        status: "rejected",
        approverId,
        at: new Date().toISOString()
      };
    }
    if (approval.type === "leave") {
      await this.rejectLeave(approval.entityId, approverId, approval.id, rejectReason);
    } else {
      await this.rejectSickness(approval.entityId, approverId, approval.id, rejectReason);
    }
    return {
      ...approval,
      status: "rejected",
      approverId,
      at: new Date().toISOString()
    };
  }

  private countCalendarDays(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
    if (end < start) {
      throw new BadRequestException("Intervallo date non valido");
    }
    return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }

  /** Oggi come YYYY-MM-DD (Europe/Rome), coerente con il calendario lavoro in UI. */
  private calendarDateTodayIsoRome(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  }

  async getLeaveBalance(userId: string, year: number): Promise<LeaveBalance> {
    const user = await this.getUser(userId);
    const allocatedDays = user.vacationAllowanceDays ?? 22;
    const leaves = await this.listLeave(userId);
    const usedDays = leaves
      .filter((item) => item.status === "approved" || item.status === "pending")
      .filter((item) => (item.kind ?? "annual") === "annual")
      .filter((item) => Number(item.startDate.slice(0, 4)) === year)
      .reduce((acc, item) => acc + this.countCalendarDays(item.startDate, item.endDate), 0);
    return {
      userId,
      year,
      allocatedDays,
      usedDays,
      residualDays: Math.max(0, allocatedDays - usedDays)
    };
  }

  async setLeaveAllowance(userId: string, allocatedDays: number): Promise<LeaveBalance> {
    if (allocatedDays < 0 || allocatedDays > 120) {
      throw new BadRequestException("Valore ferie standard non valido");
    }
    await this.updateUser(userId, { vacationAllowanceDays: allocatedDays });
    return this.getLeaveBalance(userId, new Date().getUTCFullYear());
  }

  private countLeaveDaysOverlappingMonth(startDate: string, endDate: string, monthPrefix: string): number {
    const startMs = new Date(`${startDate}T12:00:00.000Z`).getTime();
    const endMs = new Date(`${endDate}T12:00:00.000Z`).getTime();
    let n = 0;
    for (let t = startMs; t <= endMs; t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      if (d.startsWith(monthPrefix)) {
        n += 1;
      }
    }
    return n;
  }

  private async countAnnualLeaveDaysInPeriod(userId: string, period: string): Promise<number> {
    const monthPrefix = period.slice(0, 7);
    const leaves = await this.listLeave(userId);
    let days = 0;
    for (const item of leaves) {
      if (item.status !== "approved") {
        continue;
      }
      if ((item.kind ?? "annual") !== "annual") {
        continue;
      }
      days += this.countLeaveDaysOverlappingMonth(item.startDate, item.endDate, monthPrefix);
    }
    return days;
  }

  private async countSicknessDays(userId: string, period: string): Promise<number> {
    const month = period.slice(0, 7);
    const sickness = await this.listSickness(userId);
    return sickness.filter((item) => item.fromDate.startsWith(month))
      .length;
  }

  private async countSmartworkingDays(userId: string, period: string): Promise<number> {
    const month = period.slice(0, 7);
    const summaries = await this.listWorkdaySummary(userId);
    return summaries.filter(
      (item) => item.date.startsWith(month) && item.mode === "smartworking"
    ).length;
  }

  private async countMonthlyOvertimeAmount(
    userId: string,
    period: string,
    grossMonthlySalary: number
  ): Promise<number> {
    const month = period.slice(0, 7);
    const user = await this.getUser(userId);
    const weeklyContractHours = this.normalizeWeeklyContractHours(user.weeklyContractHours);
    const monthlyContractHours = (weeklyContractHours * 52) / 12;
    const hourlyRate = monthlyContractHours > 0 ? grossMonthlySalary / monthlyContractHours : 0;
    const summaries = await this.listWorkdaySummary(userId);
    const targetSeconds = this.resolveDailyTargetSeconds(user);
    const overtimeSeconds = summaries
      .filter((item) => item.date.startsWith(month))
      .reduce((acc, item) => {
        const fallbackOvertime = Math.max(0, (item.workedSeconds ?? item.minutesWorked * 60) - targetSeconds);
        return acc + (item.overtimeSeconds ?? fallbackOvertime);
      }, 0);
    const overtimeHours = overtimeSeconds / 3600;
    return Math.round(overtimeHours * hourlyRate * 100) / 100;
  }

  async insertImportEvent(row: NexaImportEventRow): Promise<void> {
    if (!this.useDb) {
      this.importEventsMemory.unshift(row);
      if (this.importEventsMemory.length > 500) {
        this.importEventsMemory.length = 500;
      }
      return;
    }
    const payload = {
      id: row.id,
      kind: row.kind,
      category: row.category,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      status: row.status,
      row_count: row.rowCount,
      created_count: row.createdCount ?? null,
      error_count: row.errorCount,
      file_size_bytes: row.fileSizeBytes ?? null,
      file_name: row.fileName ?? null,
      errors_snapshot: row.errorsSnapshot ?? null,
      actor_user_id: row.actorUserId ?? null,
      actor_email: row.actorEmail ?? null,
      audit_meta: row.auditMeta ?? {}
    };
    const { error } = await this.supabase!.from("nexa_import_events").insert(payload);
    if (error) {
      // Non bloccare l'import: fallback solo log + memoria dev.
      // eslint-disable-next-line no-console
      console.error("[nexa_import_events]", error.message);
      this.importEventsMemory.unshift(row);
      if (this.importEventsMemory.length > 100) {
        this.importEventsMemory.length = 100;
      }
    }
  }

  async listImportEvents(limit: number): Promise<NexaImportEventRow[]> {
    const cap = Math.min(Math.max(limit, 1), 200);
    if (!this.useDb) {
      return this.importEventsMemory.slice(0, cap);
    }
    if (this.importEventsMemory.length > 0) {
      // Merge recent fallback (es. insert DB fallito) con lettura DB.
      const merged = await this.fetchImportEventsFromDb(cap * 2);
      const seen = new Set(merged.map((x) => x.id));
      for (const m of this.importEventsMemory) {
        if (!seen.has(m.id)) {
          merged.push(m);
          seen.add(m.id);
        }
      }
      merged.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
      return merged.slice(0, cap);
    }
    return this.fetchImportEventsFromDb(cap);
  }

  private async insertUserNotification(row: UserNotification): Promise<void> {
    if (!this.useDb) {
      this.userNotifications.unshift(row);
      if (this.userNotifications.length > 500) {
        this.userNotifications.length = 500;
      }
      return;
    }
    const { error } = await this.supabase!.from("user_notifications").insert({
      id: row.id,
      userId: row.userId,
      title: row.title,
      body: row.body ?? null,
      read: row.read,
      kind: row.kind ?? null,
      createdAt: row.createdAt,
      actionPath: row.actionPath ?? null
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[user_notifications]", error.message);
      this.userNotifications.unshift(row);
    }
  }

  async listUserNotifications(userId: string, limit = 50): Promise<UserNotification[]> {
    const cap = Math.min(Math.max(limit, 1), 200);
    if (!this.useDb) {
      return this.userNotifications.filter((n) => n.userId === userId).slice(0, cap);
    }
    const { data, error } = await this.supabase!
      .from("user_notifications")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(cap);
    if (error) {
      throw new BadRequestException(`Lettura notifiche fallita: ${error.message}`);
    }
    return this.mapNotificationRows(data ?? []);
  }

  async markUserNotificationRead(userId: string, notificationId: string): Promise<UserNotification> {
    if (!this.useDb) {
      const row = this.userNotifications.find((n) => n.id === notificationId && n.userId === userId);
      if (!row) throw new NotFoundException("Notifica non trovata");
      row.read = true;
      return row;
    }
    const { data, error } = await this.supabase!
      .from("user_notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("userId", userId)
      .select("*")
      .single();
    if (error || !data) {
      throw new NotFoundException("Notifica non trovata");
    }
    return this.mapNotificationRows([data])[0];
  }

  private mapNotificationRows(data: Record<string, unknown>[]): UserNotification[] {
    return (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      userId: String(r.userId),
      title: String(r.title),
      body: r.body ? String(r.body) : undefined,
      read: Boolean(r.read),
      createdAt: String(r.createdAt),
      kind: r.kind ? String(r.kind) : undefined,
      actionPath: r.actionPath ? String(r.actionPath) : undefined
    }));
  }

  private inCalendarRange(iso: string, from?: string, to?: string): boolean {
    if (!from && !to) return true;
    const d = iso.slice(0, 10);
    if (from && d < from.slice(0, 10)) return false;
    if (to && d > to.slice(0, 10)) return false;
    return true;
  }

  async getUserCalendar(userId: string, from?: string, to?: string): Promise<CalendarEvent[]> {
    return this.buildCalendarEventsForUser(userId, from, to, false);
  }

  /** Eventi aggregati per più utenti (calendario team HR). Festività una sola volta. */
  async getTeamWorkCalendar(userIds: string[], from?: string, to?: string): Promise<CalendarEvent[]> {
    if (userIds.length === 0) {
      return [];
    }
    const first = await this.getUser(userIds[0]);
    const holidayRows = await this.listCompanyHolidays(first.companyId, from, to);
    const holidayEvents: CalendarEvent[] = [];
    for (const h of holidayRows) {
      if (!this.inCalendarRange(h.day, from, to)) continue;
      holidayEvents.push({
        id: `cal-hol-${h.id}`,
        kind: "holiday",
        title: h.name,
        start: h.day,
        end: h.day,
        meta: { holidayId: h.id }
      });
    }
    const all: CalendarEvent[] = [...holidayEvents];
    for (const uid of userIds) {
      const chunk = await this.buildCalendarEventsForUser(uid, from, to, true);
      for (const ev of chunk) {
        all.push({ ...ev, userId: uid });
      }
    }
    all.sort((a, b) => a.start.localeCompare(b.start));
    return all;
  }

  /** Calendario aggregato per la vista dipendente: peer da work team, estensione per manager o CDC (vedi resolver). */
  async getCostCenterWorkCalendarForRequester(
    requesterId: string,
    from?: string,
    to?: string
  ): Promise<{ users: Array<{ id: string; fullName: string }>; events: CalendarEvent[] }> {
    const me = await this.getUser(requesterId);
    const peers = await this.resolveWorkCalendarPeerUsers(me);
    const ids = peers.map((u) => u.id);
    const events = await this.getTeamWorkCalendar(ids, from, to);
    const users = peers.map((u) => ({ id: u.id, fullName: u.fullName }));
    return { users, events };
  }

  private async buildCalendarEventsForUser(
    userId: string,
    from?: string,
    to?: string,
    skipCompanyHolidays = false
  ): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];
    const user = await this.getUser(userId);
    const leaves = await this.listLeave(userId);
    for (const l of leaves) {
      if (!this.inCalendarRange(l.startDate, from, to) && !this.inCalendarRange(l.endDate, from, to)) {
        continue;
      }
      const isRol = (l.kind ?? "annual") === "rol";
      const leaveSt =
        l.status === "rejected"
          ? "rifiutato"
          : l.status === "pending"
            ? "in attesa"
            : l.status === "approved"
              ? "approvato"
              : l.status;
      events.push({
        id: `cal-leave-${l.id}`,
        kind: isRol ? "rol" : "leave",
        title: isRol ? `Permesso ROL (${leaveSt})` : `Ferie (${leaveSt})`,
        start: l.startDate,
        end: l.endDate,
        meta: { leaveId: l.id, status: l.status, kind: l.kind ?? "annual" }
      });
    }
    const sickness = await this.listSickness(userId);
    for (const s of sickness) {
      if (!this.inCalendarRange(s.fromDate, from, to) && !this.inCalendarRange(s.toDate, from, to)) {
        continue;
      }
      const skSt =
        s.status === "rejected"
          ? "rifiutato"
          : s.status === "pending"
            ? "in attesa"
            : s.status === "approved"
              ? "approvato"
              : s.status;
      events.push({
        id: `cal-sk-${s.id}`,
        kind: "sickness",
        title: `Malattia (${skSt})`,
        start: s.fromDate,
        end: s.toDate,
        meta: { sicknessId: s.id, status: s.status }
      });
    }
    const shifts = await this.listShiftsForUser(userId);
    for (const sh of shifts) {
      const startDay = sh.startAt.slice(0, 10);
      if (!this.inCalendarRange(startDay, from, to)) continue;
      events.push({
        id: `cal-sh-${sh.id}`,
        kind: "shift",
        title: `Turno${sh.premiumCode ? ` (${sh.premiumCode})` : ""}`,
        start: sh.startAt,
        end: sh.endAt,
        meta: { shiftId: sh.id, status: sh.status }
      });
    }
    const summaries = await this.listWorkdaySummariesInRange(userId, from, to);
    const summarySwDays = new Set(
      summaries.filter((ws) => ws.mode === "smartworking").map((ws) => ws.date)
    );
    const officeDaysFromSummary = new Set(
      summaries.filter((ws) => ws.mode === "office").map((ws) => ws.date)
    );
    const swRequests = await this.listMySmartworking(userId);
    const pendingSwDays = new Set(swRequests.filter((r) => r.status === "pending").map((r) => r.day));
    for (const r of swRequests) {
      if (!this.inCalendarRange(r.day, from, to)) continue;
      if (r.status === "rejected") {
        events.push({
          id: `cal-swr-${r.id}`,
          kind: "smartworking",
          title: "Smart working (rifiutato)",
          start: r.day,
          end: r.day,
          meta: {
            swRequestId: r.id,
            status: r.status,
            ...(r.note ? { note: r.note } : {})
          }
        });
        continue;
      }
      if (r.status === "approved" && summarySwDays.has(r.day)) continue;
      if (r.status === "approved" && officeDaysFromSummary.has(r.day.slice(0, 10))) continue;
      const pending = r.status === "pending";
      events.push({
        id: `cal-swr-${r.id}`,
        kind: "smartworking",
        title: pending ? "Smart working (in attesa)" : "Smart working",
        start: r.day,
        end: r.day,
        meta: {
          swRequestId: r.id,
          status: r.status,
          ...(r.note ? { note: r.note } : {})
        }
      });
    }
    for (const ws of summaries) {
      if (ws.mode !== "smartworking") continue;
      if (pendingSwDays.has(ws.date)) continue;
      if (!this.inCalendarRange(ws.date, from, to)) continue;
      events.push({
        id: `cal-sw-${userId}-${ws.date}`,
        kind: "smartworking",
        title: "Smart working",
        start: ws.date,
        end: ws.date,
        meta: { date: ws.date }
      });
    }
    for (const ws of summaries) {
      if (ws.mode !== "office") continue;
      if (!this.inCalendarRange(ws.date, from, to)) continue;
      events.push({
        id: `cal-office-${userId}-${ws.date}`,
        kind: "office",
        title: "Sede",
        start: ws.date,
        end: ws.date,
        meta: { date: ws.date }
      });
    }
    const travelReqs = await this.listMyTravel(userId);
    for (const r of travelReqs) {
      if (!this.inCalendarRange(r.day, from, to)) continue;
      const trSt =
        r.status === "rejected"
          ? "rifiutato"
          : r.status === "pending"
            ? "in attesa"
            : r.status === "approved"
              ? "approvato"
              : r.status;
      if (r.status === "rejected") {
        events.push({
          id: `cal-tr-${r.id}`,
          kind: "travel",
          title: `Trasferta (${trSt})`,
          start: r.day,
          end: r.day,
          meta: {
            travelRequestId: r.id,
            status: r.status,
            ...(r.note ? { note: r.note } : {})
          }
        });
        continue;
      }
      const pendingTr = r.status === "pending";
      events.push({
        id: `cal-tr-${r.id}`,
        kind: "travel",
        title: pendingTr ? "Trasferta (in attesa)" : "Trasferta",
        start: r.day,
        end: r.day,
        meta: {
          travelRequestId: r.id,
          status: r.status,
          ...(r.note ? { note: r.note } : {})
        }
      });
    }
    if (!skipCompanyHolidays) {
      const holidays = await this.listCompanyHolidays(user.companyId, from, to);
      for (const h of holidays) {
        if (!this.inCalendarRange(h.day, from, to)) continue;
        events.push({
          id: `cal-hol-${h.id}-${userId}`,
          kind: "holiday",
          title: h.name,
          start: h.day,
          end: h.day,
          meta: { holidayId: h.id }
        });
      }
    }
    events.sort((a, b) => a.start.localeCompare(b.start));
    return events;
  }

  async uploadEmployeeProfilePhoto(userId: string, buffer: Buffer, mimeType: string): Promise<User> {
    if (!this.supabase) {
      throw new BadRequestException("Storage non configurato");
    }
    const okMime = mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
    if (!okMime) {
      throw new BadRequestException("Formato file non supportato (JPEG, PNG, WebP)");
    }
    if (buffer.length > 2_500_000) {
      throw new BadRequestException("File troppo grande (max ~2,5 MB)");
    }
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await this.supabase.storage.from("employee-photos").upload(path, buffer, {
      contentType: mimeType,
      upsert: true
    });
    if (error) {
      throw new InternalServerErrorException(`Upload foto fallito: ${error.message}`);
    }
    return this.updateUser(userId, { profilePhotoPath: path });
  }

  async getEmployeeProfilePhotoSignedUrl(
    requesterId: string,
    requesterRole: User["role"],
    targetUserId: string
  ): Promise<string | null> {
    if (!this.supabase) {
      return null;
    }
    const target = await this.getUser(targetUserId);
    if (!target.profilePhotoPath?.trim()) {
      return null;
    }
    const isSelf = requesterId === targetUserId;
    const isAdmin = requesterRole === "superuser";
    const isManagerWithHierarchy =
      requesterRole === "user" &&
      ((await this.isManagerOf(requesterId, targetUserId)) ||
        (await this.isUserLeadOfTeamContaining(requesterId, targetUserId)));
    if (!isSelf && !isAdmin && !isManagerWithHierarchy) {
      throw new ForbiddenException("Accesso negato alla foto profilo");
    }
    const { data, error } = await this.supabase.storage
      .from("employee-photos")
      .createSignedUrl(target.profilePhotoPath, 3600);
    if (error || !data?.signedUrl) {
      return null;
    }
    return data.signedUrl;
  }

  async getHrDashboardSummary(): Promise<{
    headcount: number;
    budgetChf: number;
    pendingExpenseCount: number;
  }> {
    const users = await this.listUsers();
    const headcount = users.length;
    const budgetChf =
      Math.round(users.reduce((acc, u) => acc + (u.baseSalaryMonthly != null ? Number(u.baseSalaryMonthly) : 0), 0) * 100) /
      100;
    let pendingExpenseCount = 0;
    if (this.useDb) {
      const { count } = await this.supabase!
        .from("expense_claims")
        .select("*", { count: "exact", head: true })
        .eq("status", "submitted");
      pendingExpenseCount = count ?? 0;
    } else {
      pendingExpenseCount = this.expenseClaims.filter((c) => c.status === "submitted").length;
    }
    return { headcount, budgetChf, pendingExpenseCount };
  }

  private mapExpenseRow(r: Record<string, unknown>): ExpenseClaim {
    return {
      id: String(r.id),
      userId: String(r.userId),
      amountCents: Number(r.amountCents ?? 0),
      currency: String(r.currency),
      description: String(r.description),
      kmDistance: r.kmDistance != null ? Number(r.kmDistance) : undefined,
      status: r.status as ExpenseClaim["status"],
      createdAt: String(r.createdAt),
      payslipPeriod: r.payslipPeriod ? String(r.payslipPeriod) : undefined,
      appliedPayslipId: r.appliedPayslipId ? String(r.appliedPayslipId) : undefined
    };
  }

  private async fetchAllExpenseClaimsForUser(userId: string): Promise<ExpenseClaim[]> {
    if (!this.useDb) {
      return this.expenseClaims.filter((c) => c.userId === userId);
    }
    const { data, error } = await this.supabase!
      .from("expense_claims")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false });
    if (error) {
      throw new BadRequestException(`Lettura note spese fallita: ${error.message}`);
    }
    return (data ?? []).map((row) => this.mapExpenseRow(row as Record<string, unknown>));
  }

  private async listApprovedExpenseClaimsForPayslip(userId: string, period: string): Promise<ExpenseClaim[]> {
    const month = period.slice(0, 7);
    const all = await this.fetchAllExpenseClaimsForUser(userId);
    return all.filter(
      (c) =>
        c.status === "approved" &&
        !c.appliedPayslipId &&
        (!c.payslipPeriod || c.payslipPeriod === period || c.payslipPeriod === month)
    );
  }

  private async markExpenseClaimsPaidAfterPayslip(
    ids: string[],
    period: string,
    payslipId: string
  ): Promise<void> {
    if (ids.length === 0) return;
    if (!this.useDb) return;
    for (const id of ids) {
      const { error } = await this.supabase!
        .from("expense_claims")
        .update({
          status: "paid",
          payslipPeriod: period,
          appliedPayslipId: payslipId
        })
        .eq("id", id);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[expense_claims] pay after payslip", error.message);
      }
    }
  }

  async listExpenseClaimsForRequester(
    requesterId: string,
    requesterRole: User["role"],
    scope: "self" | "team"
  ): Promise<ExpenseClaim[]> {
    let userIds: string[];
    if (scope === "self") {
      userIds = [requesterId];
    } else if (requesterRole === "superuser") {
      const all = await this.listUsers();
      userIds = all.map((u) => u.id);
    } else {
      userIds = [...(await this.listManagedMemberIdsForApprover(requesterId))];
    }
    if (!this.useDb) {
      return this.expenseClaims.filter((c) => userIds.includes(c.userId));
    }
    if (userIds.length === 0) return [];
    const { data, error } = await this.supabase!
      .from("expense_claims")
      .select("*")
      .in("userId", userIds)
      .order("createdAt", { ascending: false });
    if (error) {
      throw new BadRequestException(`Lettura note spese fallita: ${error.message}`);
    }
    return (data ?? []).map((row) => this.mapExpenseRow(row as Record<string, unknown>));
  }

  async createExpenseClaim(
    userId: string,
    input: { amountCents: number; currency: string; description: string; kmDistance?: number }
  ): Promise<ExpenseClaim> {
    const claim: ExpenseClaim = {
      id: `exp-${Date.now()}`,
      userId,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      kmDistance: input.kmDistance,
      status: "submitted",
      createdAt: new Date().toISOString()
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("expense_claims").insert({
        id: claim.id,
        userId: claim.userId,
        amountCents: claim.amountCents,
        currency: claim.currency,
        description: claim.description,
        kmDistance: claim.kmDistance ?? null,
        status: claim.status,
        createdAt: claim.createdAt,
        payslipPeriod: null,
        appliedPayslipId: null
      });
      if (error) {
        throw new InternalServerErrorException(`Creazione nota spesa fallita: ${error.message}`);
      }
    } else {
      this.expenseClaims.unshift(claim);
    }
    return claim;
  }

  async getExpenseClaim(id: string): Promise<ExpenseClaim> {
    if (!this.useDb) {
      const row = this.expenseClaims.find((c) => c.id === id);
      if (!row) throw new NotFoundException("Nota spesa non trovata");
      return row;
    }
    const { data, error } = await this.supabase!.from("expense_claims").select("*").eq("id", id).single();
    if (error || !data) throw new NotFoundException("Nota spesa non trovata");
    return this.mapExpenseRow(data as Record<string, unknown>);
  }

  async approveExpenseClaim(claimId: string, approverId: string): Promise<ExpenseClaim> {
    const claim = await this.getExpenseClaim(claimId);
    const approver = await this.getUser(approverId);
    await this.assertCanActOnBehalfOfUser(approverId, approver.role, claim.userId);
    if (claim.status !== "submitted") {
      throw new BadRequestException("Solo richieste inviate possono essere approvate");
    }
    claim.status = "approved";
    if (this.useDb) {
      const { error } = await this.supabase!.from("expense_claims").update({ status: "approved" }).eq("id", claimId);
      if (error) throw new InternalServerErrorException(`Aggiornamento nota spesa fallito: ${error.message}`);
    } else {
      const row = this.expenseClaims.find((c) => c.id === claimId);
      if (row) row.status = "approved";
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: claim.userId,
      title: "Nota spesa approvata",
      body: claim.description.slice(0, 200),
      read: false,
      createdAt: new Date().toISOString(),
      kind: "expense_approved"
    });
    return this.getExpenseClaim(claimId);
  }

  async rejectExpenseClaim(claimId: string, approverId: string): Promise<ExpenseClaim> {
    const claim = await this.getExpenseClaim(claimId);
    const approver = await this.getUser(approverId);
    await this.assertCanActOnBehalfOfUser(approverId, approver.role, claim.userId);
    if (claim.status !== "submitted") {
      throw new BadRequestException("Solo richieste inviate possono essere rifiutate");
    }
    if (this.useDb) {
      const { error } = await this.supabase!.from("expense_claims").update({ status: "rejected" }).eq("id", claimId);
      if (error) throw new InternalServerErrorException(`Aggiornamento nota spesa fallito: ${error.message}`);
    } else {
      const row = this.expenseClaims.find((c) => c.id === claimId);
      if (row) row.status = "rejected";
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: claim.userId,
      title: "Nota spesa rifiutata",
      body: claim.description.slice(0, 200),
      read: false,
      createdAt: new Date().toISOString(),
      kind: "expense_rejected"
    });
    return this.getExpenseClaim(claimId);
  }

  async listShiftsForUser(userId: string): Promise<Shift[]> {
    if (!this.useDb) {
      return this.shifts.filter((s) => s.userId === userId).sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    const { data, error } = await this.supabase!
      .from("shifts")
      .select("*")
      .eq("userId", userId)
      .order("startAt", { ascending: true });
    if (error) {
      throw new BadRequestException(`Lettura turni fallita: ${error.message}`);
    }
    return (data ?? []).map((r) => this.mapShiftRow(r as Record<string, unknown>));
  }

  async listShiftsForRequester(
    requesterId: string,
    requesterRole: User["role"],
    targetUserId?: string
  ): Promise<Shift[]> {
    const uid = targetUserId ?? requesterId;
    if (uid !== requesterId) {
      const req = await this.getUser(requesterId);
      if (
        req.role !== "superuser" &&
        !(await this.isManagerOf(requesterId, uid)) &&
        !(await this.isUserLeadOfTeamContaining(requesterId, uid))
      ) {
        throw new BadRequestException("Non puoi consultare i turni di questo utente");
      }
    }
    return this.listShiftsForUser(uid);
  }

  private mapShiftRow(r: Record<string, unknown>): Shift {
    return {
      id: String(r.id),
      userId: String(r.userId),
      startAt: String(r.startAt),
      endAt: String(r.endAt),
      premiumCode: r.premiumCode ? String(r.premiumCode) : undefined,
      status: (r.status as Shift["status"]) ?? "scheduled"
    };
  }

  async createShift(
    requesterId: string,
    requesterRole: User["role"],
    input: { userId: string; startAt: string; endAt: string; premiumCode?: string }
  ): Promise<Shift> {
    if (requesterRole === "user") {
      if (
        !(await this.isManagerOf(requesterId, input.userId)) &&
        !(await this.isUserLeadOfTeamContaining(requesterId, input.userId))
      ) {
        throw new BadRequestException("Puoi pianificare solo i membri del tuo team");
      }
    }
    const shift: Shift = {
      id: `sh-${Date.now()}`,
      userId: input.userId,
      startAt: input.startAt,
      endAt: input.endAt,
      premiumCode: input.premiumCode,
      status: "scheduled"
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("shifts").insert({
        id: shift.id,
        userId: shift.userId,
        startAt: shift.startAt,
        endAt: shift.endAt,
        premiumCode: shift.premiumCode ?? null,
        status: shift.status
      });
      if (error) throw new InternalServerErrorException(`Creazione turno fallita: ${error.message}`);
    } else {
      this.shifts.push(shift);
    }
    return shift;
  }

  async deleteShift(requesterId: string, requesterRole: User["role"], shiftId: string): Promise<void> {
    let shift: Shift | undefined;
    if (!this.useDb) {
      shift = this.shifts.find((s) => s.id === shiftId);
    } else {
      const { data } = await this.supabase!.from("shifts").select("*").eq("id", shiftId).single();
      shift = data ? this.mapShiftRow(data as Record<string, unknown>) : undefined;
    }
    if (!shift) throw new NotFoundException("Turno non trovato");
    if (
      requesterRole === "user" &&
      !(await this.isManagerOf(requesterId, shift.userId)) &&
      !(await this.isUserLeadOfTeamContaining(requesterId, shift.userId))
    ) {
      throw new BadRequestException("Operazione non consentita");
    }
    if (this.useDb) {
      const { error } = await this.supabase!.from("shifts").delete().eq("id", shiftId);
      if (error) throw new InternalServerErrorException(`Eliminazione turno fallita: ${error.message}`);
    } else {
      const idx = this.shifts.findIndex((s) => s.id === shiftId);
      if (idx >= 0) this.shifts.splice(idx, 1);
    }
  }

  private defaultOnboarding(userId: string): OnboardingStatus {
    const now = new Date().toISOString();
    const checklist: OnboardingChecklistItem[] = [
      { id: "ob-1", label: "Contratto firmato e archiviato", done: false },
      { id: "ob-2", label: "Account aziendali e accessi IT", done: false },
      { id: "ob-3", label: "Formazione sicurezza / compliance", done: false },
      { id: "ob-4", label: "Badge / presenze configurate", done: false }
    ];
    return { userId, phase: "active", checklist, updatedAt: now };
  }

  async getOrCreateOnboarding(userId: string): Promise<OnboardingStatus> {
    if (!this.useDb) {
      let st = this.onboardingByUser.get(userId);
      if (!st) {
        st = this.defaultOnboarding(userId);
        this.onboardingByUser.set(userId, st);
      }
      return st;
    }
    const { data } = await this.supabase!.from("lifecycle_onboarding").select("*").eq("userId", userId).maybeSingle();
    if (data) {
      const raw = data.checklistJson as unknown;
      const checklist = Array.isArray(raw)
        ? (raw as OnboardingChecklistItem[])
        : ([] as OnboardingChecklistItem[]);
      return {
        userId,
        phase: data.phase as OnboardingStatus["phase"],
        checklist,
        updatedAt: String(data.updatedAt)
      };
    }
    const st = this.defaultOnboarding(userId);
    await this.supabase!.from("lifecycle_onboarding").insert({
      userId,
      phase: st.phase,
      checklistJson: st.checklist,
      updatedAt: st.updatedAt
    });
    return st;
  }

  async patchOnboardingItem(
    userId: string,
    itemId: string,
    done: boolean,
    requesterId: string,
    requesterRole: User["role"]
  ): Promise<OnboardingStatus> {
    if (
      userId !== requesterId &&
      requesterRole !== "superuser" &&
      !(await this.isManagerOf(requesterId, userId)) &&
      !(await this.isUserLeadOfTeamContaining(requesterId, userId))
    ) {
      throw new BadRequestException("Non puoi modificare questo onboarding");
    }
    const st = await this.getOrCreateOnboarding(userId);
    const item = st.checklist.find((i: OnboardingChecklistItem) => i.id === itemId);
    if (!item) throw new NotFoundException("Voce checklist non trovata");
    item.done = done;
    st.updatedAt = new Date().toISOString();
    const allDone = st.checklist.length > 0 && st.checklist.every((i: OnboardingChecklistItem) => i.done);
    st.phase = allDone ? "completed" : "active";
    if (!this.useDb) {
      this.onboardingByUser.set(userId, st);
      return st;
    }
    const { error } = await this.supabase!
      .from("lifecycle_onboarding")
      .update({ checklistJson: st.checklist, phase: st.phase, updatedAt: st.updatedAt })
      .eq("userId", userId);
    if (error) throw new InternalServerErrorException(`Aggiornamento onboarding fallito: ${error.message}`);
    return st;
  }

  private mapDocumentRow(r: Record<string, unknown>): EmployeeDocumentRow {
    return {
      id: String(r.id),
      userId: String(r.userId),
      kind: r.kind as EmployeeDocumentKind,
      title: String(r.title),
      mimeType: r.mimeType ? String(r.mimeType) : undefined,
      storagePath: r.storagePath ? String(r.storagePath) : undefined,
      createdAt: String(r.createdAt),
      uploadedBy: r.uploadedBy ? String(r.uploadedBy) : undefined,
      bodyBase64: r.bodyBase64 ? String(r.bodyBase64) : null
    };
  }

  async listDocumentsForRequester(
    requesterId: string,
    requesterRole: User["role"],
    targetUserId?: string
  ): Promise<EmployeeDocument[]> {
    const uid = targetUserId ?? requesterId;
    if (uid !== requesterId) {
      if (
        requesterRole !== "superuser" &&
        !(await this.isManagerOf(requesterId, uid)) &&
        !(await this.isUserLeadOfTeamContaining(requesterId, uid))
      ) {
        throw new BadRequestException("Accesso ai documenti non autorizzato");
      }
    }
    if (!this.useDb) {
      return this.employeeDocuments
        .filter((d) => d.userId === uid)
        .map(({ bodyBase64: _b, ...rest }) => rest);
    }
    const { data, error } = await this.supabase!.from("employee_documents").select("*").eq("userId", uid);
    if (error) throw new BadRequestException(`Lettura documenti fallita: ${error.message}`);
    return (data ?? []).map((r) => {
      const row = this.mapDocumentRow(r as Record<string, unknown>);
      const { bodyBase64: _b, ...pub } = row;
      return pub;
    });
  }

  async createEmployeeDocument(input: {
    userId: string;
    uploadedBy: string;
    kind: EmployeeDocumentKind;
    title: string;
    mimeType?: string;
    bodyBase64?: string;
  }): Promise<EmployeeDocument> {
    const id = `doc-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const storagePath = input.bodyBase64 ? `inline:${id}` : undefined;
    const row: EmployeeDocumentRow = {
      id,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      mimeType: input.mimeType,
      storagePath,
      createdAt,
      uploadedBy: input.uploadedBy,
      bodyBase64: input.bodyBase64
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("employee_documents").insert({
        id: row.id,
        userId: row.userId,
        kind: row.kind,
        title: row.title,
        mimeType: row.mimeType ?? null,
        bodyBase64: row.bodyBase64 ?? null,
        storagePath: row.storagePath ?? null,
        createdAt: row.createdAt,
        uploadedBy: row.uploadedBy ?? null
      });
      if (error) throw new InternalServerErrorException(`Upload documento fallito: ${error.message}`);
    } else {
      this.employeeDocuments.unshift(row);
    }
    const { bodyBase64: _b, ...pub } = row;
    return pub;
  }

  async getEmployeeDocumentFile(
    requesterId: string,
    requesterRole: User["role"],
    docId: string
  ): Promise<{ mimeType?: string; base64: string }> {
    let row: EmployeeDocumentRow | undefined;
    if (!this.useDb) {
      row = this.employeeDocuments.find((d) => d.id === docId);
    } else {
      const { data } = await this.supabase!.from("employee_documents").select("*").eq("id", docId).single();
      row = data ? this.mapDocumentRow(data as Record<string, unknown>) : undefined;
    }
    if (!row) throw new NotFoundException("Documento non trovato");
    if (
      row.userId !== requesterId &&
      requesterRole !== "superuser" &&
      !(await this.isManagerOf(requesterId, row.userId)) &&
      !(await this.isUserLeadOfTeamContaining(requesterId, row.userId))
    ) {
      throw new BadRequestException("Accesso negato");
    }
    const b64 = row.bodyBase64;
    if (!b64) throw new NotFoundException("Contenuto non disponibile (solo metadato)");
    return { mimeType: row.mimeType, base64: b64 };
  }

  async listInnovationJobs(userId: string, limit = 50): Promise<InnovationJob[]> {
    const cap = Math.min(Math.max(limit, 1), 200);
    if (!this.useDb) {
      return this.innovationJobs.filter((j) => j.userId === userId).slice(0, cap);
    }
    const { data, error } = await this.supabase!
      .from("innovation_jobs")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(cap);
    if (error) throw new BadRequestException(`Lettura job innovation fallita: ${error.message}`);
    return (data ?? []).map((r) => this.mapInnovationRow(r as Record<string, unknown>));
  }

  private mapInnovationRow(r: Record<string, unknown>): InnovationJob {
    return {
      id: String(r.id),
      userId: String(r.userId),
      module: String(r.module),
      payload: (r.payload as Record<string, unknown>) ?? {},
      status: r.status as InnovationJobStatus,
      createdAt: String(r.createdAt),
      result: r.resultJson ? (r.resultJson as Record<string, unknown>) : undefined
    };
  }

  async createInnovationJob(
    userId: string,
    module: string,
    payload: Record<string, unknown>
  ): Promise<InnovationJob> {
    const id = `ij-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const result: Record<string, unknown> = {
      message: "Job completato in modalità MVP (nessun provider esterno configurato).",
      module,
      receivedAt: createdAt
    };
    const job: InnovationJob = {
      id,
      userId,
      module,
      payload,
      status: "completed",
      createdAt,
      result
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("innovation_jobs").insert({
        id,
        userId,
        module,
        payload,
        status: "completed",
        createdAt,
        resultJson: result
      });
      if (error) throw new InternalServerErrorException(`Creazione job fallita: ${error.message}`);
    } else {
      this.innovationJobs.unshift(job);
    }
    return job;
  }

  async createSmartworkingRequest(
    userId: string,
    day: string,
    note?: string,
    actorRole?: AuthRole
  ): Promise<SmartworkingRequestRow> {
    const user = await this.getUser(userId);
    const dayNorm = day.slice(0, 10);
    if (await this.hasActiveSmartworkingRequestForDay(userId, dayNorm)) {
      throw new BadRequestException("Smart working già richiesto per questa data");
    }
    const skipSwQuota = actorRole === "superuser";
    if (!skipSwQuota) {
      const monthPrefix = dayNorm.slice(0, 7);
      const monthBooked = await this.countNonRejectedSmartworkingDaysInMonth(userId, monthPrefix);
      if (monthBooked >= SMARTWORKING_MONTHLY_QUOTA) {
        throw new BadRequestException("Quota smartworking mensile esaurita (richieste in attesa incluso)");
      }
      const weekBooked = await this.countSmartworkingBookedDaysInWeek(userId, dayNorm);
      if (weekBooked >= SMARTWORKING_WEEKLY_QUOTA) {
        throw new BadRequestException(
          `Quota smartworking settimanale esaurita (max ${SMARTWORKING_WEEKLY_QUOTA} giorni, richieste in attesa incluso)`
        );
      }
    }
    const id = `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const row: SmartworkingRequestRow = {
      id,
      userId,
      day: dayNorm,
      note: note?.trim() || null,
      status: "pending",
      approverId: user.managerId ?? null,
      createdAt
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("smartworking_requests").insert({
        id: row.id,
        userId: row.userId,
        day: row.day,
        note: row.note,
        status: row.status,
        approverId: row.approverId,
        createdAt: row.createdAt
      });
      if (error) {
        throw new InternalServerErrorException(`Richiesta SW fallita: ${error.message}`);
      }
    } else {
      this.smartworkingRequests.push(row);
    }
    const swApproval = {
      id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      entityId: row.id,
      type: "smartworking" as const,
      requestedBy: userId,
      status: "pending" as const,
      at: createdAt
    };
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(swApproval);
    } else {
      this.approvals.push(swApproval);
    }
    await this.notifyApproversOfRequest(
      user,
      "Richiesta smart working",
      `${user.fullName}: ${dayNorm}${note?.trim() ? ` — ${note.trim()}` : ""}`,
      "smartworking_request",
      `/workflow/approvals?approvalId=${encodeURIComponent(swApproval.id)}`
    );
    return row;
  }

  async findSmartworkingRequestById(requestId: string): Promise<SmartworkingRequestRow | null> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("smartworking_requests").select("*").eq("id", requestId).maybeSingle();
      return (data as SmartworkingRequestRow) ?? null;
    }
    return this.smartworkingRequests.find((r) => r.id === requestId) ?? null;
  }

  async updateSmartworkingRequest(
    requesterId: string,
    requestId: string,
    day: string,
    note: string | null | undefined,
    actorRole: AuthRole
  ): Promise<SmartworkingRequestRow> {
    const row = await this.findSmartworkingRequestById(requestId);
    if (!row) {
      throw new NotFoundException("Richiesta non trovata");
    }
    await this.assertCanActOnBehalfOfUser(requesterId, actorRole, row.userId);
    if (row.status === "rejected") {
      throw new BadRequestException("Questa richiesta è stata rifiutata e non è modificabile");
    }
    const isApprovedSwCorrection = row.status === "approved";
    if (isApprovedSwCorrection) {
      if (requesterId === row.userId && actorRole !== "superuser") {
        throw new BadRequestException("Lo smart working approvato non può essere modificato dal dipendente");
      }
    } else if (row.status !== "pending") {
      throw new BadRequestException("Solo le richieste in attesa possono essere modificate");
    }
    const nextDay = day.slice(0, 10);
    const nextNote = note?.trim() || null;
    const prevDay = row.day.slice(0, 10);
    const prevNote = row.note?.trim() || null;
    if (nextDay === prevDay && nextNote === prevNote) {
      return row;
    }
    const subjectId = row.userId;
    if (
      nextDay !== row.day.slice(0, 10) &&
      (await this.hasActiveSmartworkingRequestForDay(subjectId, nextDay, requestId))
    ) {
      throw new BadRequestException("Smart working già richiesto per questa data");
    }
    if (
      nextDay !== row.day.slice(0, 10) &&
      actorRole !== "superuser" &&
      !isApprovedSwCorrection
    ) {
      const monthPrefix = nextDay.slice(0, 7);
      const monthBooked = (
        await this.listMySmartworking(subjectId)
      ).filter(
        (r) => r.id !== requestId && r.status !== "rejected" && r.day.startsWith(monthPrefix)
      ).length;
      if (monthBooked >= SMARTWORKING_MONTHLY_QUOTA) {
        throw new BadRequestException("Quota smartworking mensile esaurita per il mese selezionato");
      }
      const weekBooked = await this.countSmartworkingBookedDaysInWeek(subjectId, nextDay, requestId);
      if (weekBooked >= SMARTWORKING_WEEKLY_QUOTA) {
        throw new BadRequestException(
          `Quota smartworking settimanale esaurita (max ${SMARTWORKING_WEEKLY_QUOTA} giorni)`
        );
      }
    }
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("smartworking_requests")
        .update({ day: nextDay, note: nextNote })
        .eq("id", requestId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento SW fallito: ${error.message}`);
      }
    } else {
      row.day = nextDay;
      row.note = nextNote;
    }
    if (!isApprovedSwCorrection) {
      const user = await this.getUser(requesterId);
      let linkApprovalId: string | undefined;
      if (this.useDb) {
        const { data } = await this.supabase!
          .from("approvals")
          .select("id")
          .eq("entityId", requestId)
          .eq("type", "smartworking")
          .eq("status", "pending")
          .maybeSingle();
        linkApprovalId = (data as { id?: string } | null)?.id;
      } else {
        linkApprovalId = this.approvals.find(
          (a) => a.entityId === requestId && a.type === "smartworking" && a.status === "pending"
        )?.id;
      }
      await this.notifyApproversOfRequest(
        user,
        "Richiesta smart working",
        `${user.fullName}: ${nextDay}${nextNote ? ` — ${nextNote}` : ""}`,
        "smartworking_request",
        linkApprovalId
          ? `/workflow/approvals?approvalId=${encodeURIComponent(linkApprovalId)}`
          : "/workflow/approvals"
      );
    }
    return { ...row, day: nextDay, note: nextNote };
  }

  async cancelSmartworkingRequest(requesterId: string, requestId: string, actorRole: AuthRole): Promise<void> {
    const row = await this.findSmartworkingRequestById(requestId);
    if (!row) {
      throw new NotFoundException("Richiesta non trovata");
    }
    await this.assertCanActOnBehalfOfUser(requesterId, actorRole, row.userId);
    const today = this.calendarDateTodayIsoRome();
    const day = row.day.slice(0, 10);
    if (row.status === "approved") {
      if (day <= today) {
        throw new BadRequestException(
          "Solo lo smart working con data futura può essere rimosso (richiesta già approvata)"
        );
      }
      if (requesterId !== row.userId && actorRole !== "superuser") {
        throw new ForbiddenException(
          "Solo il dipendente interessato può annullare uno smart working approvato futuro"
        );
      }
    } else if (row.status !== "pending" && row.status !== "rejected") {
      throw new BadRequestException("Solo una richiesta in attesa o rifiutata può essere rimossa");
    }
    if (this.useDb) {
      await this.supabase!.from("approvals").delete().eq("entityId", requestId).eq("type", "smartworking");
      const { error } = await this.supabase!.from("smartworking_requests").delete().eq("id", requestId);
      if (error) {
        throw new InternalServerErrorException(`Annullamento SW fallito: ${error.message}`);
      }
    } else {
      for (let i = this.approvals.length - 1; i >= 0; i--) {
        const a = this.approvals[i];
        if (a.entityId === requestId && a.type === "smartworking") this.approvals.splice(i, 1);
      }
      const idx = this.smartworkingRequests.findIndex((r) => r.id === requestId);
      if (idx >= 0) this.smartworkingRequests.splice(idx, 1);
    }
  }

  async listMySmartworking(userId: string): Promise<SmartworkingRequestRow[]> {
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("smartworking_requests")
        .select("*")
        .eq("userId", userId)
        .order("day", { ascending: false });
      return (data as SmartworkingRequestRow[]) ?? [];
    }
    return this.smartworkingRequests.filter((r) => r.userId === userId).sort((a, b) => b.day.localeCompare(a.day));
  }

  async listPendingSmartworkingForManager(managerId: string): Promise<SmartworkingRequestRow[]> {
    const visible = await this.listManagedMemberIdsForApprover(managerId);
    if (this.useDb) {
      const { data } = await this.supabase!.from("smartworking_requests").select("*").eq("status", "pending");
      const rows = (data as SmartworkingRequestRow[]) ?? [];
      return rows.filter((r) => visible.has(r.userId) || r.approverId === managerId);
    }
    return this.smartworkingRequests.filter(
      (r) => r.status === "pending" && (visible.has(r.userId) || r.approverId === managerId)
    );
  }

  async listAllPendingSmartworkingRequests(): Promise<SmartworkingRequestRow[]> {
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("smartworking_requests")
        .select("*")
        .eq("status", "pending")
        .order("createdAt", { ascending: false });
      return (data as SmartworkingRequestRow[]) ?? [];
    }
    return this.smartworkingRequests.filter((r) => r.status === "pending");
  }

  async decideSmartworkingRequest(
    requestId: string,
    managerId: string,
    approve: boolean,
    rejectReason?: string
  ): Promise<SmartworkingRequestRow> {
    let row: SmartworkingRequestRow | undefined;
    if (this.useDb) {
      const { data } = await this.supabase!.from("smartworking_requests").select("*").eq("id", requestId).single();
      row = data as SmartworkingRequestRow | undefined;
    } else {
      row = this.smartworkingRequests.find((r) => r.id === requestId);
    }
    if (!row || row.status !== "pending") {
      throw new NotFoundException("Richiesta non trovata");
    }
    const decidingUser = await this.getUser(managerId);
    const isSuperuserApprover = decidingUser.role === "superuser";
    if (!isSuperuserApprover) {
      const subs = await this.listUsersByManager(managerId);
      const okSub = subs.some((u) => u.id === row.userId);
      const okLead = await this.isUserLeadOfTeamContaining(managerId, row.userId);
      if (!okSub && row.approverId !== managerId && !okLead) {
        throw new BadRequestException("Non autorizzato su questa richiesta");
      }
    }
    const decisionAt = new Date().toISOString();
    const status = approve ? "approved" : "rejected";
    const reason = rejectReason?.trim() || null;
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("smartworking_requests")
        .update({
          status,
          approverId: managerId,
          decisionAt,
          rejectReason: approve ? null : reason
        })
        .eq("id", requestId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento SW fallito: ${error.message}`);
      }
    } else {
      row.status = status;
      row.approverId = managerId;
      row.decisionAt = decisionAt;
      row.rejectReason = approve ? null : reason;
    }
    if (this.useDb) {
      const { error: apprErr } = await this.supabase!
        .from("approvals")
        .update({
          status,
          approverId: managerId,
          at: decisionAt,
          rejectReason: approve ? null : reason
        })
        .eq("entityId", requestId)
        .eq("type", "smartworking")
        .eq("status", "pending");
      if (apprErr) {
        throw new InternalServerErrorException(`Aggiornamento workflow SW fallito: ${apprErr.message}`);
      }
    } else {
      const arow = this.approvals.find(
        (a) => a.entityId === requestId && a.type === "smartworking" && a.status === "pending"
      );
      if (arow) {
        arow.status = status;
        arow.approverId = managerId;
        arow.at = decisionAt;
        arow.rejectReason = approve ? null : reason;
      }
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: row.userId,
      title: approve ? "Smartworking approvato" : "Smartworking rifiutato",
      body: `${row.day}${!approve && reason ? ` — ${reason}` : ""}`,
      read: false,
      createdAt: decisionAt,
      kind: "smartworking"
    });
    return { ...row, status, approverId: managerId, decisionAt, rejectReason: approve ? null : reason };
  }

  private async hasActiveTravelRequestForDay(
    userId: string,
    day: string,
    excludeRequestId?: string
  ): Promise<boolean> {
    const d = day.slice(0, 10);
    const list = await this.listMyTravel(userId);
    return list.some(
      (r) =>
        r.day.slice(0, 10) === d &&
        r.status !== "rejected" &&
        (excludeRequestId === undefined || r.id !== excludeRequestId)
    );
  }

  async createTravelRequest(
    userId: string,
    day: string,
    note?: string,
    _actorRole?: AuthRole
  ): Promise<TravelRequestRow> {
    void _actorRole;
    const user = await this.getUser(userId);
    const dayNorm = day.slice(0, 10);
    if (await this.hasActiveTravelRequestForDay(userId, dayNorm)) {
      throw new BadRequestException("Trasferta già richiesta per questa data");
    }
    const id = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const row: TravelRequestRow = {
      id,
      userId,
      day: dayNorm,
      note: note?.trim() || null,
      status: "pending",
      approverId: user.managerId ?? null,
      createdAt
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("travel_requests").insert({
        id: row.id,
        userId: row.userId,
        day: row.day,
        note: row.note,
        status: row.status,
        approverId: row.approverId,
        createdAt: row.createdAt
      });
      if (error) {
        const msg = error.message ?? "";
        if (/travel_requests/i.test(msg) && /schema cache|Could not find the table/i.test(msg)) {
          throw new InternalServerErrorException(
            "Manca la tabella travel_requests nel database (migrazione non applicata). Esegui sul progetto Supabase il file infra/supabase/migrations/023_travel_requests.sql (es. supabase db push dalla cartella infra/supabase)."
          );
        }
        throw new InternalServerErrorException(`Richiesta trasferta fallita: ${error.message}`);
      }
    } else {
      this.travelRequests.push(row);
    }
    const appr = {
      id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      entityId: row.id,
      type: "travel" as const,
      requestedBy: userId,
      status: "pending" as const,
      at: createdAt
    };
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(appr);
    } else {
      this.approvals.push(appr);
    }
    await this.notifyApproversOfRequest(
      user,
      "Richiesta trasferta",
      `${user.fullName}: ${dayNorm}${note?.trim() ? ` — ${note.trim()}` : ""}`,
      "travel_request",
      `/workflow/approvals?approvalId=${encodeURIComponent(appr.id)}`
    );
    return row;
  }

  async findTravelRequestById(requestId: string): Promise<TravelRequestRow | null> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("travel_requests").select("*").eq("id", requestId).maybeSingle();
      return (data as TravelRequestRow) ?? null;
    }
    return this.travelRequests.find((r) => r.id === requestId) ?? null;
  }

  async updateTravelRequest(
    requesterId: string,
    requestId: string,
    day: string,
    note: string | null | undefined,
    actorRole: AuthRole
  ): Promise<TravelRequestRow> {
    const row = await this.findTravelRequestById(requestId);
    if (!row) {
      throw new NotFoundException("Richiesta non trovata");
    }
    await this.assertCanActOnBehalfOfUser(requesterId, actorRole, row.userId);
    if (row.status === "rejected") {
      throw new BadRequestException("Questa richiesta è stata rifiutata e non è modificabile");
    }
    const isApprovedCorrection = row.status === "approved";
    if (isApprovedCorrection) {
      if (requesterId === row.userId && actorRole !== "superuser") {
        throw new BadRequestException("Le trasferte approvate non possono essere modificate dal dipendente");
      }
    } else if (row.status !== "pending") {
      throw new BadRequestException("Solo le richieste in attesa possono essere modificate");
    }
    const nextDay = day.slice(0, 10);
    const nextNote = note?.trim() || null;
    const prevDay = row.day.slice(0, 10);
    const prevNote = row.note?.trim() || null;
    if (nextDay === prevDay && nextNote === prevNote) {
      return row;
    }
    if (
      nextDay !== prevDay &&
      (await this.hasActiveTravelRequestForDay(row.userId, nextDay, requestId))
    ) {
      throw new BadRequestException("Trasferta già richiesta per questa data");
    }
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("travel_requests")
        .update({ day: nextDay, note: nextNote })
        .eq("id", requestId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento trasferta fallito: ${error.message}`);
      }
    } else {
      row.day = nextDay;
      row.note = nextNote;
    }
    if (!isApprovedCorrection) {
      const user = await this.getUser(requesterId);
      let linkApprovalId: string | undefined;
      if (this.useDb) {
        const { data } = await this.supabase!
          .from("approvals")
          .select("id")
          .eq("entityId", requestId)
          .eq("type", "travel")
          .eq("status", "pending")
          .maybeSingle();
        linkApprovalId = (data as { id?: string } | null)?.id;
      } else {
        linkApprovalId = this.approvals.find(
          (a) => a.entityId === requestId && a.type === "travel" && a.status === "pending"
        )?.id;
      }
      await this.notifyApproversOfRequest(
        user,
        "Richiesta trasferta",
        `${user.fullName}: ${nextDay}${nextNote ? ` — ${nextNote}` : ""}`,
        "travel_request",
        linkApprovalId
          ? `/workflow/approvals?approvalId=${encodeURIComponent(linkApprovalId)}`
          : "/workflow/approvals"
      );
    }
    return { ...row, day: nextDay, note: nextNote };
  }

  async cancelTravelRequest(requesterId: string, requestId: string, actorRole: AuthRole): Promise<void> {
    const row = await this.findTravelRequestById(requestId);
    if (!row) {
      throw new NotFoundException("Richiesta non trovata");
    }
    await this.assertCanActOnBehalfOfUser(requesterId, actorRole, row.userId);
    const today = this.calendarDateTodayIsoRome();
    const day = row.day.slice(0, 10);
    if (row.status === "approved") {
      if (day <= today) {
        throw new BadRequestException(
          "Solo la trasferta con data futura può essere rimossa (richiesta già approvata)"
        );
      }
      if (requesterId !== row.userId && actorRole !== "superuser") {
        throw new ForbiddenException(
          "Solo il dipendente interessato può annullare una trasferta approvata futura"
        );
      }
    } else if (row.status !== "pending" && row.status !== "rejected") {
      throw new BadRequestException("Solo una richiesta in attesa o rifiutata può essere rimossa");
    }
    if (this.useDb) {
      await this.supabase!.from("approvals").delete().eq("entityId", requestId).eq("type", "travel");
      const { error } = await this.supabase!.from("travel_requests").delete().eq("id", requestId);
      if (error) {
        throw new InternalServerErrorException(`Annullamento trasferta fallito: ${error.message}`);
      }
    } else {
      for (let i = this.approvals.length - 1; i >= 0; i--) {
        const a = this.approvals[i];
        if (a.entityId === requestId && a.type === "travel") this.approvals.splice(i, 1);
      }
      const idx = this.travelRequests.findIndex((r) => r.id === requestId);
      if (idx >= 0) this.travelRequests.splice(idx, 1);
    }
  }

  async listMyTravel(userId: string): Promise<TravelRequestRow[]> {
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("travel_requests")
        .select("*")
        .eq("userId", userId)
        .order("day", { ascending: false });
      return (data as TravelRequestRow[]) ?? [];
    }
    return this.travelRequests.filter((r) => r.userId === userId).sort((a, b) => b.day.localeCompare(a.day));
  }

  async listPendingTravelForManager(managerId: string): Promise<TravelRequestRow[]> {
    const visible = await this.listManagedMemberIdsForApprover(managerId);
    if (this.useDb) {
      const { data } = await this.supabase!.from("travel_requests").select("*").eq("status", "pending");
      const rows = (data as TravelRequestRow[]) ?? [];
      return rows.filter((r) => visible.has(r.userId) || r.approverId === managerId);
    }
    return this.travelRequests.filter(
      (r) => r.status === "pending" && (visible.has(r.userId) || r.approverId === managerId)
    );
  }

  async listAllPendingTravelRequests(): Promise<TravelRequestRow[]> {
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("travel_requests")
        .select("*")
        .eq("status", "pending")
        .order("createdAt", { ascending: false });
      return (data as TravelRequestRow[]) ?? [];
    }
    return this.travelRequests.filter((r) => r.status === "pending");
  }

  async decideTravelRequest(
    requestId: string,
    managerId: string,
    approve: boolean,
    rejectReason?: string
  ): Promise<TravelRequestRow> {
    let row: TravelRequestRow | undefined;
    if (this.useDb) {
      const { data } = await this.supabase!.from("travel_requests").select("*").eq("id", requestId).single();
      row = data as TravelRequestRow | undefined;
    } else {
      row = this.travelRequests.find((r) => r.id === requestId);
    }
    if (!row || row.status !== "pending") {
      throw new NotFoundException("Richiesta non trovata");
    }
    const decidingUser = await this.getUser(managerId);
    const isSuperuserApprover = decidingUser.role === "superuser";
    if (!isSuperuserApprover) {
      const subs = await this.listUsersByManager(managerId);
      const okSub = subs.some((u) => u.id === row.userId);
      const okLead = await this.isUserLeadOfTeamContaining(managerId, row.userId);
      if (!okSub && row.approverId !== managerId && !okLead) {
        throw new BadRequestException("Non autorizzato su questa richiesta");
      }
    }
    const decisionAt = new Date().toISOString();
    const status = approve ? "approved" : "rejected";
    const reason = rejectReason?.trim() || null;
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("travel_requests")
        .update({
          status,
          approverId: managerId,
          decisionAt,
          rejectReason: approve ? null : reason
        })
        .eq("id", requestId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento trasferta fallito: ${error.message}`);
      }
    } else {
      row.status = status;
      row.approverId = managerId;
      row.decisionAt = decisionAt;
      row.rejectReason = approve ? null : reason;
    }
    if (this.useDb) {
      const { error: apprErr } = await this.supabase!
        .from("approvals")
        .update({
          status,
          approverId: managerId,
          at: decisionAt,
          rejectReason: approve ? null : reason
        })
        .eq("entityId", requestId)
        .eq("type", "travel")
        .eq("status", "pending");
      if (apprErr) {
        throw new InternalServerErrorException(`Aggiornamento workflow trasferta fallito: ${apprErr.message}`);
      }
    } else {
      const arow = this.approvals.find(
        (a) => a.entityId === requestId && a.type === "travel" && a.status === "pending"
      );
      if (arow) {
        arow.status = status;
        arow.approverId = managerId;
        arow.at = decisionAt;
        arow.rejectReason = approve ? null : reason;
      }
    }
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: row.userId,
      title: approve ? "Trasferta approvata" : "Trasferta rifiutata",
      body: `${row.day}${!approve && reason ? ` — ${reason}` : ""}`,
      read: false,
      createdAt: decisionAt,
      kind: "travel"
    });
    return { ...row, status, approverId: managerId, decisionAt, rejectReason: approve ? null : reason };
  }

  async getSmartworkingMonthlyBalance(userId: string, month?: string): Promise<{ used: number; quota: number }> {
    const m = month ?? new Date().toISOString().slice(0, 7);
    const used = await this.countNonRejectedSmartworkingDaysInMonth(userId, m);
    return { used, quota: SMARTWORKING_MONTHLY_QUOTA };
  }

  private mondayOfWeekUtcContaining(dayIso: string): string {
    const d = new Date(`${dayIso.slice(0, 10)}T12:00:00.000Z`);
    const dow = d.getUTCDay();
    const diffFromMon = (dow + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diffFromMon);
    return d.toISOString().slice(0, 10);
  }

  private addCalendarDaysUtcIso(iso: string, delta: number): string {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  /** Giorni con richiesta SW attiva (pending o approved) nella settimana UTC che contiene dayIso. */
  private async countSmartworkingBookedDaysInWeek(
    userId: string,
    dayIso: string,
    excludeRequestId?: string
  ): Promise<number> {
    const mon = this.mondayOfWeekUtcContaining(dayIso);
    const sun = this.addCalendarDaysUtcIso(mon, 6);
    const list = await this.listMySmartworking(userId);
    let n = 0;
    for (const r of list) {
      if (excludeRequestId && r.id === excludeRequestId) continue;
      if (r.status === "rejected") continue;
      const day = r.day.slice(0, 10);
      if (day >= mon && day <= sun) n += 1;
    }
    return n;
  }

  /** Richiesta pending o approvata per quel giorno (rejected escluso). Opzionale: ignora una riga (es. update stesso id). */
  private async hasActiveSmartworkingRequestForDay(
    userId: string,
    day: string,
    excludeRequestId?: string
  ): Promise<boolean> {
    const d = day.slice(0, 10);
    const list = await this.listMySmartworking(userId);
    return list.some(
      (r) =>
        r.day.slice(0, 10) === d &&
        r.status !== "rejected" &&
        (excludeRequestId === undefined || r.id !== excludeRequestId)
    );
  }

  private async countApprovedSmartworkingDaysInMonth(userId: string, monthPrefix: string): Promise<number> {
    const list = await this.listMySmartworking(userId);
    return list.filter((r) => r.status === "approved" && r.day.startsWith(monthPrefix)).length;
  }

  private async countNonRejectedSmartworkingDaysInMonth(userId: string, monthPrefix: string): Promise<number> {
    const list = await this.listMySmartworking(userId);
    return list.filter((r) => r.status !== "rejected" && r.day.startsWith(monthPrefix)).length;
  }

  private composeAttendanceBoardRow(
    u: User,
    dayIso: string,
    entries: TimeEntry[],
    calEvents: CalendarEvent[],
    workdayMode: WorkMode | undefined,
    flags: { isWeekend: boolean; isCompanyHoliday: boolean }
  ): AttendanceDayBoardRow {
    const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
    const firstIn = sorted.find((e) => e.type === "clock_in");
    const lastOut = [...sorted].reverse().find((e) => e.type === "clock_out");
    const fmt = (iso: string): string => {
      const t = new Date(iso);
      return Number.isNaN(t.getTime()) ? iso.slice(11, 16) : t.toLocaleTimeString("it-CH", { hour: "2-digit", minute: "2-digit" });
    };

    const statusLabels: string[] = [];
    for (const ev of calEvents) {
      if (ev.kind === "holiday") continue;
      const st = String(ev.meta?.status ?? "");
      if (st === "rejected") continue;
      if (ev.title && !statusLabels.includes(ev.title)) {
        statusLabels.push(ev.title);
      }
    }
    if (workdayMode === "smartworking" && !statusLabels.some((x) => x.toLowerCase().includes("smart"))) {
      statusLabels.push("Modalità presenze: smart working");
    }
    if (workdayMode === "office" && sorted.length > 0) {
      statusLabels.push("Modalità presenze: sede");
    }

    const absenceApproved = calEvents.some(
      (e) =>
        (e.kind === "leave" || e.kind === "rol" || e.kind === "sickness") &&
        String(e.meta?.status ?? "") === "approved"
    );
    const absencePending = calEvents.some(
      (e) =>
        (e.kind === "leave" || e.kind === "rol" || e.kind === "sickness") &&
        String(e.meta?.status ?? "") === "pending"
    );
    const travelApproved = calEvents.some((e) => e.kind === "travel" && String(e.meta?.status ?? "") === "approved");

    const alerts: string[] = [];
    if (sorted.length > 0 && (absenceApproved || travelApproved)) {
      alerts.push("Timbratura registrata con assenza/trasferta dichiarata: verificare coerenza.");
    }
    const expectPunch = !flags.isCompanyHoliday && !flags.isWeekend && !absenceApproved;
    if (expectPunch && sorted.length === 0) {
      alerts.push("Nessuna timbratura in questa data lavorativa.");
    }
    if (sorted.length > 0 && sorted.length % 2 !== 0) {
      alerts.push("Numero di timbrature dispari (coppie entrata/uscita).");
    }
    if (sorted.length > 0 && sorted[sorted.length - 1]!.type === "clock_in") {
      alerts.push("Ultima timbratura è un’entrata: uscita non registrata.");
    }
    if (absencePending) {
      alerts.push("Presenza di richieste assenza in attesa di approvazione.");
    }

    return {
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      firstClockIn: firstIn ? fmt(firstIn.at) : null,
      lastClockOut: lastOut ? fmt(lastOut.at) : null,
      workdayMode: workdayMode ?? null,
      statusLabels,
      alerts
    };
  }

  async buildAttendanceDayBoard(
    userIds: string[],
    day: string,
    costCenterIds?: string[] | null
  ): Promise<AttendanceDayBoardResponse> {
    const d = day.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new BadRequestException("Parametro day atteso nel formato YYYY-MM-DD");
    }
    const idSet = new Set(userIds);
    let allUsers = (await this.listUsers()).filter((u) => idSet.has(u.id));
    if (costCenterIds != null && costCenterIds.length > 0) {
      const allow = new Set(costCenterIds);
      allUsers = allUsers.filter((u) => allow.has(u.costCenterId?.trim() || "__none__"));
    }
    const filteredIds = allUsers.map((u) => u.id);
    const entries = await this.listTimeEntriesForUsersOnDay(filteredIds, d);
    const byUserEntries = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const list = byUserEntries.get(e.userId) ?? [];
      list.push(e);
      byUserEntries.set(e.userId, list);
    }

    const dow = new Date(`${d}T12:00:00.000Z`).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    let isCompanyHoliday = false;
    const sampleCompany = allUsers.find((u) => u.companyId?.trim())?.companyId;
    if (sampleCompany) {
      const hols = await this.listCompanyHolidays(sampleCompany, d, d);
      isCompanyHoliday = hols.length > 0;
    }

    const rowMap = new Map<string, AttendanceDayBoardRow>();
    for (const u of allUsers) {
      const uEntries = byUserEntries.get(u.id) ?? [];
      const cal = await this.buildCalendarEventsForUser(u.id, d, d, true);
      const summaries = await this.listWorkdaySummariesInRange(u.id, d, d);
      const summary = summaries.find((s) => s.date.slice(0, 10) === d);
      rowMap.set(
        u.id,
        this.composeAttendanceBoardRow(u, d, uEntries, cal, summary?.mode, {
          isWeekend,
          isCompanyHoliday
        })
      );
    }

    type TeamBucket = { id: string; label: string; userIds: string[] };
    type CcBucket = { id: string; label: string; teams: Map<string, TeamBucket> };
    const ccBuckets = new Map<string, CcBucket>();

    for (const u of allUsers) {
      const ccId = u.costCenterId?.trim() || "__none__";
      if (!ccBuckets.has(ccId)) {
        let ccLabel = "Senza centro di costo";
        if (ccId !== "__none__") {
          const cc = await this.getCostCenterById(ccId);
          ccLabel = cc ? [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name : ccId;
        }
        ccBuckets.set(ccId, { id: ccId, label: ccLabel, teams: new Map() });
      }
      const ccB = ccBuckets.get(ccId)!;
      const tid = u.teamId?.trim() || "__none__";
      if (!ccB.teams.has(tid)) {
        let teamLabel = tid === "__none__" ? "Senza team / altro" : tid;
        if (tid !== "__none__") {
          try {
            const wt = await this.getWorkTeam(tid);
            teamLabel = wt.name;
          } catch {
            teamLabel = tid;
          }
        }
        ccB.teams.set(tid, { id: tid, label: teamLabel, userIds: [] });
      }
      ccB.teams.get(tid)!.userIds.push(u.id);
    }

    const costCenters = [...ccBuckets.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "it"))
      .map((cc) => ({
        id: cc.id,
        label: cc.label,
        teams: [...cc.teams.values()]
          .sort((a, b) => a.label.localeCompare(b.label, "it"))
          .map((tm) => ({
            id: tm.id,
            label: tm.label,
            rows: [...tm.userIds]
              .sort((a, b) => {
                const ua = allUsers.find((x) => x.id === a)?.fullName ?? "";
                const ub = allUsers.find((x) => x.id === b)?.fullName ?? "";
                return ua.localeCompare(ub, "it");
              })
              .map((uid) => rowMap.get(uid)!)
              .filter(Boolean)
          }))
      }));

    return { day: d, costCenters };
  }

  async getPeopleInsightsRisk(): Promise<Array<{ userId: string; fullName: string; score: number; reasons: string[] }>> {
    const users = await this.listUsers();
    const rows: Array<{ userId: string; fullName: string; score: number; reasons: string[] }> = [];
    for (const u of users) {
      if (u.role === "superuser") {
        continue;
      }
      let score = 15;
      const reasons: string[] = [];
      const allowance = u.vacationAllowanceDays ?? 22;
      if (allowance < 20) {
        score += 25;
        reasons.push("Ferie contrattuali contenute");
      }
      const contractH = u.weeklyContractHours ?? 40;
      if (contractH >= 42) {
        score += 20;
        reasons.push("Contratto a ore elevate");
      }
      const y = new Date().getFullYear();
      const bal = await this.getLeaveBalance(u.id, y);
      if (bal.residualDays < 3) {
        score += 25;
        reasons.push("Saldo ferie basso");
      }
      if (reasons.length === 0) {
        reasons.push("Profilo da monitorare");
      }
      rows.push({ userId: u.id, fullName: u.fullName, score: Math.min(100, score), reasons });
    }
    return rows.sort((a, b) => b.score - a.score);
  }

  async exportAttendanceReportRows(
    from: string,
    to: string
  ): Promise<Array<{ userId: string; fullName: string; date: string; type: string; at: string }>> {
    const users = await this.listUsers();
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));
    let entries: TimeEntry[] = [];
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("time_entries")
        .select("*")
        .gte("at", `${from}T00:00:00.000Z`)
        .lte("at", `${to}T23:59:59.999Z`);
      entries = (data as TimeEntry[]) ?? [];
    } else {
      entries = this.timeEntries.filter((e) => e.at.slice(0, 10) >= from && e.at.slice(0, 10) <= to);
    }
    return entries
      .map((e) => ({
        userId: e.userId,
        fullName: userMap.get(e.userId) ?? e.userId,
        date: e.at.slice(0, 10),
        type: e.type,
        at: e.at
      }))
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  async proposeShiftsPreview(weekStart: string): Promise<Shift[]> {
    const users = (await this.listUsers()).filter((u) => u.role !== "superuser").slice(0, 12);
    const proposals: Shift[] = [];
    let i = 0;
    for (const u of users) {
      const dayOff = (i % 7) + 1;
      const d = new Date(`${weekStart}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + dayOff);
      const y = d.toISOString().slice(0, 10);
      proposals.push({
        id: `prop-${u.id}-${y}`,
        userId: u.id,
        startAt: `${y}T08:00:00.000Z`,
        endAt: `${y}T17:00:00.000Z`,
        premiumCode: undefined,
        status: "scheduled"
      });
      i += 1;
    }
    return proposals;
  }

  async completeOffboard(
    actorId: string,
    targetUserId: string,
    checklist: Record<string, boolean>
  ): Promise<{ userId: string; checklist: Record<string, boolean>; accessDisabled: boolean }> {
    await this.getUser(targetUserId);
    const allDone = Object.values(checklist).every(Boolean);
    if (this.useDb) {
      if (allDone) {
        await this.supabase!.from("users").update({ email: `offboarded+${targetUserId}@invalid.local` }).eq("id", targetUserId);
      }
    }
    return { userId: targetUserId, checklist, accessDisabled: allDone };
  }

  async payrollForecastNextMonths(months = 3): Promise<Array<{ month: string; costChf: number }>> {
    const users = await this.listUsers();
    const base = users.reduce((acc, u) => acc + (Number(u.baseSalaryMonthly) || 5800), 0);
    const out: Array<{ month: string; costChf: number }> = [];
    const d = new Date();
    for (let m = 0; m < months; m += 1) {
      const x = new Date(d.getFullYear(), d.getMonth() + m, 1);
      const label = x.toISOString().slice(0, 7);
      const growth = 1 + m * 0.02;
      out.push({ month: label, costChf: Math.round(base * growth) });
    }
    return out;
  }

  private async fetchImportEventsFromDb(cap: number): Promise<NexaImportEventRow[]> {
    const { data, error } = await this.supabase!
      .from("nexa_import_events")
      .select("*")
      .order("finished_at", { ascending: false })
      .limit(cap);
    if (error) {
      throw new BadRequestException(`Lettura storico import fallita: ${error.message}`);
    }
    return this.mapImportEventRows(data ?? []);
  }

  private pbMemOrderKey(year: number, costCenterId: string): string {
    return `${year}|${costCenterId}`;
  }

  private pbMemCellKey(year: number, month: number, userId: string): string {
    return `${year}|${month}|${userId}`;
  }

  private pbYearStatusKey(companyId: string, year: number): string {
    return `${companyId.trim()}|${year}`;
  }

  private pbForecastMemKey(year: number, month: number, userId: string): string {
    return `${year}|${month}|${userId}`;
  }

  private payslipGrossAmount(p: Payslip | undefined): number | null {
    if (!p) {
      return null;
    }
    const g = p.lines.find((l) => l.code === "GROSS");
    return g != null ? g.amount : null;
  }

  private async travelReimbursementActualChf(userId: string, period: string): Promise<number> {
    const month = period.slice(0, 7);
    const all = await this.fetchAllExpenseClaimsForUser(userId);
    let sum = 0;
    for (const c of all) {
      if (c.status === "paid" && (c.payslipPeriod === period || c.payslipPeriod === month)) {
        sum += c.amountCents / 100;
      } else if (c.status === "approved" && !c.appliedPayslipId && c.createdAt.slice(0, 7) === month) {
        sum += c.amountCents / 100;
      }
    }
    return Math.round(sum * 100) / 100;
  }

  private async fetchPersonnelBudgetOrderFromDb(
    year: number
  ): Promise<Array<{ costCenterId: string; sortOrder: number }>> {
    if (!this.useDb) {
      const out: Array<{ costCenterId: string; sortOrder: number }> = [];
      for (const [k, sortOrder] of this.personnelBudgetCcOrderMem) {
        const [y, cc] = k.split("|");
        if (Number(y) === year) {
          out.push({ costCenterId: cc, sortOrder });
        }
      }
      return out.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_cost_center_order")
      .select("cost_center_id, sort_order")
      .eq("year", year)
      .order("sort_order", { ascending: true });
    if (error) {
      throw new InternalServerErrorException(`Budget order: ${error.message}`);
    }
    return (data ?? []).map((r: Record<string, unknown>) => ({
      costCenterId: String(r.cost_center_id),
      sortOrder: Number(r.sort_order)
    }));
  }

  private async fetchPersonnelBudgetCellsFromDb(
    year: number,
    month: number
  ): Promise<
    Map<
      string,
      {
        budgetRal: number | null;
        budgetOvertime: number | null;
        budgetTravel: number | null;
        budgetInps: number | null;
        budgetInail: number | null;
        budgetTfr: number | null;
      }
    >
  > {
    const map = new Map<
      string,
      {
        budgetRal: number | null;
        budgetOvertime: number | null;
        budgetTravel: number | null;
        budgetInps: number | null;
        budgetInail: number | null;
        budgetTfr: number | null;
      }
    >();
    if (!this.useDb) {
      for (const [k, v] of this.personnelBudgetCellsMem) {
        const [y, m, uid] = k.split("|");
        if (Number(y) === year && Number(m) === month) {
          map.set(uid, v);
        }
      }
      return map;
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_cells")
      .select(
        "user_id, budget_ral, budget_overtime, budget_travel, budget_social_inps, budget_social_inail, budget_tfr"
      )
      .eq("year", year)
      .eq("month", month);
    if (error) {
      throw new InternalServerErrorException(`Budget cells: ${error.message}`);
    }
    for (const r of data ?? []) {
      const row = r as Record<string, unknown>;
      map.set(String(row.user_id), {
        budgetRal: row.budget_ral != null ? Number(row.budget_ral) : null,
        budgetOvertime: row.budget_overtime != null ? Number(row.budget_overtime) : null,
        budgetTravel: row.budget_travel != null ? Number(row.budget_travel) : null,
        budgetInps: row.budget_social_inps != null ? Number(row.budget_social_inps) : null,
        budgetInail: row.budget_social_inail != null ? Number(row.budget_social_inail) : null,
        budgetTfr: row.budget_tfr != null ? Number(row.budget_tfr) : null
      });
    }
    return map;
  }

  private budgetTotal(b: Partial<PersonnelBudgetMoney>): number {
    return (
      (b.ral ?? 0) +
      (b.overtime ?? 0) +
      (b.travel ?? 0) +
      (b.inps ?? 0) +
      (b.inail ?? 0) +
      (b.tfr ?? 0)
    );
  }

  async getPersonnelBudgetSnapshot(year: number, month: number): Promise<PersonnelBudgetSnapshot> {
    if (month < 1 || month > 12) {
      throw new BadRequestException("Mese non valido");
    }
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const users = await this.listUsers();
    const centers = await this.listCostCenters();
    const ccById = new Map(centers.map((c) => [c.id, c]));
    const orderList = await this.fetchPersonnelBudgetOrderFromDb(year);
    const orderIdx = new Map(orderList.map((o, i) => [o.costCenterId, o.sortOrder]));
    const cells = await this.fetchPersonnelBudgetCellsFromDb(year, month);

    const deptMap = new Map<string | null, PersonnelBudgetRow[]>();
    for (const u of users) {
      const ccId = u.costCenterId ?? null;
      if (!deptMap.has(ccId)) {
        deptMap.set(ccId, []);
      }
      const payslip = await this.getPayslipForUserPeriodInternal(u.id, period);
      const base = Number(u.baseSalaryMonthly) > 0 ? Number(u.baseSalaryMonthly) : 5800;
      const overtime = await this.countMonthlyOvertimeAmount(u.id, period, base);
      const travel = await this.travelReimbursementActualChf(u.id, period);
      const grossFromPayslip = this.payslipGrossAmount(payslip);
      const grossAdjusted = grossFromPayslip ?? base + overtime;
      const isIt = this.effectivePayrollJurisdiction(u) === "IT";
      const ccRow = u.costCenterId != null ? ccById.get(u.costCenterId) : undefined;
      const ratesIt = isIt ? this.italianEmployerRatesForUser(u, ccRow) : null;
      const buckets = isIt
        ? employerBudgetBucketsFromGrossIt(grossAdjusted, {
            employerInpsRate: ratesIt!.employerInpsRate,
            inailRate: ratesIt!.inailRate,
            tfrDivisor: ratesIt!.tfrDivisor
          })
        : employerBudgetBucketsFromGrossChf(grossAdjusted, this.ageFromBirthDate(u.birthDate));
      const sugB =
        isIt && ratesIt
          ? employerBudgetBucketsFromGrossIt(base, {
              employerInpsRate: ratesIt.employerInpsRate,
              inailRate: ratesIt.inailRate,
              tfrDivisor: ratesIt.tfrDivisor
            })
          : null;
      const actual: PersonnelBudgetMoney = {
        ral: Math.round((grossFromPayslip ?? base) * 100) / 100,
        overtime: Math.round(overtime * 100) / 100,
        travel,
        inps: buckets.employerInpsLike,
        inail: buckets.employerInailLike,
        tfr: buckets.employerTfrLike,
        totalCompanyCost: buckets.totalCompanyCost + travel
      };
      const bc = cells.get(u.id);
      const budgetPartial: Partial<PersonnelBudgetMoney> = {
        ral: bc?.budgetRal ?? undefined,
        overtime: bc?.budgetOvertime ?? undefined,
        travel: bc?.budgetTravel ?? undefined,
        inps: bc?.budgetInps ?? undefined,
        inail: bc?.budgetInail ?? undefined,
        tfr: bc?.budgetTfr ?? undefined
      };
      const bKeys = Object.keys(budgetPartial).length;
      const budget: PersonnelBudgetRow["budget"] =
        bKeys > 0
          ? {
              ...budgetPartial,
              totalCompanyCost: this.budgetTotal(budgetPartial)
            }
          : {};
      deptMap.get(ccId)!.push({
        userId: u.id,
        fullName: u.fullName,
        costCenterId: ccId,
        costCenterName: ccId ? ccById.get(ccId)?.name : undefined,
        budget,
        actual,
        ...(sugB
          ? {
              suggestedBudget: {
                ral: Math.round(base * 100) / 100,
                overtime: 0,
                travel: 0,
                inps: sugB.employerInpsLike,
                inail: sugB.employerInailLike,
                tfr: sugB.employerTfrLike,
                totalCompanyCost: sugB.totalCompanyCost
              }
            }
          : {})
      });
    }

    const deptKeys = [...deptMap.keys()];
    const sortedDeptKeys = deptKeys.sort((a, b) => {
      const ida = a ?? "__none__";
      const idb = b ?? "__none__";
      const oa = a != null ? orderIdx.get(a) ?? 1_000_000 : 999_999;
      const ob = b != null ? orderIdx.get(b) ?? 1_000_000 : 999_999;
      if (oa !== ob) {
        return oa - ob;
      }
      const na = a != null ? ccById.get(a)?.name ?? ida : "— senza CDC —";
      const nb = b != null ? ccById.get(b)?.name ?? idb : "— senza CDC —";
      return na.localeCompare(nb);
    });

    const departments: PersonnelBudgetDepartment[] = sortedDeptKeys.map((ccId) => ({
      costCenterId: ccId,
      costCenterName:
        ccId != null ? ccById.get(ccId)?.name ?? ccId : "— senza centro di costo —",
      sortOrder: ccId != null ? orderIdx.get(ccId) ?? 1_000_000 : 999_999,
      rows: (deptMap.get(ccId) ?? []).sort((r1, r2) => r1.fullName.localeCompare(r2.fullName))
    }));

    return { year, month, period, departments };
  }

  async getPersonnelBudgetYearStatus(companyId: string, year: number): Promise<PersonnelBudgetYearStatusDto> {
    const cid = companyId.trim();
    if (!this.useDb) {
      const st = this.personnelBudgetYearStatusMem.get(this.pbYearStatusKey(cid, year));
      return {
        companyId: cid,
        year,
        status: st?.status ?? "draft",
        approvedAt: st?.approvedAt ?? null,
        approvedByUserId: st?.approvedByUserId ?? null
      };
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_year_status")
      .select("status, approved_at, approved_by_user_id")
      .eq("company_id", cid)
      .eq("year", year)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Stato budget anno: ${error.message}`);
    }
    const row = data as Record<string, unknown> | null;
    return {
      companyId: cid,
      year,
      status: (row?.status as PersonnelBudgetYearStatusKind) ?? "draft",
      approvedAt: row?.approved_at != null ? String(row.approved_at) : null,
      approvedByUserId: row?.approved_by_user_id != null ? String(row.approved_by_user_id) : null
    };
  }

  async assertPersonnelBudgetYearEditable(companyId: string, year: number): Promise<void> {
    const st = await this.getPersonnelBudgetYearStatus(companyId, year);
    if (st.status === "approved") {
      throw new BadRequestException("Il budget per questo anno è approvato e non è modificabile.");
    }
  }

  async approvePersonnelBudgetYear(
    companyId: string,
    year: number,
    approvedByUserId: string
  ): Promise<PersonnelBudgetYearStatusDto> {
    const cid = companyId.trim();
    const now = new Date().toISOString();
    if (!this.useDb) {
      this.personnelBudgetYearStatusMem.set(this.pbYearStatusKey(cid, year), {
        status: "approved",
        approvedAt: now,
        approvedByUserId
      });
      return this.getPersonnelBudgetYearStatus(cid, year);
    }
    const { error } = await this.supabase!.from("personnel_budget_year_status").upsert(
      {
        company_id: cid,
        year,
        status: "approved",
        approved_at: now,
        approved_by_user_id: approvedByUserId
      },
      { onConflict: "company_id,year" }
    );
    if (error) {
      throw new InternalServerErrorException(`Approvazione budget: ${error.message}`);
    }
    return this.getPersonnelBudgetYearStatus(cid, year);
  }

  async setPersonnelBudgetCostCenterOrder(
    companyId: string,
    year: number,
    items: Array<{ costCenterId: string; sortOrder: number }>
  ): Promise<void> {
    await this.assertPersonnelBudgetYearEditable(companyId, year);
    if (!this.useDb) {
      for (const it of items) {
        this.personnelBudgetCcOrderMem.set(this.pbMemOrderKey(year, it.costCenterId), it.sortOrder);
      }
      return;
    }
    for (const it of items) {
      const { error } = await this.supabase!.from("personnel_budget_cost_center_order").upsert(
        {
          year,
          cost_center_id: it.costCenterId,
          sort_order: it.sortOrder
        },
        { onConflict: "year,cost_center_id" }
      );
      if (error) {
        throw new InternalServerErrorException(`Salvataggio ordine CDC: ${error.message}`);
      }
    }
  }

  async upsertPersonnelBudgetCells(
    companyId: string,
    year: number,
    month: number,
    cells: Array<{
      userId: string;
      budgetRal?: number | null;
      budgetOvertime?: number | null;
      budgetTravel?: number | null;
      budgetInps?: number | null;
      budgetInail?: number | null;
      budgetTfr?: number | null;
    }>
  ): Promise<void> {
    if (month < 1 || month > 12) {
      throw new BadRequestException("Mese non valido");
    }
    await this.assertPersonnelBudgetYearEditable(companyId, year);
    const cid = companyId.trim();
    const users = await this.listUsers();
    const idOk = new Set(users.map((u) => u.id));
    for (const c of cells) {
      if (!idOk.has(c.userId)) {
        throw new BadRequestException(`Utente sconosciuto: ${c.userId}`);
      }
      const u = users.find((x) => x.id === c.userId);
      if (u && (u.companyId?.trim() || "") !== cid) {
        throw new BadRequestException(`Utente fuori azienda: ${c.userId}`);
      }
    }
    if (!this.useDb) {
      for (const c of cells) {
        const prev = this.personnelBudgetCellsMem.get(this.pbMemCellKey(year, month, c.userId)) ?? {
          budgetRal: null,
          budgetOvertime: null,
          budgetTravel: null,
          budgetInps: null,
          budgetInail: null,
          budgetTfr: null
        };
        this.personnelBudgetCellsMem.set(this.pbMemCellKey(year, month, c.userId), {
          budgetRal: c.budgetRal !== undefined ? c.budgetRal : prev.budgetRal,
          budgetOvertime: c.budgetOvertime !== undefined ? c.budgetOvertime : prev.budgetOvertime,
          budgetTravel: c.budgetTravel !== undefined ? c.budgetTravel : prev.budgetTravel,
          budgetInps: c.budgetInps !== undefined ? c.budgetInps : prev.budgetInps,
          budgetInail: c.budgetInail !== undefined ? c.budgetInail : prev.budgetInail,
          budgetTfr: c.budgetTfr !== undefined ? c.budgetTfr : prev.budgetTfr
        });
      }
      return;
    }
    const now = new Date().toISOString();
    for (const c of cells) {
      const { error } = await this.supabase!.from("personnel_budget_cells").upsert(
        {
          year,
          month,
          user_id: c.userId,
          budget_ral: c.budgetRal ?? null,
          budget_overtime: c.budgetOvertime ?? null,
          budget_travel: c.budgetTravel ?? null,
          budget_social_inps: c.budgetInps ?? null,
          budget_social_inail: c.budgetInail ?? null,
          budget_tfr: c.budgetTfr ?? null,
          updated_at: now
        },
        { onConflict: "year,month,user_id" }
      );
      if (error) {
        throw new InternalServerErrorException(`Salvataggio budget: ${error.message}`);
      }
    }
  }

  private async fetchAllPersonnelBudgetCellsForYear(year: number): Promise<
    Map<
      string,
      Map<
        number,
        {
          budgetRal: number | null;
          budgetOvertime: number | null;
          budgetTravel: number | null;
          budgetInps: number | null;
          budgetInail: number | null;
          budgetTfr: number | null;
        }
      >
    >
  > {
    const out = new Map<
      string,
      Map<
        number,
        {
          budgetRal: number | null;
          budgetOvertime: number | null;
          budgetTravel: number | null;
          budgetInps: number | null;
          budgetInail: number | null;
          budgetTfr: number | null;
        }
      >
    >();
    if (!this.useDb) {
      for (const [k, v] of this.personnelBudgetCellsMem) {
        const [y, m, uid] = k.split("|");
        if (Number(y) !== year) continue;
        const month = Number(m);
        if (!out.has(uid)) {
          out.set(uid, new Map());
        }
        out.get(uid)!.set(month, v);
      }
      return out;
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_cells")
      .select(
        "month, user_id, budget_ral, budget_overtime, budget_travel, budget_social_inps, budget_social_inail, budget_tfr"
      )
      .eq("year", year);
    if (error) {
      throw new InternalServerErrorException(`Budget celle anno: ${error.message}`);
    }
    for (const r of data ?? []) {
      const row = r as Record<string, unknown>;
      const uid = String(row.user_id);
      const month = Number(row.month);
      if (!out.has(uid)) {
        out.set(uid, new Map());
      }
      out.get(uid)!.set(month, {
        budgetRal: row.budget_ral != null ? Number(row.budget_ral) : null,
        budgetOvertime: row.budget_overtime != null ? Number(row.budget_overtime) : null,
        budgetTravel: row.budget_travel != null ? Number(row.budget_travel) : null,
        budgetInps: row.budget_social_inps != null ? Number(row.budget_social_inps) : null,
        budgetInail: row.budget_social_inail != null ? Number(row.budget_social_inail) : null,
        budgetTfr: row.budget_tfr != null ? Number(row.budget_tfr) : null
      });
    }
    return out;
  }

  async getPersonnelBudgetAnnualMatrix(companyId: string, year: number): Promise<PersonnelBudgetAnnualMatrixResult> {
    const cid = companyId.trim();
    const [yearStatus, settings, cellByUser, usersAll, centers] = await Promise.all([
      this.getPersonnelBudgetYearStatus(cid, year),
      this.getCompanySettings(cid),
      this.fetchAllPersonnelBudgetCellsForYear(year),
      this.listUsers(),
      this.listCostCenters()
    ]);
    const ccById = new Map(centers.map((c) => [c.id, c]));
    const teamNameById = new Map<string, string>();
    for (const u of usersAll) {
      const tid = u.teamId?.trim();
      if (tid && !teamNameById.has(tid)) {
        try {
          const wt = await this.getWorkTeam(tid);
          teamNameById.set(tid, wt.name);
        } catch {
          teamNameById.set(tid, tid);
        }
      }
    }
    const companyUsers = usersAll.filter((u) => (u.companyId?.trim() || "") === cid);
    const rows: PersonnelBudgetAnnualMatrixRow[] = [];
    for (const u of companyUsers) {
      const perMonth = cellByUser.get(u.id) ?? new Map();
      const months: PersonnelBudgetAnnualMatrixRow["months"] = [];
      for (let m = 1; m <= 12; m++) {
        const c = perMonth.get(m);
        months.push({
          month: m,
          budget: {
            ral: c?.budgetRal ?? null,
            overtime: c?.budgetOvertime ?? null,
            travel: c?.budgetTravel ?? null,
            inps: c?.budgetInps ?? null,
            inail: c?.budgetInail ?? null,
            tfr: c?.budgetTfr ?? null
          }
        });
      }
      const ccId = u.costCenterId ?? null;
      const tid = u.teamId?.trim() ?? null;
      rows.push({
        userId: u.id,
        fullName: u.fullName,
        costCenterId: ccId,
        costCenterName: ccId ? ccById.get(ccId)?.name : undefined,
        teamId: tid,
        teamName: tid ? teamNameById.get(tid) : undefined,
        months
      });
    }
    rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
    return {
      year,
      yearStatus,
      payrollInstallmentMonths: settings.payrollInstallmentMonths,
      rows
    };
  }

  async applyPersonnelBudgetProRata(companyId: string, year: number): Promise<{ monthsPatched: number; users: number }> {
    await this.assertPersonnelBudgetYearEditable(companyId, year);
    const cid = companyId.trim();
    const settings = await this.getCompanySettings(cid);
    const pim = settings.payrollInstallmentMonths;
    const users = (await this.listUsers()).filter((u) => (u.companyId?.trim() || "") === cid);
    const centers = await this.listCostCenters();
    const ccById = new Map(centers.map((c) => [c.id, c]));
    let monthsPatched = 0;
    for (let month = 1; month <= 12; month++) {
      const cells: Array<{
        userId: string;
        budgetRal: number | null;
        budgetOvertime: number | null;
        budgetTravel: number | null;
        budgetInps: number | null;
        budgetInail: number | null;
        budgetTfr: number | null;
      }> = [];
      for (const u of users) {
        const base = Number(u.baseSalaryMonthly) > 0 ? Number(u.baseSalaryMonthly) : 5800;
        const monthlyRal = Math.round(((base * pim) / 12) * 100) / 100;
        const isIt = this.effectivePayrollJurisdiction(u) === "IT";
        let inps = 0;
        let inail = 0;
        let tfr = 0;
        if (isIt) {
          const ccRow = u.costCenterId != null ? ccById.get(u.costCenterId) : undefined;
          const ratesIt = this.italianEmployerRatesForUser(u, ccRow);
          const buckets = employerBudgetBucketsFromGrossIt(monthlyRal, {
            employerInpsRate: ratesIt.employerInpsRate,
            inailRate: ratesIt.inailRate,
            tfrDivisor: ratesIt.tfrDivisor
          });
          inps = buckets.employerInpsLike;
          inail = buckets.employerInailLike;
          tfr = buckets.employerTfrLike;
        } else {
          const buckets = employerBudgetBucketsFromGrossChf(monthlyRal, this.ageFromBirthDate(u.birthDate));
          inps = buckets.employerInpsLike;
          inail = buckets.employerInailLike;
          tfr = buckets.employerTfrLike;
        }
        cells.push({
          userId: u.id,
          budgetRal: monthlyRal,
          budgetOvertime: 0,
          budgetTravel: 0,
          budgetInps: Math.round(inps * 100) / 100,
          budgetInail: Math.round(inail * 100) / 100,
          budgetTfr: Math.round(tfr * 100) / 100
        });
      }
      await this.upsertPersonnelBudgetCells(cid, year, month, cells);
      monthsPatched += 1;
    }
    return { monthsPatched, users: users.length };
  }

  private async fetchForecastCellsForMonth(
    year: number,
    month: number
  ): Promise<
    Map<
      string,
      {
        forecastRal: number | null;
        forecastOvertime: number | null;
        forecastTravel: number | null;
        forecastInps: number | null;
        forecastInail: number | null;
        forecastTfr: number | null;
      }
    >
  > {
    const map = new Map<
      string,
      {
        forecastRal: number | null;
        forecastOvertime: number | null;
        forecastTravel: number | null;
        forecastInps: number | null;
        forecastInail: number | null;
        forecastTfr: number | null;
      }
    >();
    if (!this.useDb) {
      for (const [k, v] of this.personnelBudgetForecastMem) {
        const [y, m, uid] = k.split("|");
        if (Number(y) === year && Number(m) === month) {
          map.set(uid, v);
        }
      }
      return map;
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_forecast_cells")
      .select(
        "user_id, forecast_ral, forecast_overtime, forecast_travel, forecast_social_inps, forecast_social_inail, forecast_tfr"
      )
      .eq("year", year)
      .eq("month", month);
    if (error) {
      throw new InternalServerErrorException(`Forecast cells: ${error.message}`);
    }
    for (const r of data ?? []) {
      const row = r as Record<string, unknown>;
      map.set(String(row.user_id), {
        forecastRal: row.forecast_ral != null ? Number(row.forecast_ral) : null,
        forecastOvertime: row.forecast_overtime != null ? Number(row.forecast_overtime) : null,
        forecastTravel: row.forecast_travel != null ? Number(row.forecast_travel) : null,
        forecastInps: row.forecast_social_inps != null ? Number(row.forecast_social_inps) : null,
        forecastInail: row.forecast_social_inail != null ? Number(row.forecast_social_inail) : null,
        forecastTfr: row.forecast_tfr != null ? Number(row.forecast_tfr) : null
      });
    }
    return map;
  }

  async getPersonnelBudgetForecastSnapshot(
    companyId: string,
    year: number,
    month: number
  ): Promise<PersonnelBudgetForecastSnapshot> {
    const cid = companyId.trim();
    const snap = await this.getPersonnelBudgetSnapshot(year, month);
    const fcMap = await this.fetchForecastCellsForMonth(year, month);
    const users = await this.listUsers();
    const inCo = new Set(users.filter((u) => (u.companyId?.trim() || "") === cid).map((u) => u.id));
    const departments = snap.departments
      .map((d) => {
        const rows = d.rows
          .filter((r) => inCo.has(r.userId))
          .map((r) => {
            const f = fcMap.get(r.userId);
            const b = r.budget;
            const bral = b.ral ?? 0;
            const bot = b.overtime ?? 0;
            const btr = b.travel ?? 0;
            const bin = b.inps ?? 0;
            const bia = b.inail ?? 0;
            const btf = b.tfr ?? 0;
            const fral = f?.forecastRal ?? bral;
            const fot = f?.forecastOvertime ?? bot;
            const ftr = f?.forecastTravel ?? btr;
            const fin = f?.forecastInps ?? bin;
            const fia = f?.forecastInail ?? bia;
            const ftf = f?.forecastTfr ?? btf;
            const forecast: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number } = {
              ral: fral,
              overtime: fot,
              travel: ftr,
              inps: fin,
              inail: fia,
              tfr: ftf,
              totalCompanyCost: fral + fot + ftr + fin + fia + ftf
            };
            return { ...r, forecast };
          });
        return { ...d, rows };
      })
      .filter((d) => d.rows.length > 0);
    return { year, month, period: snap.period, departments };
  }

  async upsertPersonnelForecastCells(
    companyId: string,
    year: number,
    month: number,
    cells: Array<{
      userId: string;
      forecastRal?: number | null;
      forecastOvertime?: number | null;
      forecastTravel?: number | null;
      forecastInps?: number | null;
      forecastInail?: number | null;
      forecastTfr?: number | null;
    }>
  ): Promise<void> {
    if (month < 1 || month > 12) {
      throw new BadRequestException("Mese non valido");
    }
    const cid = companyId.trim();
    const users = await this.listUsers();
    const idOk = new Set(users.map((u) => u.id));
    for (const c of cells) {
      if (!idOk.has(c.userId)) {
        throw new BadRequestException(`Utente sconosciuto: ${c.userId}`);
      }
      const u = users.find((x) => x.id === c.userId);
      if (u && (u.companyId?.trim() || "") !== cid) {
        throw new BadRequestException(`Utente fuori azienda: ${c.userId}`);
      }
    }
    const now = new Date().toISOString();
    if (!this.useDb) {
      for (const c of cells) {
        const prev = this.personnelBudgetForecastMem.get(this.pbForecastMemKey(year, month, c.userId)) ?? {
          forecastRal: null,
          forecastOvertime: null,
          forecastTravel: null,
          forecastInps: null,
          forecastInail: null,
          forecastTfr: null
        };
        this.personnelBudgetForecastMem.set(this.pbForecastMemKey(year, month, c.userId), {
          forecastRal: c.forecastRal !== undefined ? c.forecastRal : prev.forecastRal,
          forecastOvertime: c.forecastOvertime !== undefined ? c.forecastOvertime : prev.forecastOvertime,
          forecastTravel: c.forecastTravel !== undefined ? c.forecastTravel : prev.forecastTravel,
          forecastInps: c.forecastInps !== undefined ? c.forecastInps : prev.forecastInps,
          forecastInail: c.forecastInail !== undefined ? c.forecastInail : prev.forecastInail,
          forecastTfr: c.forecastTfr !== undefined ? c.forecastTfr : prev.forecastTfr
        });
      }
      return;
    }
    for (const c of cells) {
      const { error } = await this.supabase!.from("personnel_budget_forecast_cells").upsert(
        {
          year,
          month,
          user_id: c.userId,
          forecast_ral: c.forecastRal ?? null,
          forecast_overtime: c.forecastOvertime ?? null,
          forecast_travel: c.forecastTravel ?? null,
          forecast_social_inps: c.forecastInps ?? null,
          forecast_social_inail: c.forecastInail ?? null,
          forecast_tfr: c.forecastTfr ?? null,
          updated_at: now
        },
        { onConflict: "year,month,user_id" }
      );
      if (error) {
        throw new InternalServerErrorException(`Salvataggio forecast: ${error.message}`);
      }
    }
  }

  async getPersonnelBudgetAnalysis(
    companyId: string,
    year: number,
    month: number,
    thresholdPct: number,
    thresholdAbs: number
  ): Promise<PersonnelBudgetAnalysisResult> {
    const cid = companyId.trim();
    const snap = await this.getPersonnelBudgetForecastSnapshot(cid, year, month);
    const notes = await this.listPersonnelBudgetAnalysisNotes(cid, year, month);
    const totals: {
      actual: PersonnelBudgetMoney;
      budget: PersonnelBudgetMoney;
      forecast: PersonnelBudgetMoney;
    } = {
      actual: { ral: 0, overtime: 0, travel: 0, inps: 0, inail: 0, tfr: 0, totalCompanyCost: 0 },
      budget: { ral: 0, overtime: 0, travel: 0, inps: 0, inail: 0, tfr: 0, totalCompanyCost: 0 },
      forecast: { ral: 0, overtime: 0, travel: 0, inps: 0, inail: 0, tfr: 0, totalCompanyCost: 0 }
    };
    const variances: PersonnelBudgetAnalysisVarianceRow[] = [];
    const cats: PersonnelBudgetAnalysisCategory[] = [
      "ral",
      "overtime",
      "travel",
      "inps",
      "inail",
      "tfr",
      "totalCompanyCost"
    ];
    const pick = (
      m: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number },
      cat: PersonnelBudgetAnalysisCategory
    ): number => {
      if (cat === "totalCompanyCost") {
        return m.totalCompanyCost ?? 0;
      }
      return (m[cat] as number) ?? 0;
    };
    for (const d of snap.departments) {
      for (const r of d.rows) {
        const b = r.budget;
        const a = r.actual;
        const fr = r.forecast;
        const budTotal = this.budgetTotal(b);
        const actTotal = a.totalCompanyCost;
        const frTotal = fr.totalCompanyCost ?? 0;

        totals.actual.ral += a.ral;
        totals.actual.overtime += a.overtime;
        totals.actual.travel += a.travel;
        totals.actual.inps += a.inps;
        totals.actual.inail += a.inail;
        totals.actual.tfr += a.tfr;
        totals.actual.totalCompanyCost += actTotal;

        totals.budget.ral += b.ral ?? 0;
        totals.budget.overtime += b.overtime ?? 0;
        totals.budget.travel += b.travel ?? 0;
        totals.budget.inps += b.inps ?? 0;
        totals.budget.inail += b.inail ?? 0;
        totals.budget.tfr += b.tfr ?? 0;
        totals.budget.totalCompanyCost += budTotal;

        totals.forecast.ral += fr.ral ?? 0;
        totals.forecast.overtime += fr.overtime ?? 0;
        totals.forecast.travel += fr.travel ?? 0;
        totals.forecast.inps += fr.inps ?? 0;
        totals.forecast.inail += fr.inail ?? 0;
        totals.forecast.tfr += fr.tfr ?? 0;
        totals.forecast.totalCompanyCost += frTotal;

        const bud: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number } = {
          ...b,
          totalCompanyCost: budTotal
        };
        const act: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number } = {
          ...a,
          totalCompanyCost: actTotal
        };
        for (const cat of cats) {
          const av = pick(act, cat);
          const bv = pick(bud, cat);
          const fv = pick(fr, cat);
          const varianceBf = fv - bv;
          const denom = Math.abs(bv) < 1e-6 ? null : (varianceBf / bv) * 100;
          const exceeds =
            Math.abs(varianceBf) >= thresholdAbs ||
            (denom != null && Math.abs(denom) >= thresholdPct);
          if (exceeds) {
            variances.push({
              category: cat,
              userId: r.userId,
              fullName: r.fullName,
              actual: av,
              budget: bv,
              forecast: fv,
              varianceBf,
              variancePct: denom,
              exceedsThreshold: true
            });
          }
        }
      }
    }
    variances.sort((x, y) => Math.abs(y.varianceBf) - Math.abs(x.varianceBf));
    return {
      year,
      month,
      thresholdPct,
      thresholdAbs,
      totals,
      variances,
      notes
    };
  }

  async listPersonnelBudgetAnalysisNotes(
    companyId: string,
    year: number,
    month: number
  ): Promise<PersonnelBudgetAnalysisNoteDto[]> {
    const cid = companyId.trim();
    if (!this.useDb) {
      return [...this.personnelBudgetAnalysisNotesMem.values()].filter(
        (n) => n.companyId === cid && n.year === year && n.month === month
      );
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_analysis_notes")
      .select("*")
      .eq("company_id", cid)
      .eq("year", year)
      .eq("month", month)
      .order("updated_at", { ascending: false });
    if (error) {
      throw new InternalServerErrorException(`Note analysis: ${error.message}`);
    }
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      companyId: cid,
      year,
      month,
      category: String(row.category),
      subjectUserId: String(row.subject_user_id ?? ""),
      comment: String(row.comment ?? ""),
      authorId: String(row.author_id),
      updatedAt: String(row.updated_at)
    }));
  }

  async upsertPersonnelBudgetAnalysisNote(
    companyId: string,
    year: number,
    month: number,
    category: string,
    subjectUserId: string,
    comment: string,
    authorId: string
  ): Promise<PersonnelBudgetAnalysisNoteDto> {
    const cid = companyId.trim();
    const sub = subjectUserId.trim();
    const now = new Date().toISOString();
    if (!this.useDb) {
      const id = `pb-note-${cid}-${year}-${month}-${category}-${sub}-${authorId}`;
      const dto: PersonnelBudgetAnalysisNoteDto = {
        id,
        companyId: cid,
        year,
        month,
        category,
        subjectUserId: sub,
        comment: comment.slice(0, 8000),
        authorId,
        updatedAt: now
      };
      this.personnelBudgetAnalysisNotesMem.set(id, dto);
      return dto;
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_analysis_notes")
      .upsert(
        {
          company_id: cid,
          year,
          month,
          category: category.slice(0, 64),
          subject_user_id: sub,
          comment: comment.slice(0, 8000),
          author_id: authorId,
          updated_at: now
        },
        { onConflict: "company_id,year,month,category,subject_user_id" }
      )
      .select("id")
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Salvataggio nota: ${error.message}`);
    }
    const rows = await this.supabase!
      .from("personnel_budget_analysis_notes")
      .select("*")
      .eq("company_id", cid)
      .eq("year", year)
      .eq("month", month)
      .eq("category", category.slice(0, 64))
      .eq("subject_user_id", sub)
      .maybeSingle();
    if (rows.error || !rows.data) {
      throw new InternalServerErrorException("Nota non recuperata dopo upsert");
    }
    const row = rows.data as Record<string, unknown>;
    return {
      id: String(row.id),
      companyId: cid,
      year,
      month,
      category: String(row.category),
      subjectUserId: String(row.subject_user_id ?? ""),
      comment: String(row.comment ?? ""),
      authorId: String(row.author_id),
      updatedAt: String(row.updated_at)
    };
  }

  private defaultCompanySettingsStored(): CompanySettingsStored {
    return {
      fiscalYearStartMonth: 1,
      companyLegalName: "",
      companyVatNumber: "",
      companyRegistrationInfo: "",
      defaultCurrency: "EUR",
      weeklyFullTimeHours: 40,
      payrollInstallmentMonths: 12,
      customVariables: {}
    };
  }

  private normalizeCompanySettingsStored(raw: unknown): CompanySettingsStored {
    const d = this.defaultCompanySettingsStored();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return d;
    }
    const o = raw as Record<string, unknown>;
    const m = o.fiscalYearStartMonth;
    if (typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 12) {
      d.fiscalYearStartMonth = m;
    }
    if (typeof o.companyLegalName === "string") {
      d.companyLegalName = o.companyLegalName.slice(0, 240);
    }
    if (typeof o.companyVatNumber === "string") {
      d.companyVatNumber = o.companyVatNumber.slice(0, 64);
    }
    if (typeof o.companyRegistrationInfo === "string") {
      d.companyRegistrationInfo = o.companyRegistrationInfo.slice(0, 240);
    }
    if (typeof o.defaultCurrency === "string" && o.defaultCurrency.trim()) {
      d.defaultCurrency = o.defaultCurrency.trim().toUpperCase().slice(0, 8);
    }
    const w = o.weeklyFullTimeHours;
    if (typeof w === "number" && Number.isFinite(w)) {
      const n = Math.round(w);
      if (n >= 1 && n <= 80) {
        d.weeklyFullTimeHours = n;
      }
    }
    const pim = o.payrollInstallmentMonths;
    if (typeof pim === "number" && Number.isInteger(pim) && pim >= 12 && pim <= 14) {
      d.payrollInstallmentMonths = pim;
    }
    if (o.customVariables && typeof o.customVariables === "object" && !Array.isArray(o.customVariables)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(o.customVariables as Record<string, unknown>)) {
        if (k.length > 120) continue;
        if (typeof v !== "string") continue;
        out[k] = v.slice(0, 2000);
      }
      d.customVariables = out;
    }
    return d;
  }

  private mergeCompanySettingsStored(
    into: CompanySettingsStored,
    patch: Partial<CompanySettingsStored>
  ): CompanySettingsStored {
    const next = { ...into };
    if (patch.fiscalYearStartMonth !== undefined) {
      const m = patch.fiscalYearStartMonth;
      if (m >= 1 && m <= 12) next.fiscalYearStartMonth = m;
    }
    if (patch.companyLegalName !== undefined) {
      next.companyLegalName = patch.companyLegalName.trim().slice(0, 240);
    }
    if (patch.companyVatNumber !== undefined) {
      next.companyVatNumber = patch.companyVatNumber.trim().slice(0, 64);
    }
    if (patch.companyRegistrationInfo !== undefined) {
      next.companyRegistrationInfo = patch.companyRegistrationInfo.trim().slice(0, 240);
    }
    if (patch.defaultCurrency !== undefined) {
      const c = patch.defaultCurrency.trim().toUpperCase().slice(0, 8);
      next.defaultCurrency = c || "EUR";
    }
    if (patch.weeklyFullTimeHours !== undefined) {
      const h = patch.weeklyFullTimeHours;
      if (h >= 1 && h <= 80) next.weeklyFullTimeHours = h;
    }
    if (patch.payrollInstallmentMonths !== undefined) {
      const p = patch.payrollInstallmentMonths;
      if (p >= 12 && p <= 14) next.payrollInstallmentMonths = p;
    }
    if (patch.customVariables !== undefined) {
      next.customVariables = this.normalizeCompanySettingsStored({
        customVariables: patch.customVariables
      }).customVariables;
    }
    return next;
  }

  async getCompanySettings(companyId: string): Promise<CompanySettingsDto> {
    const id = companyId.trim();
    if (!id) {
      throw new BadRequestException("companyId mancante");
    }
    if (!this.useDb) {
      const mem = this.companySettingsMem.get(id);
      const stored = mem
        ? this.normalizeCompanySettingsStored(mem)
        : this.defaultCompanySettingsStored();
      return { companyId: id, ...stored };
    }
    const { data, error } = await this.supabase!
      .from("company_settings")
      .select("settings")
      .eq("companyId", id)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Lettura impostazioni azienda: ${error.message}`);
    }
    const stored = this.normalizeCompanySettingsStored(data?.settings ?? {});
    return { companyId: id, ...stored };
  }

  async patchCompanySettings(
    companyId: string,
    patch: Partial<CompanySettingsStored>
  ): Promise<CompanySettingsDto> {
    const id = companyId.trim();
    if (!id) {
      throw new BadRequestException("companyId mancante");
    }
    const current = await this.getCompanySettings(id);
    const { companyId: _cid, ...curRest } = current;
    const nextStored = this.mergeCompanySettingsStored(curRest, patch);

    if (!this.useDb) {
      this.companySettingsMem.set(id, nextStored);
      return { companyId: id, ...nextStored };
    }
    const now = new Date().toISOString();
    const { error } = await this.supabase!.from("company_settings").upsert(
      {
        companyId: id,
        settings: nextStored,
        updatedAt: now
      },
      { onConflict: "companyId" }
    );
    if (error) {
      throw new InternalServerErrorException(`Salvataggio impostazioni azienda: ${error.message}`);
    }
    return { companyId: id, ...nextStored };
  }

  private mapImportEventRows(data: Record<string, unknown>[]): NexaImportEventRow[] {
    const rows = data as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      kind: r.kind as "validate" | "apply",
      category: String(r.category),
      startedAt: String(r.started_at),
      finishedAt: String(r.finished_at),
      status: String(r.status),
      rowCount: Number(r.row_count ?? 0),
      createdCount: r.created_count !== null && r.created_count !== undefined ? Number(r.created_count) : null,
      errorCount: Number(r.error_count ?? 0),
      fileSizeBytes: r.file_size_bytes !== null && r.file_size_bytes !== undefined ? Number(r.file_size_bytes) : null,
      fileName: r.file_name ? String(r.file_name) : null,
      errorsSnapshot: r.errors_snapshot,
      actorUserId: r.actor_user_id ? String(r.actor_user_id) : null,
      actorEmail: r.actor_email ? String(r.actor_email) : null,
      auditMeta: (r.audit_meta as Record<string, unknown>) ?? {}
    }));
  }
}
