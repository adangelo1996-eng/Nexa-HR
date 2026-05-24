import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import type { HebbMateAutomationProposal } from "./hebb-mate.types";

export type HebbMateAutomationStatus = "active" | "paused" | "archived";

export type HebbMateAutomationAction = {
  type: string;
  label: string;
  toolId?: string;
  payload?: Record<string, unknown>;
};

export type HebbMateAutomationRecord = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  workArea: string;
  frequency: HebbMateAutomationProposal["frequency"];
  scheduleHint: string;
  cronExpression: string | null;
  actions: HebbMateAutomationAction[];
  toolId: string | null;
  scopeKind: "self" | "employees" | "company";
  subjectUserIds: string[];
  status: HebbMateAutomationStatus;
  createdByUserId: string;
  proposalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HebbMateAutomationInsert = Omit<
  HebbMateAutomationRecord,
  "id" | "createdAt" | "updatedAt" | "status"
> & {
  id?: string;
  status?: HebbMateAutomationStatus;
  createdAt?: string;
  updatedAt?: string;
};

@Injectable()
export class HebbMateAutomationsStore {
  private readonly mem: HebbMateAutomationRecord[] = [];

  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private mapRow(row: Record<string, unknown>): HebbMateAutomationRecord {
    const actionsRaw = row.actions;
    const actions = Array.isArray(actionsRaw)
      ? (actionsRaw as HebbMateAutomationAction[])
      : [];
    const subjectIdsRaw = row.subject_user_ids;
    const subjectUserIds = Array.isArray(subjectIdsRaw)
      ? subjectIdsRaw.map((id) => String(id))
      : [];

    return {
      id: String(row.id),
      companyId: String(row.company_id),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      workArea: String(row.work_area ?? "all"),
      frequency: String(row.frequency) as HebbMateAutomationProposal["frequency"],
      scheduleHint: String(row.schedule_hint ?? ""),
      cronExpression: row.cron_expression != null ? String(row.cron_expression) : null,
      actions,
      toolId: row.tool_id != null ? String(row.tool_id) : null,
      scopeKind: String(row.scope_kind) as HebbMateAutomationRecord["scopeKind"],
      subjectUserIds,
      status: String(row.status) as HebbMateAutomationStatus,
      createdByUserId: String(row.created_by_user_id),
      proposalId: row.proposal_id != null ? String(row.proposal_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  async listActive(companyId: string, limit = 50): Promise<HebbMateAutomationRecord[]> {
    const { data, error } = await this.sb()
      .from("hr_hebb_mate_automations")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return this.mem.filter((a) => a.companyId === companyId && a.status === "active").slice(0, limit);
    }
    return (data as Record<string, unknown>[]).map((row) => this.mapRow(row));
  }

  async createMany(entries: HebbMateAutomationInsert[]): Promise<HebbMateAutomationRecord[]> {
    const now = new Date().toISOString();
    const full: HebbMateAutomationRecord[] = entries.map((entry) => ({
      id: entry.id ?? randomUUID(),
      companyId: entry.companyId,
      title: entry.title,
      description: entry.description,
      workArea: entry.workArea,
      frequency: entry.frequency,
      scheduleHint: entry.scheduleHint,
      cronExpression: entry.cronExpression ?? null,
      actions: entry.actions,
      toolId: entry.toolId ?? null,
      scopeKind: entry.scopeKind,
      subjectUserIds: entry.subjectUserIds,
      status: entry.status ?? "active",
      createdByUserId: entry.createdByUserId,
      proposalId: entry.proposalId ?? null,
      createdAt: entry.createdAt ?? now,
      updatedAt: entry.updatedAt ?? now
    }));

    const rows = full.map((a) => ({
      id: a.id,
      company_id: a.companyId,
      title: a.title,
      description: a.description,
      work_area: a.workArea,
      frequency: a.frequency,
      schedule_hint: a.scheduleHint,
      cron_expression: a.cronExpression,
      actions: a.actions,
      tool_id: a.toolId,
      scope_kind: a.scopeKind,
      subject_user_ids: a.subjectUserIds,
      status: a.status,
      created_by_user_id: a.createdByUserId,
      proposal_id: a.proposalId,
      created_at: a.createdAt,
      updated_at: a.updatedAt
    }));

    const { error } = await this.sb().from("hr_hebb_mate_automations").insert(rows);
    if (error) {
      /* mem fallback */
    }
    this.mem.unshift(...full);
    return full;
  }

  async archive(id: string, companyId: string): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.sb()
      .from("hr_hebb_mate_automations")
      .update({ status: "archived", updated_at: updatedAt })
      .eq("id", id)
      .eq("company_id", companyId);

    const cached = this.mem.find((a) => a.id === id && a.companyId === companyId);
    if (cached) {
      cached.status = "archived";
      cached.updatedAt = updatedAt;
    }
  }
}
