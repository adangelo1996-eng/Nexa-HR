/**
 * Modello dimostrativo cedolino IT — validare con consulenza del lavoro prima dell’uso reale.
 * Approximation: IRPEF annuale / 12, contributi INPS su base mensile con tetto, addizionali su IRPEF.
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
  /** Accantonamento TFR mensile: quota = lordo / tfrDivisore (solo voce informativa netto datore). */
  tfrDivisore: number;
  /** Moltiplicatori assenze (come modello CH per coerenza demo). */
  deductionVacationPerDay: number;
  deductionSicknessPerDay: number;
  bonusSmartworkingPerDay: number;
  employerInpsRate: number;
  employerInailRate: number;
}

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
  employerInpsRate: 0.24,
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

  const tfrAccantonamento = g / ruleSet.tfrDivisore;
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
      description: "Lordo imponibile (competenze mese, modello demo)",
      amount: round(g)
    },
    {
      code: "INPS",
      description: "Contributo INPS dipendente (quota semplificata)",
      amount: -round(inpsEmployee)
    },
    {
      code: "IRPEF",
      description: "Ritenuta IRPEF (annuo stimato / 12, con detrazioni semplificate)",
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
      description: "TFR — quota mensile accantonamento (informativa, trattenuta datore)",
      amount: round(tfrAccantonamento)
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
      description: "Netto da pagare (EUR, simulazione)",
      amount: round(netSalary)
    }
  ];

  return {
    lines,
    grossAdjusted: round(g),
    netSalary: round(netSalary)
  };
}

export function employerBudgetBucketsFromGrossIt(
  grossAdjusted: number,
  ruleSet: ItalianRuleSet = defaultItalianRuleSet2026
): {
  employerInpsLike: number;
  employerInailLike: number;
  employerTfrLike: number;
  totalEmployerContributions: number;
  totalCompanyCost: number;
} {
  const g = Math.max(0, grossAdjusted);
  const inps = g * ruleSet.employerInpsRate;
  const inail = g * ruleSet.employerInailRate;
  const tfr = g / ruleSet.tfrDivisore;
  const total = inps + inail;
  return {
    employerInpsLike: round(inps),
    employerInailLike: round(inail),
    employerTfrLike: round(tfr),
    totalEmployerContributions: round(total),
    totalCompanyCost: round(g + total + tfr)
  };
}
