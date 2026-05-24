import { ITALY_EMPLOYEE_COST_ASSUMPTIONS_2026_MVP, type ItalyEmployeeCostAssumptions } from "./calculation-assumptions";
import {
  computeDetrazioneLavoroDipendenteIt2025,
  computeTirAnnualEuros,
  irpefLordaAnnualFromBrackets
} from "./italy-tax-2025";

export type CostCalculatorInputMode = "ral" | "net";

export interface CostCalculatorAgevolazioni {
  female?: boolean;
  under36?: boolean;
  southZes?: boolean;
  naspi?: boolean;
  protectedCategories?: boolean;
  otherNotes?: string;
}

/** Benefit in natura / welfare (stima mensile o annua convertita). */
export interface CostCalculatorBenefits {
  welfareAnnualEuros?: number;
  mealVouchersMonthlyEuros?: number;
  smartWorkingMonthlyEuros?: number;
  otherBenefitsMonthlyEuros?: number;
}

export interface CostCalculatorInput {
  mode: CostCalculatorInputMode;
  weeklyContractHours: number;
  weeklyFullTimeHours?: number;
  payMonthsPerYear: 12 | 13 | 14;
  annualGrossSalaryEuros?: number;
  targetNetMonthlyEuros?: number;
  agevolazioni?: CostCalculatorAgevolazioni;
  benefits?: CostCalculatorBenefits;
  /** Solo contesto contrattuale (non modifica aliquote nel motore MVP). */
  ccnlCode?: string;
  ccnlLevel?: string;
  /** Contratto a tempo determinato (detrazioni art. 13). */
  contractFixedTerm?: boolean;
  assumptions?: ItalyEmployeeCostAssumptions;
}

export interface CostCalculatorBreakdownRow {
  key: string;
  label: string;
  euros: number;
}

export interface CostCalculatorResult {
  monthly: {
    grossEuros: number;
    netEuros: number;
    employeeInpsEuros: number;
    estimatedIrpefEuros: number;
    estimatedAddizionaliEuros: number;
    tirEuros: number;
    employerInpsEuros: number;
    inailEuros: number;
    tfrAccrualEuros: number;
    companyCostEuros: number;
  };
  annual: {
    ralEuros: number;
    grossEuros: number;
    netEuros: number;
    companyCostEuros: number;
  };
  breakdownCompanyCost: CostCalculatorBreakdownRow[];
  warnings: string[];
  assumptions: ItalyEmployeeCostAssumptions;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function safeNumber(x: unknown, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function employerDiscountPercentFromAgevolazioni(
  a: ItalyEmployeeCostAssumptions["incentives"],
  agev?: CostCalculatorAgevolazioni
): number {
  if (!agev) return 0;
  const percents: number[] = [];
  if (agev.female) percents.push(a.femaleEmployerInpsDiscountPercent);
  if (agev.under36) percents.push(a.under36EmployerInpsDiscountPercent);
  if (agev.southZes) percents.push(a.southEmployerInpsDiscountPercent);
  if (agev.naspi) percents.push(a.naspiEmployerInpsDiscountPercent);
  if (agev.protectedCategories) percents.push(a.protectedCategoriesEmployerInpsDiscountPercent);
  return percents.length > 0 ? Math.max(...percents) : 0;
}

function computeFromRal(
  ral: number,
  input: CostCalculatorInput,
  assumptions: ItalyEmployeeCostAssumptions
): CostCalculatorResult {
  const warnings: string[] = [];

  const weeklyFullTime = safeNumber(input.weeklyFullTimeHours, 40);
  const weekly = safeNumber(input.weeklyContractHours, weeklyFullTime);
  const ptFactor = weeklyFullTime > 0 ? clamp(weekly / weeklyFullTime, 0.1, 1) : 1;
  const payMonths = input.payMonthsPerYear;
  const ralAdj = Math.max(0, ral) * ptFactor;

  const grossMonthly = payMonths > 0 ? ralAdj / payMonths : 0;
  const employeeInpsMonthly = (grossMonthly * assumptions.employeeInpsPercent) / 100;
  const employeeInpsAnnual = employeeInpsMonthly * payMonths;
  const imponibileIrpefAnnual = Math.max(0, ralAdj - employeeInpsAnnual);

  const irpefLordaAnnual = irpefLordaAnnualFromBrackets(imponibileIrpefAnnual, assumptions.irpefBrackets);
  const detrazioneLavoro = computeDetrazioneLavoroDipendenteIt2025(
    imponibileIrpefAnnual,
    input.contractFixedTerm ?? false
  );
  const irpefNetAnnual = Math.max(0, irpefLordaAnnual - detrazioneLavoro);
  const tirAnnual = computeTirAnnualEuros(imponibileIrpefAnnual, irpefLordaAnnual, detrazioneLavoro);

  const irpefMonthly = irpefNetAnnual / payMonths;
  const tirMonthly = tirAnnual / payMonths;
  const addRegMonthly = (irpefMonthly * assumptions.addizionaleRegionalePercent) / 100;
  const addComMonthly = (irpefMonthly * assumptions.addizionaleComunalePercent) / 100;
  const addizionaliMonthly = addRegMonthly + addComMonthly;

  const netMonthly = Math.max(
    0,
    grossMonthly - employeeInpsMonthly - irpefMonthly - addizionaliMonthly + tirMonthly
  );

  const employerDiscount = employerDiscountPercentFromAgevolazioni(assumptions.incentives, input.agevolazioni);
  const employerInpsPercentEffective = Math.max(0, assumptions.employerInpsPercent - employerDiscount);
  const employerInpsMonthly = (grossMonthly * employerInpsPercentEffective) / 100;

  const inailMonthly = (grossMonthly * assumptions.inailPercent) / 100;
  const tfrMonthly = assumptions.tfrDivisor > 0 ? grossMonthly / assumptions.tfrDivisor : 0;

  const b = input.benefits;
  const welfareMonthly =
    b?.welfareAnnualEuros != null && Number.isFinite(b.welfareAnnualEuros)
      ? Math.max(0, b.welfareAnnualEuros) / 12
      : 0;
  const mealVouchersMonthly = Math.max(0, safeNumber(b?.mealVouchersMonthlyEuros, 0));
  const smartWorkingMonthly = Math.max(0, safeNumber(b?.smartWorkingMonthlyEuros, 0));
  const otherBenefitsMonthly = Math.max(0, safeNumber(b?.otherBenefitsMonthlyEuros, 0));
  const benefitsMonthly = welfareMonthly + mealVouchersMonthly + smartWorkingMonthly + otherBenefitsMonthly;

  const payrollCostMonthly = grossMonthly + employerInpsMonthly + inailMonthly + tfrMonthly;
  const companyCostMonthly = payrollCostMonthly + benefitsMonthly;

  if (ptFactor !== 1) {
    warnings.push(`Calcolo pro-rata part-time: ${(ptFactor * 100).toFixed(1)}% (ore contratto / full-time).`);
  }
  warnings.push(
    `Stima indicativa ${assumptions.regulatoryYear}: IRPEF art. 11 TUIR, detrazioni art. 13, INPS FPLD 9,19%/23,81%, TIR semplificato. Verificare con consulente del lavoro.`
  );
  if (employerDiscount > 0) {
    warnings.push(`Agevolazioni: riduzione contributi datore stimata di ${employerDiscount.toFixed(1)} punti.`);
  }

  const breakdown: CostCalculatorBreakdownRow[] = [
    { key: "gross", label: "RAL / mensilità (lordo mese)", euros: grossMonthly },
    { key: "employer_inps", label: "Contributi datore INPS (stima)", euros: employerInpsMonthly },
    { key: "inail", label: "INAIL (stima)", euros: inailMonthly },
    { key: "tfr", label: "TFR accantonato (stima)", euros: tfrMonthly }
  ];
  if (benefitsMonthly > 0) {
    if (welfareMonthly > 0) {
      breakdown.push({ key: "welfare", label: "Welfare (quota mensile)", euros: welfareMonthly });
    }
    if (mealVouchersMonthly > 0) {
      breakdown.push({ key: "meal_vouchers", label: "Buoni pasto (stima)", euros: mealVouchersMonthly });
    }
    if (smartWorkingMonthly > 0) {
      breakdown.push({ key: "smart_working", label: "Smart working / benefit flessibili", euros: smartWorkingMonthly });
    }
    if (otherBenefitsMonthly > 0) {
      breakdown.push({ key: "other_benefits", label: "Altri benefit", euros: otherBenefitsMonthly });
    }
  }

  return {
    monthly: {
      grossEuros: round2(grossMonthly),
      netEuros: round2(netMonthly),
      employeeInpsEuros: round2(employeeInpsMonthly),
      estimatedIrpefEuros: round2(irpefMonthly),
      estimatedAddizionaliEuros: round2(addizionaliMonthly),
      tirEuros: round2(tirMonthly),
      employerInpsEuros: round2(employerInpsMonthly),
      inailEuros: round2(inailMonthly),
      tfrAccrualEuros: round2(tfrMonthly),
      companyCostEuros: round2(companyCostMonthly)
    },
    annual: {
      ralEuros: round2(ralAdj),
      grossEuros: round2(grossMonthly * payMonths),
      netEuros: round2(netMonthly * payMonths),
      companyCostEuros: round2(companyCostMonthly * payMonths)
    },
    breakdownCompanyCost: breakdown.map((r) => ({ ...r, euros: round2(r.euros) })),
    warnings,
    assumptions
  };
}

function solveRalForTargetNetMonthly(
  targetNetMonthly: number,
  input: CostCalculatorInput,
  assumptions: ItalyEmployeeCostAssumptions
): number {
  const target = Math.max(0, targetNetMonthly);
  if (target <= 0) return 0;

  let lo = 0;
  let hi = 250_000;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const res = computeFromRal(mid, input, assumptions);
    if (res.monthly.netEuros >= target) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

export function calculateItalyCompanyCost(input: CostCalculatorInput): CostCalculatorResult {
  const assumptions = input.assumptions ?? ITALY_EMPLOYEE_COST_ASSUMPTIONS_2026_MVP;
  const payMonthsPerYear = input.payMonthsPerYear;
  const weeklyHours = safeNumber(input.weeklyContractHours, 40);
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    return computeFromRal(0, { ...input, weeklyContractHours: 40, payMonthsPerYear }, assumptions);
  }

  if (input.mode === "net") {
    const targetNetMonthly = safeNumber(input.targetNetMonthlyEuros, 0);
    const solvedRal = solveRalForTargetNetMonthly(targetNetMonthly, input, assumptions);
    return computeFromRal(solvedRal, input, assumptions);
  }

  const ral = safeNumber(input.annualGrossSalaryEuros, 0);
  return computeFromRal(ral, input, assumptions);
}

export function validateCostCalculatorInput(input: CostCalculatorInput): string[] {
  const errors: string[] = [];
  const weekly = safeNumber(input.weeklyContractHours, 0);
  if (weekly <= 0) errors.push("Indica ore settimanali contrattuali valide.");
  if (input.mode === "ral") {
    const ral = safeNumber(input.annualGrossSalaryEuros, 0);
    if (ral <= 0) errors.push("Indica una RAL annua maggiore di zero.");
  } else {
    const net = safeNumber(input.targetNetMonthlyEuros, 0);
    if (net <= 0) errors.push("Indica un netto mensile target maggiore di zero.");
  }
  return errors;
}
