/**
 * Aliquote e formule fiscali IT 2025–2026 (allineate a payroll-it-rules / Ricerca Cedolino).
 * Stima indicativa — non sostituisce consulente del lavoro.
 */

/** Detrazioni lavoro dipendente art. 13 TUIR (Legge di Bilancio 2025, circ. AE 4/E/2025). */
export function computeDetrazioneLavoroDipendenteIt2025(
  redditoComplessivoAnnuo: number,
  contractFixedTerm: boolean
): number {
  const R = redditoComplessivoAnnuo;
  if (R <= 0) return 0;
  if (R <= 15_000) {
    void contractFixedTerm;
    return 1_955;
  }
  if (R <= 28_000) {
    return 1_910 + 1_190 * ((28_000 - R) / 13_000);
  }
  if (R <= 50_000) {
    return 1_910 * ((50_000 - R) / (50_000 - 28_000));
  }
  return 0;
}

/** Trattamento integrativo semplificato (max 1.200 €/anno). */
export function computeTirAnnualEuros(
  annualTaxable: number,
  irpefLordaAnnuo: number,
  detrazioneLavoroAnnuo: number
): number {
  if (annualTaxable > 28_000 || annualTaxable < 8_500) return 0;
  if (annualTaxable <= 15_000) {
    if (irpefLordaAnnuo <= detrazioneLavoroAnnuo) return 0;
    return 1_200;
  }
  return Math.min(1_200, Math.max(0, detrazioneLavoroAnnuo - irpefLordaAnnuo));
}

export function irpefLordaAnnualFromBrackets(
  imponibile: number,
  brackets: { upToEuros: number; rate: number }[]
): number {
  const base = Math.max(0, imponibile);
  let prev = 0;
  let tax = 0;
  for (const b of brackets) {
    const top = Math.max(prev, b.upToEuros);
    const chunk = Math.min(base, top) - prev;
    if (chunk > 0) tax += chunk * b.rate;
    prev = top;
    if (base <= top) break;
  }
  return tax;
}
