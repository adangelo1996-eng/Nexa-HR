import type { JurisdictionCode, PayrollExportArtifact, PayrollRunContext, PayrollExportGenerator } from "../../payroll-core/dist/index";
import {
  calculateSwissPayroll as calcRules,
  type PayrollInput,
  type PayrollResult,
  defaultRuleSet2026,
  type SwissRuleSet
} from "../../payroll-ch-rules/dist/index";

export type { PayrollInput, PayrollResult } from "../../payroll-ch-rules/dist/index";

/** Calcolo busta CH tramite `@payday/payroll-ch-rules` (Svizzera). */
export function calculateSwissPayroll(
  input: PayrollInput,
  ruleSet: SwissRuleSet = defaultRuleSet2026
): PayrollResult {
  return calcRules(input, ruleSet);
}

class ChExportGenerator implements PayrollExportGenerator {
  readonly jurisdiction: JurisdictionCode = "CH";

  async buildExports(context: PayrollRunContext): Promise<PayrollExportArtifact[]> {
    return [
      {
        kind: "SEPA_CREDIT",
        jurisdiction: "CH",
        reference: `sepa-stub:${context.companyId}:${context.period}`
      },
      {
        kind: "PAYSLIP_PDF",
        jurisdiction: "CH",
        reference: `payslip-batch:${context.period}`
      }
    ];
  }
}

export function createChExportGenerator(): PayrollExportGenerator {
  return new ChExportGenerator();
}
