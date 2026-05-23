import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";
import { COWORK_PLAN_TTL_MS } from "./cowork.constants";
import type { CoworkPlanDto, CoworkPlanRow, CoworkPlanSection, CoworkPlanStatus } from "./cowork.types";
import type { CoworkPlanSectionMeta } from "./cowork-plan-hydration.service";

type StoredRowsPayloadV2 = {
  v: 2;
  sectionMeta: CoworkPlanSectionMeta[];
  rows: CoworkPlanRow[];
};

type StoredPlan = CoworkPlanDto & {
  companyId: string;
  actorUserId: string;
  sectionMeta: CoworkPlanSectionMeta[];
};

@Injectable()
export class CoworkPlansStore {
  private readonly mem = new Map<string, StoredPlan>();

  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private parseRowsPayload(rowsJson: unknown): { rows: CoworkPlanRow[]; sectionMeta: CoworkPlanSectionMeta[] } {
    if (Array.isArray(rowsJson)) {
      const rows = rowsJson as CoworkPlanRow[];
      const legacyRows = rows.map((row) => ({
        ...row,
        sectionId: row.sectionId ?? randomUUID(),
        domain: row.domain ?? ("unknown" as const),
        toolId: row.toolId ?? ""
      }));
      return {
        rows: legacyRows,
        sectionMeta: this.inferSectionMeta(legacyRows)
      };
    }
    if (rowsJson && typeof rowsJson === "object" && (rowsJson as StoredRowsPayloadV2).v === 2) {
      const payload = rowsJson as StoredRowsPayloadV2;
      return {
        rows: payload.rows ?? [],
        sectionMeta: payload.sectionMeta ?? []
      };
    }
    return { rows: [], sectionMeta: [] };
  }

  private inferSectionMeta(rows: CoworkPlanRow[]): CoworkPlanSectionMeta[] {
    const seen = new Map<string, CoworkPlanSectionMeta>();
    for (const row of rows) {
      if (!seen.has(row.sectionId)) {
        seen.set(row.sectionId, {
          sectionId: row.sectionId,
          domain: row.domain,
          title: row.domain
        });
      }
    }
    return [...seen.values()];
  }

  private serializeRowsPayload(rows: CoworkPlanRow[], sectionMeta: CoworkPlanSectionMeta[]): StoredRowsPayloadV2 {
    return { v: 2, sectionMeta, rows };
  }

  private mapRow(row: Record<string, unknown>): StoredPlan {
    const { rows, sectionMeta } = this.parseRowsPayload(row.rows_json);
    const sections: CoworkPlanSection[] = sectionMeta.map((meta) => ({
      sectionId: meta.sectionId,
      domain: meta.domain,
      toolId: meta.toolId ?? rows.find((r) => r.sectionId === meta.sectionId)?.toolId ?? "",
      title: meta.title,
      rows: rows.filter((r) => r.sectionId === meta.sectionId)
    }));

    return {
      planId: String(row.id),
      companyId: String(row.company_id),
      actorUserId: String(row.actor_user_id),
      domain: row.domain as StoredPlan["domain"],
      summary: String(row.summary ?? ""),
      sections,
      rows,
      sectionMeta,
      status: row.status as CoworkPlanStatus,
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      appliedAt: row.applied_at != null ? String(row.applied_at) : null,
      llmApplied: false,
      privacy: { pseudonymizedTokenCount: 0, schemaVersion: "" }
    };
  }

  async save(
    plan: Omit<StoredPlan, "createdAt" | "expiresAt" | "status" | "appliedAt" | "sectionMeta"> & {
      status?: CoworkPlanStatus;
      appliedAt?: string | null;
      sections: CoworkPlanSection[];
    }
  ): Promise<CoworkPlanDto> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + COWORK_PLAN_TTL_MS).toISOString();
    const planId = plan.planId || randomUUID();
    const status = plan.status ?? "pending";
    const sectionMeta: CoworkPlanSectionMeta[] = plan.sections.map((s) => ({
      sectionId: s.sectionId,
      domain: s.domain,
      toolId: s.toolId,
      title: s.title
    }));

    const sb = this.sb();
    const { error } = await sb.from("hr_cowork_plans").insert({
      id: planId,
      company_id: plan.companyId,
      actor_user_id: plan.actorUserId,
      domain: plan.domain,
      summary: plan.summary,
      rows_json: this.serializeRowsPayload(plan.rows, sectionMeta),
      status,
      created_at: createdAt,
      expires_at: expiresAt,
      applied_at: plan.appliedAt ?? null
    });

    const stored: StoredPlan = {
      ...plan,
      planId,
      sectionMeta,
      status,
      createdAt,
      expiresAt,
      appliedAt: plan.appliedAt ?? null
    };

    if (error) {
      this.mem.set(planId, stored);
      return this.toDto(stored);
    }

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
    appliedAt?: string | null,
    sectionMeta?: CoworkPlanSectionMeta[]
  ): Promise<CoworkPlanDto> {
    const cur = await this.get(planId, companyId);
    cur.rows = rows;
    cur.status = status;
    if (appliedAt !== undefined) {
      cur.appliedAt = appliedAt;
    }
    if (sectionMeta) {
      cur.sectionMeta = sectionMeta;
    }
    cur.sections = cur.sectionMeta.map((meta) => ({
      sectionId: meta.sectionId,
      domain: meta.domain,
      toolId: meta.toolId ?? rows.find((r) => r.sectionId === meta.sectionId)?.toolId ?? "",
      title: meta.title,
      rows: rows.filter((r) => r.sectionId === meta.sectionId)
    }));
    this.mem.set(planId, cur);

    const sb = this.sb();
    await sb
      .from("hr_cowork_plans")
      .update({
        rows_json: this.serializeRowsPayload(rows, cur.sectionMeta),
        status,
        applied_at: cur.appliedAt ?? null
      })
      .eq("id", planId)
      .eq("company_id", companyId);

    return this.toDto(cur);
  }

  async cancelPlan(planId: string, companyId: string): Promise<CoworkPlanDto> {
    const cur = await this.get(planId, companyId);
    if (cur.status === "applied") {
      throw new BadRequestException("Piano già applicato: non annullabile");
    }
    if (cur.status === "cancelled") {
      return this.toDto(cur);
    }
    const pendingOnly = cur.rows.filter((r) => r.status === "proposed");
    if (pendingOnly.length === 0 && cur.rows.some((r) => r.status === "applied")) {
      throw new BadRequestException("Piano con righe già applicate: usa undo sulle singole operazioni");
    }
    cur.rows = [];
    cur.sections = [];
    cur.sectionMeta = [];
    cur.status = "cancelled";
    this.mem.set(planId, cur);

    const sb = this.sb();
    await sb
      .from("hr_cowork_plans")
      .update({
        rows_json: this.serializeRowsPayload([], []),
        status: "cancelled",
        applied_at: null
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
      sections: stored.sections,
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
