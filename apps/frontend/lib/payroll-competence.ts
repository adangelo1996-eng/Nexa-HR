/** Logica allineata a `@payday/domain` (date civili UTC + confronto “oggi” in Europe/Rome). */

export function payrollCompetenceCalculationFirstDateIso(period: string): string {
  const trimmed = period.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!m) {
    throw new Error(`Periodo non valido: ${period}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) {
    throw new Error(`Periodo non valido: ${period}`);
  }
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const [Y, M, D] = last.split("-").map(Number);
  return new Date(Date.UTC(Y, M - 1, D + 5)).toISOString().slice(0, 10);
}

export function isPayrollCompetenceCalculableTodayRome(period: string): boolean {
  const unlock = payrollCompetenceCalculationFirstDateIso(period);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  return today >= unlock;
}

export function previousPayrollMonthIso(period: string): string {
  const [ys, ms] = period.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    return period;
  }
  const d = new Date(Date.UTC(y, mo - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mese di competenza predefinito: mese di calendario precedente (fuso Europe/Rome). */
export function defaultPayrollCompetencePeriodRome(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  let y = 0;
  let mo = 0;
  for (const p of parts) {
    if (p.type === "year") y = Number(p.value);
    if (p.type === "month") mo = Number(p.value);
  }
  if (!Number.isFinite(y) || !Number.isFinite(mo)) {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (mo <= 1) {
    return `${y - 1}-12`;
  }
  return `${y}-${String(mo - 1).padStart(2, "0")}`;
}
