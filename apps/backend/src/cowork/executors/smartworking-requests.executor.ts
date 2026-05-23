import { Injectable } from "@nestjs/common";
import type { AuthRole } from "../../platform/auth";
import { HrDataStore } from "../../platform/hr-data.store";
import type { CoworkExecutorContext, CoworkDomainExecutor } from "./cowork-executor.interface";
import type { CoworkPlanRow } from "../cowork.types";

@Injectable()
export class SmartworkingRequestsExecutor implements CoworkDomainExecutor {
  readonly domain = "smartworking_requests" as const;

  constructor(private readonly store: HrDataStore) {}

  async executeRow(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const payload = row.payload;
    const requestId = String(payload.requestId ?? "");
    const newEndDay = String(payload.newEndDay ?? "").slice(0, 10);
    const day = String(payload.day ?? "").slice(0, 10);

    if (!requestId || !newEndDay) {
      return { ...row, status: "error", errorMessage: "Parametri richiesta incompleti" };
    }

    try {
      const updated = await this.store.updateSmartworkingRequest(
        ctx.auth.userId,
        requestId,
        day || newEndDay,
        payload.note != null ? String(payload.note) : row.payload.note as string | undefined,
        ctx.auth.role as AuthRole,
        newEndDay
      );
      return {
        ...row,
        status: "applied",
        detail: `Periodo esteso fino al ${updated.endDay ?? newEndDay}`
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore estensione richiesta";
      return { ...row, status: "error", errorMessage: msg };
    }
  }
}
