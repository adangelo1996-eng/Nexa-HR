import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import { COWORK_PLAN_TTL_MS } from "./cowork.constants";
import type { CoworkPlanDto, CoworkPlanRow, CoworkPlanStatus } from "./cowork.types";

type StoredPlan = CoworkPlanDto & { companyId: string; actorUserId: string };

@Injectable()
export class CoworkPlansStore {
  private readonly mem = new Map<string, StoredPlan>();

  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private mapRow(row: Record<string, unknown>): StoredPlan {
    const rows = Array.isArray(row.rows_json) ? (row.rows_json as CoworkPlanRow[]) : [];
    return {
      planId: String(row.id),
      companyId: String(row.company_id),
      actorUserId: String(row.actor_user_id),
      domain: row.domain as StoredPlan["domain"],
      summary: String(row.summary ?? ""),
      rows,
      status: row.status as CoworkPlanStatus,
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      appliedAt: row.applied_at != null ? String(row.applied_at) : null,
      llmApplied: false,
      privacy: { pseudonymizedTokenCount: 0, schemaVersion: "" }
    };
  }

  async save(plan: Omit<StoredPlan, "createdAt" | "expiresAt" | "status" | "appliedAt"> & {
    status?: CoworkPlanStatus;
    appliedAt?: string | null;
  }): Promise<CoworkPlanDto> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + COWORK_PLAN_TTL_MS).toISOString();
    const planId = plan.planId || randomUUID();
    const status = plan.status ?? "pending";

    const sb = this.sb();
    const { error } = await sb.from("hr_cowork_plans").insert({
      id: planId,
      company_id: plan.companyId,
      actor_user_id: plan.actorUserId,
      domain: plan.domain,
      summary: plan.summary,
      rows_json: plan.rows,
      status,
      created_at: createdAt,
      expires_at: expiresAt,
      applied_at: plan.appliedAt ?? null
    });

    if (error) {
      const stored: StoredPlan = {
        ...plan,
        planId,
        status,
        createdAt,
        expiresAt,
        appliedAt: plan.appliedAt ?? null
      };
      this.mem.set(planId, stored);
      return this.toDto(stored);
    }

    const stored: StoredPlan = {
      ...plan,
      planId,
      status,
      createdAt,
      expiresAt,
      appliedAt: plan.appliedAt ?? null
    };
    this.mem.set(planId, stored);
    return this.toDto(stored);
  }

  async get(planId: string, companyId: string): Promise<StoredPlan> {
    const cached = this.mem.get(planId);
    if (cached && cached.companyId === companyId) {
      if (new Date(cached.expiresAt).getTime() < Date.now() && cached.status === "pending") {
        cached.status = "expired";
      }
      return cached;
    }

    const sb = this.sb();
    const { data, error } = await sb
      .from("hr_cowork_plans")
      .select("*")
      .eq("id", planId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException("Piano Cowork non trovato o scaduto");
    }

    const mapped = this.mapRow(data as Record<string, unknown>);
    if (new Date(mapped.expiresAt).getTime() < Date.now() && mapped.status === "pending") {
      mapped.status = "expired";
    }
    this.mem.set(planId, mapped);
    return mapped;
  }

  async updateRows(
    planId: string,
    companyId: string,
    rows: CoworkPlanRow[],
    status: CoworkPlanStatus,
    appliedAt?: string | null
  ): Promise<CoworkPlanDto> {
    const cur = await this.get(planId, companyId);
    cur.rows = rows;
    cur.status = status;
    if (appliedAt !== undefined) {
      cur.appliedAt = appliedAt;
    }
    this.mem.set(planId, cur);

    const sb = this.sb();
    await sb
      .from("hr_cowork_plans")
      .update({
        rows_json: rows,
        status,
        applied_at: cur.appliedAt ?? null
      })
      .eq("id", planId)
      .eq("company_id", companyId);

    return this.toDto(cur);
  }

  toDto(stored: StoredPlan): CoworkPlanDto {
    return {
      planId: stored.planId,
      domain: stored.domain,
      summary: stored.summary,
      rows: stored.rows,
      status: stored.status,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      appliedAt: stored.appliedAt,
      llmApplied: stored.llmApplied,
      privacy: stored.privacy
    };
  }
}
