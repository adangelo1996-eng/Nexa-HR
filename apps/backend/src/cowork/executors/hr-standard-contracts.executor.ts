import { Injectable } from "@nestjs/common";
import { HrContractsService } from "../../hr-contracts/hr-contracts.service";
import type { CoworkExecutorContext, CoworkDomainExecutor } from "./cowork-executor.interface";
import type { CoworkPlanRow } from "../cowork.types";

@Injectable()
export class HrStandardContractsExecutor implements CoworkDomainExecutor {
  readonly domain = "employment_contracts" as const;

  constructor(private readonly contracts: HrContractsService) {}

  async executeRow(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const payload = row.payload;
    const contractId = payload.contractId != null ? String(payload.contractId) : null;
    const userId = String(payload.userId ?? row.userId);
    const title = String(payload.title ?? `Contratto SW — ${row.fullName}`);

    try {
      if (contractId) {
        const cur = await this.contracts.getById(ctx.companyId, contractId);
        const party = { ...cur.party, smartWorkingEnabled: true, smartWorkingRenewalYear: payload.policyYear ?? new Date().getFullYear() };
        const blocks = Array.isArray(cur.blocks) ? cur.blocks : [];
        const week =
          typeof payload.maxRemoteDaysPerWeek === "number"
            ? payload.maxRemoteDaysPerWeek
            : typeof payload.allowedDaysPerWeek === "number"
              ? payload.allowedDaysPerWeek
              : 2;
        const month =
          typeof payload.maxRemoteDaysPerMonth === "number"
            ? payload.maxRemoteDaysPerMonth
            : typeof payload.allowedDaysPerMonth === "number"
              ? payload.allowedDaysPerMonth
              : 8;
        const hasLimitsBlock = blocks.some(
          (b) =>
            typeof b === "object" &&
            b != null &&
            ((b as { type?: string }).type === "remote_work_limits" ||
              (b as { type?: string }).type === "smartworking_clause")
        );
        const nextBlocks = hasLimitsBlock
          ? blocks
          : [
              ...blocks,
              {
                type: "remote_work_limits",
                title: "Limiti lavoro agile",
                allowedDaysPerWeek: week,
                allowedDaysPerMonth: month,
                body: `Fino a ${week} giorni a settimana e ${month} al mese, salvo deroga HR.`
              }
            ];
        await this.contracts.update(ctx.companyId, contractId, {
          party,
          blocks: nextBlocks,
          status: cur.status === "approved" ? "draft" : cur.status
        });
        return {
          ...row,
          status: "applied",
          detail: `Contratto ${cur.title}: clausola SW aggiornata (bozza)`
        };
      }

      const created = await this.contracts.create({
        companyId: ctx.companyId,
        title,
        party: {
          employeeUserId: userId,
          smartWorkingEnabled: true,
          smartWorkingRenewalYear: payload.policyYear ?? new Date().getFullYear()
        },
        blocks: [
          {
            type: "remote_work_limits",
            title: "Limiti lavoro agile",
            allowedDaysPerWeek:
              typeof payload.maxRemoteDaysPerWeek === "number" ? payload.maxRemoteDaysPerWeek : 2,
            allowedDaysPerMonth:
              typeof payload.maxRemoteDaysPerMonth === "number" ? payload.maxRemoteDaysPerMonth : 8,
            body: "Limiti da accordo annuale Nexa HR."
          }
        ],
        createdByUserId: ctx.auth.userId
      });
      return {
        ...row,
        status: "applied",
        detail: `Bozza contratto creata (${created.id.slice(0, 8)}…)`,
        payload: { ...payload, contractId: created.id }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore contratto";
      return { ...row, status: "error", errorMessage: msg };
    }
  }
}
