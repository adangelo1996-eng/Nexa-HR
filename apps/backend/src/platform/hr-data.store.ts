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
  WorkdaySummary,
  Role,
  CostCenter,
  WorkTeam,
  ClockChannel,
  GeoFix
} from "@payday/domain";
import { calculateSwissPayroll, employerBudgetBucketsFromGrossChf } from "@payday/payroll-adapters-ch";
import { calculateItalianPayroll, employerBudgetBucketsFromGrossIt } from "@payday/payroll-adapters-it";
import type { AuthRole } from "./auth";

interface ApprovalRecord {
  id: string;
  entityId: string;
  type: "leave" | "sickness" | "smartworking";
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

const SMARTWORKING_MONTHLY_QUOTA = 8;
/** Massimo giorni smart working richiedibili nella stessa settimana (lun–dom UTC) per dipendente. */
const SMARTWORKING_WEEKLY_QUOTA = 2;

/** Opzioni scrittura utente: `skipTeamLeadLinkValidation` solo per chiamate admin console (API Nest). */
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
      role: "admin",
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
      role: "team_lead",
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
      role: "employee",
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
  private readonly nfcTokenMap: Map<string, string> = new Map();
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
      return (data?.[0] as User | undefined) ?? null;
    }
    return this.users.find((item) => item.email.toLowerCase() === normalized.toLowerCase()) ?? null;
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
      return (data as User[]) ?? [];
    }
    return this.users;
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
      return data as User;
    }
    const user = this.users.find((item) => item.id === userId);
    if (!user) {
      throw new NotFoundException("Utente non trovato");
    }
    return user;
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
    const users = await this.listUsers();
    return users
      .filter((u) => u.teamId === teamId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
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
      await this.updateUser(prevLeadId, { role: "employee", roleId: employeeRoleId });
    }
    if (lead.teamId !== teamId) {
      await this.updateUser(userId, { teamId });
    }
    const promoted = await this.updateUser(userId, { role: "team_lead", roleId });
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
    if (input.role === "team_lead" && !options?.skipTeamLeadLinkValidation) {
      throw new BadRequestException(
        "Il ruolo team_lead è legato al team di cui si è responsabili: crea l'utente come dipendente o admin, poi nomina il responsabile da Gestione centri di costo → Team."
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
      jurisdiction: input.jurisdiction ?? "CH",
      taxRegion: input.taxRegion,
      taxMunicipalityIt: input.taxMunicipalityIt
    };
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
    const nextRole = input.role !== undefined ? input.role : user.role;
    if (user.role === "team_lead" && nextRole !== "team_lead") {
      await this.clearWorkTeamLeadPositions(userId);
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
    if (nextRole === "team_lead" && !options?.skipTeamLeadLinkValidation) {
      const teamAsLead = await this.findWorkTeamByLeadUserId(userId);
      if (!teamAsLead) {
        throw new BadRequestException(
          "Il ruolo team_lead è consentito solo se sei il responsabile nominato di un work team (Gestione centri di costo → Team → Nomina lead)."
        );
      }
      const effectiveTeamId = payload.teamId ?? null;
      if (effectiveTeamId !== teamAsLead.id) {
        throw new BadRequestException(
          `Un team lead deve avere «team» anagrafico uguale al team di cui è responsabile (${teamAsLead.name}).`
        );
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
      return data as User;
    }
    Object.assign(user, payload);
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
    const remainingAdmin = currentRoles.some((item) => item.id !== roleId && item.name === "admin");
    if (!remainingAdmin) {
      throw new BadRequestException("Deve esistere almeno un ruolo admin");
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

  async createCostCenter(input: { code?: string; name: string; description?: string; companyId?: string }): Promise<CostCenter> {
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
      ...(companyId ? { companyId } : {})
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
    input: { code?: string; name?: string; description?: string; companyId?: string | null }
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

  /** Admin (stessa company) o team_lead con managerId diretto sul dipendente. */
  private async assertCanActOnBehalfOfUser(
    actorUserId: string,
    actorRole: AuthRole,
    targetUserId: string
  ): Promise<void> {
    if (targetUserId === actorUserId) {
      return;
    }
    if (actorRole === "admin") {
      const a = await this.getUser(actorUserId);
      const t = await this.getUser(targetUserId);
      if (a.companyId !== t.companyId) {
        throw new ForbiddenException("Azienda diversa");
      }
      return;
    }
    if (actorRole === "team_lead") {
      if (!(await this.isManagerOf(actorUserId, targetUserId))) {
        throw new ForbiddenException("Non sei il responsabile di questo dipendente");
      }
      return;
    }
    throw new ForbiddenException("Operazione non consentita");
  }

  async isManagerOf(managerId: string, employeeId: string): Promise<boolean> {
    const employee = (await this.listUsers()).find((item) => item.id === employeeId);
    return employee?.managerId === managerId;
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

  async getUserIdByNfcToken(token: string): Promise<string | null> {
    if (token.length !== 16) {
      return null;
    }
    if (this.useDb) {
      const { data } = await this.supabase!.from("nfc_badge_tokens").select("userId").eq("token", token).maybeSingle();
      const row = data as { userId?: string } | null;
      return row?.userId ?? null;
    }
    return this.nfcTokenMap.get(token) ?? null;
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

  async upsertWorkMode(
    userId: string,
    date: string,
    mode: "office" | "smartworking"
  ): Promise<WorkdaySummary> {
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

  async createLeavePlan(input: Omit<LeavePlan, "id" | "status" | "version">): Promise<LeavePlan> {
    const requestedDays = this.countCalendarDays(input.startDate, input.endDate);
    const kind: LeavePlanKind = input.kind ?? "annual";
    if (kind === "annual") {
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
    const role = actorRole ?? "employee";
    await this.assertCanActOnBehalfOfUser(actorUserId, role, leave.userId);
    if (leave.status !== "pending") {
      throw new BadRequestException("Solo le richieste in attesa di approvazione possono essere modificate");
    }
    const year = Number(startDate.slice(0, 4));
    const requestedDays = this.countCalendarDays(startDate, endDate);
    const kind: LeavePlanKind = kindInput ?? leave.kind ?? "annual";
    if (kind === "annual") {
      const balance = await this.getLeaveBalance(leave.userId, year);
      if (requestedDays > balance.residualDays) {
        throw new BadRequestException("Ferie insufficienti per aggiornare questa richiesta");
      }
    }
    leave.startDate = startDate;
    leave.endDate = endDate;
    leave.kind = kind;
    leave.version += 1;
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
    if (leave.status !== "pending" && leave.status !== "rejected") {
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
    const role = actorRole ?? "employee";
    await this.assertCanActOnBehalfOfUser(actorUserId, role, sickness.userId);
    if (sickness.status !== "pending") {
      throw new BadRequestException("Solo le richieste in attesa di approvazione possono essere modificate");
    }
    this.countCalendarDays(fromDate, toDate);
    sickness.fromDate = fromDate;
    sickness.toDate = toDate;
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
      if (u.role === "admin") {
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
    const year = Number(period.slice(0, 4));
    const balance = await this.getLeaveBalance(userId, year);
    const claims = await this.listApprovedExpenseClaimsForPayslip(userId, period);
    const reimbursement =
      Math.round(claims.reduce((s, c) => s + c.amountCents, 0)) / 100;
    const jurisdiction = user.jurisdiction === "IT" ? "IT" : "CH";
    let result: { lines: Payslip["lines"]; grossAdjusted: number; netSalary: number };
    if (jurisdiction === "IT") {
      result = calculateItalianPayroll({
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
          municipality: user.taxMunicipalityIt?.trim() || user.taxMunicipality?.trim() || "Roma"
        },
        vacationResidualDays: balance.residualDays
      });
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
    const lines = [...result.lines, ...extraLines];
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
    const j = input.jurisdiction === "IT" ? "IT" : "CH";
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
    const subordinates = await this.listUsersByManager(requesterId);
    const visibleUserIds = new Set<string>([requesterId, ...subordinates.map((item) => item.id)]);
    const allApprovals = this.useDb
      ? (((await this.supabase!.from("approvals").select("*")).data ?? []) as ApprovalRecord[])
      : this.approvals;
    let approvals = allApprovals
      .filter((item) => requester.role === "admin" || visibleUserIds.has(item.requestedBy))
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => b.at.localeCompare(a.at));

    const leavesById = new Map<string, LeavePlan>();
    const sicknessById = new Map<string, SicknessEvent>();
    const swById = new Map<string, SmartworkingRequestRow>();

    if (this.useDb) {
      const leaveIds = approvals.filter((item) => item.type === "leave").map((item) => item.entityId);
      const sicknessIds = approvals.filter((item) => item.type === "sickness").map((item) => item.entityId);
      const swIds = approvals.filter((item) => item.type === "smartworking").map((item) => item.entityId);

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
        startDate: leave?.startDate ?? sickness?.fromDate ?? sw?.day,
        endDate: leave?.endDate ?? sickness?.toDate ?? sw?.day,
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

  /** Calendario aggregato per il team operativo (work_team) o, in assenza, tutto il CDC. */
  async getCostCenterWorkCalendarForRequester(
    requesterId: string,
    from?: string,
    to?: string
  ): Promise<{ users: Array<{ id: string; fullName: string }>; events: CalendarEvent[] }> {
    const me = await this.getUser(requesterId);
    const tid = me.teamId?.trim();
    if (tid) {
      const peers = await this.listUsersByTeam(tid);
      const ids = peers.length > 0 ? peers.map((u) => u.id) : [me.id];
      const events = await this.getTeamWorkCalendar(ids, from, to);
      const users =
        peers.length > 0
          ? peers.map((u) => ({ id: u.id, fullName: u.fullName }))
          : [{ id: me.id, fullName: me.fullName }];
      return { users, events };
    }
    const cc = me.costCenterId?.trim();
    if (!cc) {
      const events = await this.getTeamWorkCalendar([me.id], from, to);
      return { users: [{ id: me.id, fullName: me.fullName }], events };
    }
    const peers = await this.listUsersByCostCenter(me.companyId, cc);
    const ids = peers.length > 0 ? peers.map((u) => u.id) : [me.id];
    const events = await this.getTeamWorkCalendar(ids, from, to);
    const users =
      peers.length > 0
        ? peers.map((u) => ({ id: u.id, fullName: u.fullName }))
        : [{ id: me.id, fullName: me.fullName }];
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
    const isAdmin = requesterRole === "admin";
    const isManagerWithHierarchy =
      requesterRole === "team_lead" && (await this.isManagerOf(requesterId, targetUserId));
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
    if (scope === "self" || requesterRole === "employee") {
      userIds = [requesterId];
    } else if (requesterRole === "admin") {
      const all = await this.listUsers();
      userIds = all.map((u) => u.id);
    } else {
      const subs = await this.listUsersByManager(requesterId);
      userIds = [...subs.map((s) => s.id), requesterId];
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
    if (approver.role !== "admin" && !(await this.isManagerOf(approverId, claim.userId))) {
      throw new BadRequestException("Solo il responsabile diretto o admin può approvare");
    }
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
    if (approver.role !== "admin" && !(await this.isManagerOf(approverId, claim.userId))) {
      throw new BadRequestException("Solo il responsabile diretto o admin può rifiutare");
    }
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
      if (req.role !== "admin" && !(await this.isManagerOf(requesterId, uid))) {
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
    if (requesterRole === "employee") {
      throw new BadRequestException("Solo manager o admin possono creare turni");
    }
    if (requesterRole !== "admin" && !(await this.isManagerOf(requesterId, input.userId))) {
      throw new BadRequestException("Puoi pianificare solo i membri del tuo team");
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
    if (requesterRole === "employee") {
      throw new BadRequestException("Operazione non consentita");
    }
    if (requesterRole !== "admin" && !(await this.isManagerOf(requesterId, shift.userId))) {
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
    if (userId !== requesterId && requesterRole !== "admin" && !(await this.isManagerOf(requesterId, userId))) {
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
      if (requesterRole !== "admin" && !(await this.isManagerOf(requesterId, uid))) {
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
    if (row.userId !== requesterId && requesterRole !== "admin" && !(await this.isManagerOf(requesterId, row.userId))) {
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
    const skipSwQuota = actorRole === "admin";
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
    if (row.status !== "pending") {
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
      nextDay !== row.day.slice(0, 10) &&
      (await this.hasActiveSmartworkingRequestForDay(requesterId, nextDay, requestId))
    ) {
      throw new BadRequestException("Smart working già richiesto per questa data");
    }
    if (nextDay !== row.day.slice(0, 10) && actorRole !== "admin") {
      const monthPrefix = nextDay.slice(0, 7);
      const monthBooked = (
        await this.listMySmartworking(requesterId)
      ).filter(
        (r) => r.id !== requestId && r.status !== "rejected" && r.day.startsWith(monthPrefix)
      ).length;
      if (monthBooked >= SMARTWORKING_MONTHLY_QUOTA) {
        throw new BadRequestException("Quota smartworking mensile esaurita per il mese selezionato");
      }
      const weekBooked = await this.countSmartworkingBookedDaysInWeek(requesterId, nextDay, requestId);
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
    return { ...row, day: nextDay, note: nextNote };
  }

  async cancelSmartworkingRequest(requesterId: string, requestId: string, actorRole: AuthRole): Promise<void> {
    const row = await this.findSmartworkingRequestById(requestId);
    if (!row) {
      throw new NotFoundException("Richiesta non trovata");
    }
    await this.assertCanActOnBehalfOfUser(requesterId, actorRole, row.userId);
    if (row.status !== "pending" && row.status !== "rejected") {
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
    const subs = await this.listUsersByManager(managerId);
    const ids = new Set(subs.map((u) => u.id));
    if (this.useDb) {
      const { data } = await this.supabase!.from("smartworking_requests").select("*").eq("status", "pending");
      const rows = (data as SmartworkingRequestRow[]) ?? [];
      return rows.filter((r) => ids.has(r.userId) || r.approverId === managerId);
    }
    return this.smartworkingRequests.filter(
      (r) => r.status === "pending" && (ids.has(r.userId) || r.approverId === managerId)
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
    const isAdminApprover = decidingUser.role === "admin";
    if (!isAdminApprover) {
      const subs = await this.listUsersByManager(managerId);
      if (!subs.some((u) => u.id === row.userId) && row.approverId !== managerId) {
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

  async getPeopleInsightsRisk(): Promise<Array<{ userId: string; fullName: string; score: number; reasons: string[] }>> {
    const users = await this.listUsers();
    const rows: Array<{ userId: string; fullName: string; score: number; reasons: string[] }> = [];
    for (const u of users) {
      if (u.role === "admin") {
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
    const users = (await this.listUsers()).filter((u) => u.role === "employee").slice(0, 12);
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
      const isIt = u.jurisdiction === "IT";
      const buckets = isIt
        ? employerBudgetBucketsFromGrossIt(grossAdjusted)
        : employerBudgetBucketsFromGrossChf(grossAdjusted, this.ageFromBirthDate(u.birthDate));
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
        actual
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

  async setPersonnelBudgetCostCenterOrder(
    year: number,
    items: Array<{ costCenterId: string; sortOrder: number }>
  ): Promise<void> {
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
    const users = await this.listUsers();
    const idOk = new Set(users.map((u) => u.id));
    for (const c of cells) {
      if (!idOk.has(c.userId)) {
        throw new BadRequestException(`Utente sconosciuto: ${c.userId}`);
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

  private defaultCompanySettingsStored(): CompanySettingsStored {
    return {
      fiscalYearStartMonth: 1,
      companyLegalName: "",
      companyVatNumber: "",
      companyRegistrationInfo: "",
      defaultCurrency: "EUR",
      weeklyFullTimeHours: 40,
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
