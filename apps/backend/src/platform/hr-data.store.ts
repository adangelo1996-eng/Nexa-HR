import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type ApprovalView,
  type CalendarEvent,
  type CompanyHoliday,
  type EmployeeDocument,
  type EmployeeDocumentKind,
  type HrDocumentSignatureRequest,
  type HrDocumentSignatureRequestStatus,
  type ExpenseClaim,
  type InnovationJob,
  type InnovationJobStatus,
  type LeaveBalance,
  type LeavePlan,
  type LeavePlanKind,
  type OnboardingChecklistItem,
  type OnboardingStatus,
  type Payslip,
  type SicknessEvent,
  type Shift,
  type TimeEntry,
  type User,
  type UserNotification,
  type WorkMode,
  type WorkdaySummary,
  type Role,
  type CostCenter,
  type WorkTeam,
  type ClockChannel,
  type GeoFix,
  isPayrollCompetencePeriodCalculableTodayRome,
  payrollCompetenceCalculationFirstDateIsoRome
} from "@payday/domain";
import {
  calculateItalianPayroll,
  defaultItalianRuleSet2026,
  employerBudgetBucketsFromGrossIt,
  employerRatesFromItalianProfile,
  resolveComoMunicipalAddizionaleRate,
  type ItalianPayrollInput,
  type ItalianPayrollProfileEmployer,
  type PayrollItSector
} from "@payday/payroll-adapters-it";
import {
  decryptUserFromStorage,
  encryptUserForStorage,
  loadUserPiiKeyFromEnv
} from "@payday/user-pii-crypto";
import type { AuthRole } from "./auth";
import {
  ADMIN_EXPORT_FIELD_CATALOG,
  ADMIN_EXPORT_VARIABLE_FIELD_IDS,
  assertAdminExportFieldSelection
} from "./admin-export.catalog";
import { ALL_CATALOG_PERMISSION_IDS, LEGACY_TO_NEW_KEYS } from "./permission-catalog";
import { isSynapseSuperuserEmail } from "./synapse-superuser";
import {
  findSignedAncestorId,
  isVaultDocumentSigned,
  shouldCreateVaultSignatureRequest
} from "../documents/document-signature-workflow.util";

export interface ExpenseWorkflowRow {
  claim: ExpenseClaim;
  requesterName: string;
  requesterPhotoUrl?: string | null;
  /** Responsabile di I livello anagrafico (manager o team lead), se presente. */
  firstLineManagerName: string | null;
}

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

/** Riga richiesta remote working (tabella `smartworking_requests`, tipo approvazione `smartworking`). */
export interface SmartworkingRequestRow {
  id: string;
  userId: string;
  day: string;
  /** Ultimo giorno incluso (YYYY-MM-DD); se assente equivale a `day`. */
  endDay?: string | null;
  note?: string | null;
  status: "pending" | "approved" | "rejected";
  approverId?: string | null;
  decisionAt?: string | null;
  rejectReason?: string | null;
  createdAt: string;
}

export interface HrShiftPresetRow {
  id: string;
  companyId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isDefault: boolean;
  workTeamId?: string | null;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
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

export type PersonnelBudgetPlannedExtraLine = {
  id: string;
  label: string;
  budget: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
};

export type PersonnelBudgetDepartment = {
  costCenterId: string | null;
  costCenterName: string;
  sortOrder: number;
  rows: PersonnelBudgetRow[];
  /** Voci pianificate aggiuntive (non legate a dipendente). */
  plannedExtraLines?: PersonnelBudgetPlannedExtraLine[];
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
  /** YYYY-MM-DD da anagrafica (pro-rata / mese ingresso). */
  hireDate?: string | null;
  /** YYYY-MM-DD fine rapporto se presente (mese uscita). */
  contractEndDate?: string | null;
  months: Array<{
    month: number;
    budget: PersonnelBudgetCellValues;
  }>;
};

export type WorkforcePlanningScenarioRow = {
  id: string;
  name: string;
  assumptionsJson: Record<string, unknown>;
  payloadJson: Record<string, unknown>;
  analysisText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HrRoleCoverageGapRow = {
  id: string;
  roleTitle: string;
  headcountGap: number;
  expectedRalAnnual: number | null;
  notes: string | null;
  updatedAt: string;
};

export type PersonnelBudgetAnnualMatrixResult = {
  year: number;
  yearStatus: PersonnelBudgetYearStatusDto;
  payrollInstallmentMonths: number;
  rows: PersonnelBudgetAnnualMatrixRow[];
};

export type PersonnelBudgetAssumptionsDto = {
  companyId: string;
  year: number;
  employerInpsPercent: number | null;
  employeeInpsPercent: number | null;
  inailPermille: number | null;
  tfrDivisor: number | null;
  welfarePercent: number;
  bonusProvisionPercent: number;
  inflationPercentAnnual: number;
  payrollIndexationPercent: number;
  defaultPayMonthsPerYear: number;
  defaultWeeklyContractHours: number;
  plannedNewHires: number;
  plannedExits: number;
  avgNewHireRalAnnual: number | null;
  employerInpsDiscountPercent: number;
  overtimeBudgetPercentOnGross: number;
  travelBudgetPerFteMonthly: number;
  compilationNotes: string;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type PersonnelBudgetAssumptionsPatch = Partial<{
  employerInpsPercent: number | null;
  employeeInpsPercent: number | null;
  inailPermille: number | null;
  tfrDivisor: number | null;
  welfarePercent: number | null;
  bonusProvisionPercent: number | null;
  inflationPercentAnnual: number | null;
  payrollIndexationPercent: number | null;
  defaultPayMonthsPerYear: number | null;
  defaultWeeklyContractHours: number | null;
  plannedNewHires: number | null;
  plannedExits: number | null;
  avgNewHireRalAnnual: number | null;
  employerInpsDiscountPercent: number | null;
  overtimeBudgetPercentOnGross: number | null;
  travelBudgetPerFteMonthly: number | null;
  compilationNotes: string | null;
}>;

export type PersonnelBudgetCellNoteDto = {
  id: string;
  companyId: string;
  year: number;
  month: number | null;
  userId: string | null;
  plannedLineId: string | null;
  fieldKey: string;
  note: string;
  authorUserId: string | null;
  authorName: string | null;
  updatedAt: string;
};

export type PersonnelBudgetYearMonthlyRow = PersonnelBudgetRow & {
  forecast: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number };
};

export type PersonnelBudgetYearMonthlyDepartment = {
  costCenterId: string | null;
  costCenterName: string;
  sortOrder: number;
  rows: PersonnelBudgetYearMonthlyRow[];
  plannedExtraLines?: PersonnelBudgetPlannedExtraLine[];
};

export type PersonnelBudgetYearMonthlyResult = {
  year: number;
  months: Array<{
    month: number;
    departments: PersonnelBudgetYearMonthlyDepartment[];
  }>;
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
/** Massimo giorni di remote working richiedibili nella stessa settimana (lun–dom UTC) per dipendente (tipo `smartworking`). */
const SMARTWORKING_WEEKLY_QUOTA = 2;
/** Massimo giorni consecutivi per singola richiesta remote working. */
const SMARTWORKING_MAX_RANGE_DAYS = 14;

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
  /** Import Excel template: usa l’ID preassegnato (es. u-tpl-…) invece di generarne uno nuovo. */
  forcedUserId?: string;
}

interface UserCreateInput {
  firstName: string;
  lastName: string;
  /** Se valorizzato, sostituisce la concatenazione nome+cognome in anagrafica. */
  fullName?: string;
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
  employmentState?: "active" | "hr_onboarding" | "offboarding";
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
  employmentState?: "active" | "hr_onboarding" | "offboarding";
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
  /** Sede legale / indirizzo operativo (prefill contratti). */
  companyAddress: string;
  companyVatNumber: string;
  companyRegistrationInfo: string;
  /** Contratto nazionale di riferimento per l’azienda (testo o codice). */
  companyCcnl: string;
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
  /** Lazy: chiave AES-256 per colonne PII su `users` (`USER_PII_ENCRYPTION_KEY`); `null` = disabilitato. */
  private userPiiKeyResolved: Buffer | null | undefined = undefined;
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
      vacationAllowanceDays: 26,
      employmentState: "active"
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
      vacationAllowanceDays: 24,
      employmentState: "active"
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
      vacationAllowanceDays: 22,
      employmentState: "active"
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
  private readonly shiftPresets: HrShiftPresetRow[] = [];
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
  private readonly documentSignatureRequestsMem: HrDocumentSignatureRequest[] = [];
  /** `false` se tabella migration 080 non ancora applicata su Supabase. */
  private documentSignatureDbEnabled: boolean | null = null;
  private readonly onboardingByUser = new Map<string, OnboardingStatus>();
  private readonly offboardingByUser = new Map<string, OnboardingStatus>();
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
    },
    {
      id: "wt-demo-fin",
      costCenterId: "cc-2",
      name: "Team Contabilità demo",
      leadUserId: undefined
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
  /** key companyId|year|month|lineId */
  private readonly personnelBudgetPlannedExtraMem = new Map<
    string,
    PersonnelBudgetPlannedExtraLine & { costCenterId: string | null }
  >();
  /** key companyId|year */
  private readonly personnelBudgetAssumptionsMem = new Map<string, PersonnelBudgetAssumptionsDto>();
  /** key companyId|year|month|fieldKey|userId|plannedLineId */
  private readonly personnelBudgetCellNotesMem = new Map<string, PersonnelBudgetCellNoteDto>();
  /** Dev senza DB: ultimi run turnover per companyId. */
  private readonly turnoverSignalRunsMem = new Map<
    string,
    Array<{
      runId: string;
      computedAt: string;
      rows: Array<{
        userId: string;
        score: number;
        confidence: number;
        reasons: string[];
        signals: Record<string, number>;
        modelVersion: string;
      }>;
    }>
  >();
  private readonly hrAlertsMem: Array<{
    id: string;
    company_id: string;
    rule_key: string;
    severity: string;
    title: string;
    body: string;
    metric_payload: Record<string, unknown>;
    dedupe_key: string;
    status: string;
    created_at: string;
    acknowledged_at: string | null;
    acknowledged_by_user_id: string | null;
  }> = [];
  private readonly hitlProposalsMem: Array<{
    id: string;
    company_id: string;
    actor_user_id: string;
    kind: string;
    status: string;
    payload: Record<string, unknown>;
    rationale: string;
    created_at: string;
    decided_at: string | null;
    decided_by_user_id: string | null;
  }> = [];
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

  constructor(@Optional() private readonly moduleRef?: ModuleRef) {
    const url = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceRole) {
      this.supabase = createClient(url, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
  }

  private async resolveSmartworkingQuotas(
    userId: string,
    monthPrefix?: string
  ): Promise<{ weekly: number; monthly: number }> {
    if (!this.moduleRef) {
      return { weekly: SMARTWORKING_WEEKLY_QUOTA, monthly: SMARTWORKING_MONTHLY_QUOTA };
    }
    try {
      const { RemoteWorkPolicyService } = await import("../smartworking/remote-work-policy.service");
      const svc = this.moduleRef.get(RemoteWorkPolicyService, { strict: false });
      const limits = await svc.getEffectiveLimitsForUser(userId, monthPrefix);
      return {
        weekly: limits.allowedRemoteDaysPerWeek,
        monthly: limits.allowedRemoteDaysPerMonth
      };
    } catch {
      return { weekly: SMARTWORKING_WEEKLY_QUOTA, monthly: SMARTWORKING_MONTHLY_QUOTA };
    }
  }

  private resolveUserPiiKey(): Buffer | null {
    if (this.userPiiKeyResolved !== undefined) {
      return this.userPiiKeyResolved;
    }
    const key = loadUserPiiKeyFromEnv();
    this.userPiiKeyResolved = key;
    if (this.useDb && !key && process.env.NODE_ENV === "production") {
      this.logger.warn(
        "USER_PII_ENCRYPTION_KEY assente: i campi PII configurati su public.users restano in chiaro. Impostare la chiave in produzione."
      );
    }
    return key;
  }

  private coerceEmploymentState(v: unknown): "active" | "hr_onboarding" | "offboarding" {
    if (v === "hr_onboarding" || v === "offboarding") {
      return v;
    }
    return "active";
  }

  private mapUserRowFromDatabase(row: User): User {
    const decrypted = decryptUserFromStorage({ ...row } as User, this.resolveUserPiiKey());
    const rawEs = (decrypted as { employmentState?: unknown }).employmentState;
    return {
      ...decrypted,
      role: coercePlatformRole(decrypted.role),
      employmentState: this.coerceEmploymentState(rawEs)
    };
  }

  private mapUserRowToDatabase(user: User): User {
    return encryptUserForStorage(user, this.resolveUserPiiKey());
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

  /** True se le letture/scritture utenti passano da Supabase (serve per transazioni SQL dirette). */
  usesDatabase(): boolean {
    return this.useDb;
  }

  /**
   * Client Supabase con service role (bypass RLS). Solo per codice server Nest.
   * Evita dipendenze da DATABASE_URL / SUPABASE_DB_URL per accessi che possono usare PostgREST.
   */
  getServiceRoleClient(): SupabaseClient {
    if (!this.supabase) {
      throw new InternalServerErrorException(
        "Supabase non configurato: impostare SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    return this.supabase;
  }

  private async ensureSeedUsers(): Promise<void> {
    if (!this.useDb || this.seeded) return;
    await this.ensureSeedReferenceData();
    const { data, error } = await this.supabase!.from("users").select("id").limit(1);
    if (error) return;
    if (!data || data.length === 0) {
      const sealed = this.users.map((u) => this.mapUserRowToDatabase(u));
      await this.supabase!.from("users").insert(sealed);
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
      return row ? this.mapUserRowFromDatabase(row) : null;
    }
    const mem = this.users.find((item) => item.email.toLowerCase() === normalized.toLowerCase());
    return mem ? { ...mem, role: coercePlatformRole(mem.role) } : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const normalized = String(id ?? "").trim();
    if (!normalized) {
      return null;
    }
    await this.ensureSeedUsers();
    if (this.useDb) {
      const { data, error } = await this.supabase!
        .from("users")
        .select("*")
        .eq("id", normalized)
        .maybeSingle();
      if (error) {
        return null;
      }
      const row = data as User | null;
      return row ? this.mapUserRowFromDatabase(row) : null;
    }
    const mem = this.users.find((item) => item.id === normalized);
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
      return ((data as User[]) ?? []).map((u) => this.mapUserRowFromDatabase(u));
    }
    return this.users.map((u) => ({ ...u, role: coercePlatformRole(u.role) }));
  }

  /** Lookup utenti per id (evita `listUsers()` completo su liste scoped). */
  private async mapUsersByIds(userIds: string[]): Promise<Map<string, User>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) {
      return new Map();
    }
    if (this.useDb) {
      const { data, error } = await this.supabase!.from("users").select("*").in("id", unique);
      if (error) {
        throw new BadRequestException(`Lettura utenti fallita: ${error.message}`);
      }
      return new Map(
        ((data ?? []) as User[]).map((row) => [row.id, this.mapUserRowFromDatabase(row)])
      );
    }
    const idSet = new Set(unique);
    return new Map(
      this.users
        .filter((item) => idSet.has(item.id))
        .map((item) => [item.id, { ...item, role: coercePlatformRole(item.role) }])
    );
  }

  async getUser(userId: string): Promise<User> {
    await this.ensureSeedUsers();
    if (this.useDb) {
      const { data, error } = await this.supabase!.from("users").select("*").eq("id", userId).maybeSingle();
      if (error) {
        throw new BadRequestException(`Lettura utente fallita: ${error.message}`);
      }
      if (!data) {
        throw new NotFoundException("Utente non trovato");
      }
      const u = data as User;
      return this.mapUserRowFromDatabase(u);
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
      let rows = ((data as User[]) ?? []).map((u) => this.mapUserRowFromDatabase(u));
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

  private buildUserRecordForInsert(input: UserCreateInput, resolvedEmail: string, id: string): User {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const weeklyContractHours = this.normalizeWeeklyContractHours(input.weeklyContractHours);
    const fullName =
      input.fullName?.trim().replace(/\s+/g, " ").trim() || this.computeFullName(firstName, lastName);
    const user: User = {
      id,
      firstName,
      lastName,
      fullName,
      email: resolvedEmail,
      role: input.role,
      managerId: input.managerId,
      companyId: input.companyId,
      roleId: input.roleId,
      costCenterId: input.costCenterId,
      teamId: input.teamId,
      contractType: input.contractType,
      weeklyContractHours,
      avsNumber: null,
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
      jurisdiction: "IT",
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
      contractFixedTerm: input.contractFixedTerm ?? false,
      employmentState: input.employmentState ?? "active"
    };
    if (
      user.annualGrossSalary != null &&
      Number(user.annualGrossSalary) > 0 &&
      user.payMonthsPerYear != null
    ) {
      user.baseSalaryMonthly =
        Math.round((Number(user.annualGrossSalary) / user.payMonthsPerYear) * 100) / 100;
    }
    return user;
  }

  /**
   * Alloca email univoca per una riga di creazione in un import batch (insieme a `takenLower`).
   */
  async allocateBatchCreateEmail(input: UserCreateInput, takenLower: Set<string>): Promise<string> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const explicit = input.email?.trim();
    if (explicit) {
      if (!this.simpleEmailRegex().test(explicit)) {
        throw new BadRequestException("Formato email non valido");
      }
      const low = explicit.toLowerCase();
      if (takenLower.has(low)) {
        throw new BadRequestException("Email duplicata nel file di import");
      }
      const users = await this.listUsers();
      if (users.some((item) => item.email.toLowerCase() === low)) {
        throw new BadRequestException("Esiste gia un utente con questa email");
      }
      takenLower.add(low);
      return explicit;
    }
    const users = await this.listUsers();
    const domain = this.emailDomain();
    const base = this.composeEmail(firstName, lastName);
    let suffix = 0;
    const used = (e: string) =>
      takenLower.has(e.toLowerCase()) || users.some((item) => item.email.toLowerCase() === e.toLowerCase());
    let candidate = base;
    while (suffix < 5000) {
      if (!used(candidate)) {
        takenLower.add(candidate.toLowerCase());
        return candidate;
      }
      suffix += 1;
      const [local] = base.split("@");
      candidate = `${local}${suffix}@${domain}`;
    }
    throw new BadRequestException("Impossibile generare una email univoca");
  }

  /** Riga utente per INSERT transazione Postgres (email già risolta, id esplicito). */
  async materializeUserRowForPgInsert(input: UserCreateInput, id: string): Promise<User> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException("Nome e cognome sono obbligatori");
    }
    const em = input.email?.trim();
    if (!em) {
      throw new BadRequestException("Email mancante per materializzazione utente");
    }
    await this.validateReferenceIds(input.roleId, input.costCenterId);
    if (input.jurisdiction != null && input.jurisdiction !== "IT") {
      throw new BadRequestException("È supportata solo la giurisdizione payroll Italia (IT).");
    }
    return this.buildUserRecordForInsert(input, em, id);
  }

  private async mergePatchIntoUserRecord(
    user: User,
    input: UserUpdateInput,
    _options?: UserWriteOptions,
    reservedEmailsLower?: Set<string>
  ): Promise<User> {
    await this.validateReferenceIds(input.roleId, input.costCenterId);
    if (input.jurisdiction != null && input.jurisdiction !== "IT") {
      throw new BadRequestException("È supportata solo la giurisdizione payroll Italia (IT).");
    }
    if (input.employmentState !== undefined) {
      if (!["active", "hr_onboarding", "offboarding"].includes(input.employmentState)) {
        throw new BadRequestException("Stato occupazionale non valido");
      }
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
      const others = (await this.listUsers()).filter((item) => item.id !== user.id);
      if (others.some((item) => item.email.toLowerCase() === lower)) {
        throw new BadRequestException("Esiste gia un utente con questa email");
      }
      if (reservedEmailsLower?.has(lower) && lower !== user.email.toLowerCase()) {
        throw new BadRequestException("Email gia assegnata in questo import");
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
    (payload as { avsNumber?: string | null }).avsNumber = null;
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
    void _options;
    if (reservedEmailsLower != null && input.email !== undefined) {
      const oldLow = user.email.toLowerCase();
      const newLow = nextEmail.toLowerCase();
      if (oldLow !== newLow) {
        reservedEmailsLower.add(newLow);
      }
    }
    return payload;
  }

  private async mergeUserRecordForUpdate(
    userId: string,
    input: UserUpdateInput,
    options?: UserWriteOptions
  ): Promise<User> {
    const user = await this.getUser(userId);
    return this.mergePatchIntoUserRecord(user, input, options);
  }

  /**
   * Merge patch su una copia utente già nota (stesso ordine del apply sequenziale).
   * `reservedEmailsLower` opzionale: email già riservate nello stesso import (create o update precedenti).
   */
  async mergeUserUpdateIntoRecord(
    baseUser: User,
    input: UserUpdateInput,
    options?: UserWriteOptions,
    reservedEmailsLower?: Set<string>
  ): Promise<User> {
    return this.mergePatchIntoUserRecord(baseUser, input, options, reservedEmailsLower);
  }

  /** Record utente completo dopo merge (per UPDATE transazione Postgres). */
  async materializeUserRowForPgUpdate(
    userId: string,
    input: UserUpdateInput,
    options?: UserWriteOptions
  ): Promise<User> {
    return this.mergeUserRecordForUpdate(userId, input, options);
  }

  async createUser(input: UserCreateInput, options?: UserWriteOptions): Promise<User> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException("Nome e cognome sono obbligatori");
    }
    await this.validateReferenceIds(input.roleId, input.costCenterId);
    if (input.jurisdiction != null && input.jurisdiction !== "IT") {
      throw new BadRequestException("È supportata solo la giurisdizione payroll Italia (IT).");
    }
    const email = await this.resolveCreateEmail(firstName, lastName, input.email);
    const forced = options?.forcedUserId?.trim();
    const id = forced && forced.length > 0 ? forced : `u-${Date.now()}`;
    if (!this.useDb && this.users.some((u) => u.id === id)) {
      throw new BadRequestException(`ID utente già in uso: ${id}`);
    }
    const user = this.buildUserRecordForInsert(input, email, id);
    if (this.useDb) {
      await this.supabase!.from("users").insert(this.mapUserRowToDatabase(user));
      return user;
    }
    this.users.push(user);
    return user;
  }

  async updateUser(userId: string, input: UserUpdateInput, options?: UserWriteOptions): Promise<User> {
    const payload = await this.mergeUserRecordForUpdate(userId, input, options);
    if (this.useDb) {
      const { data, error } = await this.supabase!
        .from("users")
        .update(this.mapUserRowToDatabase(payload))
        .eq("id", userId)
        .select("*")
        .maybeSingle();
      if (error) {
        throw new BadRequestException(`Aggiornamento utente fallito: ${error.message}`);
      }
      if (!data) {
        throw new NotFoundException("Utente non trovato o nessuna riga aggiornata (verifica ID dipendente).");
      }
      const u = data as User;
      return this.mapUserRowFromDatabase(u);
    }
    const live = this.users.find((item) => item.id === userId);
    if (!live) {
      throw new NotFoundException("Utente non trovato");
    }
    Object.assign(live, payload);
    live.role = coercePlatformRole(payload.role);
    return { ...live, role: live.role };
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

  private expandRolePermissionsRaw(raw: string[]): Set<string> {
    const out = new Set<string>();
    for (const p of raw) {
      if (p === "*") {
        for (const id of ALL_CATALOG_PERMISSION_IDS) {
          out.add(id);
        }
        continue;
      }
      out.add(p);
      const mapped = LEGACY_TO_NEW_KEYS[p];
      if (mapped) {
        for (const id of mapped) {
          out.add(id);
        }
      }
    }
    return out;
  }

  /** Allineato a PermissionsService.canAccessHrExtendedConsole (evita dipendenza circolare). */
  private async canAccessHrExtendedConsoleLocal(userId: string, jwtRole: AuthRole, email: string): Promise<boolean> {
    if (jwtRole === "superuser") {
      return true;
    }
    if (isSynapseSuperuserEmail(email)) {
      return true;
    }
    const u = await this.getUser(userId);
    if (!u.roleId) {
      return false;
    }
    const role = await this.getRoleById(u.roleId);
    if (!role) {
      return false;
    }
    return this.expandRolePermissionsRaw(role.permissions ?? []).has("nexa.admin_users:read");
  }

  /** Esiste un responsabile di I livello (manager o team lead diverso dal dipendente). */
  private async employeeHasExpenseFirstLineApprover(employeeId: string): Promise<boolean> {
    const employee = await this.getUser(employeeId);
    if (employee.managerId?.trim()) {
      return true;
    }
    const tid = employee.teamId?.trim();
    if (!tid) {
      return false;
    }
    try {
      const team = await this.getWorkTeam(tid);
      const lead = (team.leadUserId ?? "").trim();
      return Boolean(lead && lead !== employeeId);
    } catch {
      return false;
    }
  }

  private async canApproveExpenseAsFirstLine(
    actorId: string,
    actorRole: AuthRole,
    subjectUserId: string
  ): Promise<boolean> {
    if (subjectUserId === actorId) {
      return false;
    }
    if (actorRole === "superuser") {
      const a = await this.getUser(actorId);
      const t = await this.getUser(subjectUserId);
      return a.companyId === t.companyId;
    }
    if (actorRole === "user") {
      return (
        (await this.isManagerOf(actorId, subjectUserId)) ||
        (await this.isUserLeadOfTeamContaining(actorId, subjectUserId))
      );
    }
    return false;
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
    const sourceResolved = meta?.source ?? "web";
    const entry: TimeEntry = {
      id: `te-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      type,
      at: atIso,
      source: sourceResolved,
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
    scope?: "day" | "week" | "month" | "year"
  ): Promise<{
    referenceDate: string;
    day: { overtimeSeconds: number; overtimeHours: number };
    week: { overtimeSeconds: number; overtimeHours: number };
    month: { overtimeSeconds: number; overtimeHours: number };
    year: { overtimeSeconds: number; overtimeHours: number };
  } | { scope: "day" | "week" | "month" | "year"; overtimeSeconds: number; overtimeHours: number }> {
    const summaries = await this.listWorkdaySummary(userId);
    const { start, end } = this.weekRange(referenceDate);
    const monthPrefix = referenceDate.slice(0, 7);
    const yearPrefix = referenceDate.slice(0, 4);
    const dayStr = referenceDate.slice(0, 10);
    const user = await this.getUser(userId);
    const targetSeconds = this.resolveDailyTargetSeconds(user);

    const sumOvertime = (items: WorkdaySummary[]): number =>
      items.reduce((acc, item) => {
        const fallbackOvertime = Math.max(0, (item.workedSeconds ?? item.minutesWorked * 60) - targetSeconds);
        return acc + (item.overtimeSeconds ?? fallbackOvertime);
      }, 0);

    const daySummaries = summaries.filter((item) => item.date === dayStr);
    let dayOvertimeSeconds = sumOvertime(daySummaries);
    const todayRome = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    if (dayStr === todayRome) {
      const live = await this.computeClockState(userId, dayStr);
      dayOvertimeSeconds = Math.max(dayOvertimeSeconds, live.overtimeSeconds);
    }

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
      day: { overtimeSeconds: dayOvertimeSeconds, overtimeHours: dayOvertimeSeconds / 3600 },
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

  private mergeEmployerRatesWithAssumptions(
    base: { employerInpsRate: number; inailRate: number; tfrDivisor: number },
    assumptions: PersonnelBudgetAssumptionsDto | null
  ): { employerInpsRate: number; inailRate: number; tfrDivisor: number } {
    if (!assumptions) {
      return base;
    }
    return {
      employerInpsRate:
        assumptions.employerInpsPercent != null && Number.isFinite(assumptions.employerInpsPercent)
          ? assumptions.employerInpsPercent / 100
          : base.employerInpsRate,
      inailRate:
        assumptions.inailPermille != null && Number.isFinite(assumptions.inailPermille)
          ? assumptions.inailPermille / 1000
          : base.inailRate,
      tfrDivisor:
        assumptions.tfrDivisor != null && Number.isFinite(assumptions.tfrDivisor)
          ? assumptions.tfrDivisor
          : base.tfrDivisor
    };
  }

  private employerExtrasFromAssumptions(
    gross: number,
    assumptions: PersonnelBudgetAssumptionsDto | null
  ): number {
    if (!assumptions) {
      return 0;
    }
    const w = (assumptions.welfarePercent ?? 0) / 100;
    const b = (assumptions.bonusProvisionPercent ?? 0) / 100;
    return Math.round(gross * (w + b) * 100) / 100;
  }

  private async buildItalianPayrollInputForUser(
    user: User,
    period: string,
    variablePeriod?: string
  ): Promise<ItalianPayrollInput> {
    const vp = variablePeriod?.trim() || period;
    const grossMonthlySalary =
      user.baseSalaryMonthly != null && Number(user.baseSalaryMonthly) > 0
        ? Number(user.baseSalaryMonthly)
        : 5800;
    const overtimeAmount = await this.countMonthlyOvertimeAmount(user.id, vp, grossMonthlySalary);
    const vacationDaysUsed = await this.countAnnualLeaveDaysInPeriod(user.id, vp);
    const sicknessDays = await this.countSicknessDays(user.id, vp);
    const smartworkingDays = await this.countSmartworkingDays(user.id, vp);
    const year = Number(period.slice(0, 4));
    const balance = await this.getLeaveBalance(user.id, year);
    const costCenter =
      user.costCenterId != null ? await this.getCostCenterById(user.costCenterId) : null;
    const employerIt = this.italianEmployerRatesForUser(user, costCenter ?? undefined);
    const domicile =
      user.taxDomicileSameAsResidence === false && user.taxDomicileMunicipalityIt?.trim()
        ? user.taxDomicileMunicipalityIt.trim()
        : user.taxMunicipalityIt?.trim() || "Roma";
    const payMonths = this.coercePayMonthsPerYear(user.payMonthsPerYear);
    const regionCode = user.taxRegion?.trim().toUpperCase() || "LAZ";
    const comoComunale = resolveComoMunicipalAddizionaleRate(domicile);
    const addizionaleComunaleRate = comoComunale != null ? comoComunale : undefined;
    if (regionCode === "LOM" && comoComunale == null) {
      this.logger.warn(
        `Addizionale comunale: comune "${domicile}" assente dalla tabella provincia Como; uso aliquota default del motore.`
      );
    }
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
        regionCode: user.taxRegion?.trim() || regionCode,
        municipality: domicile
      },
      ...(addizionaleComunaleRate != null ? { addizionaleComunaleRate } : {}),
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
    options?: { overrides?: Partial<ItalianPayrollInput>; variablePeriod?: string }
  ): Promise<ReturnType<typeof calculateItalianPayroll>> {
    if (!isPayrollCompetencePeriodCalculableTodayRome(period)) {
      throw new BadRequestException(
        `Calcolo cedolino per competenza ${period} disponibile dal ${payrollCompetenceCalculationFirstDateIsoRome(
          period
        )} (dal 5° giorno dopo la fine del mese).`
      );
    }
    const user = await this.getUser(userId);
    const claims = await this.listApprovedExpenseClaimsForPayslip(userId, period);
    const reimbursement =
      Math.round(claims.reduce((s, c) => s + c.amountCents, 0)) / 100;
    const varResolved =
      options?.variablePeriod != null && options.variablePeriod.trim().length > 0
        ? options.variablePeriod.trim()
        : this.previousPayrollVariableMonth(period);
    const base = await this.buildItalianPayrollInputForUser(user, period, varResolved);
    const result = calculateItalianPayroll({ ...base, ...options?.overrides });
    const extraLines = claims.map((c) => ({
      code: "RMB",
      description: `Rimborso spese: ${c.description}`.slice(0, 160),
      amount: Math.round(c.amountCents) / 100
    }));
    const netSalary = Math.round((result.netSalary + reimbursement) * 100) / 100;
    return {
      ...result,
      lines: [...result.lines, ...extraLines],
      netSalary
    };
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
    add("JUR", "Profilo payroll: Italia");
    if (user.taxRegion?.trim() || user.taxMunicipalityIt?.trim()) {
      add(
        "TAXIT",
        `Fisco IT: regione ${user.taxRegion?.trim() ?? "—"} · comune ${user.taxMunicipalityIt?.trim() ?? "—"}`
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
    if (user.phone?.trim()) {
      add("TEL", `Telefono: ${user.phone.trim()}`);
    }
    if (user.address?.trim()) {
      add("ADDR", `Indirizzo: ${user.address.trim().slice(0, 120)}`);
    }
    return out;
  }

  private mapPayslipRow(row: Record<string, unknown>): Payslip {
    const status = (row.status as Payslip["status"]) ?? "published";
    return {
      id: String(row.id),
      userId: String(row.userId),
      period: String(row.period),
      grossSalary: Number(row.grossSalary),
      netSalary: Number(row.netSalary),
      lines: (row.lines as Payslip["lines"]) ?? [],
      pdfUrl: String(row.pdfUrl ?? ""),
      status,
      publishedAt: row.publishedAt != null ? String(row.publishedAt) : null,
      publishedByUserId: row.publishedByUserId != null ? String(row.publishedByUserId) : null,
      computedAt: row.computedAt != null ? String(row.computedAt) : null,
      variablePeriod: row.variablePeriod != null ? String(row.variablePeriod) : null
    };
  }

  /** Mese di calendario precedente a `period` (YYYY-MM), per variabili da mese precedente. */
  previousPayrollVariableMonth(period: string): string {
    const [ys, ms] = period.split("-");
    const y = Number(ys);
    const mo = Number(ms);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
      throw new BadRequestException("Periodo non valido (atteso YYYY-MM)");
    }
    const d = new Date(Date.UTC(y, mo - 2, 1));
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${yy}-${mm}`;
  }

  async generatePayslip(
    userId: string,
    period: string,
    options?: {
      status?: Payslip["status"];
      variablePeriod?: string;
      publishedByUserId?: string;
    }
  ): Promise<Payslip> {
    if (!isPayrollCompetencePeriodCalculableTodayRome(period)) {
      throw new BadRequestException(
        `Calcolo cedolino per competenza ${period} disponibile dal ${payrollCompetenceCalculationFirstDateIsoRome(
          period
        )} (dal 5° giorno dopo la fine del mese).`
      );
    }
    const status = options?.status ?? "published";
    const varPer =
      options?.variablePeriod != null && String(options.variablePeriod).trim().length > 0
        ? String(options.variablePeriod).trim()
        : this.previousPayrollVariableMonth(period);
    const user = await this.getUser(userId);
    const claims = await this.listApprovedExpenseClaimsForPayslip(userId, period);
    const reimbursement =
      Math.round(claims.reduce((s, c) => s + c.amountCents, 0)) / 100;
    const itInput = await this.buildItalianPayrollInputForUser(user, period, varPer);
    const result = calculateItalianPayroll(itInput);
    const extraLines = claims.map((c) => ({
      code: "RMB",
      description: `Rimborso spese: ${c.description}`.slice(0, 160),
      amount: Math.round(c.amountCents) / 100
    }));
    const lines = [...result.lines, ...this.payslipAnagraficaLines(user), ...extraLines];
    const netSalary = Math.round((result.netSalary + reimbursement) * 100) / 100;
    const computedAt = new Date().toISOString();
    const publishedAt = status === "published" ? computedAt : null;
    const publishedByUserId =
      status === "published" ? (options?.publishedByUserId?.trim() ?? null) : null;
    const payslip: Payslip = {
      id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId,
      period,
      grossSalary: result.grossAdjusted,
      netSalary,
      lines,
      pdfUrl: `/api/payroll/${userId}/${period}/pdf`,
      status,
      publishedAt,
      publishedByUserId,
      computedAt,
      variablePeriod: varPer !== period ? varPer : null
    };
    if (this.useDb) {
      const { error: delErr } = await this.supabase!.from("payslips").delete().eq("userId", userId).eq("period", period);
      if (delErr) {
        throw new InternalServerErrorException(`Aggiornamento cedolino fallito: ${delErr.message}`);
      }
      const { error } = await this.supabase!.from("payslips").insert({
        id: payslip.id,
        userId: payslip.userId,
        period: payslip.period,
        grossSalary: payslip.grossSalary,
        netSalary: payslip.netSalary,
        lines: payslip.lines,
        pdfUrl: payslip.pdfUrl,
        status: payslip.status,
        publishedAt: payslip.publishedAt,
        publishedByUserId: payslip.publishedByUserId,
        computedAt: payslip.computedAt,
        variablePeriod: payslip.variablePeriod
      });
      if (error) {
        throw new InternalServerErrorException(`Salvataggio cedolino fallito: ${error.message}`);
      }
      await this.markExpenseClaimsPaidAfterPayslip(claims.map((c) => c.id), period, payslip.id);
    } else {
      for (let i = this.payslips.length - 1; i >= 0; i -= 1) {
        const p = this.payslips[i]!;
        if (p.userId === userId && p.period === period) {
          this.payslips.splice(i, 1);
        }
      }
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
    age?: number;
    taxRegion?: string;
    taxMunicipalityIt?: string;
    weeklyContractHours?: number;
  }): ReturnType<typeof calculateItalianPayroll> {
    const period = input.period?.trim() || new Date().toISOString().slice(0, 7);
    const mun = input.taxMunicipalityIt?.trim() || "Roma";
    const como = resolveComoMunicipalAddizionaleRate(mun);
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
        municipality: mun
      },
      vacationResidualDays: undefined,
      ...(como != null ? { addizionaleComunaleRate: como } : {})
    });
  }

  async importPayslipFromExternalPdf(
    operatorUserId: string,
    operatorRole: AuthRole,
    operatorEmail: string,
    targetUserId: string,
    period: string,
    pdfBuffer: Buffer,
    salaries?: { grossSalary?: number; netSalary?: number }
  ): Promise<Payslip> {
    const p = period.trim();
    if (!/^\d{4}-\d{2}$/.test(p)) {
      throw new BadRequestException("Periodo atteso YYYY-MM");
    }
    if (pdfBuffer.length < 16) {
      throw new BadRequestException("PDF non valido o file vuoto");
    }
    if (pdfBuffer.length > 6_000_000) {
      throw new BadRequestException("PDF troppo grande (max 6 MB)");
    }
    const magic = pdfBuffer.slice(0, 5).toString("latin1");
    if (!magic.startsWith("%PDF")) {
      throw new BadRequestException("Il file non sembra un PDF");
    }
    const canOp =
      operatorRole === "superuser" ||
      (await this.canAccessHrExtendedConsoleLocal(operatorUserId, operatorRole, operatorEmail));
    if (!canOp) {
      throw new ForbiddenException("Import cedolini riservato a HR / amministratori");
    }
    const operator = await this.getUser(operatorUserId);
    const target = await this.getUser(targetUserId);
    if (operatorRole !== "superuser" && target.companyId !== operator.companyId) {
      throw new ForbiddenException("Dipendente di un'altra azienda");
    }
    if (!this.useDb || !this.supabase) {
      throw new BadRequestException("Import PDF richiede database e storage Supabase");
    }
    const cid = String(target.companyId ?? "default").replace(/[^\w-]/g, "_");
    const objectPath = `payslip-imports/${cid}/${targetUserId}/${p}.pdf`;
    const { error: upErr } = await this.supabase.storage.from("employee-photos").upload(objectPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true
    });
    if (upErr) {
      throw new InternalServerErrorException(`Upload storage fallito: ${upErr.message}`);
    }
    const pdfUrl = `supabase://employee-photos/${objectPath}`;
    const gross =
      salaries?.grossSalary != null && Number.isFinite(Number(salaries.grossSalary))
        ? Number(salaries.grossSalary)
        : 0;
    const net =
      salaries?.netSalary != null && Number.isFinite(Number(salaries.netSalary))
        ? Number(salaries.netSalary)
        : 0;
    const now = new Date().toISOString();
    const payslip: Payslip = {
      id: `ps-imp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: targetUserId,
      period: p,
      grossSalary: gross,
      netSalary: net,
      lines: [{ code: "IMP", description: "Cedolino importato (PDF esterno)", amount: net }],
      pdfUrl,
      status: "published",
      publishedAt: now,
      publishedByUserId: operatorUserId,
      computedAt: now,
      variablePeriod: null
    };
    const { error: delErr } = await this.supabase.from("payslips").delete().eq("userId", targetUserId).eq("period", p);
    if (delErr) {
      throw new InternalServerErrorException(`Aggiornamento cedolino fallito: ${delErr.message}`);
    }
    const { error: insErr } = await this.supabase.from("payslips").insert({
      id: payslip.id,
      userId: payslip.userId,
      period: payslip.period,
      grossSalary: payslip.grossSalary,
      netSalary: payslip.netSalary,
      lines: payslip.lines,
      pdfUrl: payslip.pdfUrl,
      status: payslip.status,
      publishedAt: payslip.publishedAt,
      publishedByUserId: payslip.publishedByUserId,
      computedAt: payslip.computedAt,
      variablePeriod: payslip.variablePeriod
    });
    if (insErr) {
      throw new InternalServerErrorException(`Salvataggio cedolino fallito: ${insErr.message}`);
    }
    return payslip;
  }

  async getPayslipForPeriod(userId: string, period: string): Promise<Payslip | undefined> {
    const all = await this.listPayslips(userId, userId);
    return all.find((item) => item.period === period);
  }

  async getPayslipById(payslipId: string): Promise<Payslip | undefined> {
    if (this.useDb) {
      const { data, error } = await this.supabase!.from("payslips").select("*").eq("id", payslipId).maybeSingle();
      if (error) {
        throw new InternalServerErrorException(`Lettura cedolino: ${error.message}`);
      }
      if (!data) {
        return undefined;
      }
      return this.mapPayslipRow(data as Record<string, unknown>);
    }
    return this.payslips.find((p) => p.id === payslipId);
  }

  /** Lettura cedolino lato service (es. budget HR) senza vincolo requester. */
  private async getPayslipForUserPeriodInternal(
    userId: string,
    period: string
  ): Promise<Payslip | undefined> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("payslips").select("*").eq("userId", userId);
      const rows = ((data as Record<string, unknown>[]) ?? []).map((r) => this.mapPayslipRow(r));
      return rows.find((item) => item.period === period);
    }
    return this.payslips.find((item) => item.userId === userId && item.period === period);
  }

  async listPayslips(requesterId: string, targetUserId?: string): Promise<Payslip[]> {
    const target = targetUserId ?? requesterId;
    if (this.useDb) {
      const { data } = await this.supabase!.from("payslips").select("*").eq("userId", target);
      return ((data as Record<string, unknown>[]) ?? []).map((r) => this.mapPayslipRow(r));
    }
    return this.payslips.filter((item) => item.userId === target);
  }

  async listDraftPayslipsForPeriod(requesterId: string, period: string): Promise<Payslip[]> {
    const requester = await this.getUser(requesterId);
    const allUsers = await this.listUsers();
    const scope = new Set(
      allUsers
        .filter((u) => requester.role === "superuser" || u.companyId === requester.companyId)
        .map((u) => u.id)
    );
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("payslips")
        .select("*")
        .eq("period", period)
        .eq("status", "draft");
      const rows = ((data as Record<string, unknown>[]) ?? []).map((r) => this.mapPayslipRow(r));
      return rows.filter((p) => scope.has(p.userId));
    }
    return this.payslips.filter(
      (p) => p.period === period && p.status === "draft" && scope.has(p.userId)
    );
  }

  async publishPayslipsForPeriod(requesterId: string, period: string): Promise<{ updated: number }> {
    const requester = await this.getUser(requesterId);
    const allUsers = await this.listUsers();
    const allowedIds = allUsers
      .filter((u) => requester.role === "superuser" || u.companyId === requester.companyId)
      .map((u) => u.id);
    const now = new Date().toISOString();
    if (!this.useDb) {
      let n = 0;
      for (const p of this.payslips) {
        if (p.period !== period || p.status !== "draft") {
          continue;
        }
        if (!allowedIds.includes(p.userId)) {
          continue;
        }
        p.status = "published";
        p.publishedAt = now;
        p.publishedByUserId = requesterId;
        n += 1;
      }
      return { updated: n };
    }
    const { data } = await this.supabase!
      .from("payslips")
      .select("id")
      .eq("period", period)
      .eq("status", "draft")
      .in("userId", allowedIds);
    let updated = 0;
    for (const row of data ?? []) {
      const { error } = await this.supabase!
        .from("payslips")
        .update({
          status: "published",
          publishedAt: now,
          publishedByUserId: requesterId
        })
        .eq("id", (row as { id: string }).id);
      if (!error) {
        updated += 1;
      }
    }
    return { updated };
  }

  async batchGenerateDraftPayslips(
    requesterId: string,
    period: string,
    opts: { usePreviousMonthVariables?: boolean }
  ): Promise<Array<{ userId: string; payslipId?: string; ok: boolean; error?: string }>> {
    const requester = await this.getUser(requesterId);
    const varPer = opts.usePreviousMonthVariables
      ? this.previousPayrollVariableMonth(period)
      : period;
    const allUsers = await this.listUsers();
    const targets = allUsers.filter(
      (u) => requester.role === "superuser" || u.companyId === requester.companyId
    );
    const out: Array<{ userId: string; payslipId?: string; ok: boolean; error?: string }> = [];
    for (const u of targets) {
      try {
        const ps = await this.generatePayslip(u.id, period, {
          status: "draft",
          variablePeriod: varPer
        });
        out.push({ userId: u.id, payslipId: ps.id, ok: true });
      } catch (e) {
        out.push({
          userId: u.id,
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    return out;
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
    let approvals: ApprovalRecord[];
    if (this.useDb) {
      let query = this.supabase!.from("approvals").select("*");
      if (requester.role !== "superuser") {
        const scopedIds = [...visibleUserIds];
        if (scopedIds.length === 0) {
          return [];
        }
        query = query.in("requested_by", scopedIds);
      }
      if (status) {
        query = query.eq("status", status);
      }
      const { data, error } = await query.order("at", { ascending: false });
      if (error) {
        throw new BadRequestException(`Lettura approvazioni fallita: ${error.message}`);
      }
      approvals = (data ?? []) as ApprovalRecord[];
    } else {
      approvals = this.approvals
        .filter((item) => requester.role === "superuser" || visibleUserIds.has(item.requestedBy))
        .filter((item) => (status ? item.status === status : true))
        .sort((a, b) => b.at.localeCompare(a.at));
    }

    const leavesById = new Map<string, LeavePlan>();
    const sicknessById = new Map<string, SicknessEvent>();
    const swById = new Map<string, SmartworkingRequestRow>();
    const travelById = new Map<string, TravelRequestRow>();

    if (this.useDb) {
      const leaveIds = approvals.filter((item) => item.type === "leave").map((item) => item.entityId);
      const sicknessIds = approvals.filter((item) => item.type === "sickness").map((item) => item.entityId);
      const swIds = approvals.filter((item) => item.type === "smartworking").map((item) => item.entityId);
      const travelIds = approvals.filter((item) => item.type === "travel").map((item) => item.entityId);

      const [leaveRes, sicknessRes, swRes, travelRes] = await Promise.all([
        leaveIds.length > 0
          ? this.supabase!.from("leave_plans").select("*").in("id", leaveIds)
          : Promise.resolve({ data: [] as LeavePlan[] }),
        sicknessIds.length > 0
          ? this.supabase!.from("sickness_events").select("*").in("id", sicknessIds)
          : Promise.resolve({ data: [] as SicknessEvent[] }),
        swIds.length > 0
          ? this.supabase!.from("smartworking_requests").select("*").in("id", swIds)
          : Promise.resolve({ data: [] as SmartworkingRequestRow[] }),
        travelIds.length > 0
          ? this.supabase!.from("travel_requests").select("*").in("id", travelIds)
          : Promise.resolve({ data: [] as TravelRequestRow[] })
      ]);

      for (const row of (leaveRes.data ?? []) as LeavePlan[]) {
        leavesById.set(row.id, row);
      }
      for (const row of (sicknessRes.data ?? []) as SicknessEvent[]) {
        sicknessById.set(row.id, row);
      }
      for (const row of (swRes.data ?? []) as SmartworkingRequestRow[]) {
        swById.set(row.id, row);
      }
      for (const row of (travelRes.data ?? []) as TravelRequestRow[]) {
        travelById.set(row.id, row);
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

    const neededUserIds = new Set<string>();
    for (const item of approvals) {
      neededUserIds.add(item.requestedBy);
      if (item.approverId) {
        neededUserIds.add(item.approverId);
      }
    }
    const usersById = await this.mapUsersByIds([...neededUserIds]);
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
    await Promise.all([...neededUserIds].map((uid) => loadPhoto(uid)));

    const leaveBalanceCache = new Map<string, LeaveBalance>();
    const smartworkingMetricsCache = new Map<
      string,
      {
        smartworkingWeekUsed: number;
        smartworkingWeekQuota: number;
        smartworkingMonthUsed: number;
        smartworkingMonthQuota: number;
      }
    >();
    const teamCoverageCache = new Map<
      string,
      Awaited<ReturnType<HrDataStore["computeLeaveTeamCoverage"]>>
    >();

    const needsApproverMetrics = (item: ApprovalRecord): boolean =>
      item.status === "pending" && item.requestedBy !== requesterId;

    const out: ApprovalView[] = [];
    for (const item of approvals) {
      const user = usersById.get(item.requestedBy);
      const leave = item.type === "leave" ? leavesById.get(item.entityId) : undefined;
      const sickness = item.type === "sickness" ? sicknessById.get(item.entityId) : undefined;
      const sw = item.type === "smartworking" ? swById.get(item.entityId) : undefined;
      const tr = item.type === "travel" ? travelById.get(item.entityId) : undefined;
      const requesterPhotoUrl = photoCache.get(item.requestedBy) ?? null;
      const enrichMetrics = needsApproverMetrics(item);

      let leaveKind: "annual" | "rol" | undefined;
      let residualAnnualLeaveDays: number | undefined;
      let requestedCalendarDays: number | undefined;
      let insufficientAnnualLeaveBalance: boolean | undefined;
      let annualLeaveBalanceShortfallDays: number | undefined;
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
        if (enrichMetrics && leaveKind === "annual") {
          const year = Number(leave.startDate.slice(0, 4));
          const balanceKey = `${leave.userId}:${year}`;
          if (!leaveBalanceCache.has(balanceKey)) {
            leaveBalanceCache.set(balanceKey, await this.getLeaveBalance(leave.userId, year));
          }
          const bal = leaveBalanceCache.get(balanceKey)!;
          residualAnnualLeaveDays = bal.residualDays;
          if (requestedCalendarDays != null && residualAnnualLeaveDays < requestedCalendarDays) {
            insufficientAnnualLeaveBalance = true;
            annualLeaveBalanceShortfallDays = requestedCalendarDays - residualAnnualLeaveDays;
          } else if (requestedCalendarDays != null) {
            insufficientAnnualLeaveBalance = false;
          }
        }
      } else if (sickness) {
        try {
          requestedCalendarDays = this.countCalendarDays(sickness.fromDate, sickness.toDate);
        } catch {
          requestedCalendarDays = undefined;
        }
      } else if (sw) {
        try {
          requestedCalendarDays = this.countCalendarDays(sw.day, this.smartworkingRequestEndDay(sw));
        } catch {
          requestedCalendarDays = 1;
        }
        note = sw.note ?? null;
        if (enrichMetrics) {
          const monthPrefix = sw.day.slice(0, 7);
          const weekMon = this.mondayOfWeekUtcContaining(sw.day);
          const swKey = `${sw.userId}:${monthPrefix}:${weekMon}`;
          if (!smartworkingMetricsCache.has(swKey)) {
            const swQuotas = await this.resolveSmartworkingQuotas(sw.userId, monthPrefix);
            const [weekUsed, monthUsed] = await Promise.all([
              this.countSmartworkingBookedDaysInWeek(sw.userId, sw.day),
              this.countNonRejectedSmartworkingDaysInMonth(sw.userId, monthPrefix)
            ]);
            smartworkingMetricsCache.set(swKey, {
              smartworkingWeekUsed: weekUsed,
              smartworkingWeekQuota: swQuotas.weekly,
              smartworkingMonthUsed: monthUsed,
              smartworkingMonthQuota: swQuotas.monthly
            });
          }
          const swMetrics = smartworkingMetricsCache.get(swKey)!;
          smartworkingWeekUsed = swMetrics.smartworkingWeekUsed;
          smartworkingWeekQuota = swMetrics.smartworkingWeekQuota;
          smartworkingMonthUsed = swMetrics.smartworkingMonthUsed;
          smartworkingMonthQuota = swMetrics.smartworkingMonthQuota;
        }
      } else if (tr) {
        requestedCalendarDays = 1;
        note = tr.note ?? null;
      }

      const approverUser = item.approverId ? usersById.get(item.approverId) : undefined;
      let teamCoverageFields: {
        teamZeroCoverage?: boolean;
        teamCoverageLabel?: string;
        teamCoveragePeerCount?: number;
        teamCoverageMinAvailable?: number;
        teamCoverageZeroDays?: number;
      } = {};
      if (enrichMetrics && leave && user) {
        const coverageKey = `${user.id}:${leave.startDate}:${leave.endDate}`;
        if (!teamCoverageCache.has(coverageKey)) {
          teamCoverageCache.set(
            coverageKey,
            await this.computeLeaveTeamCoverage(user, leave.startDate, leave.endDate)
          );
        }
        const coverage = teamCoverageCache.get(coverageKey);
        if (coverage) {
          teamCoverageFields = coverage;
        }
      }
      out.push({
        id: item.id,
        entityId: item.entityId,
        type: item.type,
        requestedBy: item.requestedBy,
        approverId: item.approverId,
        approverName: approverUser?.fullName,
        status: item.status,
        at: item.at,
        requesterName: user?.fullName,
        requesterPhotoUrl,
        startDate: leave?.startDate ?? sickness?.fromDate ?? sw?.day ?? tr?.day,
        endDate:
          leave?.endDate ??
          sickness?.toDate ??
          (sw ? this.smartworkingRequestEndDay(sw) : undefined) ??
          tr?.day,
        leaveKind,
        residualAnnualLeaveDays,
        requestedCalendarDays,
        insufficientAnnualLeaveBalance,
        annualLeaveBalanceShortfallDays,
        ...teamCoverageFields,
        smartworkingWeekUsed,
        smartworkingWeekQuota,
        smartworkingMonthUsed,
        smartworkingMonthQuota,
        note
      });
    }
    return out;
  }

  /**
   * Approvazioni `pending` per dipendenti dell'azienda (vista HR: non dipende dalla visibilità team del singolo utente).
   */
  async listCompanyPendingApprovalViewsForHrDashboard(companyId: string): Promise<ApprovalView[]> {
    const companyUserIds = new Set(
      (await this.listUsers()).filter((u) => u.companyId === companyId).map((u) => u.id)
    );
    if (!companyUserIds.size) {
      return [];
    }
    const allApprovals = this.useDb
      ? (((await this.supabase!.from("approvals").select("*")).data ?? []) as ApprovalRecord[])
      : this.approvals;
    let approvals = allApprovals
      .filter((item) => companyUserIds.has(item.requestedBy) && item.status === "pending")
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
    const out: ApprovalView[] = [];
    for (const item of approvals) {
      const user = usersById.get(item.requestedBy);
      const leave = item.type === "leave" ? leavesById.get(item.entityId) : undefined;
      const sickness = item.type === "sickness" ? sicknessById.get(item.entityId) : undefined;
      const sw = item.type === "smartworking" ? swById.get(item.entityId) : undefined;
      const tr = item.type === "travel" ? travelById.get(item.entityId) : undefined;

      let leaveKind: "annual" | "rol" | undefined;
      let requestedCalendarDays: number | undefined;
      let note: string | null | undefined;

      if (leave) {
        leaveKind = (leave.kind ?? "annual") === "rol" ? "rol" : "annual";
        try {
          requestedCalendarDays = this.countCalendarDays(leave.startDate, leave.endDate);
        } catch {
          requestedCalendarDays = undefined;
        }
      } else if (sickness) {
        try {
          requestedCalendarDays = this.countCalendarDays(sickness.fromDate, sickness.toDate);
        } catch {
          requestedCalendarDays = undefined;
        }
      } else if (sw) {
        try {
          requestedCalendarDays = this.countCalendarDays(sw.day, this.smartworkingRequestEndDay(sw));
        } catch {
          requestedCalendarDays = 1;
        }
        note = sw.note ?? null;
      } else if (tr) {
        requestedCalendarDays = 1;
        note = tr.note ?? null;
      }

      const approverUser = item.approverId ? usersById.get(item.approverId) : undefined;
      out.push({
        id: item.id,
        entityId: item.entityId,
        type: item.type,
        requestedBy: item.requestedBy,
        approverId: item.approverId,
        approverName: approverUser?.fullName,
        status: item.status,
        at: item.at,
        requesterName: user?.fullName,
        requesterPhotoUrl: null,
        startDate: leave?.startDate ?? sickness?.fromDate ?? sw?.day ?? tr?.day,
        endDate:
          leave?.endDate ??
          sickness?.toDate ??
          (sw ? this.smartworkingRequestEndDay(sw) : undefined) ??
          tr?.day,
        leaveKind,
        requestedCalendarDays,
        note
      });
    }
    return out.sort((a, b) => (a.startDate ?? a.at).localeCompare(b.startDate ?? b.at));
  }

  async listCompanyExpenseClaimsPendingHr(companyId: string): Promise<ExpenseClaim[]> {
    const users = await this.listUsers();
    const companyByUser = new Map(users.map((u) => [u.id, u.companyId]));
    if (!this.useDb) {
      return this.expenseClaims.filter((c) => c.status === "pending_hr" && companyByUser.get(c.userId) === companyId);
    }
    const { data, error } = await this.supabase!.from("expense_claims").select("*").eq("status", "pending_hr").limit(400);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return ((data ?? []) as Record<string, unknown>[])
      .map((row) => this.mapExpenseRow(row))
      .filter((c) => companyByUser.get(c.userId) === companyId);
  }

  async countHrStandardContractsUnsigned(companyId: string): Promise<number> {
    if (!this.useDb) {
      return 0;
    }
    const { count, error } = await this.supabase!
      .from("hr_standard_contracts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("signed_at", null);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return count ?? 0;
  }

  async listHrStandardContractsUnsigned(
    companyId: string
  ): Promise<Array<{ id: string; title: string; recruit_candidate_id: string | null; updated_at: string }>> {
    if (!this.useDb) {
      return [];
    }
    const { data, error } = await this.supabase!
      .from("hr_standard_contracts")
      .select("id, title, recruit_candidate_id, updated_at")
      .eq("company_id", companyId)
      .is("signed_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return ((data ?? []) as Array<{ id: string; title: string; recruit_candidate_id: string | null; updated_at: string }>).map(
      (r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        recruit_candidate_id: r.recruit_candidate_id ? String(r.recruit_candidate_id) : null,
        updated_at: String(r.updated_at ?? "")
      })
    );
  }

  async getHrRecapHeadcount(companyId: string): Promise<{
    totalEmployed: number;
    active: number;
    hrOnboarding: number;
    offboarding: number;
  }> {
    const users = (await this.listUsers()).filter(
      (u) => u.companyId === companyId && !String(u.email ?? "").toLowerCase().startsWith("offboarded+")
    );
    const hires = users.filter((u) => u.role !== "superuser");
    let active = 0;
    let hrOnboarding = 0;
    let offboarding = 0;
    for (const u of hires) {
      const es = u.employmentState ?? "active";
      if (es === "hr_onboarding") {
        hrOnboarding += 1;
      } else if (es === "offboarding") {
        offboarding += 1;
      } else {
        active += 1;
      }
    }
    return { totalEmployed: hires.length, active, hrOnboarding, offboarding };
  }

  async listUsersForHrRecapCategory(
    companyId: string,
    category: "active" | "hr_onboarding" | "offboarding"
  ): Promise<User[]> {
    const users = (await this.listUsers()).filter(
      (u) =>
        u.companyId === companyId &&
        u.role !== "superuser" &&
        !String(u.email ?? "").toLowerCase().startsWith("offboarded+")
    );
    return users.filter((u) => (u.employmentState ?? "active") === category);
  }

  async sendHrDashboardReminder(input: {
    targetUserId: string;
    title: string;
    body: string;
    actionPath?: string;
  }): Promise<void> {
    await this.insertUserNotification({
      id: randomUUID(),
      userId: input.targetUserId,
      title: input.title,
      body: input.body,
      read: false,
      createdAt: new Date().toISOString(),
      kind: "hr_recap_reminder",
      actionPath: input.actionPath
    });
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

  private calendarDaysInRange(startDate: string, endDate: string): string[] {
    const startMs = new Date(`${startDate}T12:00:00.000Z`).getTime();
    const endMs = new Date(`${endDate}T12:00:00.000Z`).getTime();
    const days: string[] = [];
    for (let t = startMs; t <= endMs; t += 86_400_000) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
    return days;
  }

  private dayInInclusiveRange(day: string, start: string, end: string): boolean {
    return day >= start && day <= end;
  }

  private userAbsentOnDay(
    day: string,
    leaves: LeavePlan[],
    sickness: SicknessEvent[]
  ): boolean {
    for (const lv of leaves) {
      if (lv.status !== "approved" && lv.status !== "pending") {
        continue;
      }
      if (this.dayInInclusiveRange(day, lv.startDate, lv.endDate)) {
        return true;
      }
    }
    for (const sk of sickness) {
      if (sk.status !== "approved" && sk.status !== "pending") {
        continue;
      }
      if (this.dayInInclusiveRange(day, sk.fromDate, sk.toDate)) {
        return true;
      }
    }
    return false;
  }

  private async resolveTeamCoverageLabel(requester: User): Promise<{ peers: User[]; label: string }> {
    const peers = await this.resolveWorkCalendarPeerUsers(requester);
    const tid = requester.teamId?.trim();
    if (tid) {
      try {
        const team = await this.getWorkTeam(tid);
        return { peers, label: team.name };
      } catch {
        return { peers, label: "Team" };
      }
    }
    if (peers.length > 1 && requester.managerId?.trim()) {
      return { peers, label: "Gruppo responsabile" };
    }
    return { peers, label: "Centro di costo" };
  }

  private async computeLeaveTeamCoverage(
    requester: User,
    startDate: string,
    endDate: string
  ): Promise<{
    teamCoverageLabel: string;
    teamCoveragePeerCount: number;
    teamCoverageMinAvailable: number;
    teamCoverageZeroDays: number;
    teamZeroCoverage: boolean;
  } | null> {
    if (!startDate?.trim() || !endDate?.trim()) {
      return null;
    }
    const { peers, label } = await this.resolveTeamCoverageLabel(requester);
    if (peers.length === 0) {
      return null;
    }
    const absenceCache = new Map<string, { leaves: LeavePlan[]; sickness: SicknessEvent[] }>();
    for (const peer of peers) {
      const [leaves, sicknessEvents] = await Promise.all([
        this.listLeave(peer.id),
        this.listSickness(peer.id)
      ]);
      absenceCache.set(peer.id, { leaves, sickness: sicknessEvents });
    }
    const days = this.calendarDaysInRange(startDate, endDate);
    let minAvailable = peers.length;
    let zeroDays = 0;
    for (const day of days) {
      let available = 0;
      for (const peer of peers) {
        const cached = absenceCache.get(peer.id)!;
        if (!this.userAbsentOnDay(day, cached.leaves, cached.sickness)) {
          available += 1;
        }
      }
      if (available < minAvailable) {
        minAvailable = available;
      }
      if (available === 0) {
        zeroDays += 1;
      }
    }
    return {
      teamCoverageLabel: label,
      teamCoveragePeerCount: peers.length,
      teamCoverageMinAvailable: minAvailable,
      teamCoverageZeroDays: zeroDays,
      teamZeroCoverage: zeroDays > 0
    };
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

  /** Notifica in-app (campanella header) per eventi HR / report asincroni. */
  async notifyUserInApp(input: {
    userId: string;
    title: string;
    body?: string;
    kind?: string;
    actionPath?: string;
  }): Promise<void> {
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: input.userId,
      title: input.title,
      body: input.body,
      read: false,
      createdAt: new Date().toISOString(),
      kind: input.kind ?? "app",
      actionPath: input.actionPath
    });
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

  async deleteUserNotification(userId: string, notificationId: string): Promise<void> {
    if (!this.useDb) {
      const idx = this.userNotifications.findIndex((n) => n.id === notificationId && n.userId === userId);
      if (idx === -1) {
        throw new NotFoundException("Notifica non trovata");
      }
      this.userNotifications.splice(idx, 1);
      return;
    }
    const { data, error } = await this.supabase!
      .from("user_notifications")
      .delete()
      .eq("id", notificationId)
      .eq("userId", userId)
      .select("id");
    if (error) {
      throw new BadRequestException(`Eliminazione notifica fallita: ${error.message}`);
    }
    if (!data?.length) {
      throw new NotFoundException("Notifica non trovata");
    }
  }

  async deleteAllUserNotifications(userId: string): Promise<void> {
    if (!this.useDb) {
      for (let i = this.userNotifications.length - 1; i >= 0; i -= 1) {
        if (this.userNotifications[i]!.userId === userId) {
          this.userNotifications.splice(i, 1);
        }
      }
      return;
    }
    const { error } = await this.supabase!.from("user_notifications").delete().eq("userId", userId);
    if (error) {
      throw new BadRequestException(`Eliminazione notifiche fallita: ${error.message}`);
    }
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
    const CALENDAR_USER_CHUNK = 12;
    for (let i = 0; i < userIds.length; i += CALENDAR_USER_CHUNK) {
      const slice = userIds.slice(i, i + CALENDAR_USER_CHUNK);
      const chunks = await Promise.all(
        slice.map((uid) => this.buildCalendarEventsForUser(uid, from, to, true))
      );
      for (let j = 0; j < slice.length; j++) {
        const uid = slice[j]!;
        for (const ev of chunks[j]!) {
          all.push({ ...ev, userId: uid });
        }
      }
    }
    all.sort((a, b) => a.start.localeCompare(b.start));
    return all;
  }

  /** Riepilogo JSON export calendario team (Cowork / integrazioni). */
  buildTeamWorkCalendarExportSummary(
    userIds: string[],
    events: CalendarEvent[],
    from?: string,
    to?: string
  ): {
    from: string | null;
    to: string | null;
    userCount: number;
    eventCount: number;
    rows: Array<{ userId: string; eventCount: number; kinds: string[] }>;
  } {
    const rows = userIds.map((userId) => {
      const mine = events.filter((e) => e.userId === userId);
      const kinds = [...new Set(mine.map((e) => e.kind))].sort();
      return { userId, eventCount: mine.length, kinds };
    });
    return {
      from: from ?? null,
      to: to ?? null,
      userCount: userIds.length,
      eventCount: events.length,
      rows
    };
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

  async listMeetingRooms(
    requesterId: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      location: string | null;
      seats: number | null;
      hasScreen: boolean;
      hasProjector: boolean;
      hasWhiteboard: boolean;
      hasVideoConference: boolean;
      extraFeatures: string[];
    }>
  > {
    const me = await this.getUser(requesterId);
    if (!this.useDb) {
      return [];
    }
    const { data, error } = await this.supabase!
      .from("meeting_rooms")
      .select("*")
      .eq("company_id", me.companyId)
      .order("name", { ascending: true });
    if (error) {
      throw new InternalServerErrorException(`Lettura sale riunioni fallita: ${error.message}`);
    }
    return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      location: r.location ? String(r.location) : null,
      seats: r.seats != null ? Number(r.seats) : null,
      hasScreen: Boolean(r.has_screen),
      hasProjector: Boolean(r.has_projector),
      hasWhiteboard: Boolean(r.has_whiteboard),
      hasVideoConference: Boolean(r.has_video_conference),
      extraFeatures: Array.isArray(r.extra_features)
        ? (r.extra_features as unknown[]).map((x) => String(x)).filter(Boolean)
        : []
    }));
  }

  async createMeetingRoom(
    requesterId: string,
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
    const me = await this.getUser(requesterId);
    if (!this.useDb) {
      throw new BadRequestException("Sale riunioni non disponibili (DB non configurato)");
    }
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("Nome sala obbligatorio");
    }
    const payload = {
      company_id: me.companyId,
      name,
      location: input.location?.trim() || null,
      seats: input.seats ?? null,
      has_screen: Boolean(input.hasScreen),
      has_projector: Boolean(input.hasProjector),
      has_whiteboard: Boolean(input.hasWhiteboard),
      has_video_conference: Boolean(input.hasVideoConference),
      extra_features: (input.extraFeatures ?? []).map((x) => x.trim()).filter(Boolean),
      created_by_user_id: me.id
    };
    const { data, error } = await this.supabase!.from("meeting_rooms").insert(payload).select("id").maybeSingle();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione sala fallita: ${error?.message ?? "unknown"}`);
    }
    return { id: String((data as Record<string, unknown>).id) };
  }

  async listMeetingRoomBookingEvents(
    requesterId: string,
    from?: string,
    to?: string
  ): Promise<CalendarEvent[]> {
    const me = await this.getUser(requesterId);
    if (!this.useDb) return [];
    const q = this.supabase!
      .from("meeting_room_bookings")
      .select("id, room_id, booked_by_user_id, title, starts_at, ends_at, canceled_at")
      .eq("company_id", me.companyId)
      .is("canceled_at", null)
      .order("starts_at", { ascending: true });
    const qb =
      from || to
        ? q
            .gte("starts_at", from ? `${from.slice(0, 10)}T00:00:00.000Z` : undefined)
            .lte("starts_at", to ? `${to.slice(0, 10)}T23:59:59.999Z` : undefined)
        : q;
    const { data, error } = await qb;
    if (error) {
      throw new InternalServerErrorException(`Lettura prenotazioni sale fallita: ${error.message}`);
    }
    const items = (data as Record<string, unknown>[]) ?? [];
    return items.map((r) => {
      const roomId = String(r.room_id);
      return {
        id: `cal-room-${String(r.id)}`,
        kind: "room_booking",
        title: String(r.title || "Prenotazione sala"),
        start: String(r.starts_at),
        end: String(r.ends_at),
        userId: `room:${roomId}`,
        meta: {
          bookingId: String(r.id),
          roomId,
          bookedByUserId: String(r.booked_by_user_id)
        }
      };
    });
  }

  async createMeetingRoomBookingEvent(
    requesterId: string,
    roomId: string,
    input: {
      startsAt: string;
      endsAt: string;
      title?: string;
      inviteeUserIds?: string[];
      inviteeEmails?: string[];
    }
  ): Promise<CalendarEvent> {
    const me = await this.getUser(requesterId);
    if (!this.useDb) {
      throw new BadRequestException("Prenotazioni sala non disponibili (DB non configurato)");
    }
    const startsAt = String(input.startsAt || "").trim();
    const endsAt = String(input.endsAt || "").trim();
    if (!startsAt || !endsAt) {
      throw new BadRequestException("Orario non valido");
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      throw new BadRequestException("Orario non valido: la fine deve essere dopo l'inizio.");
    }
    const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
    if (durationMs < 15 * 60 * 1000) {
      throw new BadRequestException("Durata minima prenotazione: 15 minuti.");
    }
    if (durationMs > 12 * 60 * 60 * 1000) {
      throw new BadRequestException("Durata massima prenotazione: 12 ore.");
    }
    const title = input.title?.trim() || "";
    const { data, error } = await this.supabase!
      .from("meeting_room_bookings")
      .insert({
        company_id: me.companyId,
        room_id: roomId,
        booked_by_user_id: me.id,
        title,
        starts_at: startsAt,
        ends_at: endsAt
      })
      .select("id, room_id, booked_by_user_id, title, starts_at, ends_at")
      .maybeSingle();
    if (error || !data) {
      throw new InternalServerErrorException(`Prenotazione sala fallita: ${error?.message ?? "unknown"}`);
    }
    const row = data as Record<string, unknown>;
    const bookingId = String(row.id);

    const inviteeUserIds = [...new Set((input.inviteeUserIds ?? []).map((x) => x.trim()).filter(Boolean))].filter(
      (id) => id !== me.id
    );
    const inviteeEmails = [
      ...new Set((input.inviteeEmails ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))
    ].filter((email) => email !== me.email.toLowerCase());

    if (inviteeUserIds.length > 0 || inviteeEmails.length > 0) {
      const allUsers = await this.listUsers();
      const companyUsers = new Map(allUsers.filter((u) => u.companyId === me.companyId).map((u) => [u.id, u]));
      const inviteRows: Array<{ booking_id: string; user_id?: string; email?: string }> = [];
      for (const uid of inviteeUserIds) {
        if (!companyUsers.has(uid)) continue;
        inviteRows.push({ booking_id: bookingId, user_id: uid });
      }
      for (const email of inviteeEmails) {
        const match = allUsers.find((u) => u.companyId === me.companyId && u.email.toLowerCase() === email);
        if (match && !inviteeUserIds.includes(match.id)) {
          inviteRows.push({ booking_id: bookingId, user_id: match.id });
        } else if (!match) {
          inviteRows.push({ booking_id: bookingId, email });
        }
      }
      if (inviteRows.length > 0) {
        await this.supabase!.from("meeting_room_booking_invitees").insert(inviteRows);
      }
      const room = (await this.listMeetingRooms(requesterId)).find((r) => r.id === roomId);
      const roomLabel = room?.name ?? "Sala riunioni";
      const when = new Intl.DateTimeFormat("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(startsAt));
      for (const uid of inviteeUserIds) {
        if (!companyUsers.has(uid)) continue;
        await this.notifyUserInApp({
          userId: uid,
          title: "Invito riunione",
          body: `${me.fullName} ti ha invitato a «${title || roomLabel}» (${when}).`,
          kind: "meeting_room_invite",
          actionPath: "/sale-riunioni"
        });
      }
    }

    return {
      id: `cal-room-${bookingId}`,
      kind: "room_booking",
      title: String(row.title || "Prenotazione sala"),
      start: String(row.starts_at),
      end: String(row.ends_at),
      userId: `room:${String(row.room_id)}`,
      meta: {
        bookingId,
        roomId: String(row.room_id),
        bookedByUserId: String(row.booked_by_user_id),
        inviteeCount: inviteeUserIds.length + inviteeEmails.length
      }
    };
  }

  async listMeetingRoomColleagues(
    requesterId: string
  ): Promise<Array<{ id: string; fullName: string; email: string }>> {
    const me = await this.getUser(requesterId);
    const all = await this.listUsers();
    return all
      .filter((u) => u.companyId === me.companyId && u.id !== me.id && u.employmentState !== "offboarding")
      .map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }

  async getMeetingRoomAvailability(
    requesterId: string,
    roomId: string,
    day: string
  ): Promise<{ slots: Array<{ startsAt: string; endsAt: string; available: boolean }> }> {
    const me = await this.getUser(requesterId);
    if (!this.useDb) return { slots: [] };
    const base = day.slice(0, 10);
    const { data: room } = await this.supabase!
      .from("meeting_rooms")
      .select("id")
      .eq("id", roomId)
      .eq("company_id", me.companyId)
      .maybeSingle();
    if (!room) throw new NotFoundException("Sala non trovata");

    const { data: bookings, error } = await this.supabase!
      .from("meeting_room_bookings")
      .select("starts_at, ends_at")
      .eq("room_id", roomId)
      .is("canceled_at", null)
      .gte("starts_at", `${base}T00:00:00.000Z`)
      .lte("starts_at", `${base}T23:59:59.999Z`);
    if (error) {
      throw new InternalServerErrorException(`Disponibilità sala: ${error.message}`);
    }

    const slots: Array<{ startsAt: string; endsAt: string; available: boolean }> = [];
    for (let h = 8; h < 19; h++) {
      for (let m = 0; m < 60; m += 30) {
        const endM = m + 30;
        const endH = endM >= 60 ? h + 1 : h;
        const endMin = endM >= 60 ? 0 : endM;
        if (endH > 19 || (endH === 19 && endMin > 0)) continue;
        const startsAt = new Date(`${base}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();
        const endsAt = new Date(`${base}T${String(endH).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`).toISOString();
        const overlap = ((bookings as { starts_at: string; ends_at: string }[]) ?? []).some(
          (b) => startsAt < b.ends_at && b.starts_at < endsAt
        );
        slots.push({ startsAt, endsAt, available: !overlap });
      }
    }
    return { slots };
  }

  async cancelMeetingRoomBooking(requesterId: string, bookingId: string): Promise<void> {
    const me = await this.getUser(requesterId);
    if (!this.useDb) return;
    const { data, error } = await this.supabase!
      .from("meeting_room_bookings")
      .select("id, booked_by_user_id, company_id, canceled_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !data) {
      throw new NotFoundException("Prenotazione non trovata");
    }
    const row = data as Record<string, unknown>;
    if (String(row.company_id) !== me.companyId) {
      throw new ForbiddenException();
    }
    if (row.canceled_at) {
      return;
    }
    const ownerId = String(row.booked_by_user_id);
    const isAdmin = me.role === "superuser";
    if (!isAdmin && ownerId !== me.id) {
      throw new ForbiddenException();
    }
    const { error: upErr } = await this.supabase!
      .from("meeting_room_bookings")
      .update({ canceled_at: new Date().toISOString(), canceled_by_user_id: me.id })
      .eq("id", bookingId);
    if (upErr) {
      throw new InternalServerErrorException(`Annullamento prenotazione fallito: ${upErr.message}`);
    }
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
      const endDay = sh.endAt.slice(0, 10);
      if (!this.inCalendarRange(startDay, from, to) && !this.inCalendarRange(endDay, from, to)) continue;
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
    const swRequests = await this.listMySmartworking(userId);
    const swRequestCoveredDays = new Set<string>();
    for (const r of swRequests) {
      if (r.status === "rejected") continue;
      for (const d of this.enumerateCalendarDaysInclusive(r.day, this.smartworkingRequestEndDay(r))) {
        swRequestCoveredDays.add(d);
      }
    }
    for (const r of swRequests) {
      const swStart = r.day.slice(0, 10);
      const swEnd = this.smartworkingRequestEndDay(r);
      if (!this.inCalendarRange(swStart, from, to) && !this.inCalendarRange(swEnd, from, to)) continue;
      if (r.status === "rejected") {
        events.push({
          id: `cal-swr-${r.id}`,
          kind: "smartworking",
          title: "Remote working (rifiutato)",
          start: swStart,
          end: swEnd,
          meta: {
            swRequestId: r.id,
            status: r.status,
            ...(r.note ? { note: r.note } : {})
          }
        });
        continue;
      }
      const pending = r.status === "pending";
      const rangeLabel =
        swEnd !== swStart ? ` (${swStart} → ${swEnd})` : "";
      events.push({
        id: `cal-swr-${r.id}`,
        kind: "smartworking",
        title: pending
          ? `Remote working (in attesa)${rangeLabel}`
          : `Remote working${rangeLabel}`,
        start: swStart,
        end: swEnd,
        meta: {
          swRequestId: r.id,
          status: r.status,
          ...(r.note ? { note: r.note } : {})
        }
      });
    }
    for (const ws of summaries) {
      if (ws.mode !== "smartworking") continue;
      if (swRequestCoveredDays.has(ws.date)) continue;
      if (!this.inCalendarRange(ws.date, from, to)) continue;
      events.push({
        id: `cal-sw-${userId}-${ws.date}`,
        kind: "smartworking",
        title: "Remote working",
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
    const requester = await this.getUser(requesterId);
    const isSelf = requesterId === targetUserId;
    const isAdmin = requesterRole === "superuser";
    const isManagerWithHierarchy =
      requesterRole === "user" &&
      ((await this.isManagerOf(requesterId, targetUserId)) ||
        (await this.isUserLeadOfTeamContaining(requesterId, targetUserId)));
    const isHrSameCompany =
      (await this.canAccessHrExtendedConsoleLocal(
        requesterId,
        requesterRole as AuthRole,
        requester.email ?? ""
      )) && target.companyId === requester.companyId;
    if (!isSelf && !isAdmin && !isManagerWithHierarchy && !isHrSameCompany) {
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

  /** Profilo CV read-only: anagrafica, organizzazione, competenze (bundle unico, senza id tecnici in testa). */
  async getEmployeeCvProfile(
    requesterId: string,
    requesterRole: User["role"],
    requesterEmail: string,
    targetUserId: string,
    opts: { includeEconomic: boolean; includePayrollSensitive: boolean }
  ): Promise<{
    subject: Record<string, unknown>;
    roleName: string | null;
    costCenter: { code: string; name: string } | null;
    team: { name: string } | null;
    manager: { id: string; fullName: string } | null;
    skills: Array<{ code: string; name: string; level: number }>;
    companyCcnl: string | null;
    profilePhotoUrl: string | null;
    flags: {
      isSelf: boolean;
      canViewEconomic: boolean;
      canViewPayrollSensitive: boolean;
      canEditInAdmin: boolean;
    };
  }> {
    await this.assertCanViewEmployeeCvProfile(requesterId, requesterRole, requesterEmail, targetUserId);
    const user = await this.getUser(targetUserId);
    const isSelf = requesterId === targetUserId;
    const canEditInAdmin = isSynapseSuperuserEmail(requesterEmail);

    let roleName: string | null = null;
    if (user.roleId?.trim()) {
      const role = await this.getRoleById(user.roleId.trim());
      roleName = role?.name?.trim() || null;
    }

    let costCenter: { code: string; name: string } | null = null;
    if (user.costCenterId?.trim()) {
      const centers = await this.listCostCenters();
      const cc = centers.find((c) => c.id === user.costCenterId);
      if (cc) {
        costCenter = { code: cc.code, name: cc.name };
      }
    }

    let team: { name: string } | null = null;
    if (user.teamId?.trim()) {
      try {
        const t = await this.getWorkTeam(user.teamId.trim());
        team = { name: t.name };
      } catch {
        team = null;
      }
    }

    let manager: { id: string; fullName: string } | null = null;
    if (user.managerId?.trim()) {
      try {
        const m = await this.getUser(user.managerId.trim());
        if (m.companyId === user.companyId) {
          manager = { id: m.id, fullName: m.fullName };
        }
      } catch {
        manager = null;
      }
    }

    const skills = await this.listUserSkillsForCv(targetUserId);
    const companyRow = await this.getCompanySettings(user.companyId);
    const profilePhotoUrl = await this.getEmployeeProfilePhotoSignedUrl(
      requesterId,
      requesterRole,
      targetUserId
    );

    const subject: Record<string, unknown> = {
      fullName: user.fullName,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      email: user.email,
      phone: user.phone ?? null,
      birthDate: user.birthDate ?? null,
      hireDate: user.hireDate ?? null,
      contractType: user.contractType ?? null,
      weeklyContractHours: user.weeklyContractHours ?? null,
      employmentState: user.employmentState ?? "active",
      contractEndDate: user.contractEndDate ?? null,
      contractFixedTerm: user.contractFixedTerm ?? false,
      partTimeModality: user.partTimeModality ?? null,
      legalCategory: user.legalCategory ?? null,
      ccnlCode: user.ccnlCode ?? null,
      ccnlLevel: user.ccnlLevel ?? null,
      vacationAllowanceDays: user.vacationAllowanceDays ?? null,
      jurisdiction: user.jurisdiction ?? "IT",
      taxRegion: user.taxRegion ?? null,
      taxMunicipalityIt: user.taxMunicipalityIt ?? null
    };

    if (opts.includePayrollSensitive) {
      subject.fiscalCode = user.fiscalCode ?? null;
      subject.maritalStatus = user.maritalStatus ?? null;
      subject.dependentsChildren = user.dependentsChildren ?? null;
      subject.dependentSpouse = user.dependentSpouse ?? null;
      subject.disabilityFlag = user.disabilityFlag ?? null;
      subject.taxDomicileMunicipalityIt = user.taxDomicileMunicipalityIt ?? null;
      subject.taxDomicileSameAsResidence = user.taxDomicileSameAsResidence ?? null;
      subject.address = user.address ?? null;
      subject.iban = user.iban ?? null;
      subject.bankName = user.bankName ?? null;
      subject.bicSwift = user.bicSwift ?? null;
      subject.accountHolder = user.accountHolder ?? null;
    }

    if (opts.includeEconomic) {
      subject.annualGrossSalary = user.annualGrossSalary ?? null;
      subject.baseSalaryMonthly = user.baseSalaryMonthly ?? null;
      subject.fixedSupplementMonthly = user.fixedSupplementMonthly ?? null;
      subject.payMonthsPerYear = user.payMonthsPerYear ?? null;
      subject.fringeBenefitYtdEuros = user.fringeBenefitYtdEuros ?? null;
      subject.garnishmentMonthlyEstimate = user.garnishmentMonthlyEstimate ?? null;
    }

    return {
      subject,
      roleName,
      costCenter,
      team,
      manager,
      skills,
      companyCcnl: companyRow.companyCcnl?.trim() || null,
      profilePhotoUrl,
      flags: {
        isSelf,
        canViewEconomic: opts.includeEconomic,
        canViewPayrollSensitive: opts.includePayrollSensitive,
        canEditInAdmin
      }
    };
  }

  async assertCanViewEmployeeCvProfile(
    requesterId: string,
    requesterRole: User["role"],
    requesterEmail: string,
    targetUserId: string
  ): Promise<void> {
    if (requesterId === targetUserId) {
      return;
    }
    const [viewer, target] = await Promise.all([this.getUser(requesterId), this.getUser(targetUserId)]);
    if ((viewer.companyId || "").trim() !== (target.companyId || "").trim()) {
      throw new ForbiddenException("Azienda diversa");
    }
    if (requesterRole === "superuser") {
      return;
    }
    if (await this.canAccessHrExtendedConsoleLocal(requesterId, requesterRole as AuthRole, requesterEmail)) {
      return;
    }
    if (isSynapseSuperuserEmail(requesterEmail)) {
      return;
    }
    if (await this.userHasReportsHrRead(requesterId)) {
      return;
    }
    if (await this.isManagerOf(requesterId, targetUserId)) {
      return;
    }
    if (await this.isUserLeadOfTeamContaining(requesterId, targetUserId)) {
      return;
    }
    throw new ForbiddenException("Non autorizzato a visualizzare questo profilo");
  }

  private async userHasReportsHrRead(userId: string): Promise<boolean> {
    const u = await this.getUser(userId);
    if (!u.roleId?.trim()) {
      return false;
    }
    const role = await this.getRoleById(u.roleId.trim());
    if (!role) {
      return false;
    }
    return this.expandRolePermissionsRaw(role.permissions ?? []).has("nexa.reports_hr:read");
  }

  private async listUserSkillsForCv(
    userId: string
  ): Promise<Array<{ code: string; name: string; level: number }>> {
    if (!this.supabase) {
      return [];
    }
    try {
      const { data: rows, error } = await this.supabase
        .from("hr_user_skills")
        .select("skill_id, level")
        .eq("user_id", userId);
      if (error || !rows?.length) {
        return [];
      }
      const typed = rows as Array<{ skill_id: string; level: number }>;
      const skillIds = [...new Set(typed.map((r) => r.skill_id))];
      const { data: skills, error: e2 } = await this.supabase
        .from("hr_skills")
        .select("id, code, name")
        .in("id", skillIds);
      if (e2) {
        return [];
      }
      const byId = new Map(
        ((skills ?? []) as Array<{ id: string; code: string; name: string }>).map((s) => [s.id, s])
      );
      const out: Array<{ code: string; name: string; level: number }> = [];
      for (const row of typed) {
        const sk = byId.get(row.skill_id);
        if (!sk) {
          continue;
        }
        out.push({
          code: sk.code,
          name: sk.name,
          level: Number(row.level) || 0
        });
      }
      out.sort((a, b) => a.name.localeCompare(b.name, "it"));
      return out;
    } catch {
      return [];
    }
  }

  async downloadSupabasePrivateFile(bucket: string, objectPath: string): Promise<Buffer> {
    if (!this.supabase) {
      throw new InternalServerErrorException("Storage non configurato");
    }
    const { data, error } = await this.supabase.storage.from(bucket).download(objectPath);
    if (error || !data) {
      throw new NotFoundException(`File non disponibile${error?.message ? `: ${error.message}` : ""}`);
    }
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  }

  async getHrDashboardSummary(): Promise<{
    headcount: number;
    budgetEur: number;
    pendingExpenseCount: number;
  }> {
    const users = await this.listUsers();
    const headcount = users.length;
    const budgetEur =
      Math.round(users.reduce((acc, u) => acc + (u.baseSalaryMonthly != null ? Number(u.baseSalaryMonthly) : 0), 0) * 100) /
      100;
    let pendingExpenseCount = 0;
    if (this.useDb) {
      const { count: c1 } = await this.supabase!
        .from("expense_claims")
        .select("*", { count: "exact", head: true })
        .eq("status", "submitted");
      const { count: c2 } = await this.supabase!
        .from("expense_claims")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_hr");
      pendingExpenseCount = (c1 ?? 0) + (c2 ?? 0);
    } else {
      pendingExpenseCount = this.expenseClaims.filter((c) => c.status === "submitted" || c.status === "pending_hr")
        .length;
    }
    return { headcount, budgetEur, pendingExpenseCount };
  }

  /**
   * Cockpit workforce planning: riepilogo organico + serie costo mensile (stesso motore di forecast-payroll)
   * con scenari what-if (base / +2 FTE / costo flat / custom con parametri liberi).
   */
  async getWorkforceCockpit(
    scenario: "base" | "growth" | "freeze" | "custom",
    months = 6,
    custom?: {
      fteDelta?: number;
      monthlyFlatDeltaEur?: number;
      seriesScalePercent?: number;
    }
  ): Promise<{
    scenario: "base" | "growth" | "freeze" | "custom";
    summary: {
      headcount: number;
      monthlyPayrollMassEur: number;
      pendingExpenseCount: number;
    };
    series: Array<{ month: string; costEur: number }>;
    custom?: {
      fteDelta: number;
      monthlyFlatDeltaEur: number;
      seriesScalePercent: number;
    };
  }> {
    const m = Math.min(12, Math.max(1, months));
    const dash = await this.getHrDashboardSummary();
    const users = await this.listUsers();
    const staff = users.filter((u) => u.role !== "superuser");
    const headcount = staff.length;
    const monthlyPayrollMassEur =
      Math.round(staff.reduce((acc, u) => acc + (Number(u.baseSalaryMonthly) || 5800), 0) * 100) / 100;
    const baseSeries = await this.payrollForecastNextMonths(m);
    let series = baseSeries.map((r) => ({ month: r.month, costEur: r.costEur }));
    let customApplied: { fteDelta: number; monthlyFlatDeltaEur: number; seriesScalePercent: number } | undefined;
    if (scenario === "freeze") {
      const flat = Math.round(monthlyPayrollMassEur);
      series = baseSeries.map((r) => ({ month: r.month, costEur: flat }));
    } else if (scenario === "growth") {
      const addFte = headcount > 0 ? (monthlyPayrollMassEur / headcount) * 2 : 0;
      series = baseSeries.map((r) => ({ month: r.month, costEur: Math.round(r.costEur + addFte) }));
    } else if (scenario === "custom") {
      const fteDelta = Number.isFinite(custom?.fteDelta) ? Math.round(Number(custom!.fteDelta)) : 0;
      const monthlyFlatDeltaEur = Number.isFinite(custom?.monthlyFlatDeltaEur)
        ? Number(custom!.monthlyFlatDeltaEur)
        : 0;
      const rawPct = Number.isFinite(custom?.seriesScalePercent) ? Number(custom!.seriesScalePercent) : 100;
      const seriesScalePercent = Math.min(300, Math.max(0, rawPct));
      const scale = seriesScalePercent / 100;
      const avgPerHead = headcount > 0 ? monthlyPayrollMassEur / headcount : 5800;
      const fteCost = fteDelta * avgPerHead;
      series = baseSeries.map((r) => ({
        month: r.month,
        costEur: Math.round(r.costEur * scale + fteCost + monthlyFlatDeltaEur)
      }));
      customApplied = { fteDelta, monthlyFlatDeltaEur, seriesScalePercent };
    }
    return {
      scenario,
      summary: {
        headcount,
        monthlyPayrollMassEur,
        pendingExpenseCount: dash.pendingExpenseCount
      },
      series,
      ...(customApplied ? { custom: customApplied } : {})
    };
  }

  private mapExpenseRow(r: Record<string, unknown>): ExpenseClaim {
    const receiptB64 = r.receiptBodyBase64 != null ? String(r.receiptBodyBase64) : "";
    const sha = r.receiptSha256 != null ? String(r.receiptSha256) : null;
    return {
      id: String(r.id),
      userId: String(r.userId),
      amountCents: Number(r.amountCents ?? 0),
      currency: String(r.currency),
      description: String(r.description),
      expenseDate: r.expenseDate != null ? String(r.expenseDate) : undefined,
      expenseType: r.expenseType != null ? String(r.expenseType) : "altro",
      hasReceipt: Boolean(receiptB64.length > 0 && sha),
      receiptSha256: sha,
      ocrSuggestedCents: r.ocrSuggestedCents != null ? Number(r.ocrSuggestedCents) : null,
      kmDistance: r.kmDistance != null ? Number(r.kmDistance) : undefined,
      status: r.status as ExpenseClaim["status"],
      createdAt: String(r.createdAt),
      legalArchivalAt: r.legalArchivalAt != null ? String(r.legalArchivalAt) : null,
      payslipPeriod: r.payslipPeriod ? String(r.payslipPeriod) : undefined,
      appliedPayslipId: r.appliedPayslipId ? String(r.appliedPayslipId) : undefined,
      managerApprovedBy: r.managerApprovedBy != null ? String(r.managerApprovedBy) : null,
      managerApprovedAt: r.managerApprovedAt != null ? String(r.managerApprovedAt) : null,
      hrApprovedBy: r.hrApprovedBy != null ? String(r.hrApprovedBy) : null,
      hrApprovedAt: r.hrApprovedAt != null ? String(r.hrApprovedAt) : null
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
    scope: "self" | "team",
    options?: { teamOrgWide?: boolean }
  ): Promise<ExpenseClaim[]> {
    let userIds: string[];
    if (scope === "self") {
      userIds = [requesterId];
    } else if (requesterRole === "superuser" || options?.teamOrgWide) {
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

  private async resolveExpenseFirstLineManagerName(employeeUserId: string): Promise<string | null> {
    const employee = await this.getUser(employeeUserId);
    if (employee.managerId?.trim()) {
      try {
        const mgr = await this.getUser(employee.managerId.trim());
        return mgr.fullName;
      } catch {
        return null;
      }
    }
    const tid = employee.teamId?.trim();
    if (tid) {
      try {
        const team = await this.getWorkTeam(tid);
        const leadId = (team.leadUserId ?? "").trim();
        if (leadId && leadId !== employeeUserId) {
          const lead = await this.getUser(leadId);
          return lead.fullName;
        }
      } catch {
        /* fall through */
      }
    }
    if (employee.role === "superuser" || isSynapseSuperuserEmail(employee.email)) {
      return "HR";
    }
    return null;
  }

  private async toExpenseWorkflowRow(
    claim: ExpenseClaim,
    viewerId: string,
    viewerRole: User["role"]
  ): Promise<ExpenseWorkflowRow> {
    const requester = await this.getUser(claim.userId);
    const firstLineManagerName = await this.resolveExpenseFirstLineManagerName(claim.userId);
    let requesterPhotoUrl: string | null = null;
    try {
      requesterPhotoUrl = await this.getEmployeeProfilePhotoSignedUrl(viewerId, viewerRole, claim.userId);
    } catch {
      requesterPhotoUrl = null;
    }
    return {
      claim,
      requesterName: requester.fullName,
      requesterPhotoUrl,
      firstLineManagerName
    };
  }

  /**
   * Code spese per workflow: da approvare (responsabile), da approvare HR, mie (tutte).
   */
  async listExpenseClaimsForWorkflow(
    viewerId: string,
    viewerRole: User["role"],
    viewerEmail: string
  ): Promise<{
    toApproveManager: ExpenseWorkflowRow[];
    toApproveHr: ExpenseWorkflowRow[];
    mine: ExpenseWorkflowRow[];
  }> {
    const mineRaw = await this.fetchAllExpenseClaimsForUser(viewerId);
    const mine = await Promise.all(mineRaw.map((c) => this.toExpenseWorkflowRow(c, viewerId, viewerRole)));
    const canHr = await this.canAccessHrExtendedConsoleLocal(viewerId, viewerRole as AuthRole, viewerEmail);
    const toApproveManager: ExpenseWorkflowRow[] = [];
    const toApproveHr: ExpenseWorkflowRow[] = [];

    const pushManager = async (rows: ExpenseClaim[]): Promise<void> => {
      for (const c of rows) {
        if (c.status !== "submitted") {
          continue;
        }
        if (await this.canApproveExpenseAsFirstLine(viewerId, viewerRole as AuthRole, c.userId)) {
          toApproveManager.push(await this.toExpenseWorkflowRow(c, viewerId, viewerRole));
        }
      }
    };
    const pushHr = async (rows: ExpenseClaim[]): Promise<void> => {
      if (!canHr) {
        return;
      }
      const viewer = await this.getUser(viewerId);
      for (const c of rows) {
        if (c.status !== "pending_hr") {
          continue;
        }
        const subj = await this.getUser(c.userId);
        if (subj.companyId === viewer.companyId) {
          toApproveHr.push(await this.toExpenseWorkflowRow(c, viewerId, viewerRole));
        }
      }
    };

    if (!this.useDb) {
      await pushManager(this.expenseClaims);
      await pushHr(this.expenseClaims);
      return { toApproveManager, toApproveHr, mine };
    }

    const { data: submittedData, error: e1 } = await this.supabase!
      .from("expense_claims")
      .select("*")
      .eq("status", "submitted")
      .order("createdAt", { ascending: false });
    if (e1) {
      throw new BadRequestException(`Lettura note spese fallita: ${e1.message}`);
    }
    const { data: hrData, error: e2 } = await this.supabase!
      .from("expense_claims")
      .select("*")
      .eq("status", "pending_hr")
      .order("createdAt", { ascending: false });
   
    if (e2) {
      throw new BadRequestException(`Lettura note spese fallita: ${e2.message}`);
    }
    await pushManager((submittedData ?? []).map((row) => this.mapExpenseRow(row as Record<string, unknown>)));
    await pushHr((hrData ?? []).map((row) => this.mapExpenseRow(row as Record<string, unknown>)));
    return { toApproveManager, toApproveHr, mine };
  }

  async createExpenseClaim(
    userId: string,
    input: {
      amountCents: number;
      currency: string;
      description: string;
      expenseDate: string;
      expenseType: string;
      kmDistance?: number;
      receiptMime?: string | null;
      receiptSha256?: string | null;
      receiptBodyBase64?: string | null;
      ocrRawText?: string | null;
      ocrSuggestedCents?: number | null;
      legalArchivalAt?: string | null;
      payslipPeriod: string;
    }
  ): Promise<ExpenseClaim> {
    const needsManager = await this.employeeHasExpenseFirstLineApprover(userId);
    const initialStatus: ExpenseClaim["status"] = needsManager ? "submitted" : "pending_hr";
    const claim: ExpenseClaim = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      expenseDate: input.expenseDate,
      expenseType: input.expenseType,
      hasReceipt: Boolean(input.receiptBodyBase64 && input.receiptSha256),
      receiptSha256: input.receiptSha256 ?? null,
      ocrSuggestedCents: input.ocrSuggestedCents ?? null,
      kmDistance: input.kmDistance,
      status: initialStatus,
      createdAt: new Date().toISOString(),
      legalArchivalAt: input.legalArchivalAt ?? null,
      payslipPeriod: input.payslipPeriod,
      managerApprovedBy: null,
      managerApprovedAt: null,
      hrApprovedBy: null,
      hrApprovedAt: null
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("expense_claims").insert({
        id: claim.id,
        userId: claim.userId,
        amountCents: claim.amountCents,
        currency: claim.currency,
        description: claim.description,
        expenseDate: input.expenseDate,
        expenseType: input.expenseType,
        kmDistance: claim.kmDistance ?? null,
        status: claim.status,
        createdAt: claim.createdAt,
        payslipPeriod: input.payslipPeriod,
        appliedPayslipId: null,
        receiptMime: input.receiptMime ?? null,
        receiptSha256: input.receiptSha256 ?? null,
        receiptBodyBase64: input.receiptBodyBase64 ?? null,
        ocrRawText: input.ocrRawText ?? null,
        ocrSuggestedCents: input.ocrSuggestedCents ?? null,
        legalArchivalAt: input.legalArchivalAt ?? null,
        managerApprovedBy: null,
        managerApprovedAt: null,
        hrApprovedBy: null,
        hrApprovedAt: null
      });
      if (error) {
        throw new InternalServerErrorException(`Creazione nota spesa fallita: ${error.message}`);
      }
    } else {
      const mem = claim as ExpenseClaim & { receiptBodyBase64?: string | null; receiptMime?: string | null };
      mem.receiptBodyBase64 = input.receiptBodyBase64 ?? null;
      mem.receiptMime = input.receiptMime ?? null;
      this.expenseClaims.unshift(mem);
    }
    return claim;
  }

  /** Righe con immagine per export ZIP (solo utente indicato). */
  async fetchExpenseReceiptZipRowsForUser(
    userId: string,
    filters: { fromDate?: string; toDate?: string; status?: string }
  ): Promise<Array<{ id: string; receiptBodyBase64: string; receiptMime: string | null }>> {
    if (!this.useDb) {
      return this.expenseClaims
        .filter((c) => {
          if (c.userId !== userId) return false;
          if (!this.expenseClaimHasReceiptPayload(c)) return false;
          if (filters.status && c.status !== filters.status) return false;
          const ed = c.expenseDate;
          if (filters.fromDate && ed && ed < filters.fromDate) return false;
          if (filters.toDate && ed && ed > filters.toDate) return false;
          return true;
        })
        .map((c) => ({
          id: c.id,
          receiptBodyBase64: (c as unknown as { receiptBodyBase64?: string }).receiptBodyBase64 ?? "",
          receiptMime: (c as unknown as { receiptMime?: string | null }).receiptMime ?? "image/jpeg"
        }));
    }
    let q = this.supabase!
      .from("expense_claims")
      .select("id,receiptBodyBase64,receiptMime,expenseDate,status")
      .eq("userId", userId)
      .not("receiptBodyBase64", "is", null);
    if (filters.fromDate?.trim()) {
      q = q.gte("expenseDate", filters.fromDate.trim());
    }
    if (filters.toDate?.trim()) {
      q = q.lte("expenseDate", filters.toDate.trim());
    }
    if (filters.status?.trim()) {
      q = q.eq("status", filters.status.trim());
    }
    const { data, error } = await q;
    if (error) {
      throw new BadRequestException(`Lettura scontrini fallita: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: String((r as Record<string, unknown>).id),
      receiptBodyBase64: String((r as Record<string, unknown>).receiptBodyBase64 ?? ""),
      receiptMime:
        (r as Record<string, unknown>).receiptMime != null
          ? String((r as Record<string, unknown>).receiptMime)
          : "image/jpeg"
    }));
  }

  async fetchExpenseReceiptZipRowsForUserAndIds(
    userId: string,
    claimIds: string[]
  ): Promise<Array<{ id: string; receiptBodyBase64: string; receiptMime: string | null }>> {
    if (claimIds.length === 0) {
      return [];
    }
    if (!this.useDb) {
      const set = new Set(claimIds);
      return this.expenseClaims
        .filter((c) => c.userId === userId && set.has(c.id) && this.expenseClaimHasReceiptPayload(c))
        .map((c) => ({
          id: c.id,
          receiptBodyBase64: (c as unknown as { receiptBodyBase64?: string }).receiptBodyBase64 ?? "",
          receiptMime: (c as unknown as { receiptMime?: string | null }).receiptMime ?? "image/jpeg"
        }));
    }
    const { data, error } = await this.supabase!
      .from("expense_claims")
      .select("id,receiptBodyBase64,receiptMime")
      .eq("userId", userId)
      .in("id", claimIds)
      .not("receiptBodyBase64", "is", null);
    if (error) {
      throw new BadRequestException(`Lettura scontrini fallita: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: String((r as Record<string, unknown>).id),
      receiptBodyBase64: String((r as Record<string, unknown>).receiptBodyBase64 ?? ""),
      receiptMime:
        (r as Record<string, unknown>).receiptMime != null
          ? String((r as Record<string, unknown>).receiptMime)
          : "image/jpeg"
    }));
  }

  private expenseClaimHasReceiptPayload(c: ExpenseClaim): boolean {
    const ext = c as unknown as { receiptBodyBase64?: string; receiptSha256?: string | null };
    return Boolean(ext.receiptBodyBase64 && ext.receiptBodyBase64.length > 64 && c.receiptSha256);
  }

  async getExpenseClaimReceiptForOwner(
    claimId: string,
    userId: string
  ): Promise<{ body: Buffer; mime: string } | null> {
    const claim = await this.getExpenseClaim(claimId);
    if (claim.userId !== userId) {
      throw new NotFoundException("Scontrino non trovato");
    }
    if (!this.useDb) {
      const ext = this.expenseClaims.find((c) => c.id === claimId) as unknown as {
        receiptBodyBase64?: string;
        receiptMime?: string | null;
      };
      if (!ext?.receiptBodyBase64) {
        return null;
      }
      try {
        const body = Buffer.from(ext.receiptBodyBase64.trim(), "base64");
        if (body.length < 256) {
          return null;
        }
        return { body, mime: ext.receiptMime?.trim() || "image/jpeg" };
      } catch {
        return null;
      }
    }
    const { data, error } = await this.supabase!
      .from("expense_claims")
      .select("receiptBodyBase64,receiptMime")
      .eq("id", claimId)
      .eq("userId", userId)
      .single();
    if (error || !data) {
      return null;
    }
    const row = data as Record<string, unknown>;
    const b64 = row.receiptBodyBase64 != null ? String(row.receiptBodyBase64).trim() : "";
    if (!b64) {
      return null;
    }
    try {
      const body = Buffer.from(b64, "base64");
      if (body.length < 256) {
        return null;
      }
      return { body, mime: row.receiptMime != null ? String(row.receiptMime) : "image/jpeg" };
    } catch {
      return null;
    }
  }

  /**
   * Scontrino per chi ha diritto di vederlo in workflow: richiedente, responsabile di prima linea su richiesta
   * `submitted`, oppure HR (console estesa) su `pending_hr` stessa company.
   */
  async getExpenseClaimReceiptForViewer(
    claimId: string,
    viewerId: string
  ): Promise<{ body: Buffer; mime: string } | null> {
    const claim = await this.getExpenseClaim(claimId);
    const viewer = await this.getUser(viewerId);
    const viewerRole = viewer.role as AuthRole;
    const viewerEmail = viewer.email ?? "";

    let allowed = false;
    if (claim.userId === viewerId) {
      allowed = true;
    } else if (claim.status === "submitted") {
      allowed = await this.canApproveExpenseAsFirstLine(viewerId, viewerRole, claim.userId);
    } else if (claim.status === "pending_hr") {
      const canHr = await this.canAccessHrExtendedConsoleLocal(viewerId, viewerRole, viewerEmail);
      if (canHr) {
        const subj = await this.getUser(claim.userId);
        allowed = subj.companyId === viewer.companyId;
      }
    }

    if (!allowed) {
      throw new NotFoundException("Scontrino non trovato");
    }

    if (!this.useDb) {
      const ext = this.expenseClaims.find((c) => c.id === claimId) as unknown as {
        receiptBodyBase64?: string;
        receiptMime?: string | null;
      };
      if (!ext?.receiptBodyBase64) {
        return null;
      }
      try {
        const body = Buffer.from(ext.receiptBodyBase64.trim(), "base64");
        if (body.length < 256) {
          return null;
        }
        return { body, mime: ext.receiptMime?.trim() || "image/jpeg" };
      } catch {
        return null;
      }
    }
    const { data, error } = await this.supabase!
      .from("expense_claims")
      .select("receiptBodyBase64,receiptMime")
      .eq("id", claimId)
      .single();
    if (error || !data) {
      return null;
    }
    const row = data as Record<string, unknown>;
    const b64 = row.receiptBodyBase64 != null ? String(row.receiptBodyBase64).trim() : "";
    if (!b64) {
      return null;
    }
    try {
      const body = Buffer.from(b64, "base64");
      if (body.length < 256) {
        return null;
      }
      return { body, mime: row.receiptMime != null ? String(row.receiptMime) : "image/jpeg" };
    } catch {
      return null;
    }
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

  /**
   * Elimina una sola riga `expense_claims` di proprietà del richiedente.
   * Lo scontrino è su colonne della riga: con il DELETE spariscono solo i dati di quella richiesta.
   */
  async deleteExpenseClaimByRequester(claimId: string, requesterUserId: string): Promise<void> {
    const deletableStatuses: ExpenseClaim["status"][] = ["draft", "submitted", "pending_hr", "rejected"];
    const claim = await this.getExpenseClaim(claimId);
    if (claim.userId !== requesterUserId) {
      throw new ForbiddenException("Operazione non consentita");
    }
    if (!deletableStatuses.includes(claim.status)) {
      throw new BadRequestException("Questa nota spesa non può essere eliminata");
    }
    if (!this.useDb) {
      const idx = this.expenseClaims.findIndex((c) => c.id === claimId && c.userId === requesterUserId);
      if (idx < 0) {
        throw new NotFoundException("Nota spesa non trovata");
      }
      this.expenseClaims.splice(idx, 1);
      return;
    }
    const { data, error } = await this.supabase!
      .from("expense_claims")
      .delete()
      .eq("id", claimId)
      .eq("userId", requesterUserId)
      .select("id");
    if (error) {
      throw new InternalServerErrorException(`Eliminazione nota spesa fallita: ${error.message}`);
    }
    if (!data?.length) {
      throw new NotFoundException("Nota spesa non trovata");
    }
  }

  async approveExpenseClaim(claimId: string, approverId: string): Promise<ExpenseClaim> {
    const claim = await this.getExpenseClaim(claimId);
    const approver = await this.getUser(approverId);
    const now = new Date().toISOString();

    if (claim.status === "submitted") {
      if (approver.role === "superuser") {
        const a = await this.getUser(approverId);
        const t = await this.getUser(claim.userId);
        if (a.companyId !== t.companyId) {
          throw new ForbiddenException("Azienda diversa");
        }
      } else {
        await this.assertCanActOnBehalfOfUser(approverId, approver.role, claim.userId);
      }
      if (this.useDb) {
        const { error } = await this.supabase!.from("expense_claims").update({
          status: "pending_hr",
          managerApprovedBy: approverId,
          managerApprovedAt: now
        }).eq("id", claimId);
        if (error) {
          throw new InternalServerErrorException(`Aggiornamento nota spesa fallito: ${error.message}`);
        }
      } else {
        const row = this.expenseClaims.find((c) => c.id === claimId);
        if (row) {
          row.status = "pending_hr";
          row.managerApprovedBy = approverId;
          row.managerApprovedAt = now;
        }
      }
      await this.insertUserNotification({
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        userId: claim.userId,
        title: "Nota spesa: ok responsabile, in attesa HR",
        body: claim.description.slice(0, 200),
        read: false,
        createdAt: new Date().toISOString(),
        kind: "expense_pending_hr"
      });
      return this.getExpenseClaim(claimId);
    }

    if (claim.status === "pending_hr") {
      if (!(await this.canAccessHrExtendedConsoleLocal(approverId, approver.role as AuthRole, approver.email))) {
        throw new ForbiddenException("Solo HR può approvare note spese a questo stadio");
      }
      const a = await this.getUser(approverId);
      const t = await this.getUser(claim.userId);
      if (a.companyId !== t.companyId) {
        throw new ForbiddenException("Azienda diversa");
      }
      if (this.useDb) {
        const { error } = await this.supabase!.from("expense_claims").update({
          status: "approved",
          hrApprovedBy: approverId,
          hrApprovedAt: now
        }).eq("id", claimId);
        if (error) {
          throw new InternalServerErrorException(`Aggiornamento nota spesa fallito: ${error.message}`);
        }
      } else {
        const row = this.expenseClaims.find((c) => c.id === claimId);
        if (row) {
          row.status = "approved";
          row.hrApprovedBy = approverId;
          row.hrApprovedAt = now;
        }
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

    throw new BadRequestException("Stato nota spesa non approvabile");
  }

  async rejectExpenseClaim(claimId: string, approverId: string): Promise<ExpenseClaim> {
    const claim = await this.getExpenseClaim(claimId);
    const approver = await this.getUser(approverId);

    if (claim.status === "submitted") {
      if (approver.role === "superuser") {
        const a = await this.getUser(approverId);
        const t = await this.getUser(claim.userId);
        if (a.companyId !== t.companyId) {
          throw new ForbiddenException("Azienda diversa");
        }
      } else {
        await this.assertCanActOnBehalfOfUser(approverId, approver.role, claim.userId);
      }
    } else if (claim.status === "pending_hr") {
      if (!(await this.canAccessHrExtendedConsoleLocal(approverId, approver.role as AuthRole, approver.email))) {
        throw new ForbiddenException("Solo HR può rifiutare note spese a questo stadio");
      }
      const a = await this.getUser(approverId);
      const t = await this.getUser(claim.userId);
      if (a.companyId !== t.companyId) {
        throw new ForbiddenException("Azienda diversa");
      }
    } else {
      throw new BadRequestException("Solo richieste dal responsabile o in attesa HR possono essere rifiutate");
    }

    if (this.useDb) {
      const { error } = await this.supabase!.from("expense_claims").update({ status: "rejected" }).eq("id", claimId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento nota spesa fallito: ${error.message}`);
      }
    } else {
      const row = this.expenseClaims.find((c) => c.id === claimId);
      if (row) {
        row.status = "rejected";
      }
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

  private shiftWeekBoundsUtc(weekStart: string): { startIso: string; endIso: string } {
    const d = new Date(`${weekStart.trim()}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException("weekStart non valido (YYYY-MM-DD)");
    }
    const end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 7);
    return { startIso: d.toISOString(), endIso: end.toISOString() };
  }

  /** Blocca turni su ferie/assenze (pending o approved), malattia, smart working e trasferte. */
  private async assertShiftNoAbsenceOverlap(userId: string, startAt: string, endAt: string): Promise<void> {
    const sMs = new Date(startAt).getTime();
    const eMs = new Date(endAt).getTime();
    if (!Number.isFinite(sMs) || !Number.isFinite(eMs) || eMs <= sMs) {
      throw new BadRequestException("Intervallo turno non valido");
    }
    const ds = startAt.slice(0, 10);
    const de = endAt.slice(0, 10);
    for (const lv of await this.listLeave(userId)) {
      if (lv.status !== "pending" && lv.status !== "approved") continue;
      if (lv.endDate >= ds && lv.startDate <= de) {
        throw new BadRequestException(
          `Turno in conflitto con assenza/ferie (${lv.startDate}–${lv.endDate}${lv.kind ? `, ${lv.kind}` : ""}).`
        );
      }
    }
    for (const sk of await this.listSickness(userId)) {
      if (sk.status !== "pending" && sk.status !== "approved") continue;
      if (sk.toDate >= ds && sk.fromDate <= de) {
        throw new BadRequestException(`Turno in conflitto con malattia (${sk.fromDate}–${sk.toDate}).`);
      }
    }
    for (const sw of await this.listMySmartworking(userId)) {
      if (sw.status !== "pending" && sw.status !== "approved") continue;
      if (sw.day >= ds && sw.day <= de) {
        throw new BadRequestException(`Turno in conflitto con smart working il ${sw.day}.`);
      }
    }
    for (const tr of await this.listMyTravel(userId)) {
      if (tr.status !== "pending" && tr.status !== "approved") continue;
      if (tr.day >= ds && tr.day <= de) {
        throw new BadRequestException(`Turno in conflitto con trasferta il ${tr.day}.`);
      }
    }
  }

  private async assertShiftRestAndNoShiftOverlap(userId: string, startAt: string, endAt: string): Promise<void> {
    const s = new Date(startAt).getTime();
    const e = new Date(endAt).getTime();
    const existing = await this.listShiftsForUser(userId);
    const MIN_REST_MS = 11 * 60 * 60 * 1000;
    for (const sh of existing) {
      const a = new Date(sh.startAt).getTime();
      const b = new Date(sh.endAt).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (s < b && e > a) {
        throw new BadRequestException("Turno sovrapposto a un altro già pianificato.");
      }
      if (e <= a && a - e < MIN_REST_MS) {
        throw new BadRequestException("Riposo minimo tra turni non rispettato (11 ore).");
      }
      if (s >= b && s - b < MIN_REST_MS) {
        throw new BadRequestException("Riposo minimo tra turni non rispettato (11 ore).");
      }
    }
  }

  private async listVisibleUserIdsForShiftPlanning(requesterId: string, requesterRole: User["role"]): Promise<Set<string>> {
    const users = await this.listUsers();
    const idSet = new Set<string>();
    if (requesterRole === "superuser") {
      for (const u of users) {
        if (u.role !== "superuser") idSet.add(u.id);
      }
      return idSet;
    }
    idSet.add(requesterId);
    for (const u of users) {
      if (u.id === requesterId) continue;
      if (await this.isManagerOf(requesterId, u.id)) idSet.add(u.id);
      else if (await this.isUserLeadOfTeamContaining(requesterId, u.id)) idSet.add(u.id);
    }
    return idSet;
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
    await this.assertShiftNoAbsenceOverlap(input.userId, input.startAt, input.endAt);
    await this.assertShiftRestAndNoShiftOverlap(input.userId, input.startAt, input.endAt);
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

  async createShiftsBulk(
    requesterId: string,
    requesterRole: User["role"],
    items: Array<{ userId: string; startAt: string; endAt: string; premiumCode?: string }>
  ): Promise<Shift[]> {
    const out: Shift[] = [];
    for (const it of items) {
      out.push(await this.createShift(requesterId, requesterRole, it));
    }
    return out;
  }

  async listShiftsForPlannerWeek(
    requesterId: string,
    requesterRole: User["role"],
    weekStart: string
  ): Promise<Shift[]> {
    const { startIso, endIso } = this.shiftWeekBoundsUtc(weekStart);
    const allowed = await this.listVisibleUserIdsForShiftPlanning(requesterId, requesterRole);
    if (!this.useDb) {
      return this.shifts
        .filter((s) => s.startAt >= startIso && s.startAt < endIso && allowed.has(s.userId))
        .sort((a, b) => (a.startAt === b.startAt ? a.userId.localeCompare(b.userId) : a.startAt.localeCompare(b.startAt)));
    }
    const { data, error } = await this.supabase!
      .from("shifts")
      .select("*")
      .gte("startAt", startIso)
      .lt("startAt", endIso)
      .order("startAt", { ascending: true });
    if (error) {
      throw new BadRequestException(`Lettura turni settimanali fallita: ${error.message}`);
    }
    return (data ?? [])
      .map((r) => this.mapShiftRow(r as Record<string, unknown>))
      .filter((s) => allowed.has(s.userId));
  }

  async publishShiftsWeek(
    requesterId: string,
    requesterRole: User["role"],
    weekStart: string
  ): Promise<{ published: number; notified: number }> {
    const shifts = await this.listShiftsForPlannerWeek(requesterId, requesterRole, weekStart);
    const toPublish = shifts.filter((s) => (s.status ?? "scheduled") !== "confirmed");
    if (toPublish.length === 0) {
      return { published: 0, notified: 0 };
    }
    const ids = toPublish.map((s) => s.id);
    const notifyUsers = new Set(toPublish.map((s) => s.userId));
    if (this.useDb) {
      const { error } = await this.supabase!.from("shifts").update({ status: "confirmed" }).in("id", ids);
      if (error) {
        throw new InternalServerErrorException(`Pubblicazione turni fallita: ${error.message}`);
      }
    } else {
      for (const sh of this.shifts) {
        if (ids.includes(sh.id)) sh.status = "confirmed";
      }
    }
    for (const uid of notifyUsers) {
      await this.notifyUserInApp({
        userId: uid,
        title: "Turni pubblicati",
        body: `La pianificazione per la settimana del ${weekStart} è stata confermata.`,
        kind: "shifts_published",
        actionPath: "/scheduling"
      });
    }
    return { published: ids.length, notified: notifyUsers.size };
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

  private mapShiftPresetRow(raw: Record<string, unknown>): HrShiftPresetRow {
    return {
      id: String(raw.id),
      companyId: String(raw.company_id ?? raw.companyId),
      name: String(raw.name),
      startTime: String(raw.start_time ?? raw.startTime ?? "08:00:00"),
      endTime: String(raw.end_time ?? raw.endTime ?? "17:00:00"),
      breakMinutes: Number(raw.break_minutes ?? raw.breakMinutes ?? 0),
      isDefault: Boolean(raw.is_default ?? raw.isDefault),
      workTeamId: raw.work_team_id != null ? String(raw.work_team_id) : raw.workTeamId != null ? String(raw.workTeamId) : null,
      userId: raw.user_id != null ? String(raw.user_id) : raw.userId != null ? String(raw.userId) : null,
      createdAt: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
      updatedAt: String(raw.updated_at ?? raw.updatedAt ?? new Date().toISOString())
    };
  }

  private normalizeShiftPresetTime(t: string): string {
    const v = t.trim();
    if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
    if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
    throw new BadRequestException("Orario preset non valido (usa HH:mm o HH:mm:ss)");
  }

  async listShiftPresets(requesterId: string): Promise<HrShiftPresetRow[]> {
    const me = await this.getUser(requesterId);
    if (!this.useDb) {
      return this.shiftPresets
        .filter((p) => p.companyId === me.companyId)
        .sort((a, b) => a.name.localeCompare(b.name, "it"));
    }
    const { data, error } = await this.supabase!
      .from("hr_shift_presets")
      .select("*")
      .eq("company_id", me.companyId)
      .order("name", { ascending: true });
    if (error) {
      throw new InternalServerErrorException(`Lettura preset turni fallita: ${error.message}`);
    }
    return ((data as Record<string, unknown>[]) ?? []).map((r) => this.mapShiftPresetRow(r));
  }

  async resolveShiftPresetForUser(userId: string): Promise<HrShiftPresetRow | null> {
    const user = await this.getUser(userId);
    const presets = await this.listShiftPresets(userId);
    const byUser = presets.find((p) => p.userId === userId);
    if (byUser) return byUser;
    const teamId = user.teamId?.trim();
    if (teamId) {
      const byTeam = presets.find((p) => p.workTeamId === teamId);
      if (byTeam) return byTeam;
    }
    return presets.find((p) => p.isDefault && !p.userId && !p.workTeamId) ?? null;
  }

  async createShiftPreset(
    requesterId: string,
    input: {
      name: string;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      isDefault?: boolean;
      workTeamId?: string | null;
      userId?: string | null;
    }
  ): Promise<HrShiftPresetRow> {
    const me = await this.getUser(requesterId);
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("Nome preset obbligatorio");
    const workTeamId = input.workTeamId?.trim() || null;
    const userId = input.userId?.trim() || null;
    const isDefault = Boolean(input.isDefault);
    if (!workTeamId && !userId && !isDefault) {
      throw new BadRequestException("Indica dipendente, team o default azienda");
    }
    const now = new Date().toISOString();
    const row: HrShiftPresetRow = {
      id: randomUUID(),
      companyId: me.companyId,
      name,
      startTime: this.normalizeShiftPresetTime(input.startTime),
      endTime: this.normalizeShiftPresetTime(input.endTime),
      breakMinutes: Math.max(0, Math.min(480, Number(input.breakMinutes ?? 0))),
      isDefault,
      workTeamId,
      userId,
      createdAt: now,
      updatedAt: now
    };
    if (this.useDb) {
      const { error } = await this.supabase!.from("hr_shift_presets").insert({
        company_id: row.companyId,
        name: row.name,
        start_time: row.startTime,
        end_time: row.endTime,
        break_minutes: row.breakMinutes,
        is_default: row.isDefault,
        work_team_id: row.workTeamId,
        user_id: row.userId,
        created_at: row.createdAt,
        updated_at: row.updatedAt
      });
      if (error) {
        throw new InternalServerErrorException(`Creazione preset turno fallita: ${error.message}`);
      }
    } else {
      this.shiftPresets.push(row);
    }
    return row;
  }

  async updateShiftPreset(
    requesterId: string,
    presetId: string,
    input: {
      name?: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
      isDefault?: boolean;
      workTeamId?: string | null;
      userId?: string | null;
    }
  ): Promise<HrShiftPresetRow> {
    const me = await this.getUser(requesterId);
    const presets = await this.listShiftPresets(requesterId);
    const existing = presets.find((p) => p.id === presetId);
    if (!existing || existing.companyId !== me.companyId) {
      throw new NotFoundException("Preset turno non trovato");
    }
    const workTeamId =
      input.workTeamId !== undefined ? input.workTeamId?.trim() || null : existing.workTeamId ?? null;
    const userId = input.userId !== undefined ? input.userId?.trim() || null : existing.userId ?? null;
    const isDefault = input.isDefault !== undefined ? Boolean(input.isDefault) : existing.isDefault;
    if (!workTeamId && !userId && !isDefault) {
      throw new BadRequestException("Indica dipendente, team o default azienda");
    }
    const updated: HrShiftPresetRow = {
      ...existing,
      name: input.name?.trim() || existing.name,
      startTime: input.startTime ? this.normalizeShiftPresetTime(input.startTime) : existing.startTime,
      endTime: input.endTime ? this.normalizeShiftPresetTime(input.endTime) : existing.endTime,
      breakMinutes:
        input.breakMinutes !== undefined
          ? Math.max(0, Math.min(480, Number(input.breakMinutes)))
          : existing.breakMinutes,
      isDefault,
      workTeamId,
      userId,
      updatedAt: new Date().toISOString()
    };
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("hr_shift_presets")
        .update({
          name: updated.name,
          start_time: updated.startTime,
          end_time: updated.endTime,
          break_minutes: updated.breakMinutes,
          is_default: updated.isDefault,
          work_team_id: updated.workTeamId,
          user_id: updated.userId,
          updated_at: updated.updatedAt
        })
        .eq("id", presetId)
        .eq("company_id", me.companyId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento preset turno fallito: ${error.message}`);
      }
    } else {
      const idx = this.shiftPresets.findIndex((p) => p.id === presetId);
      if (idx >= 0) this.shiftPresets[idx] = updated;
    }
    return updated;
  }

  async deleteShiftPreset(requesterId: string, presetId: string): Promise<void> {
    const me = await this.getUser(requesterId);
    const presets = await this.listShiftPresets(requesterId);
    if (!presets.some((p) => p.id === presetId)) {
      throw new NotFoundException("Preset turno non trovato");
    }
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("hr_shift_presets")
        .delete()
        .eq("id", presetId)
        .eq("company_id", me.companyId);
      if (error) {
        throw new InternalServerErrorException(`Eliminazione preset turno fallita: ${error.message}`);
      }
    } else {
      const idx = this.shiftPresets.findIndex((p) => p.id === presetId);
      if (idx >= 0) this.shiftPresets.splice(idx, 1);
    }
  }

  shiftPresetToUtcWindow(ymd: string, preset: HrShiftPresetRow): { startAt: string; endAt: string } {
    const start = preset.startTime.slice(0, 8);
    const end = preset.endTime.slice(0, 8);
    return {
      startAt: `${ymd}T${start}.000Z`,
      endAt: `${ymd}T${end}.000Z`
    };
  }

  private defaultOnboarding(userId: string): OnboardingStatus {
    const now = new Date().toISOString();
    const checklist: OnboardingChecklistItem[] = [
      { id: "ob-1", label: "Contratto firmato e archiviato", done: false },
      { id: "ob-2", label: "Account aziendali e accessi IT", done: false },
      { id: "ob-3", label: "Formazione sicurezza / compliance", done: false },
      { id: "ob-4", label: "Badge / presenze configurate", done: false },
      { id: "emp-welcome", label: "Leggi il messaggio di benvenuto", done: false },
      { id: "emp-settings", label: "Completa profilo e recapiti", done: false },
      { id: "emp-payslips", label: "Verifica accesso cedolini", done: false },
      { id: "emp-policies", label: "Consulta policy aziendali", done: false },
      { id: "emp-team", label: "Conosci manager e team", done: false },
      { id: "emp-formazione", label: "Completa i corsi di formazione", done: false }
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

  private defaultOffboarding(userId: string): OnboardingStatus {
    const now = new Date().toISOString();
    const checklist: OnboardingChecklistItem[] = [
      { id: "emp-workflow", label: "Chiudi richieste workflow aperte", done: false },
      { id: "emp-expenses", label: "Invia note spese in sospeso", done: false },
      { id: "emp-payslips", label: "Scarica ultimi cedolini", done: false },
      { id: "emp-settings", label: "Aggiorna recapiti per comunicazioni finali", done: false },
      { id: "emp-team", label: "Allinea passaggio con il manager", done: false },
      { id: "emp-assets", label: "Restituisci asset aziendali (PC, badge, telefono)", done: false },
      { id: "emp-handover", label: "Completa passaggio di consegna documentazione", done: false }
    ];
    return { userId, phase: "active", checklist, updatedAt: now };
  }

  async getOrCreateOffboarding(userId: string): Promise<OnboardingStatus> {
    if (!this.useDb) {
      let st = this.offboardingByUser.get(userId);
      if (!st) {
        st = this.defaultOffboarding(userId);
        this.offboardingByUser.set(userId, st);
      }
      return st;
    }
    const { data } = await this.supabase!.from("lifecycle_offboarding").select("*").eq("userId", userId).maybeSingle();
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
    const st = this.defaultOffboarding(userId);
    await this.supabase!.from("lifecycle_offboarding").insert({
      userId,
      phase: st.phase,
      checklistJson: st.checklist,
      updatedAt: st.updatedAt
    });
    return st;
  }

  async patchOffboardingItem(
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
      throw new BadRequestException("Non puoi modificare questo offboarding");
    }
    const st = await this.getOrCreateOffboarding(userId);
    const item = st.checklist.find((i: OnboardingChecklistItem) => i.id === itemId);
    if (!item) throw new NotFoundException("Voce checklist non trovata");
    item.done = done;
    st.updatedAt = new Date().toISOString();
    const allDone = st.checklist.length > 0 && st.checklist.every((i: OnboardingChecklistItem) => i.done);
    st.phase = allDone ? "completed" : "active";
    if (!this.useDb) {
      this.offboardingByUser.set(userId, st);
      return st;
    }
    const { error } = await this.supabase!
      .from("lifecycle_offboarding")
      .update({ checklistJson: st.checklist, phase: st.phase, updatedAt: st.updatedAt })
      .eq("userId", userId);
    if (error) throw new InternalServerErrorException(`Aggiornamento offboarding fallito: ${error.message}`);
    return st;
  }

  private mapDocumentRow(r: Record<string, unknown>): EmployeeDocumentRow {
    const signatureMetadata = r.signatureMetadata;
    return {
      id: String(r.id),
      userId: String(r.userId),
      kind: r.kind as EmployeeDocumentKind,
      title: String(r.title),
      mimeType: r.mimeType ? String(r.mimeType) : undefined,
      storagePath: r.storagePath ? String(r.storagePath) : undefined,
      createdAt: String(r.createdAt),
      uploadedBy: r.uploadedBy ? String(r.uploadedBy) : undefined,
      parentDocumentId: r.parentDocumentId ? String(r.parentDocumentId) : undefined,
      signedAt: r.signedAt ? String(r.signedAt) : undefined,
      signedByUserId: r.signedByUserId ? String(r.signedByUserId) : undefined,
      signatureMetadata:
        signatureMetadata && typeof signatureMetadata === "object"
          ? (signatureMetadata as Record<string, unknown>)
          : undefined,
      bodyBase64: r.bodyBase64 ? String(r.bodyBase64) : null
    };
  }

  private employeeDocumentsByIdMap(): Map<string, EmployeeDocument> {
    const map = new Map<string, EmployeeDocument>();
    for (const d of this.employeeDocuments) {
      const { bodyBase64: _b, ...pub } = d;
      map.set(pub.id, pub);
    }
    return map;
  }

  private async loadEmployeeDocumentsByIdMapForUser(userId: string): Promise<Map<string, EmployeeDocument>> {
    const map = new Map<string, EmployeeDocument>();
    if (!this.useDb) {
      for (const d of this.employeeDocuments) {
        if (d.userId !== userId) continue;
        const { bodyBase64: _b, ...pub } = d;
        map.set(pub.id, pub);
      }
      return map;
    }
    const { data, error } = await this.supabase!
      .from("employee_documents")
      .select(
        "id, userId, kind, title, mimeType, storagePath, createdAt, uploadedBy, parentDocumentId, signedAt, signedByUserId, signatureMetadata"
      )
      .eq("userId", userId);
    if (error) {
      throw new BadRequestException(`Lettura documenti fallita: ${error.message}`);
    }
    for (const r of data ?? []) {
      const row = this.mapDocumentRow(r as Record<string, unknown>);
      const { bodyBase64: _b, ...pub } = row;
      map.set(pub.id, pub);
    }
    return map;
  }

  private mapSignatureRequestRow(
    r: Record<string, unknown>,
    doc?: Pick<EmployeeDocument, "title" | "kind">
  ): HrDocumentSignatureRequest {
    const signatureMetadata = r.signatureMetadata;
    return {
      id: String(r.id),
      documentId: String(r.documentId),
      parentDocumentId: r.parentDocumentId ? String(r.parentDocumentId) : undefined,
      originSignedDocumentId: r.originSignedDocumentId ? String(r.originSignedDocumentId) : undefined,
      employeeUserId: String(r.employeeUserId),
      requesterUserId: String(r.requesterUserId),
      status: r.status as HrDocumentSignatureRequestStatus,
      createdAt: String(r.createdAt),
      signedAt: r.signedAt ? String(r.signedAt) : undefined,
      returnedAt: r.returnedAt ? String(r.returnedAt) : undefined,
      signatureMetadata:
        signatureMetadata && typeof signatureMetadata === "object"
          ? (signatureMetadata as Record<string, unknown>)
          : undefined,
      documentTitle: doc?.title,
      documentKind: doc?.kind
    };
  }

  private async signatureRequestsDbAvailable(): Promise<boolean> {
    if (!this.useDb) return false;
    if (this.documentSignatureDbEnabled !== null) {
      return this.documentSignatureDbEnabled;
    }
    const { error } = await this.supabase!.from("hr_document_signature_requests").select("id").limit(1);
    this.documentSignatureDbEnabled = !error;
    if (error) {
      this.logger.warn(
        `[hr_document_signature_requests] tabella non disponibile (${error.message}); fallback in-memory`
      );
    }
    return this.documentSignatureDbEnabled;
  }

  private async insertSignatureRequestRow(row: HrDocumentSignatureRequest): Promise<void> {
    if (await this.signatureRequestsDbAvailable()) {
      const { error } = await this.supabase!.from("hr_document_signature_requests").insert({
        id: row.id,
        documentId: row.documentId,
        parentDocumentId: row.parentDocumentId ?? null,
        originSignedDocumentId: row.originSignedDocumentId ?? null,
        employeeUserId: row.employeeUserId,
        requesterUserId: row.requesterUserId,
        status: row.status,
        createdAt: row.createdAt,
        signedAt: row.signedAt ?? null,
        returnedAt: row.returnedAt ?? null,
        signatureMetadata: row.signatureMetadata ?? null
      });
      if (error) {
        this.logger.warn(`[hr_document_signature_requests] insert fallito: ${error.message}`);
        this.documentSignatureRequestsMem.unshift(row);
      }
      return;
    }
    this.documentSignatureRequestsMem.unshift(row);
  }

  private async updateSignatureRequestRow(
    id: string,
    patch: Partial<
      Pick<HrDocumentSignatureRequest, "status" | "signedAt" | "returnedAt" | "signatureMetadata">
    >
  ): Promise<HrDocumentSignatureRequest | undefined> {
    if (await this.signatureRequestsDbAvailable()) {
      const { data, error } = await this.supabase!
        .from("hr_document_signature_requests")
        .update({
          status: patch.status,
          signedAt: patch.signedAt ?? undefined,
          returnedAt: patch.returnedAt ?? undefined,
          signatureMetadata: patch.signatureMetadata ?? undefined
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error || !data) {
        const mem = this.documentSignatureRequestsMem.find((r) => r.id === id);
        if (!mem) return undefined;
        Object.assign(mem, patch);
        return mem;
      }
      return this.mapSignatureRequestRow(data as Record<string, unknown>);
    }
    const mem = this.documentSignatureRequestsMem.find((r) => r.id === id);
    if (!mem) return undefined;
    Object.assign(mem, patch);
    return mem;
  }

  private async findSignatureRequestById(id: string): Promise<HrDocumentSignatureRequest | undefined> {
    if (await this.signatureRequestsDbAvailable()) {
      const { data } = await this.supabase!
        .from("hr_document_signature_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      return data ? this.mapSignatureRequestRow(data as Record<string, unknown>) : undefined;
    }
    return this.documentSignatureRequestsMem.find((r) => r.id === id);
  }

  private async findSignatureRequestByDocumentId(
    documentId: string
  ): Promise<HrDocumentSignatureRequest | undefined> {
    if (await this.signatureRequestsDbAvailable()) {
      const { data } = await this.supabase!
        .from("hr_document_signature_requests")
        .select("*")
        .eq("documentId", documentId)
        .maybeSingle();
      return data ? this.mapSignatureRequestRow(data as Record<string, unknown>) : undefined;
    }
    return this.documentSignatureRequestsMem.find((r) => r.documentId === documentId);
  }

  /** Hook opzionale email (nessun provider configurato di default). */
  private async maybeNotifyDocumentSignatureEmail(
    userId: string,
    subject: string,
    _body: string
  ): Promise<void> {
    if (process.env.NEXA_DOCUMENT_SIGNATURE_EMAIL_HOOK !== "1") return;
    const user = await this.findUserById(userId);
    if (!user?.email) return;
    this.logger.log(`[document-signature-email] ${subject} → ${user.email}`);
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
    parentDocumentId?: string;
    /** Se true (default con parent), valuta richiesta firma dipendente dopo publish HITL. */
    triggerSignatureWorkflow?: boolean;
  }): Promise<EmployeeDocument> {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const storagePath = input.bodyBase64 ? `inline:${id}` : undefined;
    let parentDoc: EmployeeDocument | undefined;
    if (input.parentDocumentId) {
      const parentRow = await this.getEmployeeDocumentRowById(input.parentDocumentId);
      if (!parentRow) {
        throw new NotFoundException("Documento origine non trovato");
      }
      if (parentRow.userId !== input.userId) {
        throw new BadRequestException("parentDocumentId non appartiene al titolare del documento");
      }
      const { bodyBase64: _pb, ...parentPub } = parentRow;
      parentDoc = parentPub;
    }
    const row: EmployeeDocumentRow = {
      id,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      mimeType: input.mimeType,
      storagePath,
      createdAt,
      uploadedBy: input.uploadedBy,
      parentDocumentId: input.parentDocumentId,
      bodyBase64: input.bodyBase64
    };
    if (this.useDb) {
      const insertPayload: Record<string, unknown> = {
        id: row.id,
        userId: row.userId,
        kind: row.kind,
        title: row.title,
        mimeType: row.mimeType ?? null,
        bodyBase64: row.bodyBase64 ?? null,
        storagePath: row.storagePath ?? null,
        createdAt: row.createdAt,
        uploadedBy: row.uploadedBy ?? null
      };
      if (input.parentDocumentId) {
        insertPayload.parentDocumentId = input.parentDocumentId;
      }
      const { error } = await this.supabase!.from("employee_documents").insert(insertPayload);
      if (error) {
        if (input.parentDocumentId && /parentDocumentId|column/i.test(error.message)) {
          delete insertPayload.parentDocumentId;
          const retry = await this.supabase!.from("employee_documents").insert(insertPayload);
          if (retry.error) {
            throw new InternalServerErrorException(`Upload documento fallito: ${retry.error.message}`);
          }
        } else {
          throw new InternalServerErrorException(`Upload documento fallito: ${error.message}`);
        }
      }
    } else {
      this.employeeDocuments.unshift(row);
    }
    const { bodyBase64: _b, ...pub } = row;
    const triggerWorkflow = input.triggerSignatureWorkflow !== false && Boolean(input.parentDocumentId);
    if (triggerWorkflow && parentDoc) {
      await this.maybeCreateVaultSignatureRequestAfterPublish({
        requesterUserId: input.uploadedBy,
        newDocument: pub,
        parentDocument: parentDoc
      });
    }
    return pub;
  }

  private async getEmployeeDocumentRowById(docId: string): Promise<EmployeeDocumentRow | undefined> {
    if (!this.useDb) {
      return this.employeeDocuments.find((d) => d.id === docId);
    }
    const { data } = await this.supabase!.from("employee_documents").select("*").eq("id", docId).maybeSingle();
    return data ? this.mapDocumentRow(data as Record<string, unknown>) : undefined;
  }

  async maybeCreateVaultSignatureRequestAfterPublish(input: {
    requesterUserId: string;
    newDocument: EmployeeDocument;
    parentDocument: EmployeeDocument;
  }): Promise<HrDocumentSignatureRequest | null> {
    const documentsById = this.useDb
      ? await this.loadEmployeeDocumentsByIdMapForUser(input.newDocument.userId)
      : this.employeeDocumentsByIdMap();
    documentsById.set(input.newDocument.id, input.newDocument);
    if (!documentsById.has(input.parentDocument.id)) {
      documentsById.set(input.parentDocument.id, input.parentDocument);
    }
    if (
      !shouldCreateVaultSignatureRequest({
        newDocumentKind: input.newDocument.kind,
        parentDocument: input.parentDocument,
        documentsById
      })
    ) {
      return null;
    }
    const originSignedDocumentId =
      findSignedAncestorId(input.parentDocument.id, documentsById) ??
      (isVaultDocumentSigned(input.parentDocument) ? input.parentDocument.id : undefined);
    const existing = await this.findSignatureRequestByDocumentId(input.newDocument.id);
    if (existing) return existing;

    const createdAt = new Date().toISOString();
    const req: HrDocumentSignatureRequest = {
      id: `dsr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      documentId: input.newDocument.id,
      parentDocumentId: input.parentDocument.id,
      originSignedDocumentId,
      employeeUserId: input.newDocument.userId,
      requesterUserId: input.requesterUserId,
      status: "pending_employee_sign",
      createdAt,
      documentTitle: input.newDocument.title,
      documentKind: input.newDocument.kind
    };
    await this.insertSignatureRequestRow(req);
    await this.notifyUserInApp({
      userId: input.newDocument.userId,
      title: "Documento da firmare",
      body: `HR ha aggiornato «${input.newDocument.title}»: apri il vault e applica la firma digitale.`,
      kind: "document_signature_pending",
      actionPath: `/percorso/documenti?sign=${encodeURIComponent(input.newDocument.id)}`
    });
    await this.maybeNotifyDocumentSignatureEmail(
      input.newDocument.userId,
      "Documento da firmare",
      req.documentTitle ?? input.newDocument.title
    );
    return req;
  }

  async listVaultSignatureRequestsForEmployee(
    employeeUserId: string,
    status?: HrDocumentSignatureRequestStatus
  ): Promise<HrDocumentSignatureRequest[]> {
    return this.listVaultSignatureRequests({ employeeUserId, status });
  }

  async listVaultSignatureRequestsForRequester(
    requesterUserId: string,
    status?: HrDocumentSignatureRequestStatus
  ): Promise<HrDocumentSignatureRequest[]> {
    return this.listVaultSignatureRequests({ requesterUserId, status });
  }

  private async listVaultSignatureRequests(filter: {
    employeeUserId?: string;
    requesterUserId?: string;
    status?: HrDocumentSignatureRequestStatus;
  }): Promise<HrDocumentSignatureRequest[]> {
    const cap = 100;
    if (await this.signatureRequestsDbAvailable()) {
      let q = this.supabase!.from("hr_document_signature_requests").select("*");
      if (filter.employeeUserId) q = q.eq("employeeUserId", filter.employeeUserId);
      if (filter.requesterUserId) q = q.eq("requesterUserId", filter.requesterUserId);
      if (filter.status) q = q.eq("status", filter.status);
      const { data, error } = await q.order("createdAt", { ascending: false }).limit(cap);
      if (error) throw new BadRequestException(`Lettura richieste firma fallita: ${error.message}`);
      const mapped = (data ?? []).map((r) => this.mapSignatureRequestRow(r as Record<string, unknown>));
      return this.enrichSignatureRequestsWithDocumentMeta(mapped);
    }
    let rows = [...this.documentSignatureRequestsMem];
    if (filter.employeeUserId) {
      rows = rows.filter((r) => r.employeeUserId === filter.employeeUserId);
    }
    if (filter.requesterUserId) {
      rows = rows.filter((r) => r.requesterUserId === filter.requesterUserId);
    }
    if (filter.status) {
      rows = rows.filter((r) => r.status === filter.status);
    }
    return this.enrichSignatureRequestsWithDocumentMeta(rows.slice(0, cap));
  }

  private async enrichSignatureRequestsWithDocumentMeta(
    rows: HrDocumentSignatureRequest[]
  ): Promise<HrDocumentSignatureRequest[]> {
    const out: HrDocumentSignatureRequest[] = [];
    for (const r of rows) {
      if (r.documentTitle) {
        out.push(r);
        continue;
      }
      const doc = await this.getEmployeeDocumentRowById(r.documentId);
      if (!doc) {
        out.push(r);
        continue;
      }
      out.push({
        ...r,
        documentTitle: doc.title,
        documentKind: doc.kind
      });
    }
    return out;
  }

  async signVaultDocument(input: {
    documentId: string;
    actorUserId: string;
    employeeSignerName: string;
  }): Promise<{ document: EmployeeDocument; request: HrDocumentSignatureRequest }> {
    const req = await this.findSignatureRequestByDocumentId(input.documentId);
    if (!req) {
      throw new NotFoundException("Richiesta firma non trovata per questo documento");
    }
    if (req.employeeUserId !== input.actorUserId) {
      throw new ForbiddenException("Solo il dipendente titolare può firmare");
    }
    if (req.status !== "pending_employee_sign") {
      throw new BadRequestException("Richiesta firma non in attesa");
    }
    const signedAt = new Date().toISOString();
    const signatureMetadata = {
      employeeSignerName: input.employeeSignerName.trim(),
      signedAt,
      method: "digital_ack"
    };
    let row: EmployeeDocumentRow | undefined;
    if (!this.useDb) {
      row = this.employeeDocuments.find((d) => d.id === input.documentId);
    } else {
      const { data, error } = await this.supabase!
        .from("employee_documents")
        .update({
          signedAt,
          signedByUserId: input.actorUserId,
          signatureMetadata
        })
        .eq("id", input.documentId)
        .select("*")
        .maybeSingle();
      if (error && /signedAt|signatureMetadata|column/i.test(error.message)) {
        throw new BadRequestException(
          "Firma vault non disponibile: applicare migration 080 su Supabase"
        );
      }
      if (error) throw new InternalServerErrorException(`Aggiornamento documento fallito: ${error.message}`);
      row = data ? this.mapDocumentRow(data as Record<string, unknown>) : undefined;
    }
    if (!this.useDb && row) {
      row.signedAt = signedAt;
      row.signedByUserId = input.actorUserId;
      row.signatureMetadata = signatureMetadata;
    }
    if (!row) throw new NotFoundException("Documento non trovato");
    const returnedAt = new Date().toISOString();
    await this.updateSignatureRequestRow(req.id, {
      status: "signed",
      signedAt,
      signatureMetadata
    });
    const updatedReq = await this.updateSignatureRequestRow(req.id, {
      status: "returned",
      returnedAt,
      signatureMetadata
    });
    if (!updatedReq) throw new NotFoundException("Richiesta firma non trovata");
    await this.notifyUserInApp({
      userId: req.requesterUserId,
      title: "Documento firmato dal dipendente",
      body: `«${row.title}» è stato firmato ed è disponibile per la restituzione HR.`,
      kind: "document_signature_returned",
      actionPath: "/hr/cowork?panel=documents"
    });
    const { bodyBase64: _b, ...pub } = row;
    return { document: pub, request: { ...updatedReq, documentTitle: row.title, documentKind: row.kind } };
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

  /** Promemoria in-app lettura documento vault (HR → dipendente titolare). */
  async sendEmployeeDocumentVaultReminder(
    requesterId: string,
    requesterRole: User["role"],
    documentId: string
  ): Promise<{ ok: true }> {
    let row: EmployeeDocumentRow | undefined;
    if (!this.useDb) {
      row = this.employeeDocuments.find((d) => d.id === documentId);
    } else {
      const { data } = await this.supabase!.from("employee_documents").select("*").eq("id", documentId).maybeSingle();
      row = data ? this.mapDocumentRow(data as Record<string, unknown>) : undefined;
    }
    if (!row) {
      throw new NotFoundException("Documento non trovato");
    }
    if (
      row.userId !== requesterId &&
      requesterRole !== "superuser" &&
      !(await this.isManagerOf(requesterId, row.userId)) &&
      !(await this.isUserLeadOfTeamContaining(requesterId, row.userId))
    ) {
      throw new BadRequestException("Accesso negato");
    }
    await this.notifyUserInApp({
      userId: row.userId,
      title: "Documento da leggere",
      body: `Consulta e conferma la lettura di «${row.title}» nel vault documenti.`,
      kind: "document_ack_reminder",
      actionPath: "/percorso/documenti"
    });
    return { ok: true };
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
    actorRole?: AuthRole,
    endDay?: string
  ): Promise<SmartworkingRequestRow> {
    const user = await this.getUser(userId);
    const { start: dayNorm, end: endNorm } = this.normalizeSmartworkingRange(day, endDay);
    const rangeDays = this.enumerateCalendarDaysInclusive(dayNorm, endNorm);
    for (const d of rangeDays) {
      if (await this.hasActiveSmartworkingRequestForDay(userId, d)) {
        throw new BadRequestException(`Remote working già richiesto per il ${d}`);
      }
    }
    const skipSwQuota = actorRole === "superuser";
    if (!skipSwQuota) {
      const monthPrefix = dayNorm.slice(0, 7);
      const quotas = await this.resolveSmartworkingQuotas(userId, monthPrefix);
      const monthBooked = await this.countNonRejectedSmartworkingDaysInMonth(userId, monthPrefix);
      if (monthBooked + rangeDays.length > quotas.monthly) {
        throw new BadRequestException(
          `Quota mensile remote working esaurita (max ${quotas.monthly} giorni da contratto, richieste in attesa incluso)`
        );
      }
      const weekIds = new Set<string>();
      for (const d of rangeDays) {
        weekIds.add(this.mondayOfWeekUtcContaining(d));
      }
      for (const mon of weekIds) {
        const weekBooked = await this.countSmartworkingBookedDaysInWeek(userId, mon);
        const addInWeek = rangeDays.filter((d) => this.mondayOfWeekUtcContaining(d) === mon).length;
        if (weekBooked + addInWeek > quotas.weekly) {
          throw new BadRequestException(
            `Quota settimanale remote working esaurita (max ${quotas.weekly} giorni da contratto, richieste in attesa incluso)`
          );
        }
      }
    }
    const id = `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const row: SmartworkingRequestRow = {
      id,
      userId,
      day: dayNorm,
      endDay: endNorm,
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
        endDay: row.endDay,
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
    const periodLabel = this.formatSmartworkingPeriodLabel(dayNorm, endNorm);
    const daysLabel = rangeDays.length > 1 ? ` · ${rangeDays.length} giorni` : "";
    await this.notifyApproversOfRequest(
      user,
      "Richiesta remote working",
      `${user.fullName}: ${periodLabel}${daysLabel}${note?.trim() ? ` — ${note.trim()}` : ""}`,
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
    actorRole: AuthRole,
    endDay?: string
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
        throw new BadRequestException("Il remote working approvato non può essere modificato dal dipendente");
      }
    } else if (row.status !== "pending") {
      throw new BadRequestException("Solo le richieste in attesa possono essere modificate");
    }
    const { start: nextDay, end: nextEnd } = this.normalizeSmartworkingRange(day, endDay ?? row.endDay ?? row.day);
    const nextNote = note?.trim() || null;
    const prevDay = row.day.slice(0, 10);
    const prevEnd = this.smartworkingRequestEndDay(row);
    const prevNote = row.note?.trim() || null;
    if (nextDay === prevDay && nextEnd === prevEnd && nextNote === prevNote) {
      return row;
    }
    const subjectId = row.userId;
    const nextRangeDays = this.enumerateCalendarDaysInclusive(nextDay, nextEnd);
    for (const d of nextRangeDays) {
      if (await this.hasActiveSmartworkingRequestForDay(subjectId, d, requestId)) {
        throw new BadRequestException(`Remote working già richiesto per il ${d}`);
      }
    }
    if (
      (nextDay !== prevDay || nextEnd !== prevEnd) &&
      actorRole !== "superuser" &&
      !isApprovedSwCorrection
    ) {
      const monthPrefix = nextDay.slice(0, 7);
      const quotas = await this.resolveSmartworkingQuotas(subjectId, monthPrefix);
      const monthBooked = await this.countNonRejectedSmartworkingDaysInMonth(subjectId, monthPrefix, requestId);
      if (monthBooked + nextRangeDays.length > quotas.monthly) {
        throw new BadRequestException(
          `Quota mensile remote working esaurita per il mese selezionato (max ${quotas.monthly} giorni da contratto)`
        );
      }
      const weekIds = new Set(nextRangeDays.map((d) => this.mondayOfWeekUtcContaining(d)));
      for (const mon of weekIds) {
        const weekBooked = await this.countSmartworkingBookedDaysInWeek(subjectId, mon, requestId);
        const addInWeek = nextRangeDays.filter((d) => this.mondayOfWeekUtcContaining(d) === mon).length;
        if (weekBooked + addInWeek > quotas.weekly) {
          throw new BadRequestException(
            `Quota settimanale remote working esaurita (max ${quotas.weekly} giorni da contratto)`
          );
        }
      }
    }
    if (this.useDb) {
      const { error } = await this.supabase!
        .from("smartworking_requests")
        .update({ day: nextDay, endDay: nextEnd, note: nextNote })
        .eq("id", requestId);
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento SW fallito: ${error.message}`);
      }
    } else {
      row.day = nextDay;
      row.endDay = nextEnd;
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
      const periodLabel = this.formatSmartworkingPeriodLabel(nextDay, nextEnd);
      const daysLabel =
        nextRangeDays.length > 1 ? ` · ${nextRangeDays.length} giorni` : "";
      await this.notifyApproversOfRequest(
        user,
        "Richiesta remote working",
        `${user.fullName}: ${periodLabel}${daysLabel}${nextNote ? ` — ${nextNote}` : ""}`,
        "smartworking_request",
        linkApprovalId
          ? `/workflow/approvals?approvalId=${encodeURIComponent(linkApprovalId)}`
          : "/workflow/approvals"
      );
    }
    return { ...row, day: nextDay, endDay: nextEnd, note: nextNote };
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
          "Solo il remote working con data futura può essere rimosso (richiesta già approvata)"
        );
      }
      if (requesterId !== row.userId && actorRole !== "superuser") {
        throw new ForbiddenException(
          "Solo il dipendente interessato può annullare un remote working approvato futuro"
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
    const periodLabel = this.formatSmartworkingPeriodLabel(row.day, this.smartworkingRequestEndDay(row));
    await this.insertUserNotification({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: row.userId,
      title: approve ? "Remote working approvato" : "Remote working rifiutato",
      body: `${periodLabel}${!approve && reason ? ` — ${reason}` : ""}`,
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
    const quotas = await this.resolveSmartworkingQuotas(userId, m);
    return { used, quota: quotas.monthly };
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

  private smartworkingRequestEndDay(row: SmartworkingRequestRow): string {
    const end = row.endDay?.trim();
    if (end && end.length >= 10) {
      return end.slice(0, 10);
    }
    return row.day.slice(0, 10);
  }

  private normalizeSmartworkingRange(
    day: string,
    endDay?: string | null
  ): { start: string; end: string } {
    const start = day.slice(0, 10);
    const endRaw = (endDay?.trim() || start).slice(0, 10);
    if (endRaw < start) {
      throw new BadRequestException("La data fine non può essere precedente alla data inizio");
    }
    const days = this.countCalendarDays(start, endRaw);
    if (days > SMARTWORKING_MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Il periodo remote working non può superare ${SMARTWORKING_MAX_RANGE_DAYS} giorni`
      );
    }
    return { start, end: endRaw };
  }

  private enumerateCalendarDaysInclusive(start: string, end: string): string[] {
    const out: string[] = [];
    let cur = start.slice(0, 10);
    const endNorm = end.slice(0, 10);
    while (cur <= endNorm) {
      out.push(cur);
      if (cur === endNorm) break;
      cur = this.addCalendarDaysUtcIso(cur, 1);
    }
    return out;
  }

  private smartworkingRequestCoversDay(row: SmartworkingRequestRow, dayIso: string): boolean {
    const d = dayIso.slice(0, 10);
    const start = row.day.slice(0, 10);
    const end = this.smartworkingRequestEndDay(row);
    return d >= start && d <= end;
  }

  private formatSmartworkingPeriodLabel(start: string, end: string): string {
    const s = start.slice(0, 10);
    const e = end.slice(0, 10);
    if (e === s) return s;
    return `${s} → ${e}`;
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
    const booked = new Set<string>();
    for (const r of list) {
      if (excludeRequestId && r.id === excludeRequestId) continue;
      if (r.status === "rejected") continue;
      for (const d of this.enumerateCalendarDaysInclusive(r.day, this.smartworkingRequestEndDay(r))) {
        if (d >= mon && d <= sun) booked.add(d);
      }
    }
    return booked.size;
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
        r.status !== "rejected" &&
        this.smartworkingRequestCoversDay(r, d) &&
        (excludeRequestId === undefined || r.id !== excludeRequestId)
    );
  }

  private async countApprovedSmartworkingDaysInMonth(userId: string, monthPrefix: string): Promise<number> {
    const list = await this.listMySmartworking(userId);
    const days = new Set<string>();
    for (const r of list) {
      if (r.status !== "approved") continue;
      for (const d of this.enumerateCalendarDaysInclusive(r.day, this.smartworkingRequestEndDay(r))) {
        if (d.startsWith(monthPrefix)) days.add(d);
      }
    }
    return days.size;
  }

  private async countNonRejectedSmartworkingDaysInMonth(
    userId: string,
    monthPrefix: string,
    excludeRequestId?: string
  ): Promise<number> {
    const list = await this.listMySmartworking(userId);
    const days = new Set<string>();
    for (const r of list) {
      if (excludeRequestId && r.id === excludeRequestId) continue;
      if (r.status === "rejected") continue;
      for (const d of this.enumerateCalendarDaysInclusive(r.day, this.smartworkingRequestEndDay(r))) {
        if (d.startsWith(monthPrefix)) days.add(d);
      }
    }
    return days.size;
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
    if (workdayMode === "smartworking" && !statusLabels.some((x) => x.toLowerCase().includes("remote"))) {
      statusLabels.push("Modalità presenze: remote working");
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

  private tenureMonthsFromHire(hireDate?: string | null): number | null {
    const raw = hireDate?.trim();
    if (!raw) {
      return null;
    }
    const h = new Date(`${raw.slice(0, 10)}T12:00:00.000Z`);
    if (Number.isNaN(h.getTime())) {
      return null;
    }
    const now = new Date();
    let months =
      (now.getUTCFullYear() - h.getUTCFullYear()) * 12 + (now.getUTCMonth() - h.getUTCMonth());
    if (now.getUTCDate() < h.getUTCDate()) {
      months -= 1;
    }
    return Math.max(0, months);
  }

  private computeTurnoverRuleV1Snapshot(
    user: User,
    leaveResidualDays: number
  ): { score: number; confidence: number; reasons: string[]; signals: Record<string, number> } {
    const signals: Record<string, number> = {};
    const reasons: string[] = [];
    let score = 22;
    let parts = 0;

    const tenureM = this.tenureMonthsFromHire(user.hireDate);
    if (tenureM == null) {
      score += 8;
      reasons.push("Data di assunzione assente o non valida (segnale debole)");
      signals.tenureMonths = -1;
    } else {
      signals.tenureMonths = tenureM;
      parts += 1;
      if (tenureM < 6) {
        score += 18;
        reasons.push("Tenure nei primi 6 mesi (maggiore incertezza retention)");
      } else if (tenureM < 24) {
        score += 10;
        reasons.push("Tenure sotto i 24 mesi");
      } else if (tenureM >= 120) {
        score -= 12;
        reasons.push("Tenure elevata (proxy retention positiva)");
      }
    }

    const contractH = user.weeklyContractHours ?? 40;
    signals.weeklyContractHours = contractH;
    parts += 1;
    if (contractH >= 42) {
      score += 14;
      reasons.push("Contratto a ore elevate");
    }

    signals.leaveResidualDays = leaveResidualDays;
    parts += 1;
    if (leaveResidualDays < 3) {
      score += 16;
      reasons.push("Saldo ferie residuo molto basso");
    } else if (leaveResidualDays < 8) {
      score += 8;
      reasons.push("Saldo ferie contenuto");
    }

    const allowance = user.vacationAllowanceDays ?? 22;
    signals.vacationAllowanceDays = allowance;
    parts += 1;
    if (allowance < 20) {
      score += 6;
      reasons.push("Ferie contrattuali contenute");
    }

    if (reasons.length === 0) {
      reasons.push("Profilo nella media (nessun segnale marcato)");
    }

    const confidence = Math.min(0.92, 0.42 + parts * 0.12);
    return { score: Math.max(0, Math.min(100, Math.round(score))), confidence, reasons, signals };
  }

  async refreshTurnoverSignalsForCompany(
    companyId: string
  ): Promise<{ inserted: number; runId: string; computedAt: string }> {
    const runId = randomUUID();
    const computedAt = new Date().toISOString();
    const users = (await this.listUsers()).filter(
      (u) => u.companyId === companyId && u.role !== "superuser"
    );
    const y = new Date().getFullYear();
    const rowsPayload: Array<{
      company_id: string;
      user_id: string;
      run_id: string;
      score: number;
      confidence: number;
      reasons: string[];
      signals: Record<string, number>;
      model_version: string;
      computed_at: string;
    }> = [];

    for (const u of users) {
      const bal = await this.getLeaveBalance(u.id, y);
      const snap = this.computeTurnoverRuleV1Snapshot(u, bal.residualDays);
      rowsPayload.push({
        company_id: companyId,
        user_id: u.id,
        run_id: runId,
        score: snap.score,
        confidence: snap.confidence,
        reasons: snap.reasons,
        signals: snap.signals,
        model_version: "rule-v1",
        computed_at: computedAt
      });
    }

    if (!this.useDb) {
      const prev = this.turnoverSignalRunsMem.get(companyId) ?? [];
      this.turnoverSignalRunsMem.set(companyId, [
        {
          runId,
          computedAt,
          rows: rowsPayload.map((r) => ({
            userId: r.user_id,
            score: r.score,
            confidence: r.confidence,
            reasons: r.reasons as string[],
            signals: r.signals,
            modelVersion: r.model_version
          }))
        },
        ...prev
      ].slice(0, 24));
      return { inserted: rowsPayload.length, runId, computedAt };
    }

    if (rowsPayload.length === 0) {
      return { inserted: 0, runId, computedAt };
    }

    const chunk = 80;
    for (let i = 0; i < rowsPayload.length; i += chunk) {
      const slice = rowsPayload.slice(i, i + chunk);
      const { error } = await this.supabase!.from("hr_turnover_signals").insert(slice);
      if (error) {
        throw new InternalServerErrorException(`Salvataggio turnover fallito: ${error.message}`);
      }
    }
    return { inserted: rowsPayload.length, runId, computedAt };
  }

  async listCostCenterIdsForCompany(companyId: string): Promise<string[]> {
    const users = (await this.listUsers()).filter(
      (u) => u.companyId === companyId && u.role !== "superuser"
    );
    const s = new Set<string>();
    for (const u of users) {
      const c = u.costCenterId?.trim();
      if (c) {
        s.add(c);
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, "it"));
  }

  /**
   * Centri di costo presenti in anagrafica dipendenti, con etichetta leggibile da tabella `cost_centers`
   * (nome + codice). Gli ID restano quelli usati nei filtri API.
   */
  async listCostCentersForTurnoverFilter(companyId: string): Promise<Array<{ id: string; label: string }>> {
    const ids = await this.listCostCenterIdsForCompany(companyId);
    const centers = await this.listCostCenters();
    const byId = new Map(
      centers
        .filter((c) => !c.companyId || c.companyId === companyId)
        .map((c) => [c.id, c] as const)
    );
    return ids
      .map((id) => {
        const c = byId.get(id);
        const label = c ? `${c.name} (${c.code})` : id;
        return { id, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
  }

  async getLatestTurnoverRetention(
    companyId: string,
    costCenterId?: string | null
  ): Promise<
    Array<{
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
    }>
  > {
    const users = await this.listUsers();
    const byId = new Map(users.map((u) => [u.id, u]));

    if (!this.useDb) {
      const runs = this.turnoverSignalRunsMem.get(companyId) ?? [];
      const last = runs[0];
      if (!last) {
        return [];
      }
      const cc = costCenterId?.trim();
      return last.rows
        .map((r) => {
          const u = byId.get(r.userId);
          return {
            userId: r.userId,
            fullName: u?.fullName ?? r.userId,
            costCenterId: u?.costCenterId ?? null,
            score: r.score,
            confidence: r.confidence,
            reasons: r.reasons,
            signals: r.signals,
            modelVersion: r.modelVersion,
            runId: last.runId,
            computedAt: last.computedAt
          };
        })
        .filter((row) => !cc || (row.costCenterId?.trim() ?? "") === cc)
        .sort((a, b) => b.score - a.score);
    }

    const { data: tip, error: e1 } = await this.supabase!
      .from("hr_turnover_signals")
      .select("run_id,computed_at")
      .eq("company_id", companyId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) {
      throw new BadRequestException(`Lettura turnover fallita: ${e1.message}`);
    }
    if (!tip?.run_id) {
      return [];
    }
    const { data: raw, error: e2 } = await this.supabase!
      .from("hr_turnover_signals")
      .select("*")
      .eq("company_id", companyId)
      .eq("run_id", tip.run_id);
    if (e2) {
      throw new BadRequestException(`Lettura turnover fallita: ${e2.message}`);
    }
    const cc = costCenterId?.trim();
    const list = (raw ?? []) as Array<{
      user_id: string;
      score: number;
      confidence: number;
      reasons: unknown;
      signals: unknown;
      model_version: string;
      run_id: string;
      computed_at: string;
    }>;
    return list
      .map((r) => {
        const u = byId.get(r.user_id);
        return {
          userId: r.user_id,
          fullName: u?.fullName ?? r.user_id,
          costCenterId: u?.costCenterId ?? null,
          score: Number(r.score),
          confidence: Number(r.confidence),
          reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
          signals: (r.signals && typeof r.signals === "object" ? r.signals : {}) as Record<string, number>,
          modelVersion: String(r.model_version ?? "rule-v1"),
          runId: r.run_id,
          computedAt: r.computed_at
        };
      })
      .filter((row) => !cc || (row.costCenterId?.trim() ?? "") === cc)
      .sort((a, b) => b.score - a.score);
  }

  async getTurnoverRetentionTrend(
    companyId: string,
    weeks = 8
  ): Promise<Array<{ weekStart: string; avgScore: number; sampleSize: number }>> {
    const w = Math.min(52, Math.max(2, Math.floor(weeks)));
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - w * 7);
    const fromIso = from.toISOString();

    type Agg = { sum: number; n: number };
    const bucket = new Map<string, Agg>();

    const addRow = (computedAt: string, score: number): void => {
      const d = new Date(computedAt);
      const day = d.getUTCDay();
      const diff = (day + 6) % 7;
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - diff);
      const key = monday.toISOString().slice(0, 10);
      const cur = bucket.get(key) ?? { sum: 0, n: 0 };
      cur.sum += score;
      cur.n += 1;
      bucket.set(key, cur);
    };

    if (!this.useDb) {
      const runs = this.turnoverSignalRunsMem.get(companyId) ?? [];
      for (const run of runs) {
        for (const r of run.rows) {
          addRow(run.computedAt, r.score);
        }
      }
    } else {
      const { data, error } = await this.supabase!
        .from("hr_turnover_signals")
        .select("computed_at,score")
        .eq("company_id", companyId)
        .gte("computed_at", fromIso)
        .order("computed_at", { ascending: true });
      if (error) {
        throw new BadRequestException(`Trend turnover fallito: ${error.message}`);
      }
      for (const row of data ?? []) {
        addRow(String((row as { computed_at: string }).computed_at), Number((row as { score: number }).score));
      }
    }

    return [...bucket.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, v]) => ({
        weekStart,
        avgScore: v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0,
        sampleSize: v.n
      }));
  }

  async getManagerCopilotDashboard(
    actorUserId: string,
    opts: { includeTurnover: boolean; includeEconomicData: boolean }
  ): Promise<{
    pendingTotal: number;
    pendingByType: Partial<Record<"leave" | "sickness" | "smartworking" | "travel", number>>;
    teamHeadcount: number;
    teamSmartworkingPending: number;
    teamTurnoverAvgScore: number | null;
    includeEconomicData: boolean;
    directReports: Array<{
      id: string;
      fullName: string;
      email: string;
      contractType: string | null;
      hireDate: string | null;
      employmentState: string | null;
      costCenterId: string | null;
      teamId: string | null;
      pendingApprovalsCount: number;
      turnoverScore: number | null;
      ralAnnualEur: number | null;
      bonusMonthlyEur: number | null;
    }>;
    topPendingPreview: Array<{ type: string; requesterName?: string; at: string }>;
    routes: {
      approvals: string;
      smartworking: string;
      insights: string;
      workforcePlanning: string;
    };
  }> {
    const actor = await this.getUser(actorUserId);
    const team = await this.listUsersByManager(actorUserId);
    const teamIds = new Set(team.map((u) => u.id));

    const pending = await this.listApprovalsForUser(actorUserId, "pending");
    const pendingByType: Partial<Record<"leave" | "sickness" | "smartworking" | "travel", number>> = {};
    const pendingByRequester = new Map<string, number>();
    let teamSw = 0;
    for (const p of pending) {
      pendingByType[p.type] = (pendingByType[p.type] ?? 0) + 1;
      if (p.requestedBy) {
        pendingByRequester.set(p.requestedBy, (pendingByRequester.get(p.requestedBy) ?? 0) + 1);
      }
      if (p.type === "smartworking" && teamIds.has(p.requestedBy)) {
        teamSw += 1;
      }
    }

    let teamTurnoverAvg: number | null = null;
    const turnoverByUser = new Map<string, number>();
    const companyId = (actor.companyId || "").trim();
    if (opts.includeTurnover && companyId && teamIds.size > 0) {
      const latest = await this.getLatestTurnoverRetention(companyId);
      const scores = latest.filter((r) => teamIds.has(r.userId)).map((r) => r.score);
      for (const row of latest) {
        if (teamIds.has(row.userId)) {
          turnoverByUser.set(row.userId, row.score);
        }
      }
      if (scores.length > 0) {
        teamTurnoverAvg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      }
    }

    const topPendingPreview = pending.slice(0, 10).map((p) => ({
      type: p.type,
      requesterName: p.requesterName,
      at: p.at
    }));

    const directReports = team.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      contractType: u.contractType?.trim() || null,
      hireDate: u.hireDate?.trim() || null,
      employmentState: u.employmentState ?? "active",
      costCenterId: u.costCenterId?.trim() || null,
      teamId: u.teamId?.trim() || null,
      pendingApprovalsCount: pendingByRequester.get(u.id) ?? 0,
      turnoverScore: turnoverByUser.get(u.id) ?? null,
      ralAnnualEur:
        opts.includeEconomicData && u.annualGrossSalary != null && Number.isFinite(u.annualGrossSalary)
          ? Math.round(u.annualGrossSalary)
          : null,
      bonusMonthlyEur:
        opts.includeEconomicData && u.fixedSupplementMonthly != null && Number.isFinite(u.fixedSupplementMonthly)
          ? Math.round(u.fixedSupplementMonthly * 100) / 100
          : null
    }));

    return {
      pendingTotal: pending.length,
      pendingByType,
      teamHeadcount: team.length,
      teamSmartworkingPending: teamSw,
      teamTurnoverAvgScore: teamTurnoverAvg,
      includeEconomicData: opts.includeEconomicData,
      directReports,
      topPendingPreview,
      routes: {
        approvals: "/workflow/approvals",
        smartworking: "/smartworking",
        insights: "/analytics/advanced/retention",
        workforcePlanning: "/workforce-planning"
      }
    };
  }

  async listWorkforcePlanningScenarios(companyId: string): Promise<WorkforcePlanningScenarioRow[]> {
    const cid = companyId.trim();
    if (!cid) {
      return [];
    }
    if (!this.useDb) {
      return [];
    }
    const { data, error } = await this.supabase!
      .from("workforce_planning_scenarios")
      .select("id, name, assumptions_json, payload_json, analysis_text, created_at, updated_at")
      .eq("company_id", cid)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) {
      throw new BadRequestException(`Lettura scenari workforce: ${error.message}`);
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      assumptionsJson: (r.assumptions_json as Record<string, unknown>) ?? {},
      payloadJson: (r.payload_json as Record<string, unknown>) ?? {},
      analysisText: r.analysis_text != null ? String(r.analysis_text) : null,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? "")
    }));
  }

  async saveWorkforcePlanningScenario(
    companyId: string,
    actorUserId: string,
    input: {
      id?: string;
      name: string;
      assumptionsJson?: Record<string, unknown>;
      payloadJson: Record<string, unknown>;
      analysisText?: string | null;
    }
  ): Promise<{ id: string }> {
    const cid = companyId.trim();
    const name = input.name.trim().slice(0, 120);
    if (!cid || !name) {
      throw new BadRequestException("Nome scenario obbligatorio.");
    }
    if (!this.useDb) {
      return { id: input.id?.trim() || `demo-ws-${Date.now()}` };
    }
    const row = {
      company_id: cid,
      name,
      assumptions_json: input.assumptionsJson ?? {},
      payload_json: input.payloadJson ?? {},
      analysis_text: input.analysisText?.trim() || null,
      created_by_user_id: actorUserId,
      updated_at: new Date().toISOString()
    };
    const id = input.id?.trim();
    if (id) {
      const { error } = await this.supabase!
        .from("workforce_planning_scenarios")
        .update(row)
        .eq("id", id)
        .eq("company_id", cid);
      if (error) {
        throw new BadRequestException(`Aggiornamento scenario: ${error.message}`);
      }
      return { id };
    }
    const { data, error } = await this.supabase!
      .from("workforce_planning_scenarios")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      throw new BadRequestException(`Salvataggio scenario: ${error.message}`);
    }
    return { id: String((data as { id: string }).id) };
  }

  async deleteWorkforcePlanningScenario(companyId: string, scenarioId: string): Promise<void> {
    const cid = companyId.trim();
    const sid = scenarioId.trim();
    if (!cid || !sid) {
      throw new BadRequestException("Scenario non valido.");
    }
    if (!this.useDb) {
      return;
    }
    const { error } = await this.supabase!
      .from("workforce_planning_scenarios")
      .delete()
      .eq("id", sid)
      .eq("company_id", cid);
    if (error) {
      throw new BadRequestException(`Eliminazione scenario: ${error.message}`);
    }
  }

  async listHiringSimulationScenarios(
    companyId: string
  ): Promise<
    Array<{ id: string; name: string; payloadJson: Record<string, unknown>; createdAt: string; updatedAt: string }>
  > {
    const cid = companyId.trim();
    if (!cid) {
      return [];
    }
    if (!this.useDb) {
      return [];
    }
    const { data, error } = await this.supabase!
      .from("hiring_simulation_scenarios")
      .select("id, name, payload_json, created_at, updated_at")
      .eq("company_id", cid)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) {
      throw new BadRequestException(`Lettura scenari assunzione: ${error.message}`);
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      payloadJson: (r.payload_json as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? "")
    }));
  }

  async saveHiringSimulationScenario(
    companyId: string,
    actorUserId: string,
    input: { id?: string; name: string; payloadJson: Record<string, unknown> }
  ): Promise<{ id: string }> {
    const cid = companyId.trim();
    const name = input.name.trim().slice(0, 120);
    if (!cid || !name) {
      throw new BadRequestException("Nome scenario obbligatorio.");
    }
    if (!this.useDb) {
      return { id: input.id?.trim() || `demo-hiring-${Date.now()}` };
    }
    const row = {
      company_id: cid,
      name,
      payload_json: input.payloadJson ?? {},
      created_by_user_id: actorUserId,
      updated_at: new Date().toISOString()
    };
    const id = input.id?.trim();
    if (id) {
      const { error } = await this.supabase!
        .from("hiring_simulation_scenarios")
        .update(row)
        .eq("id", id)
        .eq("company_id", cid);
      if (error) {
        throw new BadRequestException(`Aggiornamento scenario assunzione: ${error.message}`);
      }
      return { id };
    }
    const { data, error } = await this.supabase!
      .from("hiring_simulation_scenarios")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      throw new BadRequestException(`Salvataggio scenario assunzione: ${error.message}`);
    }
    return { id: String((data as { id: string }).id) };
  }

  async deleteHiringSimulationScenario(companyId: string, scenarioId: string): Promise<void> {
    const cid = companyId.trim();
    const sid = scenarioId.trim();
    if (!cid || !sid) {
      throw new BadRequestException("Scenario non valido.");
    }
    if (!this.useDb) {
      return;
    }
    const { error } = await this.supabase!
      .from("hiring_simulation_scenarios")
      .delete()
      .eq("id", sid)
      .eq("company_id", cid);
    if (error) {
      throw new BadRequestException(`Eliminazione scenario assunzione: ${error.message}`);
    }
  }

  async listRoleCoverageGaps(companyId: string): Promise<HrRoleCoverageGapRow[]> {
    const cid = companyId.trim();
    if (!cid) {
      return [];
    }
    if (!this.useDb) {
      return [
        {
          id: "demo-gap-1",
          roleTitle: "Ruolo esempio (senza DB)",
          headcountGap: 2,
          expectedRalAnnual: 42000,
          notes: "Configura Supabase per persistenza.",
          updatedAt: new Date().toISOString()
        }
      ];
    }
    const { data, error } = await this.supabase!
      .from("hr_role_coverage_gaps")
      .select("id, role_title, headcount_gap, expected_ral_annual, notes, updated_at")
      .eq("company_id", cid)
      .order("role_title", { ascending: true });
    if (error) {
      throw new BadRequestException(`Lettura copertura ruoli: ${error.message}`);
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      roleTitle: String(r.role_title ?? ""),
      headcountGap: Math.max(0, Math.round(Number(r.headcount_gap) || 0)),
      expectedRalAnnual:
        r.expected_ral_annual != null && Number.isFinite(Number(r.expected_ral_annual))
          ? Math.round(Number(r.expected_ral_annual))
          : null,
      notes: r.notes != null ? String(r.notes) : null,
      updatedAt: String(r.updated_at ?? "")
    }));
  }

  async upsertRoleCoverageGap(
    companyId: string,
    actorUserId: string,
    input: {
      id?: string;
      roleTitle: string;
      headcountGap: number;
      expectedRalAnnual?: number | null;
      notes?: string | null;
    }
  ): Promise<{ id: string }> {
    const cid = companyId.trim();
    const roleTitle = input.roleTitle.trim().slice(0, 200);
    if (!cid || !roleTitle) {
      throw new BadRequestException("Titolo ruolo obbligatorio.");
    }
    const headcountGap = Math.max(0, Math.min(999, Math.round(Number(input.headcountGap) || 0)));
    const expectedRalAnnual =
      input.expectedRalAnnual != null && Number.isFinite(Number(input.expectedRalAnnual))
        ? Math.round(Number(input.expectedRalAnnual))
        : null;
    const notes = input.notes?.trim().slice(0, 2000) || null;
    if (!this.useDb) {
      return { id: input.id?.trim() || `demo-gap-${Date.now()}` };
    }
    const row = {
      company_id: cid,
      role_title: roleTitle,
      headcount_gap: headcountGap,
      expected_ral_annual: expectedRalAnnual,
      notes,
      updated_by_user_id: actorUserId,
      updated_at: new Date().toISOString()
    };
    if (input.id?.trim()) {
      const { error } = await this.supabase!
        .from("hr_role_coverage_gaps")
        .update(row)
        .eq("id", input.id.trim())
        .eq("company_id", cid);
      if (error) {
        throw new BadRequestException(`Aggiornamento gap ruolo: ${error.message}`);
      }
      return { id: input.id.trim() };
    }
    const { data, error } = await this.supabase!
      .from("hr_role_coverage_gaps")
      .upsert(row, { onConflict: "company_id,role_title" })
      .select("id")
      .single();
    if (error) {
      throw new BadRequestException(`Salvataggio gap ruolo: ${error.message}`);
    }
    return { id: String((data as { id: string }).id) };
  }

  async deleteRoleCoverageGap(companyId: string, gapId: string): Promise<void> {
    const cid = companyId.trim();
    const gid = gapId.trim();
    if (!cid || !gid) {
      throw new BadRequestException("Gap non valido.");
    }
    if (!this.useDb) {
      return;
    }
    const { error } = await this.supabase!
      .from("hr_role_coverage_gaps")
      .delete()
      .eq("id", gid)
      .eq("company_id", cid);
    if (error) {
      throw new BadRequestException(`Eliminazione gap ruolo: ${error.message}`);
    }
  }

  async getSkillsGapReport(
    companyId: string,
    roleIdFilter?: string | null
  ): Promise<
    Array<{
      roleId: string;
      roleName: string;
      skillId: string;
      skillCode: string;
      skillName: string;
      minLevel: number;
      avgUserLevel: number;
      gap: number;
      headcountInRole: number;
    }>
  > {
    if (!this.useDb) {
      return [
        {
          roleId: "r3",
          roleName: "Dipendente (demo)",
          skillId: "mem-skill",
          skillCode: "DEMO",
          skillName: "Dato competenze non persistito (modalità senza DB)",
          minLevel: 3,
          avgUserLevel: 1,
          gap: 2,
          headcountInRole: 1
        }
      ];
    }

    const sb = this.supabase!;
    let reqQuery = sb
      .from("hr_role_skill_requirements")
      .select("role_id, min_level, skill_id")
      .eq("company_id", companyId);
    if (roleIdFilter?.trim()) {
      reqQuery = reqQuery.eq("role_id", roleIdFilter.trim());
    }
    const { data: reqs, error: e1 } = await reqQuery;
    if (e1) {
      throw new BadRequestException(`Lettura fabbisogni competenze: ${e1.message}`);
    }
    const reqRows = (reqs ?? []) as Array<{ role_id: string; min_level: number; skill_id: string }>;
    if (reqRows.length === 0) {
      return [];
    }

    const skillIds = [...new Set(reqRows.map((r) => r.skill_id))];
    const { data: skills, error: e2 } = await sb.from("hr_skills").select("id, code, name").in("id", skillIds);
    if (e2) {
      throw new BadRequestException(`Lettura skills: ${e2.message}`);
    }
    const skillById = new Map((skills ?? []).map((s: { id: string; code: string; name: string }) => [s.id, s]));

    const { data: roleRows } = await sb.from("roles").select("id, name");
    const roleNameById = new Map((roleRows ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));

    const { data: usRows, error: e3 } = await sb
      .from("hr_user_skills")
      .select("user_id, skill_id, level")
      .eq("company_id", companyId);
    if (e3) {
      throw new BadRequestException(`Lettura user skills: ${e3.message}`);
    }
    const userSkillLevel = new Map<string, number>();
    for (const row of (usRows ?? []) as Array<{ user_id: string; skill_id: string; level: number }>) {
      userSkillLevel.set(`${row.user_id}|${row.skill_id}`, Number(row.level) || 0);
    }

    const users = (await this.listUsers()).filter(
      (u) => u.companyId === companyId && u.role !== "superuser"
    );

    const out: Array<{
      roleId: string;
      roleName: string;
      skillId: string;
      skillCode: string;
      skillName: string;
      minLevel: number;
      avgUserLevel: number;
      gap: number;
      headcountInRole: number;
    }> = [];

    for (const req of reqRows) {
      const sk = skillById.get(req.skill_id);
      if (!sk) {
        continue;
      }
      const inRole = users.filter((u) => (u.roleId ?? "").trim() === req.role_id);
      const headcount = inRole.length;
      let sum = 0;
      for (const u of inRole) {
        sum += userSkillLevel.get(`${u.id}|${req.skill_id}`) ?? 0;
      }
      const avgUserLevel = headcount > 0 ? Math.round((sum / headcount) * 10) / 10 : 0;
      const minLevel = Number(req.min_level) || 1;
      const gap = Math.max(0, Math.round((minLevel - avgUserLevel) * 10) / 10);
      out.push({
        roleId: req.role_id,
        roleName: roleNameById.get(req.role_id) ?? req.role_id,
        skillId: req.skill_id,
        skillCode: sk.code,
        skillName: sk.name,
        minLevel,
        avgUserLevel,
        gap,
        headcountInRole: headcount
      });
    }

    return out.sort((a, b) => b.gap - a.gap || a.roleName.localeCompare(b.roleName, "it"));
  }

  /** Rigenera fabbisogni competenze da `hr_role_skill_templates` + ruoli catalogo in uso. */
  async regenerateSkillsFromRolesForCompany(
    companyId: string,
    options: Omit<
      import("./skills-regeneration").SkillsRegenerationOptions,
      "companyId"
    >,
    createdBy?: string
  ): Promise<import("./skills-regeneration").SkillsRegenerationReport> {
    if (!this.useDb || !this.supabase) {
      throw new BadRequestException("Rigenerazione competenze richiede database configurato");
    }
    const { regenerateSkillsFromRoles } = await import("./skills-regeneration");
    return regenerateSkillsFromRoles(this.supabase, {
      companyId: companyId.trim(),
      ...options,
      createdBy: createdBy ?? options.createdBy
    });
  }

  async listHrAlerts(
    companyId: string,
    status?: "open" | "ack" | "dismissed"
  ): Promise<
    Array<{
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
    }>
  > {
    const mapRow = (r: {
      id: string;
      company_id: string;
      rule_key: string;
      severity: string;
      title: string;
      body: string;
      metric_payload: unknown;
      dedupe_key: string;
      status: string;
      created_at: string;
      acknowledged_at: string | null;
      acknowledged_by_user_id: string | null;
    }) => ({
      id: r.id,
      companyId: r.company_id,
      ruleKey: r.rule_key,
      severity: r.severity,
      title: r.title,
      body: r.body,
      metricPayload:
        r.metric_payload && typeof r.metric_payload === "object"
          ? (r.metric_payload as Record<string, unknown>)
          : {},
      dedupeKey: r.dedupe_key,
      status: r.status,
      createdAt: r.created_at,
      acknowledgedAt: r.acknowledged_at,
      acknowledgedByUserId: r.acknowledged_by_user_id
    });

    if (!this.useDb) {
      return this.hrAlertsMem
        .filter((a) => a.company_id === companyId && (!status || a.status === status))
        .map(mapRow)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    let q = this.supabase!
      .from("hr_alerts")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) {
      throw new BadRequestException(`Lettura alert HR: ${error.message}`);
    }
    return (data ?? []).map((r) => mapRow(r as never));
  }

  async acknowledgeHrAlert(companyId: string, alertId: string, actorUserId: string): Promise<void> {
    const now = new Date().toISOString();
    if (!this.useDb) {
      const row = this.hrAlertsMem.find((a) => a.id === alertId && a.company_id === companyId);
      if (!row) {
        throw new NotFoundException("Alert non trovato");
      }
      row.status = "ack";
      row.acknowledged_at = now;
      row.acknowledged_by_user_id = actorUserId;
      return;
    }
    const { data, error } = await this.supabase!
      .from("hr_alerts")
      .update({
        status: "ack",
        acknowledged_at: now,
        acknowledged_by_user_id: actorUserId
      })
      .eq("id", alertId)
      .eq("company_id", companyId)
      .eq("status", "open")
      .select("id");
    if (error) {
      throw new BadRequestException(`Aggiornamento alert: ${error.message}`);
    }
    if (!data?.length) {
      throw new NotFoundException("Alert non trovato o già gestito");
    }
  }

  async evaluateHrAlertsForCompany(companyId: string): Promise<{ created: number; notified: number }> {
    let created = 0;
    let notified = 0;
    const recipients = (await this.listUsers()).filter(
      (u) =>
        u.companyId === companyId &&
        (u.role === "superuser" || u.roleId === "r1" || u.roleId === "r-super")
    );

    const maybeCreate = async (input: {
      ruleKey: string;
      severity: "info" | "warning" | "critical";
      title: string;
      body: string;
      dedupeKey: string;
      metricPayload: Record<string, unknown>;
    }): Promise<void> => {
      if (!this.useDb) {
        const exists = this.hrAlertsMem.some(
          (a) => a.company_id === companyId && a.dedupe_key === input.dedupeKey && a.status === "open"
        );
        if (exists) {
          return;
        }
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        this.hrAlertsMem.unshift({
          id,
          company_id: companyId,
          rule_key: input.ruleKey,
          severity: input.severity,
          title: input.title,
          body: input.body,
          metric_payload: input.metricPayload,
          dedupe_key: input.dedupeKey,
          status: "open",
          created_at: createdAt,
          acknowledged_at: null,
          acknowledged_by_user_id: null
        });
        created += 1;
        for (const u of recipients) {
          await this.insertUserNotification({
            id: randomUUID(),
            userId: u.id,
            title: input.title,
            body: input.body,
            read: false,
            createdAt: createdAt,
            kind: "hr_alert",
            actionPath: "/analytics/advanced/retention"
          });
          notified += 1;
        }
        return;
      }

      const { data: existing } = await this.supabase!
        .from("hr_alerts")
        .select("id")
        .eq("company_id", companyId)
        .eq("dedupe_key", input.dedupeKey)
        .eq("status", "open")
        .maybeSingle();
      if (existing?.id) {
        return;
      }
      const { data: ins, error } = await this.supabase!
        .from("hr_alerts")
        .insert({
          company_id: companyId,
          rule_key: input.ruleKey,
          severity: input.severity,
          title: input.title,
          body: input.body,
          metric_payload: input.metricPayload,
          dedupe_key: input.dedupeKey,
          status: "open"
        })
        .select("id,created_at")
        .single();
      if (error) {
        this.logger.warn(`[hr_alerts] insert skip: ${error.message}`);
        return;
      }
      created += 1;
      const idStr = String((ins as { id: string }).id);
      const at = String((ins as { created_at: string }).created_at ?? new Date().toISOString());
      for (const u of recipients) {
        await this.insertUserNotification({
          id: randomUUID(),
          userId: u.id,
          title: input.title,
          body: input.body,
          read: false,
          createdAt: at,
          kind: "hr_alert",
          actionPath: "/analytics/advanced/retention"
        });
        notified += 1;
      }
    };

    try {
      const trend = await this.getTurnoverRetentionTrend(companyId, 6);
      const last = trend.length ? trend[trend.length - 1] : undefined;
      if (last && last.sampleSize > 0 && last.avgScore >= 58) {
        await maybeCreate({
          ruleKey: "turnover_weekly_avg",
          severity: last.avgScore >= 75 ? "critical" : "warning",
          title: "Media score turnover elevata (settimana)",
          body: `La media settimanale degli score di turnover snapshot per la settimana ${last.weekStart} è ${last.avgScore} (campione ${last.sampleSize}). Verificare insight HR.`,
          dedupeKey: `turnover_trend|${last.weekStart}|v1`,
          metricPayload: { weekStart: last.weekStart, avgScore: last.avgScore, sampleSize: last.sampleSize }
        });
      }
    } catch (e) {
      this.logger.warn(`[hr_alerts] turnover rule: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const items = await this.getLatestTurnoverRetention(companyId);
      const hot = items.filter((x) => x.score >= 78).length;
      if (hot >= 2) {
        await maybeCreate({
          ruleKey: "turnover_hotspots",
          severity: "warning",
          title: "Molti profili ad alto score turnover",
          body: `${hot} persone nell'ultimo run hanno score ≥ 78. Controllare Turnover e retention.`,
          dedupeKey: `turnover_hotspots|${items[0]?.runId ?? "norun"}|v1`,
          metricPayload: { count: hot, runId: items[0]?.runId ?? null }
        });
      }
    } catch (e) {
      this.logger.warn(`[hr_alerts] hotspots rule: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { created, notified };
  }

  /** Aggregati produttività e assenteismo (nessun nominativo nel payload LLM). */
  async getProductivityAbsenteeismAggregate(
    companyId: string,
    filters?: { costCenterId?: string; teamId?: string; yearMonth?: string }
  ): Promise<{
    windowDays: number;
    headcount: number;
    workdaysTracked: number;
    avgMinutesWorkedPerDay: number | null;
    overtimeHoursMonth: number;
    absenceDaysMonth: number;
    smartworkingDaysMonth: number;
    byCostCenter: Array<{ label: string; headcount: number; avgMinutes: number | null; absenceDays: number }>;
    note: string;
  }> {
    const cid = companyId.trim();
    const costCenterId = filters?.costCenterId?.trim();
    const teamId = filters?.teamId?.trim();
    const period = filters?.yearMonth?.trim() || new Date().toISOString().slice(0, 7);
    let users = (await this.listUsers()).filter(
      (u) => (u.companyId || "").trim() === cid && u.role !== "superuser"
    );
    if (costCenterId) {
      users = users.filter((u) => u.costCenterId === costCenterId);
    }
    if (teamId) {
      users = users.filter((u) => (u.teamId?.trim() || "") === teamId);
    }
    const centers = await this.listCostCenters();
    const ccLabel = (id: string | null | undefined): string => {
      if (!id) return "Senza centro di costo";
      const cc = centers.find((c) => c.id === id);
      return cc ? [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name : id;
    };
    let totalMinutes = 0;
    let workdays = 0;
    let overtimeHours = 0;
    let absenceDays = 0;
    let smartDays = 0;
    const ccAgg = new Map<string, { headcount: number; minutes: number; days: number; absence: number }>();

    for (const u of users) {
      const ccKey = ccLabel(u.costCenterId);
      const hit = ccAgg.get(ccKey) ?? { headcount: 0, minutes: 0, days: 0, absence: 0 };
      hit.headcount += 1;
      const summaries = await this.listWorkdaySummary(u.id);
      const monthSummaries = summaries.filter((s) => s.date.startsWith(period));
      for (const s of monthSummaries) {
        const mins = s.minutesWorked ?? Math.round((s.workedSeconds ?? 0) / 60);
        totalMinutes += mins;
        workdays += 1;
        hit.minutes += mins;
        hit.days += 1;
        if (s.mode === "smartworking") {
          smartDays += 1;
        }
        const otSec = s.overtimeSeconds ?? 0;
        overtimeHours += otSec / 3600;
      }
      absenceDays += await this.countAnnualLeaveDaysInPeriod(u.id, period);
      absenceDays += await this.countSicknessDays(u.id, period);
      hit.absence += await this.countAnnualLeaveDaysInPeriod(u.id, period);
      hit.absence += await this.countSicknessDays(u.id, period);
      ccAgg.set(ccKey, hit);
    }

    const byCostCenter = [...ccAgg.entries()].map(([label, v]) => ({
      label,
      headcount: v.headcount,
      avgMinutes: v.days > 0 ? Math.round(v.minutes / v.days) : null,
      absenceDays: v.absence
    }));

    return {
      windowDays: 30,
      headcount: users.length,
      workdaysTracked: workdays,
      avgMinutesWorkedPerDay: workdays > 0 ? Math.round(totalMinutes / workdays) : null,
      overtimeHoursMonth: Math.round(overtimeHours * 10) / 10,
      absenceDaysMonth: absenceDays,
      smartworkingDaysMonth: smartDays,
      byCostCenter: byCostCenter.slice(0, 12),
      note: `Aggregati da workday_summaries e piani ferie/malattia per ${period}.`
    };
  }

  async listAnalyticsFilterOptions(companyId: string): Promise<{
    costCenters: Array<{ id: string; label: string }>;
    teams: Array<{ id: string; label: string; costCenterId: string }>;
  }> {
    const [costCenters, users] = await Promise.all([
      this.listCostCentersForTurnoverFilter(companyId),
      this.listUsers()
    ]);
    const companyUsers = users.filter((u) => (u.companyId?.trim() || "") === companyId.trim());
    const teamIds = new Set(
      companyUsers.map((u) => u.teamId?.trim()).filter((id): id is string => Boolean(id))
    );
    const teams: Array<{ id: string; label: string; costCenterId: string }> = [];
    for (const teamId of teamIds) {
      try {
        const team = await this.getWorkTeam(teamId);
        teams.push({
          id: team.id,
          label: team.name,
          costCenterId: team.costCenterId
        });
      } catch {
        teams.push({ id: teamId, label: teamId, costCenterId: "" });
      }
    }
    teams.sort((a, b) => a.label.localeCompare(b.label, "it"));
    return { costCenters, teams };
  }

  private kpiSnapshotMemKey(input: {
    companyId: string;
    analysisId: string;
    kpiKey: string;
    yearMonth: string;
    costCenterId: string;
    teamId: string;
  }): string {
    return [
      input.companyId,
      input.analysisId,
      input.kpiKey,
      input.yearMonth,
      input.costCenterId,
      input.teamId
    ].join("|");
  }

  private readonly kpiMonthlySnapshotsMem = new Map<
    string,
    {
      labelIt: string;
      chartType: "line" | "bar";
      valueNumeric: number | null;
      valueText: string;
      capturedAt: string;
    }
  >();

  async hasKpiMonthlySnapshotsForMonth(input: {
    companyId: string;
    analysisId: string;
    yearMonth: string;
    costCenterId: string;
    teamId: string;
  }): Promise<boolean> {
    if (!this.useDb) {
      for (const key of this.kpiMonthlySnapshotsMem.keys()) {
        const [companyId, analysisId, , yearMonth, costCenterId, teamId] = key.split("|");
        if (
          companyId === input.companyId &&
          analysisId === input.analysisId &&
          yearMonth === input.yearMonth &&
          costCenterId === input.costCenterId &&
          teamId === input.teamId
        ) {
          return true;
        }
      }
      return false;
    }
    const { count, error } = await this.supabase!
      .from("hr_kpi_monthly_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", input.companyId)
      .eq("analysis_id", input.analysisId)
      .eq("year_month", input.yearMonth)
      .eq("cost_center_id", input.costCenterId)
      .eq("team_id", input.teamId);
    if (error) {
      if (this.isMissingRelationError(error, "hr_kpi_monthly_snapshots")) {
        return false;
      }
      throw new InternalServerErrorException(`Lettura snapshot KPI: ${error.message}`);
    }
    return (count ?? 0) > 0;
  }

  async upsertKpiMonthlySnapshots(
    companyId: string,
    analysisId: string,
    yearMonth: string,
    rows: Array<{
      kpiKey: string;
      labelIt: string;
      chartType: "line" | "bar";
      valueNumeric: number | null;
      valueText: string;
    }>,
    costCenterId = "",
    teamId = ""
  ): Promise<void> {
    const capturedAt = new Date().toISOString();
    if (!this.useDb) {
      for (const row of rows) {
        this.kpiMonthlySnapshotsMem.set(
          this.kpiSnapshotMemKey({
            companyId,
            analysisId,
            kpiKey: row.kpiKey,
            yearMonth,
            costCenterId,
            teamId
          }),
          {
            labelIt: row.labelIt,
            chartType: row.chartType,
            valueNumeric: row.valueNumeric,
            valueText: row.valueText,
            capturedAt
          }
        );
      }
      return;
    }
    const payload = rows.map((row) => ({
      company_id: companyId,
      analysis_id: analysisId,
      kpi_key: row.kpiKey,
      year_month: yearMonth,
      value_numeric: row.valueNumeric,
      value_text: row.valueText,
      cost_center_id: costCenterId,
      team_id: teamId,
      captured_at: capturedAt,
      label_it: row.labelIt,
      chart_type: row.chartType
    }));
    const { error } = await this.supabase!.from("hr_kpi_monthly_snapshots").upsert(payload, {
      onConflict: "company_id,analysis_id,kpi_key,year_month,cost_center_id,team_id"
    });
    if (error) {
      if (this.isMissingRelationError(error, "hr_kpi_monthly_snapshots")) {
        return;
      }
      throw new InternalServerErrorException(`Salvataggio snapshot KPI: ${error.message}`);
    }
  }

  async listKpiMonthlySnapshots(input: {
    companyId: string;
    analysisId: string;
    from: string;
    to: string;
    costCenterId: string;
    teamId: string;
  }): Promise<
    Array<{
      kpiKey: string;
      labelIt: string;
      chartType: "line" | "bar";
      yearMonth: string;
      valueNumeric: number | null;
      valueText: string;
    }>
  > {
    if (!this.useDb) {
      const out: Array<{
        kpiKey: string;
        labelIt: string;
        chartType: "line" | "bar";
        yearMonth: string;
        valueNumeric: number | null;
        valueText: string;
      }> = [];
      for (const [key, row] of this.kpiMonthlySnapshotsMem.entries()) {
        const [companyId, analysisId, kpiKey, yearMonth, costCenterId, teamId] = key.split("|");
        if (companyId !== input.companyId || analysisId !== input.analysisId) continue;
        if (yearMonth < input.from || yearMonth > input.to) continue;
        if (costCenterId !== input.costCenterId || teamId !== input.teamId) continue;
        out.push({
          kpiKey,
          labelIt: row.labelIt,
          chartType: row.chartType,
          yearMonth,
          valueNumeric: row.valueNumeric,
          valueText: row.valueText
        });
      }
      return out;
    }
    const { data, error } = await this.supabase!
      .from("hr_kpi_monthly_snapshots")
      .select("kpi_key,label_it,chart_type,year_month,value_numeric,value_text")
      .eq("company_id", input.companyId)
      .eq("analysis_id", input.analysisId)
      .eq("cost_center_id", input.costCenterId)
      .eq("team_id", input.teamId)
      .gte("year_month", input.from)
      .lte("year_month", input.to)
      .order("year_month", { ascending: true });
    if (error) {
      if (this.isMissingRelationError(error, "hr_kpi_monthly_snapshots")) {
        return [];
      }
      throw new InternalServerErrorException(`Lettura storico KPI: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      kpiKey: String((row as { kpi_key: string }).kpi_key),
      labelIt: String((row as { label_it?: string }).label_it ?? (row as { kpi_key: string }).kpi_key),
      chartType: ((row as { chart_type?: string }).chart_type === "bar" ? "bar" : "line") as "line" | "bar",
      yearMonth: String((row as { year_month: string }).year_month),
      valueNumeric:
        (row as { value_numeric?: number | null }).value_numeric != null
          ? Number((row as { value_numeric: number }).value_numeric)
          : null,
      valueText: String((row as { value_text?: string }).value_text ?? "")
    }));
  }
  private isMissingRelationError(error: { message?: string; code?: string }, table: string): boolean {
    const msg = (error.message ?? "").toLowerCase();
    return (
      error.code === "42P01" ||
      msg.includes(table) ||
      msg.includes("does not exist") ||
      msg.includes("could not find the table")
    );
  }

  /** Equità retributiva interna per ruolo (fasce RAL, senza nominativi). */
  async getInternalPayEquityAggregate(companyId: string): Promise<{
    headcount: number;
    rolesAnalyzed: number;
    globalMedianMonthlyEur: number | null;
    spreadRatioHighLow: number | null;
    byRole: Array<{
      roleName: string;
      headcount: number;
      medianMonthlyEur: number;
      minMonthlyEur: number;
      maxMonthlyEur: number;
      spreadPct: number | null;
    }>;
    byCostCenter: Array<{ label: string; headcount: number; medianMonthlyEur: number }>;
    note: string;
  }> {
    const cid = companyId.trim();
    const users = (await this.listUsers()).filter(
      (u) => (u.companyId || "").trim() === cid && u.role !== "superuser"
    );
    const roles = await this.listRoles();
    const roleName = (id: string | null | undefined): string =>
      roles.find((r) => r.id === id)?.name?.trim() || "Ruolo non assegnato";
    const centers = await this.listCostCenters();
    const ccLabel = (id: string | null | undefined): string => {
      if (!id) return "Senza centro di costo";
      const cc = centers.find((c) => c.id === id);
      return cc ? [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name : id;
    };
    const monthly = (u: User): number => {
      const b = Number(u.baseSalaryMonthly);
      return Number.isFinite(b) && b > 0 ? b : 5800;
    };
    const allBases = users.map(monthly).sort((a, b) => a - b);
    const globalMedian =
      allBases.length > 0 ? allBases[Math.floor(allBases.length / 2)]! : null;

    const byRoleMap = new Map<string, number[]>();
    for (const u of users) {
      const key = roleName(u.roleId);
      const arr = byRoleMap.get(key) ?? [];
      arr.push(monthly(u));
      byRoleMap.set(key, arr);
    }
    const byRole = [...byRoleMap.entries()]
      .map(([roleNameKey, bases]) => {
        const sorted = [...bases].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)]!;
        const min = sorted[0]!;
        const max = sorted[sorted.length - 1]!;
        const spreadPct = min > 0 ? Math.round(((max - min) / min) * 1000) / 10 : null;
        return {
          roleName: roleNameKey,
          headcount: bases.length,
          medianMonthlyEur: med,
          minMonthlyEur: min,
          maxMonthlyEur: max,
          spreadPct
        };
      })
      .sort((a, b) => (b.spreadPct ?? 0) - (a.spreadPct ?? 0))
      .slice(0, 16);

    const ccMap = new Map<string, number[]>();
    for (const u of users) {
      const key = ccLabel(u.costCenterId);
      const arr = ccMap.get(key) ?? [];
      arr.push(monthly(u));
      ccMap.set(key, arr);
    }
    const byCostCenter = [...ccMap.entries()].map(([label, bases]) => {
      const sorted = [...bases].sort((a, b) => a - b);
      return {
        label,
        headcount: bases.length,
        medianMonthlyEur: sorted[Math.floor(sorted.length / 2)]!
      };
    });

    const low = allBases[0];
    const high = allBases[allBases.length - 1];
    const spreadRatio = low && high ? Math.round((high / low) * 100) / 100 : null;

    return {
      headcount: users.length,
      rolesAnalyzed: byRoleMap.size,
      globalMedianMonthlyEur: globalMedian,
      spreadRatioHighLow: spreadRatio,
      byRole,
      byCostCenter: byCostCenter.slice(0, 10),
      note: "Confronto su stipendi base mensili in anagrafica; non include variabili, benefit o cedolini pubblicati."
    };
  }

  /** Carico manager: report diretti e approvazioni in coda (aggregati). */
  async getManagerLoadAggregate(companyId: string): Promise<{
    managersCount: number;
    totalDirectReports: number;
    pendingApprovalsTotal: number;
    medianReportsPerManager: number | null;
    topLoad: Array<{
      managerLabel: string;
      directReports: number;
      pendingApprovals: number;
      loadScore: number;
    }>;
    pendingByType: Record<string, number>;
    note: string;
  }> {
    const cid = companyId.trim();
    const users = (await this.listUsers()).filter((u) => (u.companyId || "").trim() === cid);
    const staff = users.filter((u) => u.role !== "superuser");
    const reportsByManager = new Map<string, number>();
    for (const u of staff) {
      const mid = u.managerId?.trim();
      if (!mid) continue;
      reportsByManager.set(mid, (reportsByManager.get(mid) ?? 0) + 1);
    }
    const managerIds = new Set([...reportsByManager.keys()]);
    const pendingViews = await this.listCompanyPendingApprovalViewsForHrDashboard(cid);
    const pendingByManager = new Map<string, number>();
    const pendingByType: Record<string, number> = {};
    for (const p of pendingViews) {
      const approver = p.approverId?.trim();
      if (approver) {
        pendingByManager.set(approver, (pendingByManager.get(approver) ?? 0) + 1);
      }
      const t = String(p.type ?? "other");
      pendingByType[t] = (pendingByType[t] ?? 0) + 1;
    }
    const topLoad: Array<{
      managerLabel: string;
      directReports: number;
      pendingApprovals: number;
      loadScore: number;
    }> = [];
    for (const mid of managerIds) {
      const mgr = users.find((u) => u.id === mid);
      const dr = reportsByManager.get(mid) ?? 0;
      const pend = pendingByManager.get(mid) ?? 0;
      const loadScore = dr * 2 + pend * 3;
      topLoad.push({
        managerLabel: mgr ? `Manager #${topLoad.length + 1}` : `Manager #${topLoad.length + 1}`,
        directReports: dr,
        pendingApprovals: pend,
        loadScore
      });
    }
    topLoad.sort((a, b) => b.loadScore - a.loadScore);
    const sanitizedTop = topLoad.slice(0, 10).map((row, i) => ({
      ...row,
      managerLabel: `Manager cluster ${i + 1}`
    }));
    const reportCounts = [...reportsByManager.values()];
    const median =
      reportCounts.length > 0
        ? reportCounts.sort((a, b) => a - b)[Math.floor(reportCounts.length / 2)]!
        : null;

    return {
      managersCount: managerIds.size,
      totalDirectReports: reportCounts.reduce((s, n) => s + n, 0),
      pendingApprovalsTotal: pendingViews.length,
      medianReportsPerManager: median,
      topLoad: sanitizedTop,
      pendingByType,
      note: "Cluster manager pseudonimizzati; loadScore = report×2 + approvazioni×3."
    };
  }

  async getProcessCycleMetrics(companyId: string): Promise<{
    companyId: string;
    windowDays: number;
    samples: { leave: number; expense: number; onboarding: number };
    medianHoursLeaveApproval: number | null;
    medianDaysExpenseToPaid: number | null;
    medianDaysOnboarding: number | null;
    note: string;
  }> {
    void companyId;
    return {
      companyId,
      windowDays: 90,
      samples: { leave: 0, expense: 0, onboarding: 0 },
      medianHoursLeaveApproval: null,
      medianDaysExpenseToPaid: null,
      medianDaysOnboarding: null,
      note:
        "v0 stub: servono timestamp normalizzati (richiesta vs decisione) su ferie, note spese e onboarding; la dashboard userà query parametriche quando il modello dati sarà allineato."
    };
  }

  async createHitlProposal(
    companyId: string,
    actorUserId: string,
    input: { kind: string; payload: Record<string, unknown>; rationale: string }
  ): Promise<{ id: string }> {
    const kind = input.kind.trim().slice(0, 80);
    const rationale = input.rationale.trim().slice(0, 4000);
    if (!kind) {
      throw new BadRequestException("kind obbligatorio");
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    if (!this.useDb) {
      this.hitlProposalsMem.unshift({
        id,
        company_id: companyId,
        actor_user_id: actorUserId,
        kind,
        status: "proposed",
        payload: input.payload ?? {},
        rationale,
        created_at: createdAt,
        decided_at: null,
        decided_by_user_id: null
      });
      return { id };
    }
    const { data, error } = await this.supabase!
      .from("hr_hitl_proposals")
      .insert({
        company_id: companyId,
        actor_user_id: actorUserId,
        kind,
        status: "proposed",
        payload: input.payload ?? {},
        rationale
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione proposta HITL fallita: ${error?.message ?? "unknown"}`);
    }
    return { id: String((data as { id: string }).id) };
  }

  async listHitlProposals(companyId: string): Promise<
    Array<{
      id: string;
      kind: string;
      status: string;
      rationale: string;
      payload: Record<string, unknown>;
      createdAt: string;
      decidedAt: string | null;
      actorUserId: string;
      decidedByUserId: string | null;
    }>
  > {
    const mapRow = (r: {
      id: string;
      kind: string;
      status: string;
      rationale: string;
      payload: unknown;
      created_at: string;
      decided_at: string | null;
      actor_user_id: string;
      decided_by_user_id: string | null;
    }) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      rationale: r.rationale,
      payload: r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {},
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      actorUserId: r.actor_user_id,
      decidedByUserId: r.decided_by_user_id
    });
    if (!this.useDb) {
      return this.hitlProposalsMem
        .filter((x) => x.company_id === companyId)
        .map((r) =>
          mapRow({
            id: r.id,
            kind: r.kind,
            status: r.status,
            rationale: r.rationale,
            payload: r.payload,
            created_at: r.created_at,
            decided_at: r.decided_at,
            actor_user_id: r.actor_user_id,
            decided_by_user_id: r.decided_by_user_id
          })
        );
    }
    const { data, error } = await this.supabase!
      .from("hr_hitl_proposals")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      throw new BadRequestException(`Lettura HITL: ${error.message}`);
    }
    return (data ?? []).map((r) => mapRow(r as never));
  }

  async decideHitlProposal(
    companyId: string,
    proposalId: string,
    actorUserId: string,
    approve: boolean
  ): Promise<{ id: string; status: string }> {
    const now = new Date().toISOString();
    const status = approve ? "approved" : "rejected";
    if (!this.useDb) {
      const row = this.hitlProposalsMem.find((x) => x.id === proposalId && x.company_id === companyId);
      if (!row || row.status !== "proposed") {
        throw new NotFoundException("Proposta non trovata o già chiusa");
      }
      row.status = status;
      row.decided_at = now;
      row.decided_by_user_id = actorUserId;
      return { id: proposalId, status };
    }
    const { data, error } = await this.supabase!
      .from("hr_hitl_proposals")
      .update({
        status,
        decided_at: now,
        decided_by_user_id: actorUserId
      })
      .eq("id", proposalId)
      .eq("company_id", companyId)
      .eq("status", "proposed")
      .select("id,status")
      .single();
    if (error || !data) {
      throw new NotFoundException("Proposta non trovata o già chiusa");
    }
    return { id: String((data as { id: string }).id), status: String((data as { status: string }).status) };
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

  async proposeShiftsPreview(weekStart: string, respectAbsences = false): Promise<Shift[]> {
    const users = (await this.listUsers()).filter((u) => u.role !== "superuser").slice(0, 12);
    const proposals: Shift[] = [];
    let i = 0;
    for (const u of users) {
      let placed = false;
      for (let off = 0; off < 7 && !placed; off += 1) {
        const dayOff = ((i + off) % 7) + 1;
        const d = new Date(`${weekStart}T12:00:00.000Z`);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException("weekStart non valido");
        }
        d.setUTCDate(d.getUTCDate() + dayOff);
        const y = d.toISOString().slice(0, 10);
        const startAt = `${y}T08:00:00.000Z`;
        const endAt = `${y}T17:00:00.000Z`;
        if (respectAbsences) {
          try {
            await this.assertShiftNoAbsenceOverlap(u.id, startAt, endAt);
          } catch {
            continue;
          }
        }
        proposals.push({
          id: `prop-${u.id}-${y}`,
          userId: u.id,
          startAt,
          endAt,
          premiumCode: undefined,
          status: "scheduled"
        });
        placed = true;
      }
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
      const offSt = await this.getOrCreateOffboarding(targetUserId);
      offSt.phase = "completed";
      offSt.updatedAt = new Date().toISOString();
      await this.supabase!
        .from("lifecycle_offboarding")
        .update({ phase: offSt.phase, updatedAt: offSt.updatedAt })
        .eq("userId", targetUserId);
    } else {
      const offSt = await this.getOrCreateOffboarding(targetUserId);
      offSt.phase = "completed";
      offSt.updatedAt = new Date().toISOString();
      this.offboardingByUser.set(targetUserId, offSt);
    }
    return { userId: targetUserId, checklist, accessDisabled: allDone };
  }

  async payrollForecastNextMonths(months = 3): Promise<Array<{ month: string; costEur: number }>> {
    const users = await this.listUsers();
    const base = users.reduce((acc, u) => acc + (Number(u.baseSalaryMonthly) || 5800), 0);
    const out: Array<{ month: string; costEur: number }> = [];
    const d = new Date();
    for (let m = 0; m < months; m += 1) {
      const x = new Date(d.getFullYear(), d.getMonth() + m, 1);
      const label = x.toISOString().slice(0, 7);
      const growth = 1 + m * 0.02;
      out.push({ month: label, costEur: Math.round(base * growth) });
    }
    return out;
  }

  /**
   * Forecast costi: massa RAL mensile, stima oneri azienda (moltiplicatore indicativo IT) e totali per mese,
   * aggregati per centro di costo / team e ranking dipendenti (stima RAL annua da mensilità × mensilità contrattuale).
   */
  async payrollForecastCostBreakdown(
    companyId: string,
    months = 6
  ): Promise<{
    employerFactor: number;
    series: Array<{
      month: string;
      ralMassMonthlyEur: number;
      estimatedEmployerMonthlyEur: number;
      totalMonthlyEur: number;
    }>;
    byCostCenter: Array<{
      costCenterId: string | null;
      label: string;
      headcount: number;
      monthlyRalMassEur: number;
      monthlyTotalEur: number;
    }>;
    byTeam: Array<{
      teamId: string;
      teamName: string;
      costCenterId: string;
      headcount: number;
      monthlyRalMassEur: number;
      monthlyTotalEur: number;
    }>;
    employees: Array<{
      userId: string;
      fullName: string;
      monthlyBaseEur: number;
      ralAnnualEstimateEur: number;
      monthlyTotalEstimateEur: number;
      costCenterId?: string;
      teamId?: string | null;
    }>;
  }> {
    const cid = companyId.trim();
    const cap = Math.min(12, Math.max(1, months));
    const users = (await this.listUsers()).filter((u) => !cid || (u.companyId || "").trim() === cid);
    const employerFactor = 0.32;
    const defaultBase = 5800;
    const payMonths = (u: (typeof users)[0]): number => {
      const pm = Number(u.payMonthsPerYear);
      if (pm === 12 || pm === 13 || pm === 14) {
        return pm;
      }
      return 13;
    };
    const monthlyBase = (u: (typeof users)[0]): number => {
      const b = Number(u.baseSalaryMonthly);
      return Number.isFinite(b) && b > 0 ? b : defaultBase;
    };
    const ralAnnual = (u: (typeof users)[0]): number => monthlyBase(u) * payMonths(u);
    const totalMonthlyMass = users.reduce((s, u) => s + monthlyBase(u), 0);
    const d = new Date();
    const series: Array<{
      month: string;
      ralMassMonthlyEur: number;
      estimatedEmployerMonthlyEur: number;
      totalMonthlyEur: number;
    }> = [];
    for (let m = 0; m < cap; m += 1) {
      const x = new Date(d.getFullYear(), d.getMonth() + m, 1);
      const label = x.toISOString().slice(0, 7);
      const growth = 1 + m * 0.02;
      const ral = Math.round(totalMonthlyMass * growth);
      const oneri = Math.round(ral * employerFactor);
      series.push({ month: label, ralMassMonthlyEur: ral, estimatedEmployerMonthlyEur: oneri, totalMonthlyEur: ral + oneri });
    }
    const ccMap = new Map<
      string | null,
      { label: string; headcount: number; monthlyRalMassEur: number; monthlyTotalEur: number }
    >();
    const teamMap = new Map<string, { teamName: string; costCenterId: string; headcount: number; monthlyRalMassEur: number; monthlyTotalEur: number }>();
    const teamNameCache = new Map<string, string>();
    const resolveTeamName = async (ccId: string, tid: string): Promise<string> => {
      const k = `${ccId}|${tid}`;
      if (teamNameCache.has(k)) {
        return teamNameCache.get(k)!;
      }
      try {
        const teams = await this.listWorkTeamsByCostCenter(ccId);
        const t = teams.find((x) => x.id === tid);
        const n = t?.name ?? tid;
        teamNameCache.set(k, n);
        return n;
      } catch {
        teamNameCache.set(k, tid);
        return tid;
      }
    };
    const centers = await this.listCostCenters();
    const ccLabel = (id: string | null | undefined): string => {
      if (!id) {
        return "Senza centro di costo";
      }
      const c = centers.find((x) => x.id === id);
      return c ? `${c.code} — ${c.name}` : id;
    };
    for (const u of users) {
      const base = monthlyBase(u);
      const tot = Math.round(base * (1 + employerFactor));
      const ccId = u.costCenterId?.trim() || null;
      const curCc = ccMap.get(ccId) ?? { label: ccLabel(ccId), headcount: 0, monthlyRalMassEur: 0, monthlyTotalEur: 0 };
      curCc.headcount += 1;
      curCc.monthlyRalMassEur += base;
      curCc.monthlyTotalEur += tot;
      ccMap.set(ccId, curCc);
      const tid = u.teamId?.trim();
      if (tid && u.costCenterId) {
        const cc = u.costCenterId;
        const ex = teamMap.get(tid) ?? {
          teamName: tid,
          costCenterId: cc,
          headcount: 0,
          monthlyRalMassEur: 0,
          monthlyTotalEur: 0
        };
        ex.headcount += 1;
        ex.monthlyRalMassEur += base;
        ex.monthlyTotalEur += tot;
        teamMap.set(tid, ex);
      }
    }
    await Promise.all(
      [...teamMap.entries()].map(async ([tid, row]) => {
        row.teamName = await resolveTeamName(row.costCenterId, tid);
        return tid;
      })
    );
    const byCostCenter = [...ccMap.entries()]
      .map(([costCenterId, v]) => ({
        costCenterId,
        label: v.label,
        headcount: v.headcount,
        monthlyRalMassEur: Math.round(v.monthlyRalMassEur),
        monthlyTotalEur: Math.round(v.monthlyTotalEur)
      }))
      .sort((a, b) => b.monthlyTotalEur - a.monthlyTotalEur);
    const byTeam = [...teamMap.entries()]
      .map(([teamId, v]) => ({
        teamId,
        teamName: v.teamName,
        costCenterId: v.costCenterId,
        headcount: v.headcount,
        monthlyRalMassEur: Math.round(v.monthlyRalMassEur),
        monthlyTotalEur: Math.round(v.monthlyTotalEur)
      }))
      .sort((a, b) => b.monthlyTotalEur - a.monthlyTotalEur);
    const employees = users
      .map((u) => {
        const mb = monthlyBase(u);
        const ra = Math.round(ralAnnual(u));
        const mt = Math.round(mb * (1 + employerFactor));
        return {
          userId: u.id,
          fullName: u.fullName || u.email || u.id,
          monthlyBaseEur: Math.round(mb),
          ralAnnualEstimateEur: ra,
          monthlyTotalEstimateEur: mt,
          costCenterId: u.costCenterId,
          teamId: u.teamId ?? null
        };
      })
      .sort((a, b) => b.monthlyTotalEstimateEur - a.monthlyTotalEstimateEur);
    return {
      employerFactor,
      series,
      byCostCenter,
      byTeam,
      employees
    };
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

  private async travelReimbursementActualAmount(userId: string, period: string): Promise<number> {
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
    const companyId = users.find((u) => u.companyId?.trim())?.companyId?.trim() ?? "comp-1";
    const assumptions = await this.getPersonnelBudgetAssumptions(companyId, year);

    const deptMap = new Map<string | null, PersonnelBudgetRow[]>();
    for (const u of users) {
      const ccId = u.costCenterId ?? null;
      if (!deptMap.has(ccId)) {
        deptMap.set(ccId, []);
      }
      const payslip = await this.getPayslipForUserPeriodInternal(u.id, period);
      const base = Number(u.baseSalaryMonthly) > 0 ? Number(u.baseSalaryMonthly) : 5800;
      const overtime = await this.countMonthlyOvertimeAmount(u.id, period, base);
      const travel = await this.travelReimbursementActualAmount(u.id, period);
      const grossFromPayslip = this.payslipGrossAmount(payslip);
      const grossAdjusted = grossFromPayslip ?? base + overtime;
      const ccRow = u.costCenterId != null ? ccById.get(u.costCenterId) : undefined;
      const ratesIt = this.mergeEmployerRatesWithAssumptions(
        this.italianEmployerRatesForUser(u, ccRow),
        assumptions
      );
      const extrasAct = this.employerExtrasFromAssumptions(grossAdjusted, assumptions);
      const buckets = employerBudgetBucketsFromGrossIt(grossAdjusted, {
        employerInpsRate: ratesIt.employerInpsRate,
        inailRate: ratesIt.inailRate,
        tfrDivisor: ratesIt.tfrDivisor
      });
      const sugB = employerBudgetBucketsFromGrossIt(base, {
        employerInpsRate: ratesIt.employerInpsRate,
        inailRate: ratesIt.inailRate,
        tfrDivisor: ratesIt.tfrDivisor
      });
      const extrasSug = this.employerExtrasFromAssumptions(base, assumptions);
      const actual: PersonnelBudgetMoney = {
        ral: Math.round((grossFromPayslip ?? base) * 100) / 100,
        overtime: Math.round(overtime * 100) / 100,
        travel,
        inps: buckets.employerInpsLike,
        inail: buckets.employerInailLike,
        tfr: buckets.employerTfrLike,
        totalCompanyCost: buckets.totalCompanyCost + travel + extrasAct
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
                totalCompanyCost: sugB.totalCompanyCost + extrasSug
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

    const plannedByCc = await this.fetchPersonnelBudgetPlannedExtraGrouped(companyId, year, month);

    const departments: PersonnelBudgetDepartment[] = sortedDeptKeys.map((ccId) => ({
      costCenterId: ccId,
      costCenterName:
        ccId != null ? ccById.get(ccId)?.name ?? ccId : "— senza centro di costo —",
      sortOrder: ccId != null ? orderIdx.get(ccId) ?? 1_000_000 : 999_999,
      rows: (deptMap.get(ccId) ?? []).sort((r1, r2) => r1.fullName.localeCompare(r2.fullName)),
      plannedExtraLines: plannedByCc.get(ccId ?? "__none__") ?? []
    }));

    return { year, month, period, departments };
  }

  private pbPlannedExtraMemKey(
    companyId: string,
    year: number,
    month: number,
    lineId: string
  ): string {
    return `${companyId}|${year}|${month}|${lineId}`;
  }

  private mapPlannedExtraRow(raw: Record<string, unknown>): PersonnelBudgetPlannedExtraLine & {
    costCenterId: string | null;
  } {
    const budgetPartial: Partial<PersonnelBudgetMoney> = {
      ral: raw.budget_ral != null ? Number(raw.budget_ral) : 0,
      overtime: raw.budget_overtime != null ? Number(raw.budget_overtime) : 0,
      travel: raw.budget_travel != null ? Number(raw.budget_travel) : 0,
      inps: raw.budget_inps != null ? Number(raw.budget_inps) : 0,
      inail: raw.budget_inail != null ? Number(raw.budget_inail) : 0,
      tfr: raw.budget_tfr != null ? Number(raw.budget_tfr) : 0
    };
    return {
      id: String(raw.id),
      label: String(raw.label ?? "Voce pianificata"),
      costCenterId: raw.cost_center_id != null ? String(raw.cost_center_id) : null,
      budget: {
        ...budgetPartial,
        totalCompanyCost: this.budgetTotal(budgetPartial)
      }
    };
  }

  private async fetchPersonnelBudgetPlannedExtraGrouped(
    companyId: string,
    year: number,
    month: number
  ): Promise<Map<string, PersonnelBudgetPlannedExtraLine[]>> {
    const grouped = new Map<string, PersonnelBudgetPlannedExtraLine[]>();
    const push = (ccKey: string, line: PersonnelBudgetPlannedExtraLine): void => {
      const list = grouped.get(ccKey) ?? [];
      list.push(line);
      grouped.set(ccKey, list);
    };
    if (!this.useDb) {
      for (const [key, row] of this.personnelBudgetPlannedExtraMem) {
        if (!key.startsWith(`${companyId}|${year}|${month}|`)) {
          continue;
        }
        const ccKey = row.costCenterId ?? "__none__";
        push(ccKey, { id: row.id, label: row.label, budget: row.budget });
      }
      return grouped;
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_planned_extra_lines")
      .select("*")
      .eq("company_id", companyId)
      .eq("year", year)
      .eq("month", month)
      .order("sort_order", { ascending: true });
    if (error) {
      throw new BadRequestException(`Lettura righe pianificate extra fallita: ${error.message}`);
    }
    for (const raw of data ?? []) {
      const mapped = this.mapPlannedExtraRow(raw as Record<string, unknown>);
      push(mapped.costCenterId ?? "__none__", {
        id: mapped.id,
        label: mapped.label,
        budget: mapped.budget
      });
    }
    return grouped;
  }

  async upsertPersonnelBudgetPlannedExtraLine(
    companyId: string,
    input: {
      id?: string;
      year: number;
      month: number;
      costCenterId: string | null;
      label: string;
      budgetRal?: number | null;
      budgetOvertime?: number | null;
      budgetTravel?: number | null;
      budgetInps?: number | null;
      budgetInail?: number | null;
      budgetTfr?: number | null;
    }
  ): Promise<PersonnelBudgetPlannedExtraLine> {
    const label = input.label.trim();
    if (!label) {
      throw new BadRequestException("Etichetta obbligatoria");
    }
    const id = input.id?.trim() || randomUUID();
    const row = {
      budgetRal: input.budgetRal ?? 0,
      budgetOvertime: input.budgetOvertime ?? 0,
      budgetTravel: input.budgetTravel ?? 0,
      budgetInps: input.budgetInps ?? 0,
      budgetInail: input.budgetInail ?? 0,
      budgetTfr: input.budgetTfr ?? 0
    };
    const budgetPartial: Partial<PersonnelBudgetMoney> = {
      ral: row.budgetRal,
      overtime: row.budgetOvertime,
      travel: row.budgetTravel,
      inps: row.budgetInps,
      inail: row.budgetInail,
      tfr: row.budgetTfr
    };
    const dto: PersonnelBudgetPlannedExtraLine = {
      id,
      label,
      budget: { ...budgetPartial, totalCompanyCost: this.budgetTotal(budgetPartial) }
    };
    if (!this.useDb) {
      this.personnelBudgetPlannedExtraMem.set(this.pbPlannedExtraMemKey(companyId, input.year, input.month, id), {
        ...dto,
        costCenterId: input.costCenterId
      });
      return dto;
    }
    const { error } = await this.supabase!.from("personnel_budget_planned_extra_lines").upsert(
      {
        id,
        company_id: companyId,
        year: input.year,
        month: input.month,
        cost_center_id: input.costCenterId,
        label,
        budget_ral: row.budgetRal,
        budget_overtime: row.budgetOvertime,
        budget_travel: row.budgetTravel,
        budget_inps: row.budgetInps,
        budget_inail: row.budgetInail,
        budget_tfr: row.budgetTfr,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    );
    if (error) {
      throw new BadRequestException(`Salvataggio riga pianificata fallito: ${error.message}`);
    }
    return dto;
  }

  async deletePersonnelBudgetPlannedExtraLine(companyId: string, lineId: string): Promise<void> {
    if (!this.useDb) {
      for (const key of [...this.personnelBudgetPlannedExtraMem.keys()]) {
        if (key.endsWith(`|${lineId}`) && key.startsWith(`${companyId}|`)) {
          this.personnelBudgetPlannedExtraMem.delete(key);
        }
      }
      return;
    }
    const { error } = await this.supabase!
      .from("personnel_budget_planned_extra_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("id", lineId);
    if (error) {
      throw new BadRequestException(`Eliminazione riga pianificata fallita: ${error.message}`);
    }
  }

  private pbAssumptionsMemKey(companyId: string, year: number): string {
    return `${companyId.trim()}|${year}`;
  }

  private pbCellNoteMemKey(
    companyId: string,
    year: number,
    month: number | null,
    fieldKey: string,
    userId: string | null,
    plannedLineId: string | null
  ): string {
    return `${companyId.trim()}|${year}|${month ?? 0}|${fieldKey}|${userId ?? ""}|${plannedLineId ?? ""}`;
  }

  async getPersonnelBudgetAssumptions(
    companyId: string,
    year: number
  ): Promise<PersonnelBudgetAssumptionsDto> {
    const cid = companyId.trim();
    const defaults: PersonnelBudgetAssumptionsDto = {
      companyId: cid,
      year,
      employerInpsPercent: null,
      employeeInpsPercent: null,
      inailPermille: null,
      tfrDivisor: null,
      welfarePercent: 0,
      bonusProvisionPercent: 0,
      inflationPercentAnnual: 2.5,
      payrollIndexationPercent: 2,
      defaultPayMonthsPerYear: 13,
      defaultWeeklyContractHours: 40,
      plannedNewHires: 0,
      plannedExits: 0,
      avgNewHireRalAnnual: null,
      employerInpsDiscountPercent: 0,
      overtimeBudgetPercentOnGross: 3,
      travelBudgetPerFteMonthly: 150,
      compilationNotes: "",
      updatedAt: null,
      updatedByUserId: null
    };
    if (!this.useDb) {
      return this.personnelBudgetAssumptionsMem.get(this.pbAssumptionsMemKey(cid, year)) ?? defaults;
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_assumptions")
      .select("*")
      .eq("company_id", cid)
      .eq("year", year)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Assunzioni budget: ${error.message}`);
    }
    if (!data) {
      return defaults;
    }
    const row = data as Record<string, unknown>;
    return {
      companyId: cid,
      year,
      employerInpsPercent:
        row.employer_inps_percent != null ? Number(row.employer_inps_percent) : null,
      employeeInpsPercent:
        row.employee_inps_percent != null ? Number(row.employee_inps_percent) : null,
      inailPermille: row.inail_permille != null ? Number(row.inail_permille) : null,
      tfrDivisor: row.tfr_divisor != null ? Number(row.tfr_divisor) : null,
      welfarePercent: row.welfare_percent != null ? Number(row.welfare_percent) : 0,
      bonusProvisionPercent:
        row.bonus_provision_percent != null ? Number(row.bonus_provision_percent) : 0,
      inflationPercentAnnual:
        row.inflation_percent_annual != null ? Number(row.inflation_percent_annual) : 2.5,
      payrollIndexationPercent:
        row.payroll_indexation_percent != null ? Number(row.payroll_indexation_percent) : 2,
      defaultPayMonthsPerYear:
        row.default_pay_months_per_year != null ? Number(row.default_pay_months_per_year) : 13,
      defaultWeeklyContractHours:
        row.default_weekly_contract_hours != null ? Number(row.default_weekly_contract_hours) : 40,
      plannedNewHires: row.planned_new_hires != null ? Number(row.planned_new_hires) : 0,
      plannedExits: row.planned_exits != null ? Number(row.planned_exits) : 0,
      avgNewHireRalAnnual:
        row.avg_new_hire_ral_annual != null ? Number(row.avg_new_hire_ral_annual) : null,
      employerInpsDiscountPercent:
        row.employer_inps_discount_percent != null ? Number(row.employer_inps_discount_percent) : 0,
      overtimeBudgetPercentOnGross:
        row.overtime_budget_percent_on_gross != null
          ? Number(row.overtime_budget_percent_on_gross)
          : 3,
      travelBudgetPerFteMonthly:
        row.travel_budget_per_fte_monthly != null ? Number(row.travel_budget_per_fte_monthly) : 150,
      compilationNotes:
        row.compilation_notes != null ? String(row.compilation_notes) : "",
      updatedAt: row.updated_at != null ? String(row.updated_at) : null,
      updatedByUserId:
        row.updated_by_user_id != null ? String(row.updated_by_user_id) : null
    };
  }

  async upsertPersonnelBudgetAssumptions(
    companyId: string,
    year: number,
    patch: PersonnelBudgetAssumptionsPatch,
    userId: string
  ): Promise<PersonnelBudgetAssumptionsDto> {
    const cid = companyId.trim();
    const prev = await this.getPersonnelBudgetAssumptions(cid, year);
    const pickNum = (
      key: keyof PersonnelBudgetAssumptionsPatch,
      fallback: number
    ): number => {
      if (patch[key] === undefined || patch[key] == null) return fallback;
      return Number(patch[key]);
    };
    const dto: PersonnelBudgetAssumptionsDto = {
      ...prev,
      employerInpsPercent:
        patch.employerInpsPercent !== undefined ? patch.employerInpsPercent : prev.employerInpsPercent,
      employeeInpsPercent:
        patch.employeeInpsPercent !== undefined ? patch.employeeInpsPercent : prev.employeeInpsPercent,
      inailPermille: patch.inailPermille !== undefined ? patch.inailPermille : prev.inailPermille,
      tfrDivisor: patch.tfrDivisor !== undefined ? patch.tfrDivisor : prev.tfrDivisor,
      welfarePercent: pickNum("welfarePercent", prev.welfarePercent),
      bonusProvisionPercent: pickNum("bonusProvisionPercent", prev.bonusProvisionPercent),
      inflationPercentAnnual: pickNum("inflationPercentAnnual", prev.inflationPercentAnnual),
      payrollIndexationPercent: pickNum("payrollIndexationPercent", prev.payrollIndexationPercent),
      defaultPayMonthsPerYear: pickNum("defaultPayMonthsPerYear", prev.defaultPayMonthsPerYear),
      defaultWeeklyContractHours: pickNum(
        "defaultWeeklyContractHours",
        prev.defaultWeeklyContractHours
      ),
      plannedNewHires: pickNum("plannedNewHires", prev.plannedNewHires),
      plannedExits: pickNum("plannedExits", prev.plannedExits),
      avgNewHireRalAnnual:
        patch.avgNewHireRalAnnual !== undefined ? patch.avgNewHireRalAnnual : prev.avgNewHireRalAnnual,
      employerInpsDiscountPercent: pickNum(
        "employerInpsDiscountPercent",
        prev.employerInpsDiscountPercent
      ),
      overtimeBudgetPercentOnGross: pickNum(
        "overtimeBudgetPercentOnGross",
        prev.overtimeBudgetPercentOnGross
      ),
      travelBudgetPerFteMonthly: pickNum(
        "travelBudgetPerFteMonthly",
        prev.travelBudgetPerFteMonthly
      ),
      compilationNotes:
        patch.compilationNotes !== undefined ? String(patch.compilationNotes) : prev.compilationNotes,
      updatedAt: new Date().toISOString(),
      updatedByUserId: userId
    };
    if (!this.useDb) {
      this.personnelBudgetAssumptionsMem.set(this.pbAssumptionsMemKey(cid, year), dto);
      return dto;
    }
    const { error } = await this.supabase!.from("personnel_budget_assumptions").upsert(
      {
        company_id: cid,
        year,
        employer_inps_percent: dto.employerInpsPercent,
        employee_inps_percent: dto.employeeInpsPercent,
        inail_permille: dto.inailPermille,
        tfr_divisor: dto.tfrDivisor,
        welfare_percent: dto.welfarePercent,
        bonus_provision_percent: dto.bonusProvisionPercent,
        inflation_percent_annual: dto.inflationPercentAnnual,
        payroll_indexation_percent: dto.payrollIndexationPercent,
        default_pay_months_per_year: dto.defaultPayMonthsPerYear,
        default_weekly_contract_hours: dto.defaultWeeklyContractHours,
        planned_new_hires: dto.plannedNewHires,
        planned_exits: dto.plannedExits,
        avg_new_hire_ral_annual: dto.avgNewHireRalAnnual,
        employer_inps_discount_percent: dto.employerInpsDiscountPercent,
        overtime_budget_percent_on_gross: dto.overtimeBudgetPercentOnGross,
        travel_budget_per_fte_monthly: dto.travelBudgetPerFteMonthly,
        compilation_notes: dto.compilationNotes,
        updated_at: dto.updatedAt,
        updated_by_user_id: userId
      },
      { onConflict: "company_id,year" }
    );
    if (error) {
      throw new BadRequestException(`Salvataggio assunzioni budget: ${error.message}`);
    }
    return dto;
  }

  async listPersonnelBudgetCellNotes(
    companyId: string,
    year: number,
    month?: number | null
  ): Promise<PersonnelBudgetCellNoteDto[]> {
    const cid = companyId.trim();
    if (!this.useDb) {
      return [...this.personnelBudgetCellNotesMem.values()].filter((n) => {
        if (n.companyId !== cid || n.year !== year) {
          return false;
        }
        if (month != null && n.month !== month) {
          return false;
        }
        return n.note.trim().length > 0;
      });
    }
    let q = this.supabase!
      .from("personnel_budget_cell_notes")
      .select("*")
      .eq("company_id", cid)
      .eq("year", year);
    if (month != null) {
      q = q.eq("month", month);
    }
    const { data, error } = await q;
    if (error) {
      throw new InternalServerErrorException(`Note celle budget: ${error.message}`);
    }
    return (data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: String(row.id),
        companyId: cid,
        year,
        month: row.month != null ? Number(row.month) : null,
        userId: row.user_id != null ? String(row.user_id) : null,
        plannedLineId: row.planned_line_id != null ? String(row.planned_line_id) : null,
        fieldKey: String(row.field_key),
        note: String(row.note ?? ""),
        authorUserId: row.author_user_id != null ? String(row.author_user_id) : null,
        authorName: row.author_name != null ? String(row.author_name) : null,
        updatedAt: String(row.updated_at ?? new Date().toISOString())
      };
    });
  }

  async upsertPersonnelBudgetCellNote(
    companyId: string,
    input: {
      year: number;
      month: number | null;
      userId: string | null;
      plannedLineId: string | null;
      fieldKey: string;
      note: string;
    },
    authorUserId: string,
    authorName: string | null
  ): Promise<PersonnelBudgetCellNoteDto | null> {
    const cid = companyId.trim();
    const fieldKey = input.fieldKey.trim();
    if (!fieldKey) {
      throw new BadRequestException("fieldKey obbligatorio");
    }
    if (!input.userId && !input.plannedLineId) {
      throw new BadRequestException("userId o plannedLineId obbligatorio");
    }
    const note = input.note.trim();
    const memKey = this.pbCellNoteMemKey(
      cid,
      input.year,
      input.month,
      fieldKey,
      input.userId,
      input.plannedLineId
    );
    if (!note) {
      if (!this.useDb) {
        for (const [k, v] of this.personnelBudgetCellNotesMem) {
          if (
            v.companyId === cid &&
            v.year === input.year &&
            v.month === input.month &&
            v.fieldKey === fieldKey &&
            v.userId === input.userId &&
            v.plannedLineId === input.plannedLineId
          ) {
            this.personnelBudgetCellNotesMem.delete(k);
          }
        }
        return null;
      }
      let del = this.supabase!
        .from("personnel_budget_cell_notes")
        .delete()
        .eq("company_id", cid)
        .eq("year", input.year)
        .eq("field_key", fieldKey);
      if (input.month != null) {
        del = del.eq("month", input.month);
      } else {
        del = del.is("month", null);
      }
      if (input.userId) {
        del = del.eq("user_id", input.userId);
      }
      if (input.plannedLineId) {
        del = del.eq("planned_line_id", input.plannedLineId);
      }
      const { error } = await del;
      if (error) {
        throw new BadRequestException(`Rimozione nota cella: ${error.message}`);
      }
      return null;
    }
    const id = randomUUID();
    const dto: PersonnelBudgetCellNoteDto = {
      id,
      companyId: cid,
      year: input.year,
      month: input.month,
      userId: input.userId,
      plannedLineId: input.plannedLineId,
      fieldKey,
      note,
      authorUserId,
      authorName,
      updatedAt: new Date().toISOString()
    };
    if (!this.useDb) {
      this.personnelBudgetCellNotesMem.set(memKey, dto);
      return dto;
    }
    const existing = (await this.listPersonnelBudgetCellNotes(cid, input.year, input.month ?? undefined)).find(
      (n) =>
        n.fieldKey === fieldKey &&
        n.userId === input.userId &&
        n.plannedLineId === input.plannedLineId
    );
    const payload = {
      company_id: cid,
      year: input.year,
      month: input.month,
      user_id: input.userId,
      planned_line_id: input.plannedLineId,
      field_key: fieldKey,
      note,
      author_user_id: authorUserId,
      author_name: authorName,
      updated_at: dto.updatedAt
    };
    if (existing) {
      const { data, error } = await this.supabase!
        .from("personnel_budget_cell_notes")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) {
        throw new BadRequestException(`Salvataggio nota cella: ${error.message}`);
      }
      const row = data as Record<string, unknown>;
      return { ...dto, id: String(row.id ?? existing.id) };
    }
    const { data, error } = await this.supabase!
      .from("personnel_budget_cell_notes")
      .insert({ ...payload, id })
      .select("*")
      .single();
    if (error) {
      throw new BadRequestException(`Salvataggio nota cella: ${error.message}`);
    }
    const row = data as Record<string, unknown>;
    return { ...dto, id: String(row.id ?? id) };
  }

  async getPersonnelBudgetYearMonthly(
    companyId: string,
    year: number
  ): Promise<PersonnelBudgetYearMonthlyResult> {
    const cid = companyId.trim();
    const months: PersonnelBudgetYearMonthlyResult["months"] = [];
    for (let month = 1; month <= 12; month++) {
      const snap = await this.getPersonnelBudgetSnapshot(year, month);
      const forecast = await this.getPersonnelBudgetForecastSnapshot(cid, year, month);
      const fcByUser = new Map<string, (typeof forecast.departments)[0]["rows"][0]>();
      for (const d of forecast.departments) {
        for (const r of d.rows) {
          fcByUser.set(r.userId, r);
        }
      }
      const departments: PersonnelBudgetYearMonthlyDepartment[] = snap.departments.map((d) => ({
        costCenterId: d.costCenterId,
        costCenterName: d.costCenterName,
        sortOrder: d.sortOrder,
        plannedExtraLines: d.plannedExtraLines,
        rows: d.rows.map((r) => {
          const fr = fcByUser.get(r.userId);
          return {
            ...r,
            forecast: fr?.forecast ?? {}
          };
        })
      }));
      months.push({ month, departments });
    }
    return { year, months };
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
        hireDate: u.hireDate?.trim() || null,
        contractEndDate: u.contractEndDate?.trim() || null,
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
    const assumptions = await this.getPersonnelBudgetAssumptions(cid, year);
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
        const ccRow = u.costCenterId != null ? ccById.get(u.costCenterId) : undefined;
        const ratesIt = this.mergeEmployerRatesWithAssumptions(
          this.italianEmployerRatesForUser(u, ccRow),
          assumptions
        );
        const buckets = employerBudgetBucketsFromGrossIt(monthlyRal, {
          employerInpsRate: ratesIt.employerInpsRate,
          inailRate: ratesIt.inailRate,
          tfrDivisor: ratesIt.tfrDivisor
        });
        const inps = buckets.employerInpsLike;
        const inail = buckets.employerInailLike;
        const tfr = buckets.employerTfrLike;
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
      companyLegalName: "CASA DAMIANI S.P.A.",
      companyAddress: "Via Synapse 1, 20121 Milano (MI), Italia",
      companyVatNumber: "IT01234567890",
      companyRegistrationInfo: "REA MI-1234567 · CCIAA Milano · Cap. soc. € 100.000 i.v.",
      companyCcnl: "Commercio — Terziario distribuito e servizi",
      defaultCurrency: "EUR",
      weeklyFullTimeHours: 40,
      payrollInstallmentMonths: 13,
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
    if (typeof o.companyAddress === "string") {
      d.companyAddress = o.companyAddress.slice(0, 400);
    }
    if (typeof o.companyVatNumber === "string") {
      d.companyVatNumber = o.companyVatNumber.slice(0, 64);
    }
    if (typeof o.companyRegistrationInfo === "string") {
      d.companyRegistrationInfo = o.companyRegistrationInfo.slice(0, 240);
    }
    if (typeof o.companyCcnl === "string") {
      d.companyCcnl = o.companyCcnl.slice(0, 240);
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
    if (patch.companyAddress !== undefined) {
      next.companyAddress = patch.companyAddress.trim().slice(0, 400);
    }
    if (patch.companyVatNumber !== undefined) {
      next.companyVatNumber = patch.companyVatNumber.trim().slice(0, 64);
    }
    if (patch.companyRegistrationInfo !== undefined) {
      next.companyRegistrationInfo = patch.companyRegistrationInfo.trim().slice(0, 240);
    }
    if (patch.companyCcnl !== undefined) {
      next.companyCcnl = patch.companyCcnl.trim().slice(0, 240);
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

  async buildAdminExportPreview(
    requesterId: string,
    selectedFields: string[],
    competencePeriod?: string
  ): Promise<{
    columnIds: string[];
    columns: Array<{ id: string; label: string }>;
    rows: Array<Record<string, string | number | null>>;
  }> {
    const { fields, competencePeriod: cp } = assertAdminExportFieldSelection(
      selectedFields,
      competencePeriod
    );
    const requester = await this.getUser(requesterId);
    const allUsers = await this.listUsers();
    const inCompany = allUsers.filter(
      (u) => requester.role === "superuser" || u.companyId === requester.companyId
    );
    const idToUser = new Map(inCompany.map((u) => [u.id, u] as const));
    const labelById = new Map(ADMIN_EXPORT_FIELD_CATALOG.map((d) => [d.id, d.label] as const));
    const rows: Array<Record<string, string | number | null>> = [];
    for (const u of inCompany) {
      const row: Record<string, string | number | null> = {};
      let cc: CostCenter | null = null;
      if (u.costCenterId?.trim()) {
        cc = await this.getCostCenterById(u.costCenterId.trim());
      }
      let teamName: string | null = null;
      if (u.teamId?.trim()) {
        try {
          const wt = await this.getWorkTeam(u.teamId.trim());
          teamName = wt.name;
        } catch {
          teamName = null;
        }
      }
      const manager = u.managerId?.trim() ? idToUser.get(u.managerId.trim()) : undefined;
      const grossMonthly =
        u.baseSalaryMonthly != null && Number(u.baseSalaryMonthly) > 0
          ? Number(u.baseSalaryMonthly)
          : 5800;
      const vp = cp ?? "";
      let vacationDaysUsed = 0;
      let sicknessDays = 0;
      let smartworkingDays = 0;
      let overtimeAmount = 0;
      let expenseEuro = 0;
      if (vp && fields.some((f) => ADMIN_EXPORT_VARIABLE_FIELD_IDS.has(f))) {
        if (fields.includes("vacationDaysUsed")) {
          vacationDaysUsed = await this.countAnnualLeaveDaysInPeriod(u.id, vp);
        }
        if (fields.includes("sicknessDays")) {
          sicknessDays = await this.countSicknessDays(u.id, vp);
        }
        if (fields.includes("smartworkingDays")) {
          smartworkingDays = await this.countSmartworkingDays(u.id, vp);
        }
        if (fields.includes("overtimeAmountEuro")) {
          overtimeAmount = await this.countMonthlyOvertimeAmount(u.id, vp, grossMonthly);
        }
        if (fields.includes("approvedExpenseReimbursementEuro")) {
          const claims = await this.listApprovedExpenseClaimsForPayslip(u.id, vp);
          expenseEuro = Math.round(claims.reduce((s, c) => s + c.amountCents, 0)) / 100;
        }
      }
      for (const fid of fields) {
        switch (fid) {
          case "userId":
            row[fid] = u.id;
            break;
          case "email":
            row[fid] = u.email;
            break;
          case "fullName":
            row[fid] = u.fullName;
            break;
          case "firstName":
            row[fid] = u.firstName ?? "";
            break;
          case "lastName":
            row[fid] = u.lastName ?? "";
            break;
          case "fiscalCode":
            row[fid] = u.fiscalCode?.trim() ?? "";
            break;
          case "phone":
            row[fid] = u.phone?.trim() ?? "";
            break;
          case "address":
            row[fid] = u.address?.trim() ?? "";
            break;
          case "taxMunicipalityIt":
            row[fid] = u.taxMunicipalityIt?.trim() ?? "";
            break;
          case "taxRegion":
            row[fid] = u.taxRegion?.trim() ?? "";
            break;
          case "hireDate":
            row[fid] = u.hireDate?.trim() ?? "";
            break;
          case "birthDate":
            row[fid] = u.birthDate?.trim() ?? "";
            break;
          case "contractType":
            row[fid] = u.contractType?.trim() ?? "";
            break;
          case "weeklyContractHours":
            row[fid] = u.weeklyContractHours ?? null;
            break;
          case "baseSalaryMonthly":
            row[fid] = u.baseSalaryMonthly ?? null;
            break;
          case "annualGrossSalary":
            row[fid] = u.annualGrossSalary ?? null;
            break;
          case "vacationAllowanceDays":
            row[fid] = u.vacationAllowanceDays ?? null;
            break;
          case "costCenterCode":
            row[fid] = cc?.code ?? "";
            break;
          case "costCenterName":
            row[fid] = cc?.name ?? "";
            break;
          case "teamName":
            row[fid] = teamName ?? "";
            break;
          case "managerFullName":
            row[fid] = manager?.fullName ?? "";
            break;
          case "competencePeriod":
            row[fid] = vp || null;
            break;
          case "vacationDaysUsed":
            row[fid] = vacationDaysUsed;
            break;
          case "sicknessDays":
            row[fid] = sicknessDays;
            break;
          case "smartworkingDays":
            row[fid] = smartworkingDays;
            break;
          case "overtimeAmountEuro":
            row[fid] = Math.round(overtimeAmount * 100) / 100;
            break;
          case "approvedExpenseReimbursementEuro":
            row[fid] = expenseEuro;
            break;
          default:
            break;
        }
      }
      rows.push(row);
    }
    const columns = fields.map((id) => ({ id, label: labelById.get(id) ?? id }));
    return { columnIds: fields, columns, rows };
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
