import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import type { ApprovalView, User } from "@payday/domain";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { RecruitingService } from "../recruiting/recruiting.service";

export type HrRecapTaskDto = {
  id: string;
  kind: "approval" | "expense_hr" | "contract_sign";
  title: string;
  subtitle?: string;
  dueAt: string | null;
  href: string;
  /** Utente da sollecitare (approvatore, HR su spesa, o creatore contratto). */
  notifyUserId: string | null;
};

@Injectable()
export class HrRecapService {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly recruiting: RecruitingService
  ) {}

  private async assertHrRecap(auth: AuthContext): Promise<{ me: User; companyId: string }> {
    const me = await this.store.getUser(auth.userId);
    const companyId = (me.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile");
    }
    if (auth.role === "superuser") {
      return { me, companyId };
    }
    const ext = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    const hrReports = await this.permissions.userHasAll(auth.userId, ["nexa.reports_hr:read"]);
    if (!ext && !hrReports) {
      throw new ForbiddenException("Solo HR o amministratori possono accedere al recap operativo.");
    }
    return { me, companyId };
  }

  async listRecruitingOnboarding(auth: AuthContext): Promise<{
    items: Awaited<ReturnType<RecruitingService["listOnboardingCandidatesForCompany"]>>;
  }> {
    const { companyId } = await this.assertHrRecap(auth);
    const items = await this.recruiting.listOnboardingCandidatesForCompany(companyId);
    return { items };
  }

  async getSummary(auth: AuthContext): Promise<{
    totalEmployed: number;
    active: number;
    hrOnboarding: number;
    offboarding: number;
    contractsToSign: number;
    recruitingOnboardingCandidates: number;
  }> {
    const { companyId } = await this.assertHrRecap(auth);
    const [head, contractsToSign, recruitingOnboardingCandidates] = await Promise.all([
      this.store.getHrRecapHeadcount(companyId),
      this.store.countHrStandardContractsUnsigned(companyId),
      this.recruiting.listOnboardingCandidatesForCompany(companyId).then((rows) => rows.length)
    ]);
    return {
      ...head,
      contractsToSign,
      recruitingOnboardingCandidates
    };
  }

  async listTasks(auth: AuthContext): Promise<{ tasks: HrRecapTaskDto[] }> {
    const { companyId, me } = await this.assertHrRecap(auth);
    const [approvals, expenses, contracts, users] = await Promise.all([
      this.store.listCompanyPendingApprovalViewsForHrDashboard(companyId),
      this.store.listCompanyExpenseClaimsPendingHr(companyId),
      this.store.listHrStandardContractsUnsigned(companyId),
      this.store.listUsers()
    ]);
    const usersById = new Map(users.map((u) => [u.id, u]));

    const tasks: HrRecapTaskDto[] = [];

    for (const a of approvals) {
      if (a.status !== "pending") {
        continue;
      }
      const label =
        a.type === "leave"
          ? a.leaveKind === "rol"
            ? "ROL in attesa"
            : "Ferie in attesa"
          : a.type === "sickness"
            ? "Malattia in attesa"
            : a.type === "travel"
              ? "Trasferta in attesa"
              : "Remote working in attesa";
      const requester = usersById.get(a.requestedBy);
      const notifyUserId = a.approverId?.trim() || requester?.managerId?.trim() || null;
      tasks.push({
        id: `appr:${a.id}`,
        kind: "approval",
        title: `${label}: ${a.requesterName ?? a.requestedBy}`,
        subtitle: a.approverName ? `Approvatore: ${a.approverName}` : undefined,
        dueAt: a.startDate ?? a.at,
        href: "/workflow/approvals",
        notifyUserId
      });
    }

    for (const c of expenses) {
      const u = usersById.get(c.userId);
      tasks.push({
        id: `exp:${c.id}`,
        kind: "expense_hr",
        title: `Nota spesa in attesa HR: ${u?.fullName ?? c.userId}`,
        subtitle: c.description?.slice(0, 120) || undefined,
        dueAt: c.expenseDate ?? c.createdAt,
        href: "/expenses/org",
        notifyUserId: c.userId
      });
    }

    for (const ct of contracts) {
      tasks.push({
        id: `ctr:${ct.id}`,
        kind: "contract_sign",
        title: `Contratto da firmare: ${ct.title || "Senza titolo"}`,
        subtitle: ct.recruit_candidate_id ? `Candidato collegato` : undefined,
        dueAt: ct.updated_at || null,
        href: `/contracts/${encodeURIComponent(ct.id)}`,
        /** Abilita «Sollecita» in UI: il sollecito reale va agli HR (vedi `postReminder` prefisso ctr). */
        notifyUserId: me.id
      });
    }

    tasks.sort((x, y) => String(x.dueAt ?? "").localeCompare(String(y.dueAt ?? "")));
    return { tasks };
  }

  private async resolveManagerId(userId: string): Promise<string | null> {
    try {
      const u = await this.store.getUser(userId);
      return u.managerId?.trim() || null;
    } catch {
      return null;
    }
  }

  async postReminder(
    auth: AuthContext,
    input: { taskId: string }
  ): Promise<{ ok: true }> {
    const { companyId, me } = await this.assertHrRecap(auth);
    const prefix = input.taskId.split(":")[0];
    const rawId = input.taskId.slice(input.taskId.indexOf(":") + 1);
    if (prefix === "appr") {
      const approvals = await this.store.listCompanyPendingApprovalViewsForHrDashboard(companyId);
      const a = approvals.find((x) => x.id === rawId) as ApprovalView | undefined;
      if (!a) {
        throw new NotFoundException("Task non trovato");
      }
      const target = a.approverId?.trim() || (await this.resolveManagerId(a.requestedBy));
      if (!target) {
        throw new BadRequestException("Nessun destinatario per il sollecito");
      }
      await this.store.sendHrDashboardReminder({
        targetUserId: target,
        title: "Sollecito: approvazione in sospeso",
        body: `${me.fullName} (HR) sollecita un'azione su una richiesta di ${a.requesterName ?? "un collega"}.`,
        actionPath: "/workflow/approvals"
      });
      return { ok: true };
    }
    if (prefix === "exp") {
      const rows = await this.store.listCompanyExpenseClaimsPendingHr(companyId);
      const c = rows.find((x) => x.id === rawId);
      if (!c) {
        throw new NotFoundException("Task non trovato");
      }
      await this.store.sendHrDashboardReminder({
        targetUserId: c.userId,
        title: "Sollecito: nota spesa in revisione HR",
        body: `${me.fullName} (HR) sollecita un aggiornamento sulla nota spesa in coda.`,
        actionPath: "/expenses/org"
      });
      return { ok: true };
    }
    if (prefix === "ctr") {
      const rows = await this.store.listHrStandardContractsUnsigned(companyId);
      const ct = rows.find((x) => x.id === rawId);
      if (!ct) {
        throw new NotFoundException("Task non trovato");
      }
      const hrIds: string[] = [];
      for (const u of await this.store.listUsers()) {
        if (u.companyId !== companyId) {
          continue;
        }
        if (u.role === "superuser") {
          hrIds.push(u.id);
          continue;
        }
        if (await this.permissions.canAccessHrExtendedConsole(u.id, u.role, u.email)) {
          hrIds.push(u.id);
        } else if (await this.permissions.userHasAll(u.id, ["nexa.reports_hr:read"])) {
          hrIds.push(u.id);
        }
      }
      const target = hrIds.find((id) => id !== me.id) ?? hrIds[0];
      if (!target) {
        throw new BadRequestException("Nessun destinatario HR per sollecito contratto");
      }
      await this.store.sendHrDashboardReminder({
        targetUserId: target,
        title: "Sollecito: contratto da firmare",
        body: `${me.fullName} ricorda di completare la firma / revisione del contratto «${ct.title}».`,
        actionPath: `/contracts/${encodeURIComponent(ct.id)}`
      });
      return { ok: true };
    }
    throw new BadRequestException("taskId non valido");
  }

  async listPeople(
    auth: AuthContext,
    category: string
  ): Promise<{ users?: User[]; contracts?: Awaited<ReturnType<HrDataStore["listHrStandardContractsUnsigned"]>> }> {
    const allowed = new Set(["active", "hr_onboarding", "offboarding", "contracts_pending"]);
    if (!allowed.has(category)) {
      throw new BadRequestException("category non valida");
    }
    const { companyId } = await this.assertHrRecap(auth);
    if (category === "contracts_pending") {
      const contracts = await this.store.listHrStandardContractsUnsigned(companyId);
      return { contracts };
    }
    const users = await this.store.listUsersForHrRecapCategory(
      companyId,
      category as "active" | "hr_onboarding" | "offboarding"
    );
    return { users };
  }
}
