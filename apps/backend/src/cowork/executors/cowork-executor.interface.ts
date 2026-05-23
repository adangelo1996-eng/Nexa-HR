import type { AuthContext } from "../../platform/auth";
import type { CoworkDomain, CoworkPlanRow } from "../cowork.types";

export type CoworkExecutorContext = {
  auth: AuthContext;
  companyId: string;
};

export interface CoworkDomainExecutor {
  readonly domain: CoworkDomain;
  executeRow(ctx: CoworkExecutorContext, row: CoworkPlanRow): Promise<CoworkPlanRow>;
}
