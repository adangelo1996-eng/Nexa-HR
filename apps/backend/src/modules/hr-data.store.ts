import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalView, LeaveBalance, LeavePlan, Payslip, SicknessEvent, TimeEntry, User, WorkdaySummary, Role, CostCenter } from "./models";
import { calculateSwissPayroll } from "./swiss-payroll.util";

interface ApprovalRecord {
  id: string;
  entityId: string;
  type: "leave" | "sickness";
  requestedBy: string;
  approverId?: string;
  status: "pending" | "approved" | "rejected";
  at: string;
}

interface UserCreateInput {
  firstName: string;
  lastName: string;
  role: User["role"];
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

interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  fullName?: string;
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
  phone?: string;
  address?: string;
}

interface Delegation {
  managerId: string;
  delegateManagerId: string;
  from: string;
  to: string;
}

@Injectable()
export class HrDataStore {
  private readonly supabase?: SupabaseClient;
  private seeded = false;
  private readonly users: User[] = [
    {
      id: "u-admin",
      email: "admin@payday.ch",
      fullName: "HR Admin",
      firstName: "HR",
      lastName: "Admin",
      role: "admin",
      companyId: "comp-1",
      roleId: "r1",
      costCenterId: "cc-1",
      weeklyContractHours: 40,
      dailyTargetSeconds: 28800,
      vacationAllowanceDays: 26
    },
    {
      id: "u-manager",
      email: "manager.controllo@payday.local",
      fullName: "Manager Controllo",
      firstName: "Manager",
      lastName: "Controllo",
      role: "manager_controllo_gestione",
      companyId: "comp-1",
      roleId: "r2",
      costCenterId: "cc-1",
      weeklyContractHours: 40,
      dailyTargetSeconds: 28800,
      vacationAllowanceDays: 24
    },
    {
      id: "u-employee",
      email: "dipendente.demo@payday.local",
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
      id: "r2",
      name: "manager_controllo_gestione",
      permissions: ["approve:leave", "approve:sickness", "read:team", "read:payslip:team"]
    },
    {
      id: "r3",
      name: "employee",
      permissions: ["clock", "request:leave", "request:sickness", "read:self", "read:payslip:self"]
    }
  ];

  private readonly timeEntries: TimeEntry[] = [];
  private readonly workdaySummaries: WorkdaySummary[] = [];
  private readonly leavePlans: LeavePlan[] = [];
  private readonly sicknessEvents: SicknessEvent[] = [];
  private readonly approvals: ApprovalRecord[] = [];
  private readonly payslips: Payslip[] = [];
  private readonly delegations: Delegation[] = [];
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
      this.supabase = createClient(url, serviceRole);
    }
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

  private async ensureSeedReferenceData(): Promise<void> {
    if (!this.useDb) return;
    const rolesCount = await this.supabase!.from("roles").select("id", { count: "exact", head: true });
    if (!rolesCount.error && (rolesCount.count ?? 0) === 0) {
      await this.supabase!.from("roles").insert(this.roles);
    }
    const centersCount = await this.supabase!
      .from("cost_centers")
      .select("id", { count: "exact", head: true });
    if (!centersCount.error && (centersCount.count ?? 0) === 0) {
      await this.supabase!.from("cost_centers").insert(this.costCenters);
    }
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
    const user = (await this.listUsers()).find((item) => item.id === userId);
    if (!user) throw new NotFoundException("Utente non trovato");
    return user;
  }

  async listUsersByManager(managerId: string): Promise<User[]> {
    const users = await this.listUsers();
    return users.filter((item) => item.managerId === managerId);
  }

  private normalizePart(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, ".");
  }

  private composeEmail(firstName: string, lastName: string): string {
    const localPart = `${this.normalizePart(firstName)}.${this.normalizePart(lastName)}`.replace(/\.+/g, ".");
    return `${localPart}@payday.local`;
  }

  private async getUniqueEmail(firstName: string, lastName: string): Promise<string> {
    const users = await this.listUsers();
    const base = this.composeEmail(firstName, lastName);
    if (!users.some((item) => item.email.toLowerCase() === base.toLowerCase())) {
      return base;
    }
    let suffix = 1;
    while (suffix < 5000) {
      const [local] = base.split("@");
      const candidate = `${local}${suffix}@payday.local`;
      if (!users.some((item) => item.email.toLowerCase() === candidate.toLowerCase())) {
        return candidate;
      }
      suffix += 1;
    }
    throw new BadRequestException("Impossibile generare una email univoca");
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

  async createUser(input: UserCreateInput): Promise<User> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException("Nome e cognome sono obbligatori");
    }
    await this.validateReferenceIds(input.roleId, input.costCenterId);
    const weeklyContractHours = this.normalizeWeeklyContractHours(input.weeklyContractHours);
    const fullName = this.computeFullName(firstName, lastName);
    const email = await this.getUniqueEmail(firstName, lastName);
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
      phone: input.phone,
      address: input.address
    };
    if (this.useDb) {
      await this.supabase!.from("users").insert(user);
      return user;
    }
    this.users.push(user);
    return user;
  }

  async updateUser(userId: string, input: UserUpdateInput): Promise<User> {
    const user = await this.getUser(userId);
    await this.validateReferenceIds(input.roleId, input.costCenterId);
    const weeklyContractHours =
      input.weeklyContractHours !== undefined
        ? this.normalizeWeeklyContractHours(input.weeklyContractHours)
        : this.normalizeWeeklyContractHours(user.weeklyContractHours);
    const nextFirstName = input.firstName ?? user.firstName ?? user.fullName.split(" ")[0] ?? "";
    const nextLastName = input.lastName ?? user.lastName ?? user.fullName.split(" ").slice(1).join(" ") ?? "";
    const fullName = input.fullName ?? this.computeFullName(nextFirstName, nextLastName);
    const payload: User = {
      ...user,
      ...input,
      weeklyContractHours,
      dailyTargetSeconds: this.computeDailyTargetSecondsFromWeekly(weeklyContractHours),
      firstName: nextFirstName,
      lastName: nextLastName,
      fullName
    };
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
    if (role.name === "admin") {
      throw new BadRequestException("Il ruolo admin non puo essere eliminato");
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

  async createCostCenter(input: { code: string; name: string; description?: string }): Promise<CostCenter> {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) {
      throw new BadRequestException("Codice e nome centro di costo sono obbligatori");
    }
    const existing = (await this.listCostCenters()).find(
      (center) => center.code.toLowerCase() === code.toLowerCase()
    );
    if (existing) {
      throw new BadRequestException("Esiste gia un centro di costo con questo codice");
    }
    const costCenter: CostCenter = {
      id: `cc-${Date.now()}`,
      code,
      name,
      description: input.description
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
    input: { code?: string; name?: string; description?: string }
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
    if (this.useDb) {
      const { data } = await this.supabase!
        .from("users")
        .update({ role })
        .eq("id", userId)
        .select("*")
        .single();
      if (!data) throw new NotFoundException("Utente non trovato");
      return data as User;
    }
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new NotFoundException("Utente non trovato");
    user.role = role;
    return user;
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
    const todayEntries = (await this.listTimeEntries(userId, date)).sort((a, b) => a.at.localeCompare(b.at));
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

  async addTimeEntry(userId: string, type: "clock_in" | "clock_out", at?: string): Promise<TimeEntry> {
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
      at: atIso
    };
    if (this.useDb) {
      await this.supabase!.from("time_entries").insert(entry);
      await this.refreshSummary(userId, day);
      return entry;
    }
    this.timeEntries.push(entry);
    await this.refreshSummary(userId, day);
    return entry;
  }

  async listTimeEntries(userId: string, date?: string): Promise<TimeEntry[]> {
    if (this.useDb) {
      let query = this.supabase!.from("time_entries").select("*").eq("userId", userId);
      if (date) {
        query = query.like("at", `${date}%`);
      }
      const { data } = await query;
      return ((data as TimeEntry[]) ?? []).sort((a, b) => b.at.localeCompare(a.at));
    }
    return this.timeEntries
      .filter((item) => item.userId === userId && (!date || item.at.startsWith(date)))
      .sort((a, b) => b.at.localeCompare(a.at));
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
    const dayEntries = (await this.listTimeEntries(userId, date)).sort((a, b) => a.at.localeCompare(b.at));
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
    const balance = await this.getLeaveBalance(input.userId, Number(input.startDate.slice(0, 4)));
    if (requestedDays > balance.residualDays) {
      throw new BadRequestException("Ferie insufficienti: riduci i giorni richiesti");
    }
    const leave: LeavePlan = {
      id: `lv-${Date.now()}`,
      status: "pending",
      version: 1,
      ...input
    };
    if (this.useDb) {
      await this.supabase!.from("leave_plans").insert(leave);
    } else {
      this.leavePlans.push(leave);
    }
    const approval = {
      id: `ap-${Date.now()}`,
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
    return leave;
  }

  async updateLeavePlan(leaveId: string, startDate: string, endDate: string): Promise<LeavePlan> {
    const leave = await this.getLeave(leaveId);
    if (!leave) throw new NotFoundException("Piano ferie non trovato");
    const year = Number(startDate.slice(0, 4));
    const requestedDays = this.countCalendarDays(startDate, endDate);
    const balance = await this.getLeaveBalance(leave.userId, year);
    const previousDays = leave.status === "approved" ? this.countCalendarDays(leave.startDate, leave.endDate) : 0;
    if (requestedDays > balance.residualDays + previousDays) {
      throw new BadRequestException("Ferie insufficienti per aggiornare questa richiesta");
    }
    leave.startDate = startDate;
    leave.endDate = endDate;
    leave.version += 1;
    leave.status = "pending";
    if (this.useDb) {
      await this.supabase!
        .from("leave_plans")
        .update({ startDate, endDate, version: leave.version, status: leave.status })
        .eq("id", leaveId);
    }
    const approval = {
      id: `ap-${Date.now()}`,
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
    return leave;
  }

  async approveLeave(leaveId: string, approverId: string): Promise<LeavePlan> {
    const leave = await this.getLeave(leaveId);
    if (!leave) throw new NotFoundException("Piano ferie non trovato");
    leave.status = "approved";
    if (this.useDb) {
      await this.supabase!.from("leave_plans").update({ status: "approved" }).eq("id", leaveId);
    }
    const approval = {
      id: `ap-${Date.now()}`,
      entityId: leave.id,
      type: "leave",
      requestedBy: leave.userId,
      approverId,
      status: "approved",
      at: new Date().toISOString()
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
    return leave;
  }

  async rejectLeave(leaveId: string, approverId: string): Promise<LeavePlan> {
    const leave = await this.getLeave(leaveId);
    leave.status = "rejected";
    if (this.useDb) {
      await this.supabase!.from("leave_plans").update({ status: "rejected" }).eq("id", leaveId);
    }
    const approval = {
      id: `ap-${Date.now()}`,
      entityId: leave.id,
      type: "leave",
      requestedBy: leave.userId,
      approverId,
      status: "rejected",
      at: new Date().toISOString()
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
    return leave;
  }

  async listLeave(userId: string): Promise<LeavePlan[]> {
    if (this.useDb) {
      const { data } = await this.supabase!.from("leave_plans").select("*").eq("userId", userId);
      return (data as LeavePlan[]) ?? [];
    }
    return this.leavePlans.filter((item) => item.userId === userId);
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
      id: `ap-${Date.now()}`,
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
    return sickness;
  }

  async approveSickness(id: string, approverId: string): Promise<SicknessEvent> {
    const sickness = await this.getSickness(id);
    if (!sickness) throw new NotFoundException("Evento malattia non trovato");
    sickness.status = "approved";
    if (this.useDb) {
      await this.supabase!.from("sickness_events").update({ status: "approved" }).eq("id", id);
    }
    const approval = {
      id: `ap-${Date.now()}`,
      entityId: sickness.id,
      type: "sickness",
      requestedBy: sickness.userId,
      approverId,
      status: "approved",
      at: new Date().toISOString()
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
    return sickness;
  }

  async rejectSickness(id: string, approverId: string): Promise<SicknessEvent> {
    const sickness = await this.getSickness(id);
    sickness.status = "rejected";
    if (this.useDb) {
      await this.supabase!.from("sickness_events").update({ status: "rejected" }).eq("id", id);
    }
    const approval = {
      id: `ap-${Date.now()}`,
      entityId: sickness.id,
      type: "sickness",
      requestedBy: sickness.userId,
      approverId,
      status: "rejected",
      at: new Date().toISOString()
    } as ApprovalRecord;
    if (this.useDb) {
      await this.supabase!.from("approvals").insert(approval);
    } else {
      this.approvals.push(approval);
    }
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

  async getOrgChart(): Promise<unknown> {
    const users = await this.listUsers();
    return {
      nodes: users.map((user) => ({
        id: user.id,
        label: user.fullName,
        role: user.role
      })),
      edges: users
        .filter((user) => user.managerId)
        .map((user) => ({ from: user.managerId, to: user.id }))
    };
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

  async generatePayslip(userId: string, period: string): Promise<Payslip> {
    const grossMonthlySalary = 5800;
    const overtimeAmount = await this.countMonthlyOvertimeAmount(userId, period, grossMonthlySalary);
    const taxProfile = {
      canton: "TI",
      municipality: "Lugano",
      permitType: "B" as const,
      companyType: "commerciale",
      companySite: "TI-LUG"
    };
    const result = calculateSwissPayroll({
      period,
      grossMonthlySalary,
      age: 37,
      vacationDaysUsed: await this.countLeaveDays(userId, period),
      sicknessDays: await this.countSicknessDays(userId, period),
      smartworkingDays: await this.countSmartworkingDays(userId, period),
      overtimeAmount,
      taxProfile
    });

    const payslip: Payslip = {
      id: `ps-${Date.now()}`,
      userId,
      period,
      grossSalary: result.grossAdjusted,
      netSalary: result.netSalary,
      lines: result.lines,
      pdfUrl: `/api/payroll/${userId}/${period}/pdf`
    };
    if (this.useDb) {
      await this.supabase!.from("payslips").insert({
        id: payslip.id,
        userId: payslip.userId,
        period: payslip.period,
        grossSalary: payslip.grossSalary,
        netSalary: payslip.netSalary,
        lines: payslip.lines,
        pdfUrl: payslip.pdfUrl
      });
    } else {
      this.payslips.push(payslip);
    }
    return payslip;
  }

  async getPayslipForPeriod(userId: string, period: string): Promise<Payslip | undefined> {
    const all = await this.listPayslips(userId, userId);
    return all.find((item) => item.period === period);
  }

  async listPayslips(requesterId: string, targetUserId?: string): Promise<Payslip[]> {
    const target = targetUserId ?? requesterId;
    if (this.useDb) {
      const { data } = await this.supabase!.from("payslips").select("*").eq("userId", target);
      return (data as Payslip[]) ?? [];
    }
    return this.payslips.filter((item) => item.userId === target);
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
    const approvals = allApprovals
      .filter((item) => requester.role === "admin" || visibleUserIds.has(item.requestedBy))
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => b.at.localeCompare(a.at));

    const leavesById = new Map<string, LeavePlan>();
    const sicknessById = new Map<string, SicknessEvent>();

    if (this.useDb) {
      const leaveIds = approvals.filter((item) => item.type === "leave").map((item) => item.entityId);
      const sicknessIds = approvals.filter((item) => item.type === "sickness").map((item) => item.entityId);

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
    } else {
      for (const leave of this.leavePlans) {
        leavesById.set(leave.id, leave);
      }
      for (const sickness of this.sicknessEvents) {
        sicknessById.set(sickness.id, sickness);
      }
    }

    const users = await this.listUsers();
    const usersById = new Map(users.map((user) => [user.id, user]));

    return approvals.map((item) => {
      const user = usersById.get(item.requestedBy);
      const leave = item.type === "leave" ? leavesById.get(item.entityId) : undefined;
      const sickness = item.type === "sickness" ? sicknessById.get(item.entityId) : undefined;
      return {
        id: item.id,
        entityId: item.entityId,
        type: item.type,
        requestedBy: item.requestedBy,
        approverId: item.approverId,
        status: item.status,
        at: item.at,
        requesterName: user?.fullName,
        startDate: leave?.startDate ?? sickness?.fromDate,
        endDate: leave?.endDate ?? sickness?.toDate
      };
    });
  }

  async approveByApprovalId(approvalId: string, approverId: string): Promise<ApprovalView> {
    const approvals = await this.listApprovalsForUser(approverId);
    const approval = approvals.find((item) => item.id === approvalId);
    if (!approval) {
      throw new NotFoundException("Autorizzazione non trovata");
    }
    if (approval.type === "leave") {
      await this.approveLeave(approval.entityId, approverId);
    } else {
      await this.approveSickness(approval.entityId, approverId);
    }
    return {
      ...approval,
      status: "approved",
      approverId,
      at: new Date().toISOString()
    };
  }

  async rejectByApprovalId(approvalId: string, approverId: string): Promise<ApprovalView> {
    const approvals = await this.listApprovalsForUser(approverId);
    const approval = approvals.find((item) => item.id === approvalId);
    if (!approval) {
      throw new NotFoundException("Autorizzazione non trovata");
    }
    if (approval.type === "leave") {
      await this.rejectLeave(approval.entityId, approverId);
    } else {
      await this.rejectSickness(approval.entityId, approverId);
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
      .filter((item) => item.status === "approved")
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

  private async countLeaveDays(userId: string, period: string): Promise<number> {
    const month = period.slice(0, 7);
    const leaves = await this.listLeave(userId);
    return leaves.filter((item) => item.status === "approved" && item.startDate.startsWith(month))
      .length;
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
}
