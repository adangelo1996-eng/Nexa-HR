import type { CompanySettingsDto } from "../platform/hr-data.store";

/** Campi party precompilati da impostazioni azienda (contratti standard). */
export function companySettingsToContractPartyDefaults(
  company: Pick<
    CompanySettingsDto,
    | "companyLegalName"
    | "companyAddress"
    | "companyVatNumber"
    | "companyRegistrationInfo"
    | "companyCcnl"
    | "weeklyFullTimeHours"
    | "payrollInstallmentMonths"
  >
): Record<string, unknown> {
  const address =
    company.companyAddress?.trim() ||
    company.companyRegistrationInfo?.trim() ||
    undefined;
  const payMonths = company.payrollInstallmentMonths;
  const payNorm =
    payMonths === 12 || payMonths === 13 || payMonths === 14 ? payMonths : undefined;
  const out: Record<string, unknown> = {
    companyLegalName: company.companyLegalName?.trim() || "Datore di lavoro",
    companyAddress: address,
    companyVatNumber: company.companyVatNumber?.trim() || undefined,
    ccnlCode: company.companyCcnl?.trim() || undefined,
    weeklyHours: company.weeklyFullTimeHours ?? 40
  };
  if (payNorm) {
    out.payMonthsPerYear = payNorm;
  }
  return out;
}

export function mergeContractPartyDefaults(
  base: Record<string, unknown>,
  defaults: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...defaults, ...base };
  for (const [k, v] of Object.entries(defaults)) {
    const cur = merged[k];
    if (cur == null || (typeof cur === "string" && !String(cur).trim())) {
      merged[k] = v;
    }
  }
  return merged;
}
