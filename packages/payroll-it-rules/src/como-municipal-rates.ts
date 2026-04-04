import { COMO_MUNICIPAL_ADDIZIONALE_RATES } from "./como-municipal-rates.generated";

/** Normalizza il nome comune per lookup nella tabella Como (addizionali_como_2025). */
export function normalizeComoMunicipalityKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u2019/g, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Risolve l'aliquota addizionale comunale (frazione, es. 0.007 = 0,70%) dal dataset provincia Como.
 * Fonte: colonna `Aliquota_vigente_%_2025_2026` in `addizionali_como_2025.md`.
 * @returns `null` se il comune non è in elenco.
 */
export function resolveComoMunicipalAddizionaleRate(municipality: string): number | null {
  const key = normalizeComoMunicipalityKey(municipality);
  const row = COMO_MUNICIPAL_ADDIZIONALE_RATES[key];
  if (!row) {
    return null;
  }
  return row.vigente;
}

export function isComoDatasetMunicipality(municipality: string): boolean {
  return normalizeComoMunicipalityKey(municipality) in COMO_MUNICIPAL_ADDIZIONALE_RATES;
}
