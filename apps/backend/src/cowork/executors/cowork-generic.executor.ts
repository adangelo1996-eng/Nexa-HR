import { Injectable } from "@nestjs/common";
import type { EmployeeDocumentKind } from "@payday/domain";
import { CompensationBenchService } from "../../compensation/compensation-bench.service";
import { HrCenterService } from "../../hr-center/hr-center.service";
import { HrOffboardingService } from "../../hr-offboarding/hr-offboarding.service";
import { HrOnboardingService } from "../../hr-onboarding/hr-onboarding.service";
import { AttendanceTeamService } from "../../workforce/attendance-team.service";
import { HrRecapService } from "../../hr-recap/hr-recap.service";
import { ADMIN_EXPORT_FIELD_CATALOG } from "../../platform/admin-export.catalog";
import { HrDataStore } from "../../platform/hr-data.store";
import { LinkedInJobSyncService } from "../../recruiting/linkedin/linkedin-job-sync.service";
import { RecruitingService } from "../../recruiting/recruiting.service";
import { ThirdPartyLicensesService } from "../../third-party-licenses/third-party-licenses.service";
import { TrainingService } from "../../training/training.service";
import { COWORK_LEGACY_DOMAIN_EXECUTOR_DOMAINS, getCoworkTool } from "../cowork-tool-catalog";
import type { CoworkPlanRow } from "../cowork.types";
import type { CoworkExecutorContext } from "./cowork-executor.interface";

const DEFAULT_EXPORT_FIELD_IDS = [
  "userId",
  "email",
  "fullName",
  "costCenterCode",
  "costCenterName",
  "hireDate",
  "contractType"
];

@Injectable()
export class CoworkGenericExecutor {
  constructor(
    private readonly store: HrDataStore,
    private readonly offboarding: HrOffboardingService,
    private readonly hrCenter: HrCenterService,
    private readonly hrRecap: HrRecapService,
    private readonly compensationBench: CompensationBenchService,
    private readonly linkedInSync: LinkedInJobSyncService,
    private readonly recruiting: RecruitingService,
    private readonly onboarding: HrOnboardingService,
    private readonly training: TrainingService,
    private readonly thirdPartyLicenses: ThirdPartyLicensesService,
    private readonly attendanceTeam: AttendanceTeamService
  ) {}

  supportsRow(row: CoworkPlanRow): boolean {
    const toolId = row.toolId || String(row.payload.toolId ?? "");
    if (!toolId) {
      return !COWORK_LEGACY_DOMAIN_EXECUTOR_DOMAINS.has(row.domain);
    }
    const tool = getCoworkTool(toolId);
    if (!tool?.executable) {
      return false;
    }
    return !COWORK_LEGACY_DOMAIN_EXECUTOR_DOMAINS.has(row.domain);
  }

  async executeRow(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const toolId = row.toolId || String(row.payload.toolId ?? "");
    try {
      switch (toolId) {
        case "create_meeting_room_booking":
          return await this.applyMeetingRoomBooking(ctx, row);
        case "cancel_meeting_room_booking":
          return await this.applyCancelBooking(ctx, row);
        case "create_leave_plan":
          return await this.applyLeavePlan(ctx, row);
        case "create_smartworking_request":
          return await this.applySmartworkingRequest(ctx, row);
        case "create_travel_request":
          return await this.applyTravelRequest(ctx, row);
        case "create_sickness_report":
          return await this.applySicknessReport(ctx, row);
        case "approve_pending_leaves":
          return await this.applyApproveLeave(ctx, row);
        case "approve_pending_smartworking":
          return await this.applyApproveSmartworking(ctx, row);
        case "create_shift_batch":
          return await this.applyCreateShift(ctx, row);
        case "start_offboarding":
          return await this.applyStartOffboarding(ctx, row);
        case "update_leave_allowance":
          return await this.applyLeaveAllowance(ctx, row);
        case "publish_payslips_period":
          return await this.applyPublishPayslips(ctx, row);
        case "create_expense_claim":
          return await this.applyExpenseClaim(ctx, row);
        case "approve_pending_expenses":
          return await this.applyApproveExpense(ctx, row);
        case "create_innovation_job":
          return await this.applyInnovationJob(ctx, row);
        case "run_hr_center_recap":
          return await this.applyHrCenterRecap(ctx, row);
        case "run_retention_analysis":
          return await this.applyRetentionRefresh(ctx, row);
        case "evaluate_hr_alerts":
          return await this.applyEvaluateHrAlerts(ctx, row);
        case "hr_recap_reminder":
          return await this.applyHrRecapReminder(ctx, row);
        case "personnel_budget_adjust":
          return await this.applyPersonnelBudgetAdjust(ctx, row);
        case "payroll_batch_generate":
          return await this.applyPayrollBatchGenerate(ctx, row);
        case "compensation_benchmark_estimate":
          return await this.applyCompensationBenchmark(ctx, row);
        case "export_employees_preview":
          return await this.applyExportEmployeesPreview(ctx, row);
        case "recruiting_linkedin_sync":
          return await this.applyLinkedInSync(ctx, row);
        case "training_batch":
          return await this.applyTrainingBatch(ctx, row);
        case "assign_training_course":
          return await this.applyAssignTrainingCourse(ctx, row);
        case "start_onboarding_from_candidate":
          return await this.applyOnboardingFromCandidate(ctx, row);
        case "onboarding_wizard_reminder":
          return await this.applyOnboardingWizardReminder(ctx, row);
        case "upload_employee_document":
          return await this.applyUploadEmployeeDocument(ctx, row);
        case "link_document_ack":
          return await this.applyLinkDocumentAck(ctx, row);
        case "corporate_policy_publish":
          return await this.applyCorporatePolicyPublish(ctx, row);
        case "third_party_license_assign":
          return await this.applyThirdPartyLicenseAssign(ctx, row);
        case "sync_team_calendar_view":
          return await this.applySyncTeamCalendarView(ctx, row);
        case "attendance_qr_batch":
          return await this.applyAttendanceQrBatch(ctx, row);
        default:
          return {
            ...row,
            status: "error",
            errorMessage: toolId ? `Tool ${toolId} non collegato all'executor` : "Tool non specificato"
          };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ...row, status: "error", errorMessage: msg };
    }
  }

  private async applyMeetingRoomBooking(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const roomId = String(row.payload.roomId ?? "");
    const startsAt = String(row.payload.startsAt ?? "");
    const endsAt = String(row.payload.endsAt ?? "");
    const title = row.payload.title != null ? String(row.payload.title) : undefined;
    const event = await this.store.createMeetingRoomBookingEvent(ctx.auth.userId, roomId, {
      startsAt,
      endsAt,
      title
    });
    const bookingId = String(event.meta?.bookingId ?? "");
    return {
      ...row,
      status: "applied",
      detail: `${event.title} ${startsAt.slice(0, 16)} → ${endsAt.slice(0, 16)}`,
      payload: { ...row.payload, bookingId }
    };
  }

  private async applyCancelBooking(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const bookingId = String(row.payload.bookingId ?? "");
    await this.store.cancelMeetingRoomBooking(ctx.auth.userId, bookingId);
    return { ...row, status: "applied", detail: `Prenotazione ${bookingId} annullata` };
  }

  private async applyLeavePlan(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const leave = await this.store.createLeavePlan(
      {
        userId,
        startDate: String(row.payload.startDate).slice(0, 10),
        endDate: String(row.payload.endDate).slice(0, 10),
        kind: (row.payload.kind as "annual" | "rol") ?? "annual"
      },
      { skipAnnualBalanceCheck: ctx.auth.role === "superuser" }
    );
    return {
      ...row,
      status: "applied",
      detail: `Ferie ${leave.startDate} → ${leave.endDate} (${leave.status})`,
      payload: { ...row.payload, leaveId: leave.id }
    };
  }

  private async applySmartworkingRequest(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const sw = await this.store.createSmartworkingRequest(
      userId,
      String(row.payload.day).slice(0, 10),
      row.payload.note != null ? String(row.payload.note) : undefined,
      ctx.auth.role,
      row.payload.endDay != null ? String(row.payload.endDay).slice(0, 10) : undefined
    );
    return {
      ...row,
      status: "applied",
      detail: `SW ${sw.day.slice(0, 10)}${sw.endDay ? ` → ${sw.endDay.slice(0, 10)}` : ""} (${sw.status})`,
      payload: { ...row.payload, requestId: sw.id }
    };
  }

  private async applyTravelRequest(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const tr = await this.store.createTravelRequest(
      userId,
      String(row.payload.day).slice(0, 10),
      row.payload.note != null ? String(row.payload.note) : undefined,
      ctx.auth.role
    );
    return {
      ...row,
      status: "applied",
      detail: `Trasferta ${tr.day.slice(0, 10)} (${tr.status})`,
      payload: { ...row.payload, travelId: tr.id, requestId: tr.id }
    };
  }

  private async applySicknessReport(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const sk = await this.store.createSicknessEvent({
      userId,
      fromDate: String(row.payload.fromDate).slice(0, 10),
      toDate: String(row.payload.toDate).slice(0, 10),
      documentUrl: ""
    });
    return {
      ...row,
      status: "applied",
      detail: `Malattia ${sk.fromDate} → ${sk.toDate} (${sk.status})`,
      payload: { ...row.payload, sicknessId: sk.id }
    };
  }

  private async applyApproveLeave(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const leaveId = String(row.payload.leaveId ?? "");
    const leave = await this.store.approveLeave(leaveId, ctx.auth.userId);
    return {
      ...row,
      status: "applied",
      detail: `Ferie approvate ${leave.startDate} → ${leave.endDate}`,
      payload: { ...row.payload, leaveId: leave.id }
    };
  }

  private async applyApproveSmartworking(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const requestId = String(row.payload.requestId ?? "");
    await this.store.decideSmartworkingRequest(requestId, ctx.auth.userId, true);
    return {
      ...row,
      status: "applied",
      detail: `Remote working approvato (${requestId})`,
      payload: { ...row.payload, requestId }
    };
  }

  private async applyCreateShift(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const me = await this.store.getUser(ctx.auth.userId);
    const shift = await this.store.createShift(ctx.auth.userId, me.role, {
      userId,
      startAt: String(row.payload.startAt),
      endAt: String(row.payload.endAt),
      premiumCode: row.payload.premiumCode != null ? String(row.payload.premiumCode) : undefined
    });
    return {
      ...row,
      status: "applied",
      detail: `Turno ${shift.startAt.slice(0, 16)} → ${shift.endAt.slice(0, 16)}`,
      payload: { ...row.payload, shiftId: shift.id }
    };
  }

  private async applyStartOffboarding(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    await this.offboarding.startForEmployee({
      userId,
      companyId: ctx.companyId,
      actorUserId: ctx.auth.userId
    });
    return { ...row, status: "applied", detail: `Wizard offboarding avviato` };
  }

  private async applyLeaveAllowance(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const allocatedDays = Number(row.payload.allocatedDays);
    const year = Number(row.payload.year ?? new Date().getFullYear());
    const previous = await this.store.getLeaveBalance(userId, year);
    const bal = await this.store.setLeaveAllowance(userId, allocatedDays);
    return {
      ...row,
      status: "applied",
      detail: `Monte ferie ${bal.allocatedDays} gg (residuo ${bal.residualDays})`,
      payload: {
        ...row.payload,
        _coworkPreviousState: { allocatedDays: previous.allocatedDays, year }
      }
    };
  }

  private async applyPublishPayslips(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const period = String(row.payload.period ?? "").trim();
    const { updated } = await this.store.publishPayslipsForPeriod(ctx.auth.userId, period);
    return { ...row, status: "applied", detail: `Pubblicati ${updated} cedolini per ${period}` };
  }

  private async applyExpenseClaim(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const amountEur = Number(row.payload.amountEur ?? 0);
    const amountCents = Math.round(amountEur * 100);
    const expenseDate = String(row.payload.expenseDate ?? new Date().toISOString().slice(0, 10));
    const period = expenseDate.slice(0, 7);
    const claim = await this.store.createExpenseClaim(userId, {
      amountCents,
      currency: "EUR",
      description: String(row.payload.description ?? "Nota spese Cowork"),
      expenseDate,
      expenseType: "generic",
      payslipPeriod: period
    });
    return {
      ...row,
      status: "applied",
      detail: `Nota spese ${(claim.amountCents / 100).toFixed(2)} EUR (${claim.status})`,
      payload: { ...row.payload, claimId: claim.id }
    };
  }

  private async applyApproveExpense(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const claimId = String(row.payload.claimId ?? "");
    const claim = await this.store.approveExpenseClaim(claimId, ctx.auth.userId);
    return {
      ...row,
      status: "applied",
      detail: `Spesa approvata ${(claim.amountCents / 100).toFixed(2)} EUR`,
      payload: { ...row.payload, claimId: claim.id }
    };
  }

  private async applyInnovationJob(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const title = String(row.payload.title ?? "Job Cowork");
    const job = await this.store.createInnovationJob(ctx.auth.userId, "cowork", { title });
    return { ...row, status: "applied", detail: `Job innovation ${title} (${job.status})` };
  }

  private async applyHrCenterRecap(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userIds = Array.isArray(row.payload.userIds)
      ? (row.payload.userIds as string[])
      : row.payload.userId
        ? [String(row.payload.userId)]
        : row.userId
          ? [row.userId]
          : [];
    const result = await this.hrCenter.runRecap(ctx.auth, { userIds });
    const recapMode = result.facts.recapMode === "single" ? "singolo" : "aggregato";
    return {
      ...row,
      status: "applied",
      detail: `Recap HR Center (${recapMode}, ${userIds.length} profili) — LLM ${result.llm.refineApplied ? "attivo" : "fallback"}`
    };
  }

  private async applyRetentionRefresh(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const companyId = ctx.companyId.trim();
    const out = await this.store.refreshTurnoverSignalsForCompany(companyId);
    return {
      ...row,
      status: "applied",
      detail: `Score turnover ricalcolati: ${out.inserted} profili (run ${out.runId.slice(0, 8)}…)`
    };
  }

  private async applyEvaluateHrAlerts(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const companyId = ctx.companyId.trim();
    const out = await this.store.evaluateHrAlertsForCompany(companyId);
    return {
      ...row,
      status: "applied",
      detail: `Alert HR: ${out.created} creati, ${out.notified} notifiche inviate`
    };
  }

  private async applyHrRecapReminder(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const taskId = String(row.payload.taskId ?? "");
    await this.hrRecap.postReminder(ctx.auth, { taskId });
    return { ...row, status: "applied", detail: `Sollecito inviato per task ${taskId}` };
  }

  private async applyPersonnelBudgetAdjust(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const year = Number(row.payload.year);
    const month = Number(row.payload.month);
    const budgetRal = Number(row.payload.budgetRal);
    const matrix = await this.store.getPersonnelBudgetAnnualMatrix(ctx.companyId, year);
    const matrixRow = matrix.rows.find((r) => r.userId === userId);
    const prevBudgetRal = matrixRow?.months.find((m) => m.month === month)?.budget.ral ?? 0;
    await this.store.upsertPersonnelBudgetCells(ctx.companyId, year, month, [
      { userId, budgetRal: Math.round(budgetRal * 100) / 100 }
    ]);
    return {
      ...row,
      status: "applied",
      detail: `Budget RAL ${budgetRal.toFixed(0)} EUR (${year}-${String(month).padStart(2, "0")})`,
      payload: {
        ...row.payload,
        _coworkPreviousState: { year, month, budgetRal: prevBudgetRal }
      }
    };
  }

  private async applyPayrollBatchGenerate(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const period = String(row.payload.period ?? "").trim();
    const usePrev = row.payload.usePreviousMonthVariables === true;
    const userId = String(row.payload.userId ?? row.userId ?? "").trim();
    const varPer = usePrev ? this.store.previousPayrollVariableMonth(period) : period;
    if (userId && userId !== "company") {
      try {
        const ps = await this.store.generatePayslip(userId, period, {
          status: "draft",
          variablePeriod: varPer
        });
        return {
          ...row,
          status: "applied",
          detail: `Bozza cedolino ${period} (${ps.id.slice(0, 8)}…)`
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ...row, status: "error", errorMessage: msg };
      }
    }
    const results = await this.store.batchGenerateDraftPayslips(ctx.auth.userId, period, {
      usePreviousMonthVariables: usePrev
    });
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    return {
      ...row,
      status: "applied",
      detail: `Cedolini ${period}: ${ok} bozze generate${fail > 0 ? `, ${fail} errori` : ""}`
    };
  }

  private async applyCompensationBenchmark(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const target = await this.store.getUser(userId);
    if (!target.roleId) {
      return { ...row, status: "error", errorMessage: "Dipendente senza ruolo organizzativo per il benchmark" };
    }
    const location = String(row.payload.location ?? "Italia");
    const seniorityYears = Number(row.payload.seniorityYears ?? 0);
    const est = await this.compensationBench.estimate(ctx.auth, {
      roleSource: "org_select",
      orgRoleId: target.roleId,
      location,
      seniorityYears
    });
    return {
      ...row,
      status: "applied",
      detail: `RAL stimata ${est.ralLowEur}–${est.ralHighEur} EUR (mediana ${est.ralMedianEur}) — ${target.fullName}`
    };
  }

  private async applyExportEmployeesPreview(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const fieldIds =
      Array.isArray(row.payload.fieldIds) && row.payload.fieldIds.length > 0
        ? (row.payload.fieldIds as string[])
        : DEFAULT_EXPORT_FIELD_IDS;
    const preview = await this.store.buildAdminExportPreview(ctx.auth.userId, fieldIds);
    const validIds = new Set(ADMIN_EXPORT_FIELD_CATALOG.map((f) => f.id));
    const unknown = fieldIds.filter((id) => !validIds.has(id));
    if (unknown.length > 0) {
      return { ...row, status: "error", errorMessage: `Campi export sconosciuti: ${unknown.join(", ")}` };
    }
    const scopeIds = new Set(
      Array.isArray(row.payload.scopeUserIds) ? (row.payload.scopeUserIds as string[]) : []
    );
    const scopedRows =
      scopeIds.size > 0 ? preview.rows.filter((r) => scopeIds.has(String(r.userId ?? ""))) : preview.rows;
    return {
      ...row,
      status: "applied",
      detail: `Anteprima export: ${scopedRows.length} righe nel perimetro, ${preview.columns.length} colonne`
    };
  }

  private async applyLinkedInSync(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const companyId = ctx.companyId.trim();
    const positionIds = Array.isArray(row.payload.positionIds)
      ? (row.payload.positionIds as string[]).filter(Boolean)
      : [];
    if (positionIds.length > 0) {
      let synced = 0;
      let lastTitle = "";
      for (const pid of positionIds.slice(0, 5)) {
        const published = await this.linkedInSync.publishPositionToLinkedIn(companyId, pid);
        synced += 1;
        lastTitle = published.title;
      }
      const more = positionIds.length > synced ? ` (+${positionIds.length - synced} in coda)` : "";
      return {
        ...row,
        status: "applied",
        detail: `LinkedIn: ${synced} posizione/i (${lastTitle})${more}`
      };
    }
    const positionId = String(row.payload.positionId ?? "");
    if (positionId) {
      const published = await this.linkedInSync.publishPositionToLinkedIn(companyId, positionId);
      return {
        ...row,
        status: "applied",
        detail: `LinkedIn: ${published.title} (${published.linkedin_sync_status})`
      };
    }
    const positions = await this.recruiting.listPositions(companyId);
    const open = positions.filter((p) => p.status === "open" && p.linkedin_sync_status !== "synced");
    if (open.length === 0) {
      return { ...row, status: "applied", detail: "Nessuna posizione aperta da sincronizzare su LinkedIn" };
    }
    let synced = 0;
    let lastTitle = "";
    for (const p of open.slice(0, 5)) {
      await this.linkedInSync.publishPositionToLinkedIn(companyId, p.id);
      synced += 1;
      lastTitle = p.title;
    }
    const more = open.length > synced ? ` (+${open.length - synced} in coda)` : "";
    return {
      ...row,
      status: "applied",
      detail: `LinkedIn: ${synced} posizione/i pubblicate (ultima: ${lastTitle})${more}`
    };
  }

  private async applyTrainingBatch(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const companyId = String(row.payload.companyId ?? ctx.companyId);
    const courseIds = Array.isArray(row.payload.courseIds)
      ? (row.payload.courseIds as unknown[]).map((x) => String(x)).filter(Boolean)
      : [];
    const dueDate = String(row.payload.dueDate).slice(0, 10);
    const assignments = await this.training.assignCoursesBatch({
      companyId,
      userIds: [userId],
      courseIds,
      dueDate,
      assignedBy: ctx.auth.userId
    });
    return {
      ...row,
      status: "applied",
      detail: `${assignments.length} assegnazione/i formazione (${dueDate})`
    };
  }

  private async applyAssignTrainingCourse(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const companyId = String(row.payload.companyId ?? ctx.companyId);
    const courseId = String(row.payload.courseId ?? "");
    const dueDate = String(row.payload.dueDate).slice(0, 10);
    const assignment = await this.training.assignCourse({
      companyId,
      userId,
      courseId,
      dueDate,
      assignedBy: ctx.auth.userId
    });
    const title = assignment.course?.title ?? courseId;
    return {
      ...row,
      status: "applied",
      detail: `«${title}» assegnato (scadenza ${assignment.dueDate})`
    };
  }

  private async applyOnboardingFromCandidate(
    ctx: CoworkExecutorContext,
    row: CoworkPlanRow
  ): Promise<CoworkPlanRow> {
    const candidateId = String(row.payload.candidateId ?? "");
    const result = await this.onboarding.startFromCandidate({
      companyId: ctx.companyId,
      candidateId,
      actorUserId: ctx.auth.userId
    });
    return {
      ...row,
      status: "applied",
      userId: result.user.id,
      fullName: result.user.fullName,
      detail: `Onboarding avviato per ${result.user.fullName} (${result.user.email})`
    };
  }

  private async applyOnboardingWizardReminder(
    ctx: CoworkExecutorContext,
    row: CoworkPlanRow
  ): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const stepTitle = row.payload.pendingStepTitle != null ? String(row.payload.pendingStepTitle) : undefined;
    await this.onboarding.sendWizardReminder({
      companyId: ctx.companyId,
      userId,
      requestedByUserId: ctx.auth.userId,
      pendingStepTitle: stepTitle
    });
    return {
      ...row,
      status: "applied",
      detail: `Promemoria inviato${stepTitle ? `: ${stepTitle}` : ""}`
    };
  }

  private async applyUploadEmployeeDocument(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const title = String(row.payload.title ?? "Documento Cowork");
    const kind = (row.payload.kind as EmployeeDocumentKind) ?? "other";
    const doc = await this.store.createEmployeeDocument({
      userId,
      uploadedBy: ctx.auth.userId,
      kind,
      title
    });
    return {
      ...row,
      status: "applied",
      detail: `Scheda documento «${doc.title}» (${doc.kind}) — allega file da vault se necessario`,
      payload: { ...row.payload, documentId: doc.id }
    };
  }

  private async applyLinkDocumentAck(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const documentId = String(row.payload.documentId ?? "");
    if (!documentId) {
      return { ...row, status: "error", errorMessage: "documentId mancante" };
    }
    await this.store.sendEmployeeDocumentVaultReminder(ctx.auth.userId, ctx.auth.role, documentId);
    return {
      ...row,
      status: "applied",
      detail: `Promemoria documento ${documentId.slice(0, 8)}… inviato`
    };
  }

  private async applyThirdPartyLicenseAssign(
    ctx: CoworkExecutorContext,
    row: CoworkPlanRow
  ): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const licenseId = String(row.payload.licenseId ?? "");
    if (!licenseId) {
      return { ...row, status: "error", errorMessage: "licenseId mancante" };
    }
    const existing = await this.thirdPartyLicenses.listAssignmentsForUser(ctx.companyId, userId);
    const items = [
      ...existing
        .filter((a) => a.license_id !== licenseId)
        .map((a) => ({
          licenseId: a.license_id,
          status: a.status,
          assignedAt: a.assigned_at,
          notes: a.notes
        })),
      { licenseId, status: "active" as const, assignedAt: new Date().toISOString(), notes: "Cowork" }
    ];
    await this.thirdPartyLicenses.syncUserAssignments(ctx.companyId, userId, items);
    return { ...row, status: "applied", detail: `Licenza ${licenseId.slice(0, 8)}… assegnata` };
  }

  private async applySyncTeamCalendarView(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userIds = Array.isArray(row.payload.userIds)
      ? (row.payload.userIds as string[]).filter(Boolean)
      : row.payload.userId
        ? [String(row.payload.userId)]
        : row.userId
          ? [row.userId]
          : [];
    const from = row.payload.from != null ? String(row.payload.from).slice(0, 10) : undefined;
    const to = row.payload.to != null ? String(row.payload.to).slice(0, 10) : undefined;
    const events = await this.store.getTeamWorkCalendar(userIds, from, to);
    const summary = this.store.buildTeamWorkCalendarExportSummary(userIds, events, from, to);
    return {
      ...row,
      status: "applied",
      detail: `Calendario ${summary.from ?? "—"} → ${summary.to ?? "—"}: ${summary.eventCount} eventi su ${summary.userCount} profili`
    };
  }

  private async applyAttendanceQrBatch(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const entryType = (row.payload.entryType as "clock_in" | "clock_out") ?? "clock_in";
    const day = String(row.payload.day ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const at =
      row.payload.at != null
        ? String(row.payload.at)
        : entryType === "clock_out"
          ? `${day}T18:00:00.000Z`
          : `${day}T09:00:00.000Z`;
    await this.attendanceTeam.bulkAddTeamEntries(ctx.auth.userId, [
      { userId, type: entryType, at, source: "web" }
    ]);
    return {
      ...row,
      status: "applied",
      detail: `Timbratura ${entryType === "clock_in" ? "entrata" : "uscita"} ${day}`
    };
  }

  private async applyCorporatePolicyPublish(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const userId = String(row.payload.userId ?? row.userId);
    const policyTitle = String(row.payload.policyTitle ?? "Policy aziendale");
    const policyId = String(row.payload.policyId ?? "");
    await this.store.notifyUserInApp({
      userId,
      title: "Nuova policy aziendale",
      body: `È disponibile la policy «${policyTitle}». Apri Policy aziendali per leggerla.`,
      kind: "corporate_policy_publish",
      actionPath: "/hr/policy"
    });
    return {
      ...row,
      status: "applied",
      detail: `Comunicazione policy ${policyId.slice(0, 8)}… inviata`
    };
  }
}
