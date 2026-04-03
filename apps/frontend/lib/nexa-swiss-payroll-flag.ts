/**
 * Deve essere allineato al backend (`NEXA_SWISS_PAYROLL_ENABLED`).
 * Solo variabili `NEXT_PUBLIC_*` sono disponibili nel client Next.js.
 */
export function isSwissPayrollFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NEXA_SWISS_PAYROLL_ENABLED === "true";
}

export function payslipDisplayCurrency(storedJurisdiction?: "CH" | "IT" | null): "EUR" | "CHF" {
  if (!isSwissPayrollFeatureEnabled()) {
    return "EUR";
  }
  return storedJurisdiction === "CH" ? "CHF" : "EUR";
}
