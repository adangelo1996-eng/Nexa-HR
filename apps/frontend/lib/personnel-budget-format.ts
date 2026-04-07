const personnelBudgetAmountFormatter = new Intl.NumberFormat("it-IT", {
  useGrouping: true,
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

/**
 * Parsing input locale IT/euro: tollera migliaia con punto (1.234,56) o decimali con punto (1234.56).
 */
export function parsePersonnelBudgetMoneyInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") {
    return null;
  }
  let normalized: string;
  if (t.includes(",")) {
    normalized = t.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  } else {
    normalized = t.replace(/\s/g, "");
  }
  const x = Number(normalized);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

/** Δ% su consuntivo: (BDG − ACT) / ACT. */
export function budgetDeltaPercentLabel(actual: number, budget: number): string {
  if (!Number.isFinite(actual) || actual === 0) {
    return "—";
  }
  const d = budget - actual;
  return `${((d / actual) * 100).toFixed(1)} %`;
}
