const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertValidExpenseDate(expenseDate: string): void {
  if (!ISO_DATE.test(expenseDate.trim())) {
    throw new Error("expenseDate deve essere YYYY-MM-DD");
  }
  const [y, mo, d] = expenseDate.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error("expenseDate non è una data di calendario valida");
  }
}

/** Mese del cedolino (YYYY-MM) = mese calendario successivo al mese della data spesa. */
export function payslipPeriodFromExpenseDate(expenseDate: string): string {
  const t = expenseDate.trim();
  assertValidExpenseDate(t);
  const [ys, ms] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const next = new Date(Date.UTC(y, m - 1 + 1, 1));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}
