const personnelBudgetAmountFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** Importi budget personale: migliaia con punto, decimali con virgola (it-IT). */
export function formatPersonnelBudgetAmount(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(Number(n))) {
    return "—";
  }
  return personnelBudgetAmountFormatter.format(Number(n));
}
