import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { EmployeeDocumentKind, User } from "@payday/domain";
import { CorporatePoliciesService } from "../corporate-policies/corporate-policies.service";
import { HR_ONBOARDING_WIZARD_STEPS } from "../hr-onboarding/hr-onboarding.constants";
import { HrDataStore } from "../platform/hr-data.store";
import { RecruitingService } from "../recruiting/recruiting.service";
import { TrainingService, type TrainingCourseDto } from "../training/training.service";
import { COWORK_DOMAIN_LABELS } from "./cowork.constants";
import { getCoworkTool } from "./cowork-tool-catalog";
import type {
  CoworkDomain,
  CoworkPlanRow,
  CoworkPlanSection,
  CoworkPlannerSectionSpec
} from "./cowork.types";

export type ScopeUser = Pick<User, "id" | "fullName" | "costCenterId" | "teamId">;

@Injectable()
export class CoworkPlanHydrationService {
  constructor(
    private readonly store: HrDataStore,
    private readonly training: TrainingService,
    private readonly corporatePolicies: CorporatePoliciesService,
    private readonly recruiting: RecruitingService
  ) {}

  filterScopeUsers(users: User[], costCenterId?: string, teamId?: string): ScopeUser[] {
    let list = users.filter((u) => u.role !== "superuser" || users.length === 1);
    if (costCenterId?.trim()) {
      list = list.filter((u) => u.costCenterId === costCenterId.trim());
    }
    if (teamId?.trim()) {
      list = list.filter((u) => u.teamId === teamId.trim());
    }
    return list.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      costCenterId: u.costCenterId,
      teamId: u.teamId
    }));
  }

  sectionTitleForDomain(domain: CoworkDomain, custom?: string): string {
    if (custom?.trim()) {
      return custom.trim();
    }
    return COWORK_DOMAIN_LABELS[domain] ?? domain;
  }

  buildSectionsFromSpecs(
    specs: CoworkPlannerSectionSpec[],
    rowsByTool: Map<string, CoworkPlanRow[]>
  ): { sections: CoworkPlanSection[]; rows: CoworkPlanRow[] } {
    const sections: CoworkPlanSection[] = [];
    const allRows: CoworkPlanRow[] = [];

    for (const spec of specs) {
      const sectionId = randomUUID();
      const tool = spec.tool;
      const domainRows = (rowsByTool.get(tool) ?? []).map((row) => ({
        ...row,
        sectionId,
        domain: spec.domain,
        toolId: tool
      }));
      sections.push({
        sectionId,
        domain: spec.domain,
        toolId: tool,
        title: spec.title,
        rows: domainRows
      });
      allRows.push(...domainRows);
    }

    return { sections, rows: allRows };
  }

  async buildRowsForTool(
    toolId: string,
    companyId: string,
    scopeUsers: ScopeUser[],
    message: string,
    actorUserId: string,
    actorFullName: string
  ): Promise<CoworkPlanRow[]> {
    const tool = getCoworkTool(toolId);
    if (!tool) {
      return [];
    }
    if (!tool.executable) {
      return [];
    }

    const legacyDomainTools: Record<string, CoworkDomain> = {
      renew_agreements: "smartworking_agreements",
      extend_approved_requests: "smartworking_requests",
      update_contract_sw_clause: "employment_contracts"
    };
    const legacyDomain = legacyDomainTools[toolId];
    if (legacyDomain) {
      const rows = await this.buildRows(legacyDomain, companyId, scopeUsers, message);
      return rows.map((r) => ({ ...r, toolId }));
    }

    const sid = randomUUID();

    switch (toolId) {
      case "create_meeting_room_booking":
        return this.buildMeetingRoomBookingRows(sid, toolId, actorUserId, actorFullName, message);
      case "cancel_meeting_room_booking":
        return this.buildCancelBookingRows(sid, toolId, actorUserId, actorFullName, message);
      case "create_leave_plan":
        return this.buildLeavePlanRows(sid, toolId, scopeUsers, message);
      case "create_smartworking_request":
        return this.buildSmartworkingRequestRows(sid, toolId, scopeUsers, message);
      case "create_travel_request":
        return this.buildTravelRequestRows(sid, toolId, scopeUsers, message);
      case "create_sickness_report":
        return this.buildSicknessRows(sid, toolId, scopeUsers, message);
      case "approve_pending_leaves":
        return this.buildApproveLeaveRows(sid, toolId, scopeUsers);
      case "approve_pending_smartworking":
        return this.buildApproveSmartworkingRows(sid, toolId, scopeUsers);
      case "create_shift_batch":
        return this.buildShiftBatchRows(sid, toolId, scopeUsers, message);
      case "start_offboarding":
        return this.buildOffboardingRows(sid, toolId, scopeUsers);
      case "update_leave_allowance":
        return this.buildLeaveAllowanceRows(sid, toolId, scopeUsers, message);
      case "publish_payslips_period":
        return this.buildPublishPayslipsRows(sid, toolId, message);
      case "create_expense_claim":
        return this.buildExpenseClaimRows(sid, toolId, scopeUsers, message);
      case "approve_pending_expenses":
        return this.buildApproveExpenseRows(sid, toolId, scopeUsers, actorUserId);
      case "create_innovation_job":
        return this.buildInnovationJobRows(sid, toolId, actorUserId, actorFullName, message);
      case "training_batch":
        return this.buildTrainingBatchRows(sid, toolId, companyId, scopeUsers, message);
      case "assign_training_course":
        return this.buildAssignTrainingCourseRows(sid, toolId, companyId, scopeUsers, message);
      case "start_onboarding_from_candidate":
        return this.buildOnboardingFromCandidateRows(sid, toolId, actorUserId, actorFullName, message);
      case "onboarding_wizard_reminder":
        return this.buildOnboardingReminderRows(sid, toolId, companyId, scopeUsers);
      case "upload_employee_document":
        return this.buildUploadDocumentRows(sid, toolId, scopeUsers, message);
      case "link_document_ack":
        return this.buildDocumentAckRows(sid, toolId, scopeUsers, message);
      case "corporate_policy_publish":
        return this.buildCorporatePolicyPublishRows(sid, toolId, companyId, scopeUsers, message);
      case "run_hr_center_recap":
        return this.buildHrCenterRecapRows(sid, toolId, scopeUsers);
      case "run_retention_analysis":
        return this.buildRetentionRefreshRows(sid, toolId, actorUserId, actorFullName);
      case "evaluate_hr_alerts":
        return this.buildEvaluateHrAlertsRows(sid, toolId, actorUserId, actorFullName);
      case "hr_recap_reminder":
        return this.buildHrRecapReminderRows(sid, toolId, companyId, scopeUsers, message);
      case "payroll_batch_generate":
        return this.buildPayrollBatchRows(sid, toolId, scopeUsers, message);
      case "compensation_benchmark_estimate":
        return this.buildCompensationBenchmarkRows(sid, toolId, scopeUsers, message);
      case "personnel_budget_adjust":
        return await this.buildPersonnelBudgetAdjustRows(sid, toolId, scopeUsers, message);
      case "export_employees_preview":
        return this.buildExportEmployeesPreviewRows(sid, toolId, scopeUsers);
      case "recruiting_linkedin_sync":
        return this.buildRecruitingLinkedInSyncRows(sid, toolId, companyId, message);
      case "third_party_license_assign":
        return this.buildThirdPartyLicenseAssignRows(sid, toolId, companyId, scopeUsers, message);
      case "sync_team_calendar_view":
        return this.buildTeamCalendarExportRows(sid, toolId, scopeUsers, message);
      case "attendance_qr_batch":
        return this.buildAttendanceQrBatchRows(sid, toolId, scopeUsers, message);
      default:
        return [];
    }
  }

  private attachHighRiskRationale(row: CoworkPlanRow, toolId: string): CoworkPlanRow {
    const tool = getCoworkTool(toolId);
    if (!tool?.highRisk) {
      return row;
    }
    return {
      ...row,
      rationale:
        row.rationale ??
        "Operazione payroll ad alto impatto: verifica periodo, bozze e perimetro prima di applicare."
    };
  }

  groupRowsIntoSections(rows: CoworkPlanRow[], sectionMeta?: CoworkPlanSectionMeta[]): CoworkPlanSection[] {
    const titleBySection = new Map(
      (sectionMeta ?? []).map((m) => [m.sectionId, m.title] as const)
    );
    const domainBySection = new Map(
      (sectionMeta ?? []).map((m) => [m.sectionId, m.domain] as const)
    );
    const order: string[] = [];
    const bySection = new Map<string, CoworkPlanRow[]>();

    for (const row of rows) {
      if (!bySection.has(row.sectionId)) {
        order.push(row.sectionId);
        bySection.set(row.sectionId, []);
      }
      bySection.get(row.sectionId)!.push(row);
    }

    return order.map((sectionId) => {
      const sectionRows = bySection.get(sectionId) ?? [];
      const domain = domainBySection.get(sectionId) ?? sectionRows[0]?.domain ?? "unknown";
      const toolId = sectionRows[0]?.toolId ?? "";
      return {
        sectionId,
        domain,
        toolId,
        title: titleBySection.get(sectionId) ?? this.sectionTitleForDomain(domain),
        rows: sectionRows
      };
    });
  }

  templateSummary(domain: CoworkDomain, count: number, message: string): string {
    const labels: Partial<Record<CoworkDomain, string>> = {
      smartworking_agreements: "accordi smart working",
      smartworking_requests: "estensioni richieste smart working",
      employment_contracts: "aggiornamenti contrattuali con clausola SW",
      calendar: "calendario e prenotazioni",
      time_off: "assenze e permessi",
      lifecycle: "lifecycle HR",
      training: "assegnazioni formazione",
      compensation: "payroll e compensation",
      org: "organizzazione",
      generic: "operazioni HR",
      unknown: "operazioni"
    };
    return `Piano ${labels[domain] ?? domain} per ${count} dipendenti nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`;
  }

  multiSectionSummary(sectionCount: number, rowCount: number, message: string): string {
    return `Piano con ${sectionCount} area/e operative e ${rowCount} righe nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`;
  }

  parseYear(message: string): number {
    const m = message.match(/\b(20\d{2})\b/);
    if (m) {
      return Number(m[1]);
    }
    return new Date().getFullYear();
  }

  parseEndDate(message: string, year: number): string {
    const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) {
      return iso[1]!;
    }
    if (/\b31\/12\b|\bfine anno\b|\b31-12\b/.test(message.toLowerCase())) {
      return `${year}-12-31`;
    }
    return `${year}-12-31`;
  }

  private parseIsoDatesFromMessage(message: string): string[] {
    return [...message.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]!);
  }

  /** JavaScript UTC weekday (0 = Sunday … 6 = Saturday). */
  parseWeekdaysFromMessage(message: string): number[] {
    const m = message
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const found = new Set<number>();
    const rules: Array<[RegExp, number]> = [
      [/\bluned[iì]\b/, 1],
      [/\bmarted[iì]\b/, 2],
      [/\bmercoled[iì]\b/, 3],
      [/\bgioved[iì]\b/, 4],
      [/\bvenerd[iì]\b/, 5],
      [/\bsabato\b/, 6],
      [/\bdomenica\b/, 0],
      [/\bmonday\b/, 1],
      [/\btuesday\b/, 2],
      [/\bwednesday\b/, 3],
      [/\bthursday\b/, 4],
      [/\bfriday\b/, 5],
      [/\bsaturday\b/, 6],
      [/\bsunday\b/, 0]
    ];
    for (const [re, wd] of rules) {
      if (re.test(m)) {
        found.add(wd);
      }
    }
    return [...found].sort((a, b) => a - b);
  }

  parseMonthFromMessage(message: string): number | null {
    const m = message
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const named: Array<[RegExp, number]> = [
      [/\b(gennaio|january|jan)\b/, 1],
      [/\b(febbraio|february|feb)\b/, 2],
      [/\b(marzo|march|mar)\b/, 3],
      [/\b(aprile|april|apr)\b/, 4],
      [/\b(maggio|may)\b/, 5],
      [/\b(giugno|june|jun)\b/, 6],
      [/\b(luglio|july|jul)\b/, 7],
      [/\b(agosto|august|aug)\b/, 8],
      [/\b(settembre|september|sep|sept)\b/, 9],
      [/\b(ottobre|october|oct)\b/, 10],
      [/\b(novembre|november|nov)\b/, 11],
      [/\b(dicembre|december|dec)\b/, 12]
    ];
    for (const [re, month] of named) {
      if (re.test(m)) {
        return month;
      }
    }
    const ym = message.match(/\b(20\d{2})-(\d{2})(?:-\d{2})?\b/);
    if (ym) {
      const month = Number(ym[2]);
      if (month >= 1 && month <= 12) {
        return month;
      }
    }
    return null;
  }

  private monthIsoRange(year: number, month: number): { from: string; to: string } {
    const mm = String(month).padStart(2, "0");
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
  }

  private addCalendarDayUtc(iso: string, delta: number): string {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  private enumerateDaysInclusive(from: string, to: string): string[] {
    const out: string[] = [];
    let cur = from.slice(0, 10);
    const end = to.slice(0, 10);
    while (cur <= end) {
      out.push(cur);
      if (cur === end) {
        break;
      }
      cur = this.addCalendarDayUtc(cur, 1);
    }
    return out;
  }

  /**
   * Espande pattern NL tipo «ogni lunedì di maggio 2026» in date ISO (una richiesta SW per giorno).
   * Vuoto se il messaggio non descrive ricorrenza per weekday.
   */
  expandSmartworkingDaysFromMessage(message: string): string[] {
    const weekdays = this.parseWeekdaysFromMessage(message);
    if (weekdays.length === 0) {
      return [];
    }

    const year = this.parseYear(message);
    const month = this.parseMonthFromMessage(message);
    const isoDates = this.parseIsoDatesFromMessage(message);

    let from: string;
    let to: string;
    if (isoDates.length >= 2) {
      const sorted = [...isoDates].sort();
      from = sorted[0]!;
      to = sorted[sorted.length - 1]!;
    } else if (month != null) {
      ({ from, to } = this.monthIsoRange(year, month));
    } else {
      return [];
    }

    const norm = message
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const recurringCue =
      /\b(ogni|tutti i|tutte le|every|each)\b/.test(norm) ||
      month != null ||
      /\b(luned|marted|mercoled|gioved|venerd|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(di|in|del|da|for|of)\b/.test(
        norm
      );
    if (!recurringCue) {
      return [];
    }

    const days: string[] = [];
    for (const d of this.enumerateDaysInclusive(from, to)) {
      const wd = new Date(`${d}T12:00:00.000Z`).getUTCDay();
      if (weekdays.includes(wd)) {
        days.push(d);
      }
    }
    return days;
  }

  private defaultCalendarRange(message: string): { from: string; to: string } {
    const dates = this.parseIsoDatesFromMessage(message);
    if (dates.length >= 2) {
      const sorted = [...dates].sort();
      return { from: sorted[0]!, to: sorted[sorted.length - 1]! };
    }
    if (dates.length === 1) {
      return { from: dates[0]!, to: dates[0]! };
    }
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - now.getDay() + 1);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(from), to: fmt(to) };
  }

  private parseAttendanceDay(message: string): string {
    const dates = this.parseIsoDatesFromMessage(message);
    if (dates[0]) {
      return dates[0];
    }
    return new Date().toISOString().slice(0, 10);
  }

  async buildAggregates(
    domain: CoworkDomain,
    companyId: string,
    users: ScopeUser[]
  ): Promise<Record<string, unknown>> {
    const sb = this.store.getServiceRoleClient();
    if (domain === "smartworking_agreements") {
      const { data } = await sb
        .from("smartworking_agreements")
        .select("user_id, valid_to, status")
        .eq("company_id", companyId)
        .eq("status", "active");
      const activeByUser = new Set((data ?? []).map((r) => String((r as { user_id: string }).user_id)));
      const withoutAgreement = users.filter((u) => !activeByUser.has(u.id)).length;
      return {
        scopeHeadcount: users.length,
        withoutActiveAgreement: withoutAgreement,
        withActiveAgreement: users.length - withoutAgreement
      };
    }
    if (domain === "smartworking_requests") {
      const { data } = await sb.from("smartworking_requests").select("userId, status, day, endDay").eq("status", "approved");
      const approved = (data ?? []) as Array<{ userId: string; day: string; endDay?: string | null }>;
      const scopeIds = new Set(users.map((u) => u.id));
      const inScope = approved.filter((r) => scopeIds.has(r.userId));
      return {
        scopeHeadcount: users.length,
        approvedRequestsInScope: inScope.length
      };
    }
    if (domain === "employment_contracts") {
      const { data } = await sb
        .from("hr_standard_contracts")
        .select("id, party, signed_by_user_id")
        .eq("company_id", companyId);
      const scopeIds = new Set(users.map((u) => u.id));
      let withContract = 0;
      for (const row of data ?? []) {
        const party = (row as { party?: Record<string, unknown> }).party ?? {};
        const signedBy = (row as { signed_by_user_id?: string | null }).signed_by_user_id;
        const empId = party.employeeUserId ?? signedBy;
        if (empId && scopeIds.has(String(empId))) {
          withContract += 1;
        }
      }
      return {
        scopeHeadcount: users.length,
        withStandardContract: withContract,
        withoutStandardContract: users.length - withContract
      };
    }
    if (domain === "training") {
      const courses = await this.training.listCourses(companyId);
      return {
        scopeHeadcount: users.length,
        availableCourses: courses.length,
        mandatoryCourses: courses.filter((c) => c.category === "mandatory").length
      };
    }
    if (domain === "onboarding") {
      return { scopeHeadcount: users.length, onboardingFromCandidateAvailable: true };
    }
    if (domain === "documents") {
      return { scopeHeadcount: users.length, documentVaultAvailable: true };
    }
    if (domain === "calendar") {
      const rooms = await this.store.listMeetingRooms(users[0]?.id ?? "");
      return { scopeHeadcount: users.length, meetingRoomsAvailable: rooms.length };
    }
    if (domain === "time_off") {
      let pendingLeaves = 0;
      for (const u of users.slice(0, 20)) {
        const leaves = await this.store.listLeave(u.id);
        pendingLeaves += leaves.filter((l) => l.status === "pending").length;
      }
      return { scopeHeadcount: users.length, pendingLeavesSample: pendingLeaves };
    }
    if (domain === "lifecycle") {
      return { scopeHeadcount: users.length, offboardingStartAvailable: true };
    }
    if (domain === "compensation") {
      return { scopeHeadcount: users.length };
    }
    return { scopeHeadcount: users.length };
  }

  async buildRows(
    domain: CoworkDomain,
    companyId: string,
    users: ScopeUser[],
    message: string,
    sectionId?: string
  ): Promise<CoworkPlanRow[]> {
    const sid = sectionId ?? randomUUID();
    const year = this.parseYear(message);
    const validFrom = `${year}-01-01`;
    const validTo = this.parseEndDate(message, year);
    const sb = this.store.getServiceRoleClient();

    if (domain === "smartworking_agreements") {
      const { data } = await sb
        .from("smartworking_agreements")
        .select("id, user_id, valid_to, policy_version")
        .eq("company_id", companyId)
        .eq("status", "active");
      const byUser = new Map<string, { id: string; validTo: string; policyVersion: string }>();
      for (const row of data ?? []) {
        const r = row as { id: string; user_id: string; valid_to: string; policy_version: string };
        byUser.set(r.user_id, { id: r.id, validTo: r.valid_to, policyVersion: r.policy_version });
      }

      return users.map((u) => {
        const existing = byUser.get(u.id);
        const action = existing ? "renew_agreement" : "create_agreement";
        const detail = existing
          ? `Rinnovo ${existing.validTo.slice(0, 10)} → ${validTo} (${year})`
          : `Nuovo accordo ${validFrom} → ${validTo} (${year})`;
        return {
          id: randomUUID(),
          sectionId: sid,
          domain,
          toolId: "renew_agreements",
          userId: u.id,
          fullName: u.fullName,
          action,
          detail,
          rationale: "Allineamento annuale policy smart working",
          status: "proposed" as const,
          payload: {
            userId: u.id,
            agreementId: existing?.id ?? null,
            validFrom,
            validTo,
            policyVersion: String(year)
          }
        };
      });
    }

    if (domain === "smartworking_requests") {
      const { data } = await sb.from("smartworking_requests").select("*").eq("status", "approved");
      const scopeIds = new Set(users.map((u) => u.id));
      const rows: CoworkPlanRow[] = [];
      for (const raw of data ?? []) {
        const r = raw as {
          id: string;
          userId: string;
          day: string;
          endDay?: string | null;
          note?: string | null;
        };
        if (!scopeIds.has(r.userId)) {
          continue;
        }
        const user = users.find((u) => u.id === r.userId);
        const currentEnd = (r.endDay ?? r.day).slice(0, 10);
        if (currentEnd >= validTo) {
          continue;
        }
        rows.push({
          id: randomUUID(),
          sectionId: sid,
          domain,
          toolId: "extend_approved_requests",
          userId: r.userId,
          fullName: user?.fullName ?? r.userId,
          action: "extend_request",
          detail: `${r.day.slice(0, 10)}–${currentEnd} → fine ${validTo}`,
          rationale: "Estensione periodo approvato",
          status: "proposed",
          payload: {
            requestId: r.id,
            day: r.day,
            newEndDay: validTo,
            note: r.note
          }
        });
      }
      return rows;
    }

    if (domain === "employment_contracts") {
      const { data } = await sb
        .from("hr_standard_contracts")
        .select("id, title, party, signed_by_user_id, status")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });

      const bestByUser = new Map<string, { id: string; title: string; status: string }>();
      for (const raw of data ?? []) {
        const row = raw as {
          id: string;
          title: string;
          party: Record<string, unknown>;
          signed_by_user_id?: string | null;
          status: string;
        };
        const empId = row.party?.employeeUserId ?? row.signed_by_user_id;
        if (!empId) {
          continue;
        }
        const uid = String(empId);
        if (!bestByUser.has(uid)) {
          bestByUser.set(uid, { id: row.id, title: row.title, status: row.status });
        }
      }

      return users.map((u) => {
        const contract = bestByUser.get(u.id);
        if (contract) {
          return {
            id: randomUUID(),
            sectionId: sid,
            domain,
            toolId: "update_contract_sw_clause",
            userId: u.id,
            fullName: u.fullName,
            action: "update_contract_sw_clause",
            detail: `${contract.title} (${contract.status}) → clausola SW ${year}`,
            rationale: "Rinnovo clausola agile su contratto esistente",
            status: "proposed" as const,
            payload: {
              userId: u.id,
              contractId: contract.id,
              policyYear: year
            }
          };
        }
        return {
          id: randomUUID(),
          sectionId: sid,
          domain,
          toolId: "update_contract_sw_clause",
          userId: u.id,
          fullName: u.fullName,
          action: "create_contract_draft",
          detail: `Nuova bozza contratto con clausola SW ${year}`,
          rationale: "Nessun contratto standard collegato",
          status: "proposed" as const,
          payload: {
            userId: u.id,
            policyYear: year,
            title: `Contratto SW ${year} — ${u.fullName}`
          }
        };
      });
    }

    return [];
  }

  primaryDomainFromSections(sections: CoworkPlanSection[]): CoworkDomain {
    const executable = sections.find((s) => s.domain !== "unknown");
    return executable?.domain ?? sections[0]?.domain ?? "unknown";
  }

  parseUuidsFromMessage(message: string): string[] {
    const out: string[] = [];
    const re = /\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/gi;
    for (const m of message.matchAll(re)) {
      const id = m[1]!;
      if (!out.includes(id)) {
        out.push(id);
      }
    }
    return out;
  }

  parseTrainingDueDate(message: string): string {
    const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) {
      return iso[1]!;
    }
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }

  async resolveTrainingCourseIds(companyId: string, message: string, single = false): Promise<string[]> {
    const courses = await this.training.listCourses(companyId);
    const uuids = this.parseUuidsFromMessage(message);
    const byUuid = uuids.filter((id) => courses.some((c) => c.id === id));
    if (byUuid.length > 0) {
      return single ? [byUuid[0]!] : byUuid;
    }

    const m = message.toLowerCase();
    const keywordMatchers: Array<{ test: RegExp; match: (c: TrainingCourseDto) => boolean }> = [
      { test: /\bsicurezz/, match: (c) => /sicurezz/.test(`${c.title} ${c.code}`.toLowerCase()) },
      { test: /\bgdpr|privacy/, match: (c) => /gdpr|privacy/.test(`${c.title} ${c.code}`.toLowerCase()) },
      { test: /\betic/, match: (c) => /etic/.test(`${c.title} ${c.code}`.toLowerCase()) },
      { test: /\bharass|molesti/, match: (c) => /harass|molesti/.test(`${c.title} ${c.code}`.toLowerCase()) },
      { test: /\bexcel/, match: (c) => /excel/.test(`${c.title} ${c.code}`.toLowerCase()) },
      { test: /\bspeak|comunicaz/, match: (c) => /speak|comunicaz/.test(`${c.title} ${c.code}`.toLowerCase()) },
      { test: /\bnexa|piattaforma/, match: (c) => /nexa|piattaforma/.test(`${c.title} ${c.code}`.toLowerCase()) }
    ];

    const matched = courses.filter((c) => keywordMatchers.some((km) => km.test.test(m) && km.match(c)));
    if (matched.length > 0) {
      return single ? [matched[0]!.id] : matched.map((c) => c.id);
    }

    if (/\bobbligatori|mandatory|tutti i corsi/.test(m)) {
      const mandatory = courses.filter((c) => c.category === "mandatory").map((c) => c.id);
      return single && mandatory[0] ? [mandatory[0]] : mandatory;
    }

    return single && courses[0] ? [courses[0].id] : courses.map((c) => c.id).slice(0, 4);
  }

  parseDocumentTitleFromMessage(message: string, fallback: string): string {
    const titled = message.match(/\btitolo\s+(.+?)(?:\s+per\s+|\s*$)/i);
    if (titled?.[1]) {
      return titled[1].trim().slice(0, 120);
    }
    const quoted = message.match(/[«"']([^»"']{3,120})[»"']/);
    if (quoted?.[1]) {
      return quoted[1].trim();
    }
    return fallback;
  }

  parseDocumentKindFromMessage(message: string): EmployeeDocumentKind {
    const m = message.toLowerCase();
    if (/\bcedolin|payslip\b/.test(m)) {
      return "payslip";
    }
    if (/\bcontratt/.test(m)) {
      return "contract";
    }
    if (/\bpersonale|identit|cf\b/.test(m)) {
      return "personal";
    }
    return "other";
  }

  parseIsoDateFromMessage(message: string, fallback: string): string {
    const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) {
      return iso[1]!;
    }
    const it = message.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (it) {
      const d = it[1]!.padStart(2, "0");
      const m = it[2]!.padStart(2, "0");
      return `${it[3]}-${m}-${d}`;
    }
    return fallback;
  }

  parseBookingWindow(message: string): { startsAt: string; endsAt: string } {
    const dateIso = this.parseIsoDateFromMessage(message, new Date().toISOString().slice(0, 10));
    const range = message.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
    const startH = range ? range[1]!.padStart(2, "0") : "09";
    const startM = range ? range[2]! : "00";
    const endH = range ? range[3]!.padStart(2, "0") : "10";
    const endM = range ? range[4]! : "00";
    return {
      startsAt: `${dateIso}T${startH}:${startM}:00.000Z`,
      endsAt: `${dateIso}T${endH}:${endM}:00.000Z`
    };
  }

  parseTitleFromMessage(message: string, fallback: string): string {
    const titled = message.match(/\btitolo\s+(.+?)(?:\s+per\s+|\s*$)/i);
    if (titled?.[1]) {
      return titled[1].trim().slice(0, 120);
    }
    return fallback;
  }

  private async resolveDefaultMeetingRoomId(actorUserId: string): Promise<string | null> {
    const rooms = await this.store.listMeetingRooms(actorUserId);
    return rooms[0]?.id ?? null;
  }

  private async buildMeetingRoomBookingRows(
    sectionId: string,
    toolId: string,
    actorUserId: string,
    actorFullName: string,
    message: string
  ): Promise<CoworkPlanRow[]> {
    const roomId = await this.resolveDefaultMeetingRoomId(actorUserId);
    if (!roomId) {
      return [];
    }
    const { startsAt, endsAt } = this.parseBookingWindow(message);
    const title = this.parseTitleFromMessage(message, "Evento Cowork");
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "calendar",
        toolId,
        userId: actorUserId,
        fullName: actorFullName,
        action: "create_meeting_room_booking",
        detail: `${title}: ${startsAt.slice(0, 16)} → ${endsAt.slice(0, 16)}`,
        rationale: "Prenotazione sala visibile sul calendario team",
        status: "proposed",
        payload: { roomId, startsAt, endsAt, title, toolId }
      }
    ];
  }

  private buildCancelBookingRows(
    sectionId: string,
    toolId: string,
    actorUserId: string,
    actorFullName: string,
    message: string
  ): CoworkPlanRow[] {
    const idMatch = message.match(/\b([0-9a-f-]{36})\b/i);
    if (!idMatch) {
      return [];
    }
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "calendar",
        toolId,
        userId: actorUserId,
        fullName: actorFullName,
        action: "cancel_meeting_room_booking",
        detail: `Annulla prenotazione ${idMatch[1]}`,
        status: "proposed",
        payload: { bookingId: idMatch[1], toolId }
      }
    ];
  }

  private buildLeavePlanRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const year = this.parseYear(message);
    const range = message.match(/(\d{1,2})[/-](\d{1,2})/);
    const startDate = range
      ? `${year}-${range[1]!.padStart(2, "0")}-${range[2]!.padStart(2, "0")}`
      : `${year}-08-15`;
    const endDate = range
      ? `${year}-${String(Number(range[1]) + 5).padStart(2, "0")}-${range[2]!.padStart(2, "0")}`
      : `${year}-08-20`;
    const kind = /\brol\b/i.test(message) ? "rol" : "annual";
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "time_off",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "create_leave_plan",
      detail: `${kind === "rol" ? "ROL" : "Ferie"} ${startDate} → ${endDate} (in attesa)`,
      rationale: "Richiesta assenza su calendario",
      status: "proposed" as const,
      payload: { userId: u.id, startDate, endDate, kind, toolId }
    }));
  }

  private buildSmartworkingRequestRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const expanded = this.expandSmartworkingDaysFromMessage(message);
    if (expanded.length > 0) {
      const rows: CoworkPlanRow[] = [];
      for (const u of users) {
        for (const day of expanded) {
          rows.push({
            id: randomUUID(),
            sectionId,
            domain: "time_off",
            toolId,
            userId: u.id,
            fullName: u.fullName,
            action: "create_smartworking_request",
            detail: `Remote ${day} (in attesa)`,
            rationale: `${expanded.length} giorni ricorrenti nel periodo (una richiesta per giorno, visibile su calendario lavoro)`,
            status: "proposed",
            payload: { userId: u.id, day, endDay: day, toolId }
          });
        }
      }
      return rows;
    }

    const isoDates = this.parseIsoDatesFromMessage(message);
    let day: string;
    let endDay: string;
    if (isoDates.length >= 2) {
      const sorted = [...isoDates].sort();
      day = sorted[0]!;
      endDay = sorted[sorted.length - 1]!;
    } else {
      day = this.parseIsoDateFromMessage(message, new Date().toISOString().slice(0, 10));
      endDay = day;
    }
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "time_off",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "create_smartworking_request",
      detail: `Remote ${day}${endDay !== day ? ` → ${endDay}` : ""} (in attesa)`,
      rationale: "Richiesta remote working su calendario lavoro",
      status: "proposed" as const,
      payload: { userId: u.id, day, endDay, toolId }
    }));
  }

  private buildTravelRequestRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const day = this.parseIsoDateFromMessage(message, new Date().toISOString().slice(0, 10));
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "time_off",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "create_travel_request",
      detail: `Trasferta ${day} (in attesa)`,
      status: "proposed" as const,
      payload: { userId: u.id, day, toolId }
    }));
  }

  private buildSicknessRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const fromDate = this.parseIsoDateFromMessage(message, new Date().toISOString().slice(0, 10));
    const toDate = this.parseEndDate(message, this.parseYear(message));
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "time_off",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "create_sickness_report",
      detail: `Malattia ${fromDate} → ${toDate} (in attesa)`,
      status: "proposed" as const,
      payload: { userId: u.id, fromDate, toDate, toolId }
    }));
  }

  private async buildApproveLeaveRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[]
  ): Promise<CoworkPlanRow[]> {
    const scopeIds = new Set(users.map((u) => u.id));
    const rows: CoworkPlanRow[] = [];
    for (const u of users) {
      const leaves = await this.store.listLeave(u.id);
      for (const l of leaves) {
        if (l.status !== "pending" || !scopeIds.has(l.userId)) {
          continue;
        }
        rows.push({
          id: randomUUID(),
          sectionId,
          domain: "time_off",
          toolId,
          userId: l.userId,
          fullName: u.fullName,
          action: "approve_leave",
          detail: `Approva ${l.startDate} → ${l.endDate}`,
          status: "proposed",
          payload: { leaveId: l.id, toolId }
        });
      }
    }
    return rows;
  }

  private async buildApproveSmartworkingRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[]
  ): Promise<CoworkPlanRow[]> {
    const scopeIds = new Set(users.map((u) => u.id));
    const rows: CoworkPlanRow[] = [];
    for (const u of users) {
      const requests = await this.store.listMySmartworking(u.id);
      for (const r of requests) {
        if (r.status !== "pending" || !scopeIds.has(r.userId)) {
          continue;
        }
        rows.push({
          id: randomUUID(),
          sectionId,
          domain: "time_off",
          toolId,
          userId: r.userId,
          fullName: u.fullName,
          action: "approve_smartworking",
          detail: `Approva SW ${r.day.slice(0, 10)}`,
          status: "proposed",
          payload: { requestId: r.id, toolId }
        });
      }
    }
    return rows;
  }

  private buildShiftBatchRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const dateIso = this.parseIsoDateFromMessage(message, new Date().toISOString().slice(0, 10));
    const { startsAt, endsAt } = this.parseBookingWindow(message);
    const startAt = startsAt.includes("T") ? startsAt : `${dateIso}T09:00:00.000Z`;
    const endAt = endsAt.includes("T") ? endsAt : `${dateIso}T17:00:00.000Z`;
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "calendar",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "create_shift",
      detail: `Turno ${startAt.slice(0, 16)} → ${endAt.slice(0, 16)}`,
      status: "proposed" as const,
      payload: { userId: u.id, startAt, endAt, toolId }
    }));
  }

  private buildOffboardingRows(sectionId: string, toolId: string, users: ScopeUser[]): CoworkPlanRow[] {
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "lifecycle",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "start_offboarding",
      detail: "Avvia wizard uscita",
      status: "proposed" as const,
      payload: { userId: u.id, toolId }
    }));
  }

  private buildLeaveAllowanceRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const year = this.parseYear(message);
    const daysMatch = message.match(/\b(\d{1,3})\s*(?:gg|giorni)\b/i);
    const allocatedDays = daysMatch ? Number(daysMatch[1]) : 22;
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "org",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "update_leave_allowance",
      detail: `Monte ferie ${year}: ${allocatedDays} gg`,
      status: "proposed" as const,
      payload: { userId: u.id, year, allocatedDays, toolId }
    }));
  }

  private buildPublishPayslipsRows(sectionId: string, toolId: string, message: string): CoworkPlanRow[] {
    const periodMatch = message.match(/\b(20\d{2}-\d{2})\b/);
    const period = periodMatch?.[1] ?? new Date().toISOString().slice(0, 7);
    return [
      this.attachHighRiskRationale(
        {
          id: randomUUID(),
          sectionId,
          domain: "payroll",
          toolId,
          userId: "company",
          fullName: "Azienda",
          action: "publish_payslips_period",
          detail: `Pubblica cedolini ${period}`,
          status: "proposed",
          payload: { period, toolId }
        },
        toolId
      )
    ];
  }

  private buildPayrollBatchRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const periodMatch = message.match(/\b(20\d{2}-\d{2})\b/);
    const period = periodMatch?.[1] ?? new Date().toISOString().slice(0, 7);
    const usePreviousMonthVariables = /\bvariabil.*mese preced|previous.*month\b/i.test(message);
    return users.map((u) =>
      this.attachHighRiskRationale(
        {
          id: randomUUID(),
          sectionId,
          domain: "payroll",
          toolId,
          userId: u.id,
          fullName: u.fullName,
          action: "payroll_batch_generate",
          detail: `Genera bozza cedolino ${period}`,
          status: "proposed" as const,
          payload: { userId: u.id, period, usePreviousMonthVariables, toolId }
        },
        toolId
      )
    );
  }

  private buildCompensationBenchmarkRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const locationMatch = message.match(/\b(?:a|in)\s+([A-Za-zÀ-ú\s]{2,40})/i);
    const location = locationMatch?.[1]?.trim() || "Italia";
    const seniorityMatch = message.match(/\b(\d{1,2})\s*ann/i);
    const seniorityYears = seniorityMatch ? Number(seniorityMatch[1]) : 3;
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "payroll",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "compensation_benchmark_estimate",
      detail: `Stima RAL (${location}, ${seniorityYears} anni)`,
      rationale: "Solo analisi — nessuna modifica anagrafica",
      status: "proposed" as const,
      payload: { userId: u.id, location, seniorityYears, toolId }
    }));
  }

  private async buildPersonnelBudgetAdjustRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
    const now = new Date();
    const year = this.parseYear(message);
    const monthMatch = message.match(/\bmese\s*(\d{1,2})\b/i) ?? message.match(/\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/);
    const month = monthMatch
      ? Number(monthMatch[1])
      : monthMatch && monthMatch[2]
        ? Number(monthMatch[1])
        : now.getMonth() + 1;
    const eurMatch =
      message.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|eur)/i) ??
      message.match(/\bbudget\s*(\d+)/i);
    const budgetRalDefault = eurMatch
      ? Number(String(eurMatch[1]).replace(/\./g, "").replace(",", "."))
      : 0;
    const rows: CoworkPlanRow[] = [];
    for (const u of users) {
      let budgetRal = budgetRalDefault;
      if (budgetRal <= 0) {
        try {
          const full = await this.store.getUser(u.id);
          if (full.annualGrossSalary != null && Number(full.annualGrossSalary) > 0) {
            budgetRal = Math.round(Number(full.annualGrossSalary) / 12);
          }
        } catch {
          budgetRal = 0;
        }
      }
      rows.push({
        id: randomUUID(),
        sectionId,
        domain: "personnel_budget",
        toolId,
        userId: u.id,
        fullName: u.fullName,
        action: "personnel_budget_adjust",
        detail: `Budget RAL ${budgetRal > 0 ? `${budgetRal} EUR` : "da definire"} (${year}-${String(month).padStart(2, "0")})`,
        status: "proposed" as const,
        payload: { userId: u.id, year, month, budgetRal, toolId }
      });
    }
    return rows;
  }

  private buildExportEmployeesPreviewRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[]
  ): CoworkPlanRow[] {
    const scopeIds = users.map((u) => u.id);
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "admin",
        toolId,
        userId: "export",
        fullName: "Export perimetro",
        action: "export_employees_preview",
        detail: `Anteprima export per ${scopeIds.length} dipendenti`,
        status: "proposed",
        payload: { scopeUserIds: scopeIds, toolId }
      }
    ];
  }

  private async buildRecruitingLinkedInSyncRows(
    sectionId: string,
    toolId: string,
    companyId: string,
    message: string
  ): Promise<CoworkPlanRow[]> {
    const uuids = this.parseUuidsFromMessage(message);
    const positions = await this.store.getServiceRoleClient().from("recruit_positions").select("id, title, status, linkedin_sync_status").eq("company_id", companyId);
    const rows = (positions.data ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      linkedin_sync_status?: string | null;
    }>;
    const open = rows.filter((p) => p.status === "open");
    const targeted =
      uuids.length > 0
        ? open.filter((p) => uuids.includes(p.id))
        : open.filter((p) => (p.linkedin_sync_status ?? "not_linked") !== "synced");
    if (targeted.length === 0) {
      return [];
    }
    if (uuids.length === 1 && targeted.length === 1) {
      const p = targeted[0]!;
      return [
        {
          id: randomUUID(),
          sectionId,
          domain: "recruiting",
          toolId,
          userId: p.id,
          fullName: p.title,
          action: "recruiting_linkedin_sync",
          detail: `Pubblica su LinkedIn: ${p.title}`,
          status: "proposed",
          payload: { positionId: p.id, toolId }
        }
      ];
    }
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "recruiting",
        toolId,
        userId: "recruiting",
        fullName: "LinkedIn",
        action: "recruiting_linkedin_sync",
        detail: `Sync LinkedIn per ${targeted.length} posizione/i aperte`,
        status: "proposed",
        payload: { positionIds: targeted.map((p) => p.id), toolId }
      }
    ];
  }

  private buildTeamCalendarExportRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    if (users.length === 0) {
      return [];
    }
    const { from, to } = this.defaultCalendarRange(message);
    const userIds = users.map((u) => u.id);
    const label = users.length === 1 ? users[0]!.fullName : `${users.length} dipendenti nel perimetro`;
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "calendar",
        toolId,
        userId: users[0]!.id,
        fullName: label,
        action: "sync_team_calendar_view",
        detail: `Export calendario ${from} → ${to}`,
        status: "proposed",
        payload: { userIds, from, to, toolId }
      }
    ];
  }

  private buildAttendanceQrBatchRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const day = this.parseAttendanceDay(message);
    const entryType =
      /\b(uscita|clock.?out|fine giornata)\b/i.test(message) ? ("clock_out" as const) : ("clock_in" as const);
    const atBase = `${day}T09:00:00.000Z`;
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "generic",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "attendance_qr_batch",
      detail: `Timbratura ${entryType === "clock_in" ? "entrata" : "uscita"} ${day}`,
      status: "proposed" as const,
      payload: { userId: u.id, day, entryType, at: atBase, toolId }
    }));
  }

  private async buildThirdPartyLicenseAssignRows(
    sectionId: string,
    toolId: string,
    companyId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
    const uuids = this.parseUuidsFromMessage(message);
    const licenseId = uuids[0] ?? "";
    if (!licenseId) {
      return [];
    }
    const sb = this.store.getServiceRoleClient();
    const { data } = await sb
      .from("third_party_licenses")
      .select("id, tool_name")
      .eq("company_id", companyId)
      .eq("id", licenseId)
      .maybeSingle();
    if (!data) {
      return [];
    }
    const toolName = String((data as { tool_name: string }).tool_name);
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "third_party_licenses",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "third_party_license_assign",
      detail: `Assegna licenza ${toolName}`,
      status: "proposed" as const,
      payload: { userId: u.id, licenseId, toolId }
    }));
  }

  private buildExpenseClaimRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const amountMatch = message.match(/(\d+[,.]?\d*)\s*(?:€|eur)/i);
    const amountEur = amountMatch ? Number(amountMatch[1]!.replace(",", ".")) : 0;
    const expenseDate = this.parseIsoDateFromMessage(message, new Date().toISOString().slice(0, 10));
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "generic",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "create_expense_claim",
      detail: `Nota spese ${amountEur > 0 ? `${amountEur.toFixed(2)} EUR` : "importo da definire"}`,
      status: "proposed" as const,
      payload: {
        userId: u.id,
        amountEur,
        expenseDate,
        description: message.slice(0, 200),
        toolId
      }
    }));
  }

  private async buildApproveExpenseRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    actorUserId: string
  ): Promise<CoworkPlanRow[]> {
    const scopeIds = new Set(users.map((u) => u.id));
    const actor = await this.store.getUser(actorUserId);
    const { toApproveHr } = await this.store.listExpenseClaimsForWorkflow(
      actorUserId,
      actor.role,
      actor.email ?? ""
    );
    const rows: CoworkPlanRow[] = [];
    for (const row of toApproveHr) {
      const claim = row.claim;
      if (!scopeIds.has(claim.userId)) {
        continue;
      }
      const user = users.find((u) => u.id === claim.userId);
      rows.push({
        id: randomUUID(),
        sectionId,
        domain: "generic",
        toolId,
        userId: claim.userId,
        fullName: user?.fullName ?? row.requesterName,
        action: "approve_expense",
        detail: `Approva ${(claim.amountCents / 100).toFixed(2)} EUR — ${claim.description.slice(0, 60)}`,
        status: "proposed",
        payload: { claimId: claim.id, toolId }
      });
    }
    return rows;
  }

  private buildInnovationJobRows(
    sectionId: string,
    toolId: string,
    actorUserId: string,
    actorFullName: string,
    message: string
  ): CoworkPlanRow[] {
    const title = this.parseTitleFromMessage(message, "Pipeline Cowork");
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "generic",
        toolId,
        userId: actorUserId,
        fullName: actorFullName,
        action: "create_innovation_job",
        detail: title,
        status: "proposed",
        payload: { title, toolId }
      }
    ];
  }

  private async buildTrainingBatchRows(
    sectionId: string,
    toolId: string,
    companyId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
    const courseIds = await this.resolveTrainingCourseIds(companyId, message, false);
    if (courseIds.length === 0 || users.length === 0) {
      return [];
    }
    const dueDate = this.parseTrainingDueDate(message);
    const courses = await this.training.listCourses(companyId);
    const titles = courseIds
      .map((id) => courses.find((c) => c.id === id)?.title ?? id)
      .join(", ");
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "training",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "training_batch",
      detail: `${titles} entro ${dueDate}`,
      rationale: "Assegnazione formazione batch",
      status: "proposed" as const,
      payload: { userId: u.id, companyId, courseIds, dueDate, toolId }
    }));
  }

  private async buildAssignTrainingCourseRows(
    sectionId: string,
    toolId: string,
    companyId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
    const courseIds = await this.resolveTrainingCourseIds(companyId, message, true);
    const courseId = courseIds[0];
    if (!courseId || users.length === 0) {
      return [];
    }
    const dueDate = this.parseTrainingDueDate(message);
    const course = await this.training.getCourseById(companyId, courseId);
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "training",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "assign_training_course",
      detail: `«${course.title}» entro ${dueDate}`,
      status: "proposed" as const,
      payload: { userId: u.id, companyId, courseId, dueDate, toolId }
    }));
  }

  private buildOnboardingFromCandidateRows(
    sectionId: string,
    toolId: string,
    actorUserId: string,
    actorFullName: string,
    message: string
  ): CoworkPlanRow[] {
    const candidateId = this.parseUuidsFromMessage(message)[0];
    if (!candidateId) {
      return [];
    }
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "onboarding",
        toolId,
        userId: actorUserId,
        fullName: actorFullName,
        action: "start_onboarding_from_candidate",
        detail: `Onboarding da candidato ${candidateId.slice(0, 8)}…`,
        rationale: "Creazione utente e wizard HR da recruiting",
        status: "proposed",
        payload: { candidateId, toolId }
      }
    ];
  }

  private async buildOnboardingReminderRows(
    sectionId: string,
    toolId: string,
    companyId: string,
    users: ScopeUser[]
  ): Promise<CoworkPlanRow[]> {
    const scopeIds = new Set(users.map((u) => u.id));
    const rows: CoworkPlanRow[] = [];
    const sb = this.store.getServiceRoleClient();
    const { data } = await sb
      .from("hr_onboarding_wizard")
      .select("user_id, steps_json, completed_at")
      .eq("company_id", companyId);
    for (const raw of data ?? []) {
      const row = raw as {
        user_id: string;
        steps_json?: Record<string, { done?: boolean }>;
        completed_at?: string | null;
      };
      if (row.completed_at || !scopeIds.has(row.user_id)) {
        continue;
      }
      const steps = row.steps_json ?? {};
      const pending = HR_ONBOARDING_WIZARD_STEPS.find((s) => steps[s.key]?.done !== true);
      if (!pending) {
        continue;
      }
      const user = users.find((u) => u.id === row.user_id);
      rows.push({
        id: randomUUID(),
        sectionId,
        domain: "onboarding",
        toolId,
        userId: row.user_id,
        fullName: user?.fullName ?? row.user_id,
        action: "onboarding_wizard_reminder",
        detail: `Step pendente: ${pending.titleIt}`,
        status: "proposed",
        payload: {
          userId: row.user_id,
          pendingStepKey: pending.key,
          pendingStepTitle: pending.titleIt,
          toolId
        }
      });
    }
    return rows;
  }

  private buildUploadDocumentRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): CoworkPlanRow[] {
    const title = this.parseDocumentTitleFromMessage(message, "Documento Cowork");
    const kind = this.parseDocumentKindFromMessage(message);
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "documents",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "upload_employee_document",
      detail: `${title} (${kind}) — metadati`,
      status: "proposed" as const,
      payload: { userId: u.id, title, kind, toolId }
    }));
  }

  private async buildDocumentAckRows(
    sectionId: string,
    toolId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
    const explicitId = this.parseUuidsFromMessage(message)[0];
    const rows: CoworkPlanRow[] = [];
    for (const u of users) {
      let documentId = explicitId;
      let docTitle = explicitId ? `documento ${explicitId.slice(0, 8)}…` : "";
      if (!documentId) {
        const sb = this.store.getServiceRoleClient();
        const { data: docRows } = await sb
          .from("employee_documents")
          .select("id, title, createdAt")
          .eq("userId", u.id)
          .order("createdAt", { ascending: false })
          .limit(1);
        const latest = docRows?.[0] as { id: string; title: string } | undefined;
        if (!latest) {
          continue;
        }
        documentId = String(latest.id);
        docTitle = String(latest.title);
      }
      rows.push({
        id: randomUUID(),
        sectionId,
        domain: "documents",
        toolId,
        userId: u.id,
        fullName: u.fullName,
        action: "link_document_ack",
        detail: `Promemoria lettura: ${docTitle}`,
        status: "proposed",
        payload: { userId: u.id, documentId, documentTitle: docTitle, toolId }
      });
    }
    return rows;
  }

  private async buildCorporatePolicyPublishRows(
    sectionId: string,
    toolId: string,
    companyId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
    const policies = await this.corporatePolicies.list(companyId);
    if (policies.length === 0) {
      return [];
    }
    const uuids = this.parseUuidsFromMessage(message);
    const policy =
      policies.find((p) => uuids.includes(p.id)) ??
      policies.find((p) => {
        const t = p.title.toLowerCase();
        const m = message.toLowerCase();
        return m.includes(t) || t.split(/\s+/).some((w) => w.length > 4 && m.includes(w));
      }) ??
      policies[0]!;
    return users.map((u) => ({
      id: randomUUID(),
      sectionId,
      domain: "corporate_policies",
      toolId,
      userId: u.id,
      fullName: u.fullName,
      action: "corporate_policy_publish",
      detail: `Policy: ${policy.title}`,
      status: "proposed" as const,
      payload: {
        userId: u.id,
        policyId: policy.id,
        policyTitle: policy.title,
        toolId
      }
    }));
  }

  private buildHrCenterRecapRows(sectionId: string, toolId: string, users: ScopeUser[]): CoworkPlanRow[] {
    if (users.length === 0) {
      return [];
    }
    const userIds = users.map((u) => u.id);
    const label = users.length === 1 ? users[0]!.fullName : `${users.length} dipendenti nel perimetro`;
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "analytics",
        toolId,
        userId: users[0]!.id,
        fullName: label,
        action: "run_hr_center_recap",
        detail: `Recap HR Center su ${users.length} profilo/i`,
        status: "proposed",
        payload: { userIds, toolId }
      }
    ];
  }

  private buildRetentionRefreshRows(
    sectionId: string,
    toolId: string,
    actorUserId: string,
    actorFullName: string
  ): CoworkPlanRow[] {
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "analytics",
        toolId,
        userId: actorUserId,
        fullName: actorFullName,
        action: "run_retention_analysis",
        detail: "Ricalcolo score turnover per l'azienda",
        status: "proposed",
        payload: { toolId }
      }
    ];
  }

  private buildEvaluateHrAlertsRows(
    sectionId: string,
    toolId: string,
    actorUserId: string,
    actorFullName: string
  ): CoworkPlanRow[] {
    return [
      {
        id: randomUUID(),
        sectionId,
        domain: "analytics",
        toolId,
        userId: actorUserId,
        fullName: actorFullName,
        action: "evaluate_hr_alerts",
        detail: "Valutazione regole alert HR",
        status: "proposed",
        payload: { toolId }
      }
    ];
  }

  private async buildHrRecapReminderRows(
    sectionId: string,
    toolId: string,
    companyId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
    const explicit = message.match(/\b(appr|exp|ctr):[0-9a-f-]{36}\b/i);
    if (explicit) {
      return [
        {
          id: randomUUID(),
          sectionId,
          domain: "generic",
          toolId,
          userId: users[0]?.id ?? "hr",
          fullName: users[0]?.fullName ?? "HR",
          action: "hr_recap_reminder",
          detail: `Sollecito task ${explicit[0]}`,
          status: "proposed",
          payload: { taskId: explicit[0], toolId }
        }
      ];
    }
    const scopeIds = new Set(users.map((u) => u.id));
    const rows: CoworkPlanRow[] = [];
    const approvals = await this.store.listCompanyPendingApprovalViewsForHrDashboard(companyId);
    for (const a of approvals) {
      if (!scopeIds.has(a.requestedBy)) {
        continue;
      }
      const u = users.find((x) => x.id === a.requestedBy);
      rows.push({
        id: randomUUID(),
        sectionId,
        domain: "generic",
        toolId,
        userId: a.requestedBy,
        fullName: u?.fullName ?? a.requesterName ?? a.requestedBy,
        action: "hr_recap_reminder",
        detail: `Sollecito approvazione: ${a.requesterName ?? a.requestedBy}`,
        status: "proposed",
        payload: { taskId: `appr:${a.id}`, toolId }
      });
    }
    const expenses = await this.store.listCompanyExpenseClaimsPendingHr(companyId);
    for (const c of expenses) {
      if (!scopeIds.has(c.userId)) {
        continue;
      }
      const u = users.find((x) => x.id === c.userId);
      rows.push({
        id: randomUUID(),
        sectionId,
        domain: "generic",
        toolId,
        userId: c.userId,
        fullName: u?.fullName ?? c.userId,
        action: "hr_recap_reminder",
        detail: "Sollecito nota spesa HR",
        status: "proposed",
        payload: { taskId: `exp:${c.id}`, toolId }
      });
    }
    return rows.slice(0, 15);
  }
}

export type CoworkPlanSectionMeta = {
  sectionId: string;
  domain: CoworkDomain;
  toolId?: string;
  title: string;
};
