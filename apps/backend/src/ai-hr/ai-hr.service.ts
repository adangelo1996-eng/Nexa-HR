import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { User } from "@payday/domain";
import type { AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { CorporatePoliciesService } from "../corporate-policies/corporate-policies.service";
import { HrDataStore, type SmartworkingRequestRow } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { isSynapseSuperuserEmail } from "../platform/synapse-superuser";
import { AiAuditService } from "./ai-audit.service";
import {
  AI_HR_ROUTE_HINTS,
  NEXA_HR_AGENT_ID,
  NEXA_HR_AGENT_VERSION,
  NEXA_HR_PLATFORM_NAV
} from "./ai-hr-agent";
import { assertMessageHasNoKnownPersonFullNames } from "./ai-hr-message-policy";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";

const SCHEMA_ASSISTANT = "ai_assistant_v1";
const SCHEMA_NL = "ai_nl_query_v1";
const SCHEMA_ANOMALIES = "ai_anomalies_v1";
const SCHEMA_TRIAGE = "ai_triage_v1";
const SCHEMA_TRIAGE_RATIONALE = "ai_triage_rationale_v1";

export interface NlQueryCatalogEntry {
  id: string;
  label: string;
  description: string;
  requiredPermissions: string[];
}

export type AssistantScopeMode = "self" | "user" | "team" | "cost_center";

export interface AssistantScopePayload {
  mode: AssistantScopeMode;
  userId?: string;
  teamId?: string;
  costCenterId?: string;
}

@Injectable()
export class AiHrService {
  constructor(
    private readonly store: HrDataStore,
    private readonly policies: CorporatePoliciesService,
    private readonly gateway: AiPrivacyGateway,
    private readonly audit: AiAuditService,
    private readonly permissions: PermissionsService,
    private readonly openAi: AiOpenAiRefinementService
  ) {}

  nlQueryCatalog(): { queries: NlQueryCatalogEntry[]; capabilities: { llmActive: boolean } } {
    return {
      capabilities: { llmActive: this.openAi.isActive() },
      queries: [
        {
          id: "my_leave_balance",
          label: "Saldo ferie (anno corrente)",
          description: "Giorni assegnati, usati e residuo ferie annuali.",
          requiredPermissions: ["nexa.leaves:read"]
        },
        {
          id: "my_pending_leaves",
          label: "Richieste ferie in sospeso",
          description: "Elenco richieste ferie con stato pending.",
          requiredPermissions: ["nexa.leaves:read"]
        },
        {
          id: "my_payslip_headline",
          label: "Ultimo cedolino (lordo / netto)",
          description: "Periodo e importi sintetici dell’ultimo cedolino pubblicato.",
          requiredPermissions: ["nexa.payslips:read"]
        }
      ]
    };
  }

  private async depseudoAfterOptionalRefine(
    sessionId: string,
    pseudo: { pseudonymized: unknown; schemaVersion: string },
    openAiSchema: string
  ): Promise<{ result: unknown; refineApplied: boolean }> {
    const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, openAiSchema);
    const refineApplied = refined != null;
    const modelJson = refineApplied ? refined : pseudo.pseudonymized;
    const result = await this.gateway.fromModelResponse(sessionId, modelJson);
    return { result, refineApplied };
  }

  async assistant(
    auth: { userId: string; role: AuthRole },
    body: { message: string; page?: string | null; scope?: AssistantScopePayload }
  ): Promise<{
    reply: string;
    sources: string[];
    llm: { configured: boolean; refineApplied: boolean };
    privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
  }> {
    const me = await this.store.getUser(auth.userId);
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);
    assertMessageHasNoKnownPersonFullNames(body.message, companyUsers);

    const { subjectUserIds, scopeKind } = await this.resolveAssistantSubjectUserIds(auth, me, body.scope);
    const org = await this.hasOrgAiScope(auth, me);
    const managed = await this.hasManagedAiScope(auth.userId);
    const managedSet = managed ? await this.store.listManagedMemberIdsForApprover(auth.userId) : new Set<string>();

    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const sources: string[] = [];
      const facts: Record<string, unknown> = {
        page: body.page ?? null,
        message: body.message,
        scopeKind,
        scopeSubjects: subjectUserIds.map((id) => ({ id })),
        subjectCount: subjectUserIds.length
      };
      facts.snapshot = await this.buildAssistantSnapshot(auth, me, subjectUserIds, org, managedSet);
      facts.routeHints = AI_HR_ROUTE_HINTS;
      facts.platformCapabilities = NEXA_HR_PLATFORM_NAV;
      facts.agent = { id: NEXA_HR_AGENT_ID, version: NEXA_HR_AGENT_VERSION };
      sources.push("assistant_snapshot", "route_hints", "platform_capabilities", "nexa_hr_agent");

      const canReadLeaves = await this.permissions.userHasAll(auth.userId, ["nexa.leaves:read"]);
      const year = new Date().getFullYear();
      if (subjectUserIds.length === 1 && canReadLeaves) {
        const sid = subjectUserIds[0]!;
        if (await this.canViewSubjectForAssistant(auth.userId, sid, org, managedSet)) {
          facts.leaveBalance = await this.store.getLeaveBalance(sid, year);
          sources.push("leave_balance");
        }
      }

      const snippets = await this.policies.listSnippetsForAi(me.companyId);
      facts.policySnippets = snippets.map((s) => ({ title: s.title }));
      sources.push("corporate_policies_meta");
      const draft = this.buildAssistantDraft(facts, body.message);
      const wrapped = { envelope: { text: draft, facts } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_ASSISTANT);
      const { result: cleared, refineApplied } = await this.depseudoAfterOptionalRefine(
        sessionId,
        pseudo,
        SCHEMA_ASSISTANT
      );
      const clearedEnv = cleared as { envelope?: { text?: string } };
      const reply = typeof clearedEnv.envelope?.text === "string" ? clearedEnv.envelope.text : draft;
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "assistant",
        schemaVersion: SCHEMA_ASSISTANT,
        sessionId,
        inputForFingerprint: {
          message: body.message,
          page: body.page,
          scopeKind,
          subjectCount: subjectUserIds.length
        },
        dataSources: sources,
        responseSizeBytes: Buffer.byteLength(reply, "utf8"),
        outcome: "ok"
      });
      return {
        reply,
        sources,
        llm: { configured: this.openAi.isActive(), refineApplied },
        privacy: { pseudonymizedTokenCount: pseudo.tokenCount, schemaVersion: SCHEMA_ASSISTANT }
      };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async getAssistantScopeOptions(auth: { userId: string; role: AuthRole }): Promise<{
    modesAllowed: AssistantScopeMode[];
    managedUsers?: { userId: string; label: string }[];
    teams?: { teamId: string; name: string; costCenterId: string }[];
    costCenters?: { costCenterId: string; label: string }[];
  }> {
    const me = await this.store.getUser(auth.userId);
    const org = await this.hasOrgAiScope(auth, me);
    const managed = await this.hasManagedAiScope(auth.userId);
    const modes: AssistantScopeMode[] = ["self"];
    const managedSet = managed ? await this.store.listManagedMemberIdsForApprover(auth.userId) : new Set<string>();
    const all = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);

    if (org) {
      modes.push("user", "team", "cost_center");
      const centers = (await this.store.listCostCenters()).filter(
        (c) => !c.companyId || c.companyId === me.companyId
      );
      const teams: { teamId: string; name: string; costCenterId: string }[] = [];
      for (const cc of centers) {
        try {
          const wt = await this.store.listWorkTeamsByCostCenter(cc.id);
          for (const t of wt) {
            teams.push({ teamId: t.id, name: t.name, costCenterId: cc.id });
          }
        } catch {
          /* work_teams assente */
        }
      }
      return {
        modesAllowed: modes,
        costCenters: centers.map((c) => ({ costCenterId: c.id, label: `${c.code} — ${c.name}` })),
        teams
      };
    }

    if (managed) {
      modes.push("user", "team");
      const managedUsers = [...managedSet]
        .filter((id) => id !== auth.userId)
        .map((id) => {
          const u = all.find((x) => x.id === id);
          return { userId: id, label: u?.fullName ?? id };
        });
      const teamIds = await this.store.listWorkTeamIdsWhereUserIsLead(auth.userId);
      const teams: { teamId: string; name: string; costCenterId: string }[] = [];
      for (const tid of teamIds) {
        try {
          const t = await this.store.getWorkTeam(tid);
          teams.push({ teamId: t.id, name: t.name, costCenterId: t.costCenterId });
        } catch {
          /* skip */
        }
      }
      return { modesAllowed: modes, managedUsers, teams };
    }

    return { modesAllowed: modes };
  }

  async searchAssistantOrgUsers(
    auth: { userId: string; role: AuthRole },
    q: string
  ): Promise<{ users: { userId: string; label: string }[] }> {
    const me = await this.store.getUser(auth.userId);
    if (!(await this.hasOrgAiScope(auth, me))) {
      throw new ForbiddenException("Ricerca anagrafica non consentita per il tuo profilo.");
    }
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) {
      throw new BadRequestException("Inserisci almeno 2 caratteri per la ricerca.");
    }
    const all = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);
    const users = all
      .filter(
        (u) =>
          u.fullName.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          (u.firstName && u.firstName.toLowerCase().includes(needle)) ||
          (u.lastName && u.lastName.toLowerCase().includes(needle))
      )
      .slice(0, 40)
      .map((u) => ({ userId: u.id, label: u.fullName }));
    return { users };
  }

  private async hasOrgAiScope(auth: { role: AuthRole }, me: User): Promise<boolean> {
    if (auth.role === "superuser") {
      return true;
    }
    if (isSynapseSuperuserEmail(me.email)) {
      return true;
    }
    return this.permissions.userHasAll(me.id, ["nexa.ai_assistant:scope_org"]);
  }

  private async hasManagedAiScope(userId: string): Promise<boolean> {
    return this.permissions.userHasAll(userId, ["nexa.ai_assistant:scope_managed"]);
  }

  private async canViewSubjectForAssistant(
    actorId: string,
    subjectId: string,
    org: boolean,
    managedSet: Set<string>
  ): Promise<boolean> {
    if (subjectId === actorId) {
      return true;
    }
    if (org) {
      const actor = await this.store.getUser(actorId);
      const sub = await this.store.getUser(subjectId);
      return sub.companyId === actor.companyId;
    }
    return managedSet.has(subjectId);
  }

  private async resolveAssistantSubjectUserIds(
    auth: { userId: string; role: AuthRole },
    me: User,
    scope?: AssistantScopePayload
  ): Promise<{ subjectUserIds: string[]; scopeKind: AssistantScopeMode }> {
    const org = await this.hasOrgAiScope(auth, me);
    const managed = await this.hasManagedAiScope(auth.userId);
    const managedSet = managed ? await this.store.listManagedMemberIdsForApprover(auth.userId) : new Set<string>();

    const mode: AssistantScopeMode = scope?.mode ?? "self";
    if (mode === "self") {
      return { subjectUserIds: [auth.userId], scopeKind: "self" };
    }

    if (mode === "user") {
      const uid = scope?.userId?.trim();
      if (!uid) {
        throw new BadRequestException("Ambito «persona»: seleziona un dipendente.");
      }
      if (uid === auth.userId) {
        return { subjectUserIds: [auth.userId], scopeKind: "user" };
      }
      if (!(await this.canViewSubjectForAssistant(auth.userId, uid, org, managedSet))) {
        throw new ForbiddenException("Non puoi analizzare questa persona.");
      }
      return { subjectUserIds: [uid], scopeKind: "user" };
    }

    if (mode === "team") {
      const tid = scope?.teamId?.trim();
      if (!tid) {
        throw new BadRequestException("Ambito «team»: seleziona un team.");
      }
      const team = await this.store.getWorkTeam(tid);
      if (org) {
        const cc = await this.store.getCostCenterById(team.costCenterId);
        if (!cc || (cc.companyId && cc.companyId !== me.companyId)) {
          throw new ForbiddenException("Team non valido per la tua azienda.");
        }
      } else if (managed) {
        const led = await this.store.listWorkTeamIdsWhereUserIsLead(auth.userId);
        if (!led.includes(tid)) {
          throw new ForbiddenException("Puoi selezionare solo team di cui sei responsabile.");
        }
      } else {
        throw new ForbiddenException("Ambito team non consentito.");
      }
      const members = (await this.store.listUsers()).filter((u) => u.teamId?.trim() === tid && u.companyId === me.companyId);
      const ids = members.map((m) => m.id);
      if (!ids.length) {
        throw new BadRequestException("Nessun membro trovato per il team selezionato.");
      }
      return { subjectUserIds: ids, scopeKind: "team" };
    }

    if (mode === "cost_center") {
      if (!org) {
        throw new ForbiddenException("Solo HR / amministratori possono usare l’ambito centro di costo.");
      }
      const ccid = scope?.costCenterId?.trim();
      if (!ccid) {
        throw new BadRequestException("Ambito «centro di costo»: seleziona un centro.");
      }
      const cc = await this.store.getCostCenterById(ccid);
      if (!cc || (cc.companyId && cc.companyId !== me.companyId)) {
        throw new ForbiddenException("Centro di costo non valido.");
      }
      const members = (await this.store.listUsers()).filter((u) => u.costCenterId === ccid && u.companyId === me.companyId);
      const ids = members.map((m) => m.id);
      if (!ids.length) {
        throw new BadRequestException("Nessun dipendente trovato per il centro di costo selezionato.");
      }
      return { subjectUserIds: ids, scopeKind: "cost_center" };
    }

    throw new BadRequestException("Ambito non valido.");
  }

  private async buildAssistantSnapshot(
    auth: { userId: string },
    me: User,
    subjectUserIds: string[],
    org: boolean,
    managedSet: Set<string>
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    const actorId = auth.userId;

    const canLeave = await this.permissions.userHasAll(actorId, ["nexa.leaves:read"]);
    try {
      if (canLeave && subjectUserIds.length === 1) {
        const sid = subjectUserIds[0]!;
        if (await this.canViewSubjectForAssistant(actorId, sid, org, managedSet)) {
          const leaves = await this.store.listLeave(sid);
          out.pendingMyLeaveRequestsCount = leaves.filter((l) => l.status === "pending").length;
          const year = new Date().getFullYear();
          const bal = await this.store.getLeaveBalance(sid, year);
          out.leaveResidualDays = bal.residualDays;
          out.leaveResidualIsLow = bal.residualDays <= 3;
        }
      } else if (canLeave && subjectUserIds.length > 1) {
        let pending = 0;
        let lowAny = false;
        for (const sid of subjectUserIds) {
          if (!(await this.canViewSubjectForAssistant(actorId, sid, org, managedSet))) {
            continue;
          }
          const leaves = await this.store.listLeave(sid);
          pending += leaves.filter((l) => l.status === "pending").length;
          const y = new Date().getFullYear();
          const bal = await this.store.getLeaveBalance(sid, y);
          if (bal.residualDays <= 3) {
            lowAny = true;
          }
        }
        out.pendingLeaveRequestsInScope = pending;
        out.leaveResidualIsLow = lowAny;
        out.scopeIsMultiPerson = true;
      }
    } catch {
      /* ignore */
    }

    try {
      const appr = await this.store.listApprovalsForUser(actorId, "pending");
      out.pendingTeamApprovalsCount = Array.isArray(appr) ? appr.length : 0;
    } catch {
      out.pendingTeamApprovalsCount = 0;
    }
    try {
      const notifs = await this.store.listUserNotifications(actorId, 40);
      out.unreadNotificationsCount = notifs.filter((n) => !n.read).length;
    } catch {
      out.unreadNotificationsCount = 0;
    }

    try {
      if (await this.permissions.userHasAll(actorId, ["nexa.expenses:read"])) {
        if (subjectUserIds.length === 1) {
          const sid = subjectUserIds[0]!;
          if (sid === actorId) {
            const claims = await this.store.listExpenseClaimsForRequester(actorId, me.role, "self");
            const open = claims.filter(
              (c) => c.status === "draft" || c.status === "submitted" || c.status === "pending_hr"
            );
            out.openExpenseClaimsCount = open.length;
          } else if (await this.canViewSubjectForAssistant(actorId, sid, org, managedSet)) {
            const sub = await this.store.getUser(sid);
            const claims = await this.store.listExpenseClaimsForRequester(sid, sub.role, "self");
            const open = claims.filter(
              (c) => c.status === "draft" || c.status === "submitted" || c.status === "pending_hr"
            );
            out.openExpenseClaimsCountInScope = open.length;
          }
        }
      }
    } catch {
      /* ignore */
    }

    try {
      if (await this.permissions.userHasAll(actorId, ["nexa.payslips:read"])) {
        if (subjectUserIds.length === 1) {
          const sid = subjectUserIds[0]!;
          if (sid === actorId) {
            const slips = await this.store.listPayslipsWithNewFlag(actorId);
            out.unreadNewPayslipsCount = slips.filter((s) => s.isNew).length;
          } else if (await this.canViewSubjectForAssistant(actorId, sid, org, managedSet)) {
            const slips = await this.store.listPayslipsWithNewFlag(actorId, sid);
            out.unreadNewPayslipsCountInScope = slips.filter((s) => s.isNew).length;
          }
        }
      }
    } catch {
      /* ignore */
    }

    try {
      if (await this.permissions.userHasAll(actorId, ["nexa.attendance:read"])) {
        const end = new Date();
        const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, 1));
        const pad = (n: number) => String(n).padStart(2, "0");
        const windowStart = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`;
        const windowEnd = end.toISOString().slice(0, 10);

        if (subjectUserIds.length === 1) {
          const sid = subjectUserIds[0]!;
          if (await this.canViewSubjectForAssistant(actorId, sid, org, managedSet)) {
            const rows = await this.store.listMySmartworking(sid);
            out.smartWorkingInsight = this.summarizeSmartworkingWindow(rows, windowStart, windowEnd);
          }
        } else if (subjectUserIds.length > 1) {
          const byMonth = new Map<string, number>();
          let totalApproved = 0;
          for (const sid of subjectUserIds) {
            if (!(await this.canViewSubjectForAssistant(actorId, sid, org, managedSet))) {
              continue;
            }
            const rows = await this.store.listMySmartworking(sid);
            const one = this.summarizeSmartworkingWindow(rows, windowStart, windowEnd);
            totalApproved += one.approvedInWindow;
            for (const { month, approvedDays } of one.months) {
              byMonth.set(month, (byMonth.get(month) ?? 0) + approvedDays);
            }
          }
          out.smartWorkingMultiScopeSummary = {
            windowStart,
            windowEnd,
            totalApprovedDays: totalApproved,
            months: [...byMonth.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([month, approvedDays]) => ({ month, approvedDays }))
          };
        }
      }
    } catch {
      /* ignore */
    }

    return out;
  }

  private summarizeSmartworkingWindow(
    rows: SmartworkingRequestRow[],
    windowStart: string,
    windowEnd: string
  ): {
    windowStart: string;
    windowEnd: string;
    months: { month: string; approvedDays: number }[];
    topWeekdays: { label: string; count: number }[];
    pendingInWindow: number;
    approvedInWindow: number;
  } {
    const wdLabels = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
    const byMonth = new Map<string, number>();
    const byWd = new Map<number, number>();
    let pendingInWindow = 0;
    let approvedInWindow = 0;
    for (const r of rows) {
      if (r.day < windowStart || r.day > windowEnd) {
        continue;
      }
      if (r.status === "pending") {
        pendingInWindow++;
        continue;
      }
      if (r.status !== "approved") {
        continue;
      }
      approvedInWindow++;
      const ym = r.day.slice(0, 7);
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
      const wd = new Date(`${r.day}T12:00:00Z`).getUTCDay();
      byWd.set(wd, (byWd.get(wd) ?? 0) + 1);
    }
    const months = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, approvedDays]) => ({ month, approvedDays }));
    const topWeekdays = [...byWd.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([wd, count]) => ({ label: wdLabels[wd] ?? String(wd), count }));
    return { windowStart, windowEnd, months, topWeekdays, pendingInWindow, approvedInWindow };
  }

  private buildAssistantDraft(facts: Record<string, unknown>, message: string): string {
    const m = message.toLowerCase();
    const lines: string[] = [];
    const snap = facts.snapshot as Record<string, unknown> | undefined;
    const asksSmartWorking =
      /smart\s*working|smartworking|lavoro\s*agile|lavoro\s*ibrid|ibrido|in\s+remoto|da\s+casa|telelavoro/i.test(
        message
      );
    const asksCorporateDoc = /policy|policies|document|regolamento|corporate/i.test(m);
    const wantsSituation =
      /\burgent|urgenz|priorit|c['’]è da fare|cosa devo|subito|oggi devo|checklist|dimenticat|cosa manca|da fare\b/i.test(
        m
      );
    const hasSignal =
      snap &&
      [
        snap.pendingMyLeaveRequestsCount,
        snap.pendingLeaveRequestsInScope,
        snap.pendingTeamApprovalsCount,
        snap.unreadNotificationsCount,
        snap.openExpenseClaimsCount,
        snap.openExpenseClaimsCountInScope,
        snap.unreadNewPayslipsCount,
        snap.unreadNewPayslipsCountInScope
      ].some((v) => typeof v === "number" && v > 0);
    const lowLeave = snap && snap.leaveResidualIsLow === true;

    if (asksSmartWorking) {
      lines.push("Smart working (da richieste registrate in Nexa HR):");
      const ins = snap?.smartWorkingInsight as
        | {
            windowStart: string;
            windowEnd: string;
            months: { month: string; approvedDays: number }[];
            topWeekdays: { label: string; count: number }[];
            pendingInWindow: number;
            approvedInWindow: number;
          }
        | undefined;
      const multi = snap?.smartWorkingMultiScopeSummary as
        | {
            windowStart: string;
            windowEnd: string;
            totalApprovedDays: number;
            months: { month: string; approvedDays: number }[];
          }
        | undefined;
      if (ins) {
        if (ins.approvedInWindow === 0 && ins.pendingInWindow === 0) {
          lines.push(
            `Dal ${ins.windowStart} al ${ins.windowEnd} non risultano giorni smart working approvati né richieste ancora in sospeso per il soggetto selezionato. Controlla Smart working (/smartworking) o il calendario.`
          );
        } else {
          lines.push(
            `Periodo: dal ${ins.windowStart} al ${ins.windowEnd}. Giornate approvate: ${ins.approvedInWindow}; ancora in valutazione nel periodo: ${ins.pendingInWindow}.`
          );
          if (ins.months.length) {
            lines.push(`Riepilogo mensile (approvate): ${ins.months.map((x) => `${x.month}: ${x.approvedDays}`).join(", ")}.`);
          }
          if (ins.topWeekdays.length && ins.approvedInWindow > 0) {
            lines.push(
              `Giorni della settimana più frequenti tra le approvate: ${ins.topWeekdays.map((w) => `${w.label} (${w.count})`).join(", ")}.`
            );
          }
          lines.push("Per il dettaglio giorno per giorno: Smart working (/smartworking) o Calendario lavoro (/work-calendar).");
        }
      } else if (multi) {
        lines.push(
          `Nel gruppo selezionato, dal ${multi.windowStart} al ${multi.windowEnd}, risultano ${multi.totalApprovedDays} giornate smart working approvate (somma sulle persone visibili).`
        );
        if (multi.months.length) {
          lines.push(`Per mese (somma): ${multi.months.map((x) => `${x.month}: ${x.approvedDays}`).join(", ")}.`);
        }
        lines.push(
          "Per capire le abitudini di una singola persona, imposta l’ambito «Una persona» oppure apri Smart working (/smartworking)."
        );
      } else {
        lines.push(
          "Non risultano dati smart working visibili per questo ambito con i permessi attuali (serve almeno consultazione presenze / dati del soggetto). Verifica ambito e permessi, oppure apri Smart working (/smartworking)."
        );
      }
      lines.push("");
    }

    if (wantsSituation || hasSignal || lowLeave) {
      lines.push("Situazione rapida (da dati aggiornati in app):");
      if (typeof snap?.pendingMyLeaveRequestsCount === "number" && snap.pendingMyLeaveRequestsCount > 0) {
        lines.push(
          `• Richieste ferie/permesso in sospeso per il soggetto selezionato: ${snap.pendingMyLeaveRequestsCount} (Workflow).`
        );
      }
      if (typeof snap?.pendingLeaveRequestsInScope === "number" && snap.pendingLeaveRequestsInScope > 0) {
        lines.push(
          `• Richieste ferie/permesso in sospeso (somma sul gruppo selezionato): ${snap.pendingLeaveRequestsInScope} (Workflow).`
        );
      }
      if (typeof snap?.pendingTeamApprovalsCount === "number" && snap.pendingTeamApprovalsCount > 0) {
        lines.push(
          `• Come responsabile hai ${snap.pendingTeamApprovalsCount} approvazione/i in sospeso: apri Workflow → Approvazioni team.`
        );
      }
      if (typeof snap?.unreadNotificationsCount === "number" && snap.unreadNotificationsCount > 0) {
        lines.push(`• Notifiche non lette: ${snap.unreadNotificationsCount} (controlla il centro notifiche in alto nell’app).`);
      }
      if (typeof snap?.openExpenseClaimsCount === "number" && snap.openExpenseClaimsCount > 0) {
        lines.push(`• Note spese da completare o in approvazione: ${snap.openExpenseClaimsCount} (sezione Spese).`);
      }
      if (typeof snap?.openExpenseClaimsCountInScope === "number" && snap.openExpenseClaimsCountInScope > 0) {
        lines.push(
          `• Note spese aperte nell’ambito selezionato: ${snap.openExpenseClaimsCountInScope} (sezione Spese).`
        );
      }
      if (typeof snap?.unreadNewPayslipsCount === "number" && snap.unreadNewPayslipsCount > 0) {
        lines.push(`• Cedolini nuovi o non segnati come letti: ${snap.unreadNewPayslipsCount} (sezione Cedolini).`);
      }
      if (typeof snap?.unreadNewPayslipsCountInScope === "number" && snap.unreadNewPayslipsCountInScope > 0) {
        lines.push(
          `• Cedolini non letti nell’ambito selezionato: ${snap.unreadNewPayslipsCountInScope} (sezione Cedolini).`
        );
      }
      if (lowLeave && typeof snap?.leaveResidualDays === "number") {
        lines.push(`• Ferie residue basse (${snap.leaveResidualDays} giorni): valuta se pianificare il riposo in Workflow.`);
      }
      if (lines.length === 1) {
        lines.push(
          "• Non risultano richieste tue in attesa, né approvazioni team pendenti, né notifiche non lette, né note spese aperte o cedolini nuovi secondo i dati che vediamo ora. Controlla comunque Workflow e le notifiche per sicurezza."
        );
      }
    }

    const bal = facts.leaveBalance as { residualDays?: number; usedDays?: number; allocatedDays?: number } | undefined;
    if (bal && (m.includes("ferie") || m.includes("saldo") || m.includes("vacation"))) {
      lines.push(
        `Saldo ferie: residuo ${bal.residualDays ?? 0} giorni (usati ${bal.usedDays ?? 0} su ${bal.allocatedDays ?? 0} assegnati).`
      );
    }
    const pol = facts.policySnippets as { title: string }[] | undefined;
    if (pol?.length && (!asksSmartWorking || asksCorporateDoc)) {
      lines.push(`Documenti Corporate Policies disponibili: ${pol.map((p) => p.title).join(", ")}.`);
    }
    if (lines.length === 0) {
      lines.push(
        "Sono il punto di accesso centrale per orientarti su Nexa HR: chiedi pure su ferie, cedolini, spese, policy, organigramma, report, turni o amministrazione — indico sempre dove andare nell’app."
      );
    }
    lines.push(
      "Percorsi frequenti: Workflow (ferie/permessi/malattia); Approvazioni team se sei responsabile; Cedolini; Spese; Corporate Policies; Dashboard e Calendario lavoro per la giornata."
    );
    lines.push("Per inviare una richiesta ufficiale usa i moduli in Workflow: lì resta la traccia corretta.");
    return lines.join("\n");
  }

  async nlQueryRun(
    auth: { userId: string; role: AuthRole },
    body: { queryId: string }
  ): Promise<{ queryId: string; table: Record<string, unknown>[]; summary: string }> {
    const catalog = this.nlQueryCatalog().queries;
    const entry = catalog.find((q) => q.id === body.queryId);
    if (!entry) {
      throw new BadRequestException("queryId non nel catalogo");
    }
    for (const p of entry.requiredPermissions) {
      if (!(await this.permissions.userHasAll(auth.userId, [p]))) {
        throw new ForbiddenException("Non hai accesso a questa informazione. Se ti serve, chiedi a HR.");
      }
    }
    const me = await this.store.getUser(auth.userId);
    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      let table: Record<string, unknown>[] = [];
      const sources: string[] = [body.queryId];
      if (body.queryId === "my_leave_balance") {
        const y = new Date().getFullYear();
        const b = await this.store.getLeaveBalance(auth.userId, y);
        table = [{ year: b.year, allocatedDays: b.allocatedDays, usedDays: b.usedDays, residualDays: b.residualDays }];
      } else if (body.queryId === "my_pending_leaves") {
        const leaves = await this.store.listLeave(auth.userId);
        table = leaves
          .filter((l) => l.status === "pending")
          .map((l) => ({
            id: l.id,
            startDate: l.startDate,
            endDate: l.endDate,
            status: l.status,
            kind: l.kind ?? "annual"
          }));
      } else if (body.queryId === "my_payslip_headline") {
        const slips = await this.store.listPayslips(auth.userId);
        const pub = slips.filter((s) => (s.status ?? "published") === "published").sort((a, b) => b.period.localeCompare(a.period));
        const last = pub[0];
        table = last
          ? [
              {
                period: last.period,
                grossSalary: last.grossSalary,
                netSalary: last.netSalary,
                userId: last.userId
              }
            ]
          : [];
      }
      const summaryDraft =
        table.length === 0
          ? `Non ci sono righe da mostrare per «${entry.label}».`
          : `Ecco il riepilogo richiesto («${entry.label}»): ${table.length} ${table.length === 1 ? "riga" : "righe"}.`;
      const wrapped = { envelope: { summary: summaryDraft, rows: table } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_NL);
      const { result: cleared } = await this.depseudoAfterOptionalRefine(sessionId, pseudo, SCHEMA_NL);
      const clearedNl = cleared as { envelope?: { summary?: string; rows?: Record<string, unknown>[] } };
      const summary = clearedNl.envelope?.summary ?? summaryDraft;
      const rowsOut = Array.isArray(clearedNl.envelope?.rows) ? clearedNl.envelope!.rows! : table;
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "nl_query",
        schemaVersion: SCHEMA_NL,
        sessionId,
        inputForFingerprint: { queryId: body.queryId },
        dataSources: sources,
        responseSizeBytes: Buffer.byteLength(JSON.stringify({ summary, rows: rowsOut }), "utf8"),
        outcome: "ok"
      });
      return { queryId: body.queryId, table: rowsOut, summary };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async nlQuerySaveView(
    auth: { userId: string; role: AuthRole },
    body: { label: string; queryId: string }
  ): Promise<{ ok: boolean; label: string; queryId: string }> {
    const me = await this.store.getUser(auth.userId);
    const catalogIds = new Set(this.nlQueryCatalog().queries.map((q) => q.id));
    if (!catalogIds.has(body.queryId)) {
      throw new BadRequestException("queryId non nel catalogo");
    }
    await this.audit.append({
      companyId: me.companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "nl_query_save_view",
      schemaVersion: SCHEMA_NL,
      inputForFingerprint: { label: body.label, queryId: body.queryId },
      dataSources: ["nl_query_catalog"],
      outcome: "logged_only"
    });
    return { ok: true, label: body.label.trim(), queryId: body.queryId };
  }

  async anomalies(
    auth: { userId: string; role: AuthRole }
  ): Promise<{ items: { code: string; severity: string; message: string }[]; explanation: string }> {
    const me = await this.store.getUser(auth.userId);
    if (!(await this.permissions.userHasAll(auth.userId, ["nexa.leaves:read"]))) {
      throw new ForbiddenException("Anomalie base richiedono visibilità ferie");
    }
    const items: { code: string; severity: string; message: string }[] = [];
    const year = new Date().getFullYear();
    const bal = await this.store.getLeaveBalance(auth.userId, year);
    if (bal.residualDays <= 3) {
      items.push({
        code: "LOW_LEAVE_RESIDUAL",
        severity: "warning",
        message: `Residuo ferie annue basso (${bal.residualDays} giorni).`
      });
    }
    const leaves = await this.store.listLeave(auth.userId);
    const pending = leaves.filter((l) => l.status === "pending").length;
    if (pending >= 3) {
      items.push({
        code: "MANY_PENDING_LEAVE_REQUESTS",
        severity: "info",
        message: `${pending} richieste ferie ancora in attesa di approvazione.`
      });
    }
    if ((await this.permissions.userHasAll(auth.userId, ["nexa.payslips:read"])) && items.length === 0) {
      const slips = await this.store.listPayslips(auth.userId);
      const pub = slips.filter((s) => (s.status ?? "published") === "published").sort((a, b) => b.period.localeCompare(a.period));
      if (pub.length >= 2) {
        const [a, b0] = pub;
        if (a && b0 && b0.netSalary > 0 && a.netSalary < b0.netSalary * 0.9) {
          items.push({
            code: "NET_DROP_MOM",
            severity: "warning",
            message: "Il netto del cedolino più recente risulta sensibilmente inferiore al precedente: verificare trattenute o variabili del mese."
          });
        }
      }
    }
    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const explainDraft = this.buildAnomalyExplanation(items);
      const wrapped = { envelope: { items, explanation: explainDraft } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_ANOMALIES);
      const { result: cleared } = await this.depseudoAfterOptionalRefine(sessionId, pseudo, SCHEMA_ANOMALIES);
      const clearedAn = cleared as { envelope?: { explanation?: string; items?: typeof items } };
      const explanation =
        typeof clearedAn.envelope?.explanation === "string" ? clearedAn.envelope.explanation : explainDraft;
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "anomalies",
        schemaVersion: SCHEMA_ANOMALIES,
        sessionId,
        inputForFingerprint: { codes: items.map((i) => i.code) },
        dataSources: ["leave_balance", "leave_requests", "payslips_optional"],
        responseSizeBytes: Buffer.byteLength(JSON.stringify({ items, explanation }), "utf8"),
        outcome: "ok"
      });
      return { items: clearedAn.envelope?.items ?? items, explanation };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private buildAnomalyExplanation(items: { code: string; severity: string; message: string }[]): string {
    if (items.length === 0) {
      return "Tutto tranquillo: al momento non emergono segnali da segnalarti su ferie e cedolini.";
    }
    return "Ecco cosa abbiamo notato, in parole semplici:";
  }

  async triage(
    auth: { userId: string; role: AuthRole },
    body: { text: string }
  ): Promise<{ category: string; priority: string; rationale: string; suggestedPath: string | null }> {
    const me = await this.store.getUser(auth.userId);
    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const wrapped = { envelope: { text: body.text.trim() } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_TRIAGE);
      const clearedText = (await this.gateway.fromModelResponse(sessionId, pseudo.pseudonymized)) as {
        envelope?: { text?: string };
      };
      const text = typeof clearedText.envelope?.text === "string" ? clearedText.envelope.text : body.text;
      const result = this.ruleBasedTriage(text);
      let rationaleOut = result.rationale;
      if (this.openAi.isActive()) {
        const rationaleWrapped = {
          envelope: {
            rationaleSeed: result.rationale,
            category: result.category,
            priority: result.priority,
            suggestedPath: result.suggestedPath
          }
        };
        const pseudoR = await this.gateway.toModelPayload(sessionId, rationaleWrapped, SCHEMA_TRIAGE_RATIONALE);
        const { result: clearedR } = await this.depseudoAfterOptionalRefine(sessionId, pseudoR, SCHEMA_TRIAGE_RATIONALE);
        const clearedT = clearedR as { envelope?: { rationale?: string } };
        if (typeof clearedT.envelope?.rationale === "string" && clearedT.envelope.rationale.trim()) {
          rationaleOut = clearedT.envelope.rationale.trim();
        }
      }
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "triage",
        schemaVersion: SCHEMA_TRIAGE,
        sessionId,
        inputForFingerprint: { len: body.text.length },
        dataSources: ["triage_rules"],
        responseSizeBytes: Buffer.byteLength(
          JSON.stringify({ ...result, rationale: rationaleOut }),
          "utf8"
        ),
        outcome: "ok"
      });
      return { ...result, rationale: rationaleOut };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private ruleBasedTriage(text: string): {
    category: string;
    priority: string;
    rationale: string;
    suggestedPath: string | null;
  } {
    const t = text.toLowerCase();
    if (/urgent|urgente|immediat|bloccante/.test(t)) {
      return {
        category: "urgent",
        priority: "high",
        rationale: "Il testo sembra richiedere attenzione veloce: conviene contattare HR o il responsabile al più presto.",
        suggestedPath: "/workflow"
      };
    }
    if (/ferie|permesso|leave/.test(t)) {
      return {
        category: "leave",
        priority: "normal",
        rationale: "Sembra una richiesta su ferie, permessi o assenze.",
        suggestedPath: "/workflow"
      };
    }
    if (/cedolin|paga|stipend|netto|lordo/.test(t)) {
      return {
        category: "payroll",
        priority: "normal",
        rationale: "Sembra riguardare stipendio, trattenute o cedolini.",
        suggestedPath: "/payslips"
      };
    }
    if (/spes[ae]|rimbor|scontrin|nota spes|chilometr|km\b/.test(t)) {
      return {
        category: "general",
        priority: "normal",
        rationale: "Sembra riguardare note spese o rimborsi.",
        suggestedPath: "/expenses"
      };
    }
    if (/malatt|certificat/.test(t)) {
      return {
        category: "sickness",
        priority: "normal",
        rationale: "Sembra riguardare malattia, certificati o permessi per visita medica.",
        suggestedPath: "/workflow"
      };
    }
    return {
      category: "general",
      priority: "low",
      rationale: "Non abbiamo riconosciuto un tema specifico: in caso di dubbio rivolgiti a HR.",
      suggestedPath: "/settings"
    };
  }
}
