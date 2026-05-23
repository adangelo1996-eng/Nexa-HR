import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";

export type CoworkRequestStatus = "draft" | "planned" | "applied" | "cancelled";

export type CoworkRequestEntry = {
  id: string;
  companyId: string;
  actorUserId: string;
  message: string;
  status: CoworkRequestStatus;
  planId: string | null;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  costCenterId: string | null;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
};

type RequestRow = Record<string, unknown>;

@Injectable()
export class CoworkRequestsStore {
  private readonly mem: CoworkRequestEntry[] = [];

  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private mapRow(row: RequestRow): CoworkRequestEntry {
    const history = row.conversation_history;
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      actorUserId: String(row.actor_user_id),
      message: String(row.message ?? ""),
      status: String(row.status) as CoworkRequestStatus,
      planId: row.plan_id != null ? String(row.plan_id) : null,
      conversationHistory: Array.isArray(history)
        ? (history as CoworkRequestEntry["conversationHistory"])
        : [],
      costCenterId: row.cost_center_id != null ? String(row.cost_center_id) : null,
      teamId: row.team_id != null ? String(row.team_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      cancelledAt: row.cancelled_at != null ? String(row.cancelled_at) : null,
      cancelledBy: row.cancelled_by != null ? String(row.cancelled_by) : null
    };
  }

  async upsertDraft(input: {
    companyId: string;
    actorUserId: string;
    message: string;
    conversationHistory?: CoworkRequestEntry["conversationHistory"];
    costCenterId?: string;
    teamId?: string;
    requestId?: string;
  }): Promise<CoworkRequestEntry> {
    const now = new Date().toISOString();
    const existing =
      (input.requestId
        ? this.mem.find((r) => r.id === input.requestId && r.companyId === input.companyId)
        : null) ??
      this.mem.find(
        (r) =>
          r.companyId === input.companyId &&
          r.actorUserId === input.actorUserId &&
          r.status === "draft"
      );

    const entry: CoworkRequestEntry = {
      id: existing?.id ?? input.requestId ?? randomUUID(),
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      message: input.message,
      status: "draft",
      planId: existing?.planId ?? null,
      conversationHistory: input.conversationHistory ?? existing?.conversationHistory ?? [],
      costCenterId: input.costCenterId ?? existing?.costCenterId ?? null,
      teamId: input.teamId ?? existing?.teamId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      cancelledAt: null,
      cancelledBy: null
    };

    const sb = this.sb();
    const { error } = await sb.from("hr_cowork_requests").upsert(
      {
        id: entry.id,
        company_id: entry.companyId,
        actor_user_id: entry.actorUserId,
        message: entry.message,
        status: entry.status,
        plan_id: entry.planId,
        conversation_history: entry.conversationHistory,
        cost_center_id: entry.costCenterId,
        team_id: entry.teamId,
        updated_at: entry.updatedAt,
        cancelled_at: null,
        cancelled_by: null
      },
      { onConflict: "id" }
    );

    if (!error) {
      const memIdx = this.mem.findIndex((r) => r.id === entry.id);
      if (memIdx >= 0) {
        this.mem[memIdx] = entry;
      } else {
        this.mem.unshift(entry);
      }
    } else if (!existing) {
      this.mem.unshift(entry);
    }
    return entry;
  }

  async markPlanned(requestId: string, companyId: string, planId: string): Promise<void> {
    const now = new Date().toISOString();
    const sb = this.sb();
    await sb
      .from("hr_cowork_requests")
      .update({ status: "planned", plan_id: planId, updated_at: now })
      .eq("id", requestId)
      .eq("company_id", companyId);

    const memIdx = this.mem.findIndex((r) => r.id === requestId && r.companyId === companyId);
    if (memIdx >= 0) {
      this.mem[memIdx] = { ...this.mem[memIdx], status: "planned", planId, updatedAt: now };
    }
  }

  async markAppliedByPlanId(planId: string, companyId: string): Promise<void> {
    const now = new Date().toISOString();
    const sb = this.sb();
    await sb
      .from("hr_cowork_requests")
      .update({ status: "applied", updated_at: now })
      .eq("plan_id", planId)
      .eq("company_id", companyId)
      .in("status", ["draft", "planned"]);

    for (const row of this.mem) {
      if (row.companyId === companyId && row.planId === planId) {
        row.status = "applied";
        row.updatedAt = now;
      }
    }
  }

  async markCancelledByPlanId(planId: string, companyId: string, actorUserId: string): Promise<void> {
    const now = new Date().toISOString();
    const sb = this.sb();
    await sb
      .from("hr_cowork_requests")
      .update({
        status: "cancelled",
        updated_at: now,
        cancelled_at: now,
        cancelled_by: actorUserId
      })
      .eq("plan_id", planId)
      .eq("company_id", companyId)
      .neq("status", "applied");

    for (const row of this.mem) {
      if (row.companyId === companyId && row.planId === planId && row.status !== "applied") {
        row.status = "cancelled";
        row.updatedAt = now;
        row.cancelledAt = now;
        row.cancelledBy = actorUserId;
      }
    }
  }

  async findByPlanId(planId: string, companyId: string): Promise<CoworkRequestEntry | null> {
    const cached = this.mem.find((r) => r.planId === planId && r.companyId === companyId);
    if (cached) {
      return cached;
    }

    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_cowork_requests")
      .select("*")
      .eq("plan_id", planId)
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    const mapped = this.mapRow(data as RequestRow);
    this.mem.unshift(mapped);
    return mapped;
  }
}
