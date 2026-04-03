import type { PayrollExportArtifact, PayrollRunContext, PayrollExportGenerator, JurisdictionCode } from "../../payroll-core/dist/index";
export {
  calculateItalianPayroll,
  computeAnnualIrpef,
  employerBudgetBucketsFromGrossIt,
  employerRatesFromItalianProfile,
  defaultItalianRuleSet2026,
  ITALIAN_EMPLOYER_INPS_RATE_BY_SECTOR,
  type ItalianPayrollInput,
  type ItalianPayrollProfileEmployer,
  type ItalianTaxProfile,
  type ItalianRuleSet,
  type PayrollItSector,
  type EmployerItBucketOptions,
  type PayrollResult as ItalianPayrollEngineResult
} from "../../payroll-it-rules/dist/index";

/**
 * Adapter Italia: generatori F24 / UniEmens / SEPA — stub per cut-over architetturale.
 * La logica contributiva reale va implementata con consulenza fiscale e validazione formalità.
 */
class ItExportGenerator implements PayrollExportGenerator {
  readonly jurisdiction: JurisdictionCode = "IT";

  async buildExports(context: PayrollRunContext): Promise<PayrollExportArtifact[]> {
    return [
      {
        kind: "SEPA_CREDIT",
        jurisdiction: "IT",
        reference: `sepa-stub-it:${context.companyId}:${context.period}`
      },
      {
        kind: "F24",
        jurisdiction: "IT",
        reference: `f24-stub:${context.period}`
      },
      {
        kind: "UNIEMENS",
        jurisdiction: "IT",
        reference: `uniemens-stub:${context.period}`
      }
    ];
  }
}

export function createItExportGenerator(): PayrollExportGenerator {
  return new ItExportGenerator();
}
