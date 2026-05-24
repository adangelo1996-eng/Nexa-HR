import type { CompanySettingsDto } from "@/lib/api";
import type { ContractPartyInfo } from "@/lib/contracts";

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
): Partial<ContractPartyInfo> & Record<string, unknown> {
  const address =
    company.companyAddress?.trim() ||
    company.companyRegistrationInfo?.trim() ||
    "";
  const payMonths = company.payrollInstallmentMonths;
  const payNorm =
    payMonths === 12 || payMonths === 13 || payMonths === 14 ? payMonths : undefined;
  return {
    companyLegalName: company.companyLegalName?.trim() || "Datore di lavoro",
    companyAddress: address || undefined,
    companyVatNumber: company.companyVatNumber?.trim() || undefined,
    ccnlCode: company.companyCcnl?.trim() || undefined,
    weeklyHours: company.weeklyFullTimeHours ?? 40,
    ...(payNorm ? { payMonthsPerYear: payNorm } : {})
  };
}

function isBlankString(v: unknown): boolean {
  return v == null || (typeof v === "string" && !v.trim());
}

export function mergeContractPartyDefaults(
  base: ContractPartyInfo,
  defaults: Partial<ContractPartyInfo> & Record<string, unknown>
): ContractPartyInfo {
  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(defaults)) {
    if (isBlankString(merged[k])) {
      merged[k] = v;
    }
  }
  return merged as unknown as ContractPartyInfo;
}
