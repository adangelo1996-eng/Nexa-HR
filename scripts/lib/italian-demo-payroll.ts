/**
 * Generazione deterministica di IBAN IT (check digit ISO 13616) e RAL/mensilità
 * coerenti con ruolo catalogo demo, per seed e aggiornamenti DB.
 */

/** Comuni provincia Como (allineati a addizionali demo). */
export const CO_COMUNI = [
  "Como",
  "Cantù",
  "Cernobbio",
  "Erba",
  "Menaggio",
  "Bellagio",
  "Fino Mornasco",
  "Olgiate Comasco",
  "Lomazzo",
  "Mariano Comense",
  "Mozzate",
  "Uggiate-Trevano",
  "Campione D'Italia",
  "Grandate",
  "Montano Lucino",
  "Veniano",
  "Albavilla",
  "Appiano Gentile",
  "Bregnano",
  "Guanzate"
] as const;

const IT_LEGAL = ["impiegato", "operaio", "quadro", "dirigente"] as const;

/** ABI/BIC di istituti reali; CAB e CIN sono sintetici ma l’IBAN è valido a livello ISO. */
const DEMO_IT_BANKS = [
  { name: "Intesa Sanpaolo S.p.A.", abi: "03069", bic: "BCITITMM" },
  { name: "UniCredit S.p.A.", abi: "02008", bic: "UNCRITMM" },
  { name: "Banco BPM S.p.A.", abi: "05034", bic: "BAPPIT21" },
  { name: "Banca Popolare di Sondrio", abi: "05696", bic: "POSOIT22" }
] as const;

export function pseudoFiscalCode(seed: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 16; i += 1) {
    s += chars[(seed.charCodeAt(i % seed.length) + i * 7) % chars.length];
  }
  return s;
}

/** Moltiplicatore RAL da id ruolo catalogo (nexa-r-01 più alto, numeri alti spesso più junior). */
export function roleCatalogRalMultiplier(roleCatalogId: string): number {
  const m = roleCatalogId.match(/nexa-r-(\d+)/i);
  const n = m ? parseInt(m[1]!, 10) : 10;
  if (n <= 2) {
    return 1.32;
  }
  if (n <= 6) {
    return 1.14;
  }
  if (n <= 12) {
    return 1.0;
  }
  if (n <= 17) {
    return 0.95;
  }
  return 0.9;
}

function expandForMod97(fragment: string): string {
  return fragment.toUpperCase().replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
}

/** Check digit IBAN (ISO 13616 mod 97-10) per paese a 2 lettere + BBAN (IT: 23 caratteri alfanumerici). */
export function ibanIsoCheckDigits(countryTwoLetter: string, bban: string): string {
  const expanded = expandForMod97(bban + countryTwoLetter + "00");
  let rem = 0;
  for (let i = 0; i < expanded.length; i += 1) {
    const d = expanded.charCodeAt(i) - 48;
    rem = (rem * 10 + d) % 97;
  }
  return String(98 - rem).padStart(2, "0");
}

/** Validazione check digit IBAN (ISO 13616). */
export function isValidIbanMod97(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^IT[0-9]{2}[A-Z0-9]{23}$/.test(s)) {
    return false;
  }
  const rearr = s.slice(4) + s.slice(0, 4);
  const expanded = expandForMod97(rearr);
  let rem = 0;
  for (let i = 0; i < expanded.length; i += 1) {
    rem = (rem * 10 + (expanded.charCodeAt(i) - 48)) % 97;
  }
  return rem === 1;
}

function demoCab(index: number): string {
  const cabs = ["01708", "12300", "05100", "01600", "05830"];
  return cabs[index % cabs.length]!;
}

function demoAccount12(index: number): string {
  const v = (200_010_009_000 + index * 97_231 + (index % 17) * 1_003) % 1_000_000_000_000;
  return String(v).padStart(12, "0");
}

/** CIN sintetico (posizione italiana IBAN); l’intero IT… supera comunque il controllo mod-97 europeo. */
function demoCin(index: number): string {
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[index % 26]!;
}

export function buildSyntheticItalianIban(index: number): {
  iban: string;
  bankName: string;
  bicSwift: string;
} {
  const bank = DEMO_IT_BANKS[index % DEMO_IT_BANKS.length]!;
  const bban = `${demoCin(index)}${bank.abi}${demoCab(index)}${demoAccount12(index)}`;
  const cd = ibanIsoCheckDigits("IT", bban);
  const iban = `IT${cd}${bban}`;
  if (!isValidIbanMod97(iban)) {
    throw new Error(`IBAN generato non valido (mod 97): ${iban}`);
  }
  return {
    iban,
    bankName: bank.name,
    bicSwift: bank.bic
  };
}

/**
 * Campi payroll IT anagrafici + RAL/stipendio: RAL = fascia × moltiplicatore ruolo, arrotondata a 100 €;
 * mensile = RAL / mensilità (13 o 14).
 */
export function demoPayrollItFields(index: number, roleCatalogId: string): Record<string, unknown> {
  const payMonths = index % 9 === 0 ? 14 : 13;
  const mod5 = index % 5;
  const band =
    mod5 === 0
      ? 28_000 + (index % 4) * 1_500
      : mod5 === 1
        ? 36_000 + (index % 4) * 2_000
        : mod5 === 2
          ? 48_000 + (index % 3) * 2_500
          : mod5 === 3
            ? 62_000 + (index % 4) * 2_800
            : 80_000 + (index % 3) * 3_500;
  const jitter = ((index * 17) % 2_400) - 800;
  let baseRal = Math.max(24_000, Math.min(95_000, band + jitter));
  baseRal = Math.round((baseRal * roleCatalogRalMultiplier(roleCatalogId)) / 100) * 100;
  const ral = Math.max(26_000, Math.min(128_000, baseRal));
  const baseSalaryMonthly = Math.round((ral / payMonths) * 100) / 100;

  return {
    payMonthsPerYear: payMonths,
    annualGrossSalary: ral,
    baseSalaryMonthly,
    taxRegion: "LOM",
    taxMunicipalityIt: CO_COMUNI[index % CO_COMUNI.length],
    taxDomicileSameAsResidence: index % 5 !== 0,
    taxDomicileMunicipalityIt: index % 5 === 0 ? CO_COMUNI[(index + 2) % CO_COMUNI.length] : null,
    fiscalCode: pseudoFiscalCode(`nexa-seed-${index}-${ral}-${roleCatalogId}`),
    maritalStatus: index % 4 === 0 ? "married" : index % 4 === 1 ? "single" : "divorced",
    dependentsChildren: index % 6,
    dependentSpouse: index % 7 === 0,
    disabilityFlag: index % 13 === 0,
    legalCategory: IT_LEGAL[index % IT_LEGAL.length],
    partTimeModality: index % 10 === 0 ? "horizontal" : "full",
    ccnlCode: index % 3 === 0 ? "Commercio" : "Metalmeccanico",
    ccnlLevel: `L${(index % 5) + 1}`,
    contractFixedTerm: index % 11 === 0,
    contractEndDate: index % 11 === 0 ? "2026-12-31" : null,
    fixedSupplementMonthly: index % 8 === 0 ? 120 : null,
    garnishmentMonthlyEstimate: index % 15 === 0 ? 50 : null,
    fringeBenefitYtdEuros: index % 4 === 0 ? 400 : 0
  };
}
