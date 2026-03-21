import type { PayslipLine, SwissTaxProfile } from "./models";

interface PayrollInput {
  period: string;
  grossMonthlySalary: number;
  age: number;
  vacationDaysUsed: number;
  sicknessDays: number;
  smartworkingDays: number;
  overtimeAmount: number;
  taxProfile: SwissTaxProfile;
}

export function calculateSwissPayroll(input: PayrollInput): {
  lines: PayslipLine[];
  grossAdjusted: number;
  netSalary: number;
} {
  const grossAdjusted =
    input.grossMonthlySalary +
    input.overtimeAmount -
    input.vacationDaysUsed * 25 -
    input.sicknessDays * 15 +
    input.smartworkingDays * 5;

  const avs = grossAdjusted * 0.0435;
  const ai = grossAdjusted * 0.007;
  const ipg = grossAdjusted * 0.0025;
  const ad = grossAdjusted * 0.011;
  const lpp = grossAdjusted * getLppRate(input.age);
  const withholdingTax = grossAdjusted * getWithholdingTax(input.taxProfile.canton);
  const netSalary = grossAdjusted - avs - ai - ipg - ad - lpp - withholdingTax;

  return {
    grossAdjusted: round(grossAdjusted),
    netSalary: round(Math.max(0, netSalary)),
    lines: [
      { code: "GROSS", description: "Salario lordo rettificato", amount: round(grossAdjusted) },
      { code: "AVS", description: "Contributo AVS", amount: -round(avs) },
      { code: "AI", description: "Contributo AI", amount: -round(ai) },
      { code: "IPG", description: "Contributo IPG", amount: -round(ipg) },
      { code: "AD", description: "Contributo AD", amount: -round(ad) },
      { code: "LPP", description: "Contributo LPP", amount: -round(lpp) },
      { code: "QST", description: "Imposta alla fonte", amount: -round(withholdingTax) },
      { code: "NET", description: "Netto da pagare", amount: round(Math.max(0, netSalary)) }
    ]
  };
}

function getWithholdingTax(canton: string): number {
  const map: Record<string, number> = { TI: 0.06, ZH: 0.07, GE: 0.085, VD: 0.075 };
  return map[canton] ?? 0.07;
}

function getLppRate(age: number): number {
  if (age >= 25 && age <= 34) return 0.07;
  if (age >= 35 && age <= 44) return 0.1;
  if (age >= 45 && age <= 54) return 0.15;
  if (age >= 55) return 0.18;
  return 0.07;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
