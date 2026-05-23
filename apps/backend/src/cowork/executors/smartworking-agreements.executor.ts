import { randomUUID } from "node:crypto";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { HrDataStore } from "../../platform/hr-data.store";
import type { CoworkExecutorContext, CoworkDomainExecutor } from "./cowork-executor.interface";
import type { CoworkPlanRow } from "../cowork.types";

@Injectable()
export class SmartworkingAgreementsExecutor implements CoworkDomainExecutor {
  readonly domain = "smartworking_agreements" as const;

  constructor(private readonly store: HrDataStore) {}

  async executeRow(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const payload = row.payload;
    const userId = String(payload.userId ?? row.userId);
    const validFrom = String(payload.validFrom ?? "").slice(0, 10);
    const validTo = String(payload.validTo ?? "").slice(0, 10);
    const policyVersion = String(payload.policyVersion ?? "2026");
    const agreementId = payload.agreementId != null ? String(payload.agreementId) : null;
    const note = payload.note != null ? String(payload.note) : null;

    if (!validFrom || !validTo) {
      return {
        ...row,
        status: "error",
        errorMessage: "Date validità mancanti"
      };
    }

    const sb = this.store.getServiceRoleClient();
    const now = new Date().toISOString();

    if (agreementId) {
      const { error } = await sb
        .from("smartworking_agreements")
        .update({
          policy_version: policyVersion,
          valid_from: validFrom,
          valid_to: validTo,
          status: "active",
          note,
          updated_at: now
        })
        .eq("id", agreementId)
        .eq("company_id", ctx.companyId)
        .eq("user_id", userId);
      if (error) {
        return { ...row, status: "error", errorMessage: error.message };
      }
      return {
        ...row,
        status: "applied",
        detail: `Accordo aggiornato ${validFrom} → ${validTo} (${policyVersion})`
      };
    }

    const { error } = await sb.from("smartworking_agreements").insert({
      id: randomUUID(),
      company_id: ctx.companyId,
      user_id: userId,
      policy_version: policyVersion,
      valid_from: validFrom,
      valid_to: validTo,
      status: "active",
      note,
      created_by_user_id: ctx.auth.userId,
      created_at: now,
      updated_at: now
    });
    if (error) {
      return { ...row, status: "error", errorMessage: error.message };
    }
    return {
      ...row,
      status: "applied",
      detail: `Nuovo accordo ${validFrom} → ${validTo} (${policyVersion})`
    };
  }
}
