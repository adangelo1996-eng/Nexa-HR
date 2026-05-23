import { Injectable, NotFoundException } from "@nestjs/common";
import { HrStandardContractsExecutor } from "./hr-standard-contracts.executor";
import { SmartworkingAgreementsExecutor } from "./smartworking-agreements.executor";
import { SmartworkingRequestsExecutor } from "./smartworking-requests.executor";
import type { CoworkExecutorContext, CoworkDomainExecutor } from "./cowork-executor.interface";
import type { CoworkDomain, CoworkPlanRow } from "../cowork.types";

@Injectable()
export class CoworkExecutorRegistry {
  private readonly byDomain: Map<CoworkDomain, CoworkDomainExecutor>;

  constructor(
    agreements: SmartworkingAgreementsExecutor,
    requests: SmartworkingRequestsExecutor,
    contracts: HrStandardContractsExecutor
  ) {
    this.byDomain = new Map<CoworkDomain, CoworkDomainExecutor>([
      [agreements.domain, agreements],
      [requests.domain, requests],
      [contracts.domain, contracts]
    ]);
  }

  get(domain: CoworkDomain): CoworkDomainExecutor | null {
    return this.byDomain.get(domain) ?? null;
  }

  async executeRow(ctx: CoworkExecutorContext, domain: CoworkDomain, row: CoworkPlanRow): Promise<CoworkPlanRow> {
    const exec = this.get(domain);
    if (!exec) {
      return {
        ...row,
        status: "error",
        errorMessage: `Dominio ${domain} non ancora supportato per l'applicazione`
      };
    }
    return exec.executeRow(ctx, row);
  }
}

export { NotFoundException };
