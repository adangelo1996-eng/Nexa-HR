import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthRole } from "../platform/auth";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { COWORK_HIGH_RISK_TOOL_IDS } from "./cowork-tool-catalog";
import type { CoworkApplyLogEntry } from "./cowork-apply-log.store";
import { CoworkApplyLogStore } from "./cowork-apply-log.store";

const NON_REVERSIBLE_TOOLS = new Set([
  "renew_agreements",
  "publish_payslips_period",
  "payroll_batch_generate",
  "run_hr_center_recap",
  "run_retention_analysis",
  "evaluate_hr_alerts",
  "export_employees_preview",
  "sync_team_calendar_view",
  "compensation_benchmark_estimate",
  "corporate_policy_publish",
  "link_document_ack",
  "onboarding_wizard_reminder",
  "hr_recap_reminder",
  "recruiting_linkedin_sync",
  "create_innovation_job",
  "attendance_qr_batch",
  "upload_employee_document"
]);

import type { CoworkUndoRequest } from "./cowork.types";

export type { CoworkUndoRequest };

export type CoworkUndoResult = {
  ok: boolean;
  logId: string;
  message: string;
  reversible: boolean;
};

@Injectable()
export class CoworkUndoService {
  constructor(
    private readonly store: HrDataStore,
    private readonly applyLog: CoworkApplyLogStore
  ) {}

  isToolReversible(toolId: string): { reversible: boolean; reason?: string } {
    if (COWORK_HIGH_RISK_TOOL_IDS.has(toolId) || NON_REVERSIBLE_TOOLS.has(toolId)) {
      if (toolId === "publish_payslips_period" || toolId === "payroll_batch_generate") {
        return {
          reversible: false,
          reason: "Operazione payroll ad alto impatto: annullamento non consentito da Cowork"
        };
      }
      if (toolId === "renew_agreements") {
        return {
          reversible: false,
          reason: "Rinnovo accordi smart working non reversibile automaticamente"
        };
      }
      return {
        reversible: false,
        reason: "Questa operazione non supporta l'undo automatico"
      };
    }
    return { reversible: true };
  }

  buildLogUndoMeta(toolId: string): Pick<CoworkApplyLogEntry, "undoStatus" | "undoBlockedReason"> {
    const check = this.isToolReversible(toolId);
    if (!check.reversible) {
      return { undoStatus: "blocked", undoBlockedReason: check.reason ?? "Non reversibile" };
    }
    return { undoStatus: "available", undoBlockedReason: null };
  }

  async undo(auth: AuthContext, body: CoworkUndoRequest): Promise<CoworkUndoResult> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId;

    const entry =
      "logId" in body
        ? await this.applyLog.getById(body.logId, companyId)
        : await this.applyLog.getByPlanRow(body.planId, body.rowId, companyId);

    if (!entry) {
      throw new NotFoundException("Voce di log Cowork non trovata");
    }

    if (entry.undoStatus === "undone") {
      throw new BadRequestException("Operazione già annullata");
    }
    if (entry.undoStatus === "blocked") {
      throw new BadRequestException(entry.undoBlockedReason ?? "Operazione non reversibile");
    }
    if (entry.undoStatus === "failed") {
      throw new BadRequestException(entry.undoBlockedReason ?? "Undo precedente fallito");
    }

    const reversibility = this.isToolReversible(entry.toolId);
    if (!reversibility.reversible) {
      throw new BadRequestException(reversibility.reason ?? "Operazione non reversibile");
    }

    try {
      await this.reverseEntry(auth, entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.applyLog.markFailed(entry.id, companyId, msg);
      throw new BadRequestException(`Undo non riuscito: ${msg}`);
    }

    await this.applyLog.markUndone(entry.id, companyId, auth.userId);
    return {
      ok: true,
      logId: entry.id,
      message: "Operazione annullata",
      reversible: true
    };
  }

  private async reverseEntry(auth: AuthContext, entry: CoworkApplyLogEntry): Promise<void> {
    const role = auth.role as AuthRole;
    const toolId = entry.toolId;
    const entityId = entry.entityId ?? String(entry.appliedPayload.entityId ?? "");

    switch (toolId) {
      case "create_leave_plan": {
        if (!entityId) {
          throw new BadRequestException("ID ferie mancante nel log");
        }
        await this.store.cancelPendingLeavePlan(entityId, auth.userId, role);
        return;
      }
      case "create_smartworking_request": {
        if (!entityId) {
          throw new BadRequestException("ID richiesta SW mancante nel log");
        }
        await this.store.cancelSmartworkingRequest(auth.userId, entityId, role);
        return;
      }
      case "create_travel_request": {
        if (!entityId) {
          throw new BadRequestException("ID trasferta mancante nel log");
        }
        await this.store.cancelTravelRequest(auth.userId, entityId, role);
        return;
      }
      case "create_sickness_report": {
        if (!entityId) {
          throw new BadRequestException("ID malattia mancante nel log");
        }
        await this.store.cancelPendingSicknessEvent(entityId, auth.userId, role);
        return;
      }
      case "create_meeting_room_booking": {
        const bookingId = String(entry.appliedPayload.bookingId ?? entityId);
        if (!bookingId) {
          throw new BadRequestException("ID prenotazione mancante nel log");
        }
        await this.store.cancelMeetingRoomBooking(auth.userId, bookingId);
        return;
      }
      case "cancel_meeting_room_booking":
        throw new BadRequestException("Annullamento prenotazione non reversibile");
      case "approve_pending_leaves": {
        if (!entityId) {
          throw new BadRequestException("ID ferie mancante nel log");
        }
        const leave = await this.store.getLeave(entityId);
        if (leave.status !== "approved") {
          throw new BadRequestException("Solo approvazioni ferie possono essere annullate con reject");
        }
        await this.store.rejectLeave(entityId, auth.userId);
        return;
      }
      case "approve_pending_smartworking": {
        if (!entityId) {
          throw new BadRequestException("ID richiesta SW mancante nel log");
        }
        await this.store.decideSmartworkingRequest(entityId, auth.userId, false, "Annullato da Cowork undo");
        return;
      }
      case "extend_approved_requests": {
        if (!entityId || !entry.previousState) {
          throw new BadRequestException("Stato precedente richiesta non disponibile per il ripristino");
        }
        const prevEnd = String(entry.previousState.endDay ?? entry.previousState.day ?? "");
        const prevDay = String(entry.previousState.day ?? prevEnd);
        await this.store.updateSmartworkingRequest(
          auth.userId,
          entityId,
          prevDay,
          entry.previousState.note != null ? String(entry.previousState.note) : null,
          role,
          prevEnd || undefined
        );
        return;
      }
      case "update_contract_sw_clause":
        throw new BadRequestException(
          "Modifica contratto non reversibile automaticamente: ripristina manualmente la bozza precedente"
        );
      case "create_shift_batch": {
        const shiftId = String(entry.appliedPayload.shiftId ?? entityId);
        if (!shiftId) {
          throw new BadRequestException("ID turno mancante nel log");
        }
        await this.store.deleteShift(auth.userId, role, shiftId);
        return;
      }
      case "create_expense_claim": {
        const claimId = String(entry.appliedPayload.claimId ?? entityId);
        if (!claimId) {
          throw new BadRequestException("ID nota spese mancante nel log");
        }
        await this.store.deleteExpenseClaimByRequester(claimId, auth.userId);
        return;
      }
      case "approve_pending_expenses": {
        const claimId = String(entry.appliedPayload.claimId ?? entityId);
        if (!claimId) {
          throw new BadRequestException("ID nota spese mancante nel log");
        }
        await this.store.rejectExpenseClaim(claimId, auth.userId);
        return;
      }
      case "update_leave_allowance": {
        if (!entry.previousState || entry.subjectUserId == null) {
          throw new BadRequestException("Monte ferie precedente non registrato");
        }
        await this.store.setLeaveAllowance(
          entry.subjectUserId,
          Number(entry.previousState.allocatedDays)
        );
        return;
      }
      case "personnel_budget_adjust": {
        if (!entry.previousState || entry.subjectUserId == null) {
          throw new BadRequestException("Budget precedente non registrato");
        }
        const year = Number(entry.previousState.year);
        const month = Number(entry.previousState.month);
        const budgetRal = Number(entry.previousState.budgetRal);
        await this.store.upsertPersonnelBudgetCells(entry.companyId, year, month, [
          { userId: entry.subjectUserId, budgetRal }
        ]);
        return;
      }
      case "assign_training_course":
      case "training_batch": {
        const assignmentIds = entry.appliedPayload.assignmentIds;
        if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
          throw new BadRequestException("Assegnazioni formazione non registrate per undo");
        }
        throw new BadRequestException(
          "Rimozione assegnazioni formazione: usa il modulo Formazione per revocare manualmente"
        );
      }
      case "start_offboarding":
        throw new BadRequestException("Offboarding avviato non reversibile da Cowork");
      case "start_onboarding_from_candidate":
        throw new BadRequestException("Onboarding avviato non reversibile da Cowork");
      case "third_party_license_assign":
        throw new BadRequestException("Assegnazione licenza: ripristina manualmente le assegnazioni utente");
      default:
        throw new BadRequestException(`Undo non implementato per il tool ${toolId}`);
    }
  }
}
