import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import type { HebbMateCapabilityId } from "./hebb-mate.types";

export type HebbMateApplyLogUndoStatus = "available" | "undone" | "blocked" | "failed";

export type HebbMateApplyLogEntry = {
  id: string;
  companyId: string;
  proposalId: string;
  actorUserId: string;
  capability: HebbMateCapabilityId;
  subjectUserId: string | null;
  subjectFullName: string;
  entityType: string | null;
  entityId: string | null;
  previousState: Record<string, unknown> | null;
  appliedPayload: Record<string, unknown>;
  detail: string;
  undoStatus: HebbMateApplyLogUndoStatus;
  undoBlockedReason: string | null;
  appliedAt: string;
  undoneAt: string | null;
  undoneByUserId: string | null;
};

export type HebbMateApplyLogInsert = Omit<
  HebbMateApplyLogEntry,
  "id" | "undoneAt" | "undoneByUserId" | "appliedAt"
> & {
  id?: string;
  appliedAt?: string;
  undoStatus?: HebbMateApplyLogUndoStatus;
  undoBlockedReason?: string | null;
};

@Injectable()
export class HebbMateApplyLogStore {
  private readonly mem: HebbMateApplyLogEntry[] = [];

  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private mapRow(row: Record<string, unknown>): HebbMateApplyLogEntry {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      proposalId: String(row.proposal_id),
      actorUserId: String(row.actor_user_id),
      capability: String(row.capability) as HebbMateCapabilityId,
      subjectUserId: row.subject_user_id != null ? String(row.subject_user_id) : null,
      subjectFullName: String(row.subject_full_name ?? ""),
      entityType: row.entity_type != null ? String(row.entity_type) : null,
      entityId: row.entity_id != null ? String(row.entity_id) : null,
      previousState:
        row.previous_state && typeof row.previous_state === "object"
          ? (row.previous_state as Record<string, unknown>)
          : null,
      appliedPayload:
        row.applied_payload && typeof row.applied_payload === "object"
          ? (row.applied_payload as Record<string, unknown>)
          : {},
      detail: String(row.detail ?? ""),
      undoStatus: String(row.undo_status) as HebbMateApplyLogUndoStatus,
      undoBlockedReason: row.undo_blocked_reason != null ? String(row.undo_blocked_reason) : null,
      appliedAt: String(row.applied_at),
      undoneAt: row.undone_at != null ? String(row.undone_at) : null,
      undoneByUserId: row.undone_by_user_id != null ? String(row.undone_by_user_id) : null
    };
  }

  async append(entry: HebbMateApplyLogInsert): Promise<HebbMateApplyLogEntry> {
    const full: HebbMateApplyLogEntry = {
      id: entry.id ?? randomUUID(),
      companyId: entry.companyId,
      proposalId: entry.proposalId,
      actorUserId: entry.actorUserId,
      capability: entry.capability,
      subjectUserId: entry.subjectUserId,
      subjectFullName: entry.subjectFullName,
      entityType: entry.entityType,
      entityId: entry.entityId,
      previousState: entry.previousState,
      appliedPayload: entry.appliedPayload,
      detail: entry.detail,
      undoStatus: entry.undoStatus ?? "available",
      undoBlockedReason: entry.undoBlockedReason ?? null,
      appliedAt: entry.appliedAt ?? new Date().toISOString(),
      undoneAt: null,
      undoneByUserId: null
    };

    const { error } = await this.sb().from("hr_hebb_mate_apply_log").insert({
      id: full.id,
      company_id: full.companyId,
      proposal_id: full.proposalId,
      actor_user_id: full.actorUserId,
      capability: full.capability,
      subject_user_id: full.subjectUserId,
      subject_full_name: full.subjectFullName,
      entity_type: full.entityType,
      entity_id: full.entityId,
      previous_state: full.previousState,
      applied_payload: full.appliedPayload,
      detail: full.detail,
      undo_status: full.undoStatus,
      undo_blocked_reason: full.undoBlockedReason,
      applied_at: full.appliedAt
    });

    if (error) {
      /* mem fallback */
    }
    this.mem.unshift(full);
    return full;
  }

  async getById(id: string, companyId: string): Promise<HebbMateApplyLogEntry | null> {
    const cached = this.mem.find((e) => e.id === id && e.companyId === companyId);
    if (cached) {
      return cached;
    }

    const { data, error } = await this.sb()
      .from("hr_hebb_mate_apply_log")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return this.mapRow(data as Record<string, unknown>);
  }

  async listRecent(companyId: string, limit = 40): Promise<HebbMateApplyLogEntry[]> {
    const { data, error } = await this.sb()
      .from("hr_hebb_mate_apply_log")
      .select("*")
      .eq("company_id", companyId)
      .order("applied_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return this.mem.filter((e) => e.companyId === companyId).slice(0, limit);
    }
    return (data as Record<string, unknown>[]).map((row) => this.mapRow(row));
  }

  async markUndone(id: string, companyId: string, undoneByUserId: string): Promise<void> {
    const undoneAt = new Date().toISOString();
    await this.sb()
      .from("hr_hebb_mate_apply_log")
      .update({ undo_status: "undone", undone_at: undoneAt, undone_by_user_id: undoneByUserId })
      .eq("id", id)
      .eq("company_id", companyId);

    const cached = this.mem.find((e) => e.id === id && e.companyId === companyId);
    if (cached) {
      cached.undoStatus = "undone";
      cached.undoneAt = undoneAt;
      cached.undoneByUserId = undoneByUserId;
    }
  }

  async markFailed(id: string, companyId: string, reason: string): Promise<void> {
    await this.sb()
      .from("hr_hebb_mate_apply_log")
      .update({ undo_status: "failed", undo_blocked_reason: reason })
      .eq("id", id)
      .eq("company_id", companyId);

    const cached = this.mem.find((e) => e.id === id && e.companyId === companyId);
    if (cached) {
      cached.undoStatus = "failed";
      cached.undoBlockedReason = reason;
    }
  }
}
