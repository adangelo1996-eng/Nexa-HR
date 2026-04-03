/**
 * Payroll Svizzera (motore CHF, export CH, campi canton/comune anagrafica).
 *
 * Disattivata se l’ambiente non imposta esplicitamente `NEXA_SWISS_PAYROLL_ENABLED=true`.
 * Frontend: allineare `NEXT_PUBLIC_NEXA_SWISS_PAYROLL_ENABLED` per UI e valute.
 */
export function isSwissPayrollFeatureEnabled(): boolean {
  return process.env.NEXA_SWISS_PAYROLL_ENABLED === "true";
}
