/**
 * Modello cedolino IT e costi datore (TFR, INPS, INAIL) per budget/consuntivo.
 *
 * Le aliquote preset per settore (IVS datore) e i massimali sono indicative e vanno
 * verificate ogni anno con il consulente del lavoro / CCNL e con le sole band INAIL effettive.
 * Non sostituisce software paghe certificato né adempimenti (UniEmens, F24, ecc.).
 */

export interface PayslipLine {
  code: string;
  description: string;
  amount: number;
}

export interface ItalianTaxProfile {
  /** Codice o nome regione (es. LAZ, LOM) — solo informativo in cedolino. */
  regionCode: string;
  municipality: string;
}

/** Settore / schema contributivo datore (preset aliquota IVS totale su quota dipendente). */
export type PayrollItSector =
  | "industry"
  | "commerce"
  | "services"
  | "tourism"
  | "credit_insurance"
  | "agriculture"
  | "custom";

export interface ItalianPayrollInput {
  period: string;
  grossMonthlySalary: number;
  weeklyContractHours: number;
  age: number;
  vacationDaysUsed: number;
  sicknessDays: number;
  smartworkingDays: number;
  overtimeAmount: number;
  taxProfile: ItalianTaxProfile;
  /** Giorni residui ferie a fine periodo (informativo in cedolino). */
  vacationResidualDays?: number;
  /**
   * Parametri contributi datore / accantonamento TFR applicati a consuntivo (stesso profilo del budget).
   * Se assenti si usano i campi omologhi su `ItalianRuleSet`.
   */
  employerContributions?: {
    employerInpsRate?: number;
    inailRate?: number;
    tfrDivisor?: number;
  };
}

export interface ItalianRuleSet {
  year: number;
  /** Aliquota INPS dipendente su imponibile fino al tetto. */
  inpsEmployeeRate: number;
  /** Massimale mensile imponibile INPS (semplificato). */
  inpsMonthlyCap: number;
  /** Aliquote IRPEF progressività su base annua stimata (tre scaglioni). */
  irpefBrackets: Array<{ upTo: number; rate: number }>;
  /** Detrazione annuale lavoro dipendente (stima, €). */
  detrazioneLavoroAnnuo: number;
  /** % addizionale regionale su IRPEF mensile stimata. */
  addizionaleRegionaleRate: number;
  /** % addizionale comunale su IRPEF mensile stimata. */
  addizionaleComunaleRate: number;
  /** Accantonamento TFR mensile convenzionale: quota lorda mensile / divisore (art. 2120 c.c., schema standard). */
  tfrDivisore: number;
  /** Moltiplicatori assenze (come modello CH per coerenza demo). */
  deductionVacationPerDay: number;
  deductionSicknessPerDay: number;
  bonusSmartworkingPerDay: number;
  /** Aliquota contributo datore tipo IVS (fallback se profilo senza settore). */
  employerInpsRate: number;
  /** Aliquota INAIL su imponibile lordo mensile (fallback; es. 0,003 = 3‰). */
  employerInailRate: number;
}

export interface ItalianPayrollProfileEmployer {
  sector?: PayrollItSector | null;
  /** Percentuale IVS datore totale su quota dipendente (es. 24,48 → 24,48%). Ha priorità sul settore. */
  employerInpsPercent?: number | null;
  /** Premio INAIL in permille sull'imponibile (es. 3,2 → 3,2‰). */
  inailPermille?: number | null;
  /** Divisore accantonamento TFR mensile (default 13,5). */
  tfrDivisor?: number | null;
}

/**
 * Preset aliquote contributo datore (IVS e voci collegate, quota dipendente privato).
 * Valori orientativi 2026: da sostituire con percentuali contrattuali / decreti aggiornati.
 */
export const ITALIAN_EMPLOYER_INPS_RATE_BY_SECTOR: Record<PayrollItSector, number> = {
  industry: 0.2476,
  commerce: 0.2381,
  services: 0.2424,
  tourism: 0.2316,
  credit_insurance: 0.2413,
  agriculture: 0.205,
  custom: 0.24
};

export const defaultItalianRuleSet2026: ItalianRuleSet = {
  year: 2026,
  inpsEmployeeRate: 0.0919,
  inpsMonthlyCap: 4_831,
  irpefBrackets: [
    { upTo: 28_000, rate: 0.23 },
    { upTo: 50_000, rate: 0.33 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.43 }
  ],
  detrazioneLavoroAnnuo: 1_955,
  addizionaleRegionaleRate: 0.0123,
  addizionaleComunaleRate: 0.008,
  tfrDivisore: 13.5,
  deductionVacationPerDay: 25,
  deductionSicknessPerDay: 15,
  bonusSmartworkingPerDay: 5,
  employerInpsRate: 0.2424,
  employerInailRate: 0.003
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function partTimeFactor(weeklyHours: number): number {
  const h = weeklyHours > 0 ? weeklyHours : 40;
  return Math.min(1, h / 40);
}

/** IRPEF a scaglioni su reddito annuo. */
export function computeAnnualIrpef(taxableAnnual: number, ruleSet: ItalianRuleSet): number {
  let remaining = Math.max(0, taxableAnnual);
  let tax = 0;
  let lower = 0;
  for (const b of ruleSet.irpefBrackets) {
    const width = Math.min(remaining, b.upTo - lower);
    if (width > 0) {
      tax += width * b.rate;
      remaining -= width;
    }
    lower = b.upTo;
    if (remaining <= 0) break;
  }
  const afterDet = Math.max(0, tax - ruleSet.detrazioneLavoroAnnuo);
  return afterDet;
}

export function employerRatesFromItalianProfile(
  profile: ItalianPayrollProfileEmployer,
  ruleSet: ItalianRuleSet = defaultItalianRuleSet2026
): { employerInpsRate: number; inailRate: number; tfrDivisor: number } {
  let employerInpsRate: number;
  if (profile.employerInpsPercent != null && Number.isFinite(Number(profile.employerInpsPercent))) {
    employerInpsRate = Number(profile.employerInpsPercent) / 100;
  } else {
    const sec = profile.sector ?? "services";
    employerInpsRate =
      sec === "custom"
        ? ruleSet.employerInpsRate
        : (ITALIAN_EMPLOYER_INPS_RATE_BY_SECTOR[sec] ?? ruleSet.employerInpsRate);
  }
  const inailRate =
    profile.inailPermille != null && Number.isFinite(Number(profile.inailPermille))
      ? Number(profile.inailPermille) / 1000
      : ruleSet.employerInailRate;
  const tfrDivisor =
    profile.tfrDivisor != null && Number(profile.tfrDivisor) > 0
      ? Number(profile.tfrDivisor)
      : ruleSet.tfrDivisore;
  return {
    employerInpsRate,
    inailRate,
    tfrDivisor
  };
}

function isItalianRuleSet(x: unknown): x is ItalianRuleSet {
  return typeof x === "object" && x !== null && "irpefBrackets" in x && "year" in x;
}

export interface EmployerItBucketOptions {
  ruleSet?: ItalianRuleSet;
  employerInpsRate?: number;
  inailRate?: number;
  tfrDivisor?: number;
}

export function employerBudgetBucketsFromGrossIt(
  grossAdjusted: number,
  ruleSetOrOptions?: ItalianRuleSet | EmployerItBucketOptions
): {
  employerInpsLike: number;
  employerInailLike: number;
  employerTfrLike: number;
  totalEmployerContributions: number;
  totalCompanyCost: number;
} {
  const ruleSet = defaultItalianRuleSet2026;
  let opts: EmployerItBucketOptions = {};
  if (ruleSetOrOptions !== undefined) {
    if (isItalianRuleSet(ruleSetOrOptions)) {
      opts = { ruleSet: ruleSetOrOptions };
    } else {
      opts = ruleSetOrOptions;
    }
  }
  const rs = opts.ruleSet ?? ruleSet;
  const employerInpsRate = opts.employerInpsRate ?? rs.employerInpsRate;
  const inailRate = opts.inailRate ?? rs.employerInailRate;
  const tfrDivisor = opts.tfrDivisor ?? rs.tfrDivisore;
  const g = Math.max(0, grossAdjusted);
  const inps = g * employerInpsRate;
  const inail = g * inailRate;
  const tfr = g / tfrDivisor;
  const total = inps + inail;
  return {
    employerInpsLike: round(inps),
    employerInailLike: round(inail),
    employerTfrLike: round(tfr),
    totalEmployerContributions: round(total),
    totalCompanyCost: round(g + total + tfr)
  };
}

export interface PayrollResult {
  lines: PayslipLine[];
  grossAdjusted: number;
  netSalary: number;
}

export function calculateItalianPayroll(
  input: ItalianPayrollInput,
  ruleSet: ItalianRuleSet = defaultItalianRuleSet2026
): PayrollResult {
  const pt = partTimeFactor(input.weeklyContractHours);
  const base = input.grossMonthlySalary * pt;
  const grossAdjusted =
    base +
    input.overtimeAmount -
    input.vacationDaysUsed * ruleSet.deductionVacationPerDay -
    input.sicknessDays * ruleSet.deductionSicknessPerDay +
    input.smartworkingDays * ruleSet.bonusSmartworkingPerDay;

  const g = Math.max(0, grossAdjusted);
  const inpsBase = Math.min(g, ruleSet.inpsMonthlyCap * pt);
  const inpsEmployee = inpsBase * ruleSet.inpsEmployeeRate;
  const imponibileIrpef = Math.max(0, g - inpsEmployee);
  const annualEstimate = imponibileIrpef * 12;
  const irpefAnnual = computeAnnualIrpef(annualEstimate, ruleSet);
  const irpefMonthly = irpefAnnual / 12;
  const addReg = irpefMonthly * ruleSet.addizionaleRegionaleRate;
  const addCom = irpefMonthly * ruleSet.addizionaleComunaleRate;
  const totalDeductions = inpsEmployee + irpefMonthly + addReg + addCom;
  const netSalary = Math.max(0, g - totalDeductions);

  const ec = input.employerContributions;
  const employerInpsRate = ec?.employerInpsRate ?? ruleSet.employerInpsRate;
  const inailRate = ec?.inailRate ?? ruleSet.employerInailRate;
  const tfrDivisor = ec?.tfrDivisor ?? ruleSet.tfrDivisore;

  const tfrAccantonamento = g / tfrDivisor;
  const datoreInpsMese = g * employerInpsRate;
  const datoreInailMese = g * inailRate;
  const ferieGodute = input.vacationDaysUsed;
  const ferieResid = input.vacationResidualDays;

  const lines: PayslipLine[] = [
    { code: "BASE", description: "Retribuzione base (orario contrattuale)", amount: round(base) },
    {
      code: "EXTRA",
      description: "Straordinari / variabili (stima)",
      amount: round(input.overtimeAmount)
    },
    {
      code: "GROSS",
      description: "Lordo imponibile (competenze mese, contributi e IRPEF su base semplificata)",
      amount: round(g)
    },
    {
      code: "INPS",
      description: "Contributo INPS dipendente (quota pensionistica, modello semplificato)",
      amount: -round(inpsEmployee)
    },
    {
      code: "IRPEF",
      description: "Ritenuta IRPEF (annuo stimato / 12, detrazioni semplificate)",
      amount: -round(irpefMonthly)
    },
    {
      code: "ADD_REG",
      description: `Addizionale regionale IRPEF (${input.taxProfile.regionCode})`,
      amount: -round(addReg)
    },
    {
      code: "ADD_COM",
      description: `Addizionale comunale (${input.taxProfile.municipality})`,
      amount: -round(addCom)
    },
    {
      code: "TFR_INFO",
      description: `TFR — accantonamento mensile (lordo / ${tfrDivisor}, informativo / quota datore)`,
      amount: round(tfrAccantonamento)
    },
    {
      code: "DAT_INPS",
      description: "Contributi INPS a carico del datore (stima mensile su imponibile lordo)",
      amount: round(datoreInpsMese)
    },
    {
      code: "DAT_INAIL",
      description: "Premio INAIL a carico del datore (stima su imponibile, da tasso / rischio dichiarato)",
      amount: round(datoreInailMese)
    },
    {
      code: "FERIE_G",
      description: `Ferie — giorni goduti nel periodo: ${ferieGodute}`,
      amount: 0
    },
    {
      code: "FERIE_R",
      description:
        ferieResid != null ? `Ferie — giorni residui stimati: ${ferieResid}` : "Ferie — saldo: n/d",
      amount: 0
    },
    {
      code: "NET",
      description: "Netto da pagare al dipendente (EUR, simulazione)",
      amount: round(netSalary)
    }
  ];

  return {
    lines,
    grossAdjusted: round(g),
    netSalary: round(netSalary)
  };
}
