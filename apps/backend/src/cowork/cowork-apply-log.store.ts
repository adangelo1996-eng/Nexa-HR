import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import type { CoworkDomain } from "./cowork.types";

export type CoworkApplyLogUndoStatus = "available" | "undone" | "blocked" | "failed";

export type CoworkApplyLogEntry = {
  id: string;
  companyId: string;
  planId: string;
  batchId: string;
  rowId: string;
  actorUserId: string;
  toolId: string;
  domain: CoworkDomain;
  subjectUserId: string | null;
  subjectFullName: string;
  entityType: string | null;
  entityId: string | null;
  previousState: Record<string, unknown> | null;
  appliedPayload: Record<string, unknown>;
  detail: string;
  undoStatus: CoworkApplyLogUndoStatus;
  undoBlockedReason: string | null;
  appliedAt: string;
  undoneAt: string | null;
  undoneByUserId: string | null;
};

export type CoworkApplyLogInsert = Omit<
  CoworkApplyLogEntry,
  "id" | "undoneAt" | "undoneByUserId" | "appliedAt"
> & {
  id?: string;
  appliedAt?: string;
  undoStatus?: CoworkApplyLogUndoStatus;
  undoBlockedReason?: string | null;
};

type ApplyLogRow = Record<string, unknown>;

@Injectable()
export class CoworkApplyLogStore {
  private readonly mem: CoworkApplyLogEntry[] = [];

  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private mapRow(row: ApplyLogRow): CoworkApplyLogEntry {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      planId: String(row.plan_id),
      batchId: String(row.batch_id),
      rowId: String(row.row_id),
      actorUserId: String(row.actor_user_id),
      toolId: String(row.tool_id),
      domain: String(row.domain) as CoworkDomain,
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
      undoStatus: String(row.undo_status) as CoworkApplyLogUndoStatus,
      undoBlockedReason: row.undo_blocked_reason != null ? String(row.undo_blocked_reason) : null,
      appliedAt: String(row.applied_at),
      undoneAt: row.undone_at != null ? String(row.undone_at) : null,
      undoneByUserId: row.undone_by_user_id != null ? String(row.undone_by_user_id) : null
    };
  }

  async append(entry: CoworkApplyLogInsert): Promise<CoworkApplyLogEntry> {
    const id = entry.id ?? randomUUID();
    const appliedAt = entry.appliedAt ?? new Date().toISOString();
    const full: CoworkApplyLogEntry = {
      id,
      companyId: entry.companyId,
      planId: entry.planId,
      batchId: entry.batchId,
      rowId: entry.rowId,
      actorUserId: entry.actorUserId,
      toolId: entry.toolId,
      domain: entry.domain,
      subjectUserId: entry.subjectUserId,
      subjectFullName: entry.subjectFullName,
      entityType: entry.entityType,
      entityId: entry.entityId,
      previousState: entry.previousState,
      appliedPayload: entry.appliedPayload,
      detail: entry.detail,
      undoStatus: entry.undoStatus ?? "available",
      undoBlockedReason: entry.undoBlockedReason ?? null,
      appliedAt,
      undoneAt: null,
      undoneByUserId: null
    };

    const sb = this.sb();
    const { error } = await sb.from("hr_cowork_apply_log").insert({
      id: full.id,
      company_id: full.companyId,
      plan_id: full.planId,
      batch_id: full.batchId,
      row_id: full.rowId,
      actor_user_id: full.actorUserId,
      tool_id: full.toolId,
      domain: full.domain,
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
      this.mem.unshift(full);
    } else {
      this.mem.unshift(full);
    }
    return full;
  }

  async getById(id: string, companyId: string): Promise<CoworkApplyLogEntry | null> {
    const cached = this.mem.find((e) => e.id === id && e.companyId === companyId);
    if (cached) {
      return cached;
    }

    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_cowork_apply_log")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !data) {
      return this.mem.find((e) => e.id === id && e.companyId === companyId) ?? null;
    }
    const mapped = this.mapRow(data as ApplyLogRow);
    this.mem.unshift(mapped);
    return mapped;
  }

  async getByPlanRow(planId: string, rowId: string, companyId: string): Promise<CoworkApplyLogEntry | null> {
    const cached = this.mem.find(
      (e) => e.planId === planId && e.rowId === rowId && e.companyId === companyId && e.undoStatus === "available"
    );
    if (cached) {
      return cached;
    }

    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_cowork_apply_log")
      .select("*")
      .eq("plan_id", planId)
      .eq("row_id", rowId)
      .eq("company_id", companyId)
      .eq("undo_status", "available")
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return (
        this.mem.find(
          (e) => e.planId === planId && e.rowId === rowId && e.companyId === companyId && e.undoStatus === "available"
        ) ?? null
      );
    }
    const mapped = this.mapRow(data as ApplyLogRow);
    this.mem.unshift(mapped);
    return mapped;
  }

  async listSince(
    companyId: string,
    sinceIso: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ items: CoworkApplyLogEntry[]; total: number }> {
    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;

    const sb = this.sb();
    const { data, error, count } = await sb
      .from("hr_cowork_apply_log")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .gte("applied_at", sinceIso)
      .order("applied_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      const filtered = this.mem
        .filter((e) => e.companyId === companyId && e.appliedAt >= sinceIso)
        .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
      return { items: filtered.slice(offset, offset + limit), total: filtered.length };
    }

    const items = (data as ApplyLogRow[]).map((row) => this.mapRow(row));
    for (const item of items) {
      if (!this.mem.some((m) => m.id === item.id)) {
        this.mem.unshift(item);
      }
    }
    return { items, total: count ?? items.length };
  }

  async markUndone(id: string, companyId: string, actorUserId: string): Promise<CoworkApplyLogEntry | null> {
    const undoneAt = new Date().toISOString();
    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_cowork_apply_log")
      .update({
        undo_status: "undone",
        undone_at: undoneAt,
        undone_by_user_id: actorUserId
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();

    const memIdx = this.mem.findIndex((e) => e.id === id && e.companyId === companyId);
    if (memIdx >= 0) {
      this.mem[memIdx] = {
        ...this.mem[memIdx],
        undoStatus: "undone",
        undoneAt,
        undoneByUserId: actorUserId
      };
      if (!error && data) {
        return this.mapRow(data as ApplyLogRow);
      }
      return this.mem[memIdx];
    }

    if (error || !data) {
      return null;
    }
    return this.mapRow(data as ApplyLogRow);
  }

  async markFailed(id: string, companyId: string, reason: string): Promise<void> {
    const sb = this.sb();
    await sb
      .from("hr_cowork_apply_log")
      .update({ undo_status: "failed", undo_blocked_reason: reason })
      .eq("id", id)
      .eq("company_id", companyId);

    const memIdx = this.mem.findIndex((e) => e.id === id && e.companyId === companyId);
    if (memIdx >= 0) {
      this.mem[memIdx] = {
        ...this.mem[memIdx],
        undoStatus: "failed",
        undoBlockedReason: reason
      };
    }
  }
}
