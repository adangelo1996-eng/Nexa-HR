import { ITALY_EMPLOYEE_COST_ASSUMPTIONS_2026_MVP, type ItalyEmployeeCostAssumptions } from "./calculation-assumptions";

export type CostCalculatorInputMode = "ral" | "net";

export interface CostCalculatorAgevolazioni {
  female?: boolean;
  under36?: boolean;
  southZes?: boolean;
  naspi?: boolean;
  protectedCategories?: boolean;
  otherNotes?: string;
}

export interface CostCalculatorInput {
  mode: CostCalculatorInputMode;
  weeklyContractHours: number;
  weeklyFullTimeHours?: number;
  payMonthsPerYear: 12 | 13 | 14;
  annualGrossSalaryEuros?: number;
  targetNetMonthlyEuros?: number;
  agevolazioni?: CostCalculatorAgevolazioni;
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

function irpefAnnualFromBrackets(imponibile: number, brackets: { upToEuros: number; rate: number }[]): number {
  const base = Math.max(0, imponibile);
  let prev = 0;
  let tax = 0;
  for (const b of brackets) {
    const top = Math.max(prev, b.upToEuros);
    const chunk = clamp(base, prev, top) - prev;
    if (chunk > 0) {
      tax += chunk * b.rate;
    }
    prev = top;
    if (base <= top) break;
  }
  return tax;
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
  const imponibileIrpefAnnual = Math.max(0, ralAdj - employeeInpsMonthly * payMonths);

  const irpefAnnual = Math.max(
    0,
    irpefAnnualFromBrackets(imponibileIrpefAnnual, assumptions.irpefBrackets) - assumptions.detrazioniAnnueEuros
  );
  const addizionaliAnnual = imponibileIrpefAnnual * assumptions.addizionaliPercent;

  const irpefMonthly = irpefAnnual / payMonths;
  const addizionaliMonthly = addizionaliAnnual / payMonths;

  const netMonthly = Math.max(0, grossMonthly - employeeInpsMonthly - irpefMonthly - addizionaliMonthly);

  const employerDiscount = employerDiscountPercentFromAgevolazioni(assumptions.incentives, input.agevolazioni);
  const employerInpsPercentEffective = Math.max(0, assumptions.employerInpsPercent - employerDiscount);
  const employerInpsMonthly = (grossMonthly * employerInpsPercentEffective) / 100;

  const inailMonthly = (grossMonthly * assumptions.inailPercent) / 100;
  const tfrMonthly = assumptions.tfrDivisor > 0 ? grossMonthly / assumptions.tfrDivisor : 0;

  const companyCostMonthly = grossMonthly + employerInpsMonthly + inailMonthly + tfrMonthly;

  if (ptFactor !== 1) {
    warnings.push(`Calcolo pro-rata part-time: ${(ptFactor * 100).toFixed(1)}% (ore contratto / full-time).`);
  }
  warnings.push("Stima indicativa: verificare con consulente del lavoro (aliquote/IRPEF/detrazioni semplificate).");
  if (employerDiscount > 0) {
    warnings.push(`Agevolazioni: applicata riduzione contributi datore stimata di ${employerDiscount.toFixed(1)} punti.`);
  }

  const breakdown: CostCalculatorBreakdownRow[] = [
    { key: "gross", label: "RAL / mensilità (lordo mese)", euros: grossMonthly },
    { key: "employer_inps", label: "Contributi datore (stima)", euros: employerInpsMonthly },
    { key: "inail", label: "INAIL (stima)", euros: inailMonthly },
    { key: "tfr", label: "TFR accantonato (stima)", euros: tfrMonthly }
  ];

  return {
    monthly: {
      grossEuros: round2(grossMonthly),
      netEuros: round2(netMonthly),
      employeeInpsEuros: round2(employeeInpsMonthly),
      estimatedIrpefEuros: round2(irpefMonthly),
      estimatedAddizionaliEuros: round2(addizionaliMonthly),
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

