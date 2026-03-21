export interface PayslipLine {
  code: string;
  description: string;
  amount: number;
}

export interface SwissTaxProfile {
  canton: string;
  municipality: string;
  permitType: "B" | "C" | "G" | "L";
  companyType: string;
  companySite: string;
}

export interface PayrollInput {
  grossMonthlySalary: number;
  age: number;
  vacationDaysUsed: number;
  sicknessDays: number;
  smartworkingDays: number;
  overtimeAmount: number;
  period: string;
  taxProfile: SwissTaxProfile;
}

export interface PayrollResult {
  lines: PayslipLine[];
  grossAdjusted: number;
  netSalary: number;
}

export interface SwissRuleSet {
  year: number;
  avsRateEmployee: number;
  aiRateEmployee: number;
  ipgRateEmployee: number;
  adRateEmployee: number;
  lppRatesByAge: Array<{ minAge: number; maxAge: number; rate: number }>;
  withholdingTaxByCanton: Record<string, number>;
}

export const defaultRuleSet2026: SwissRuleSet = {
  year: 2026,
  avsRateEmployee: 0.0435,
  aiRateEmployee: 0.007,
  ipgRateEmployee: 0.0025,
  adRateEmployee: 0.011,
  lppRatesByAge: [
    { minAge: 25, maxAge: 34, rate: 0.07 },
    { minAge: 35, maxAge: 44, rate: 0.1 },
    { minAge: 45, maxAge: 54, rate: 0.15 },
    { minAge: 55, maxAge: 65, rate: 0.18 }
  ],
  withholdingTaxByCanton: {
    TI: 0.06,
    ZH: 0.07,
    GE: 0.085,
    VD: 0.075,
    DEFAULT: 0.07
  }
};

function getLppRate(age: number, ruleSet: SwissRuleSet): number {
  const bracket = ruleSet.lppRatesByAge.find(
    (item) => age >= item.minAge && age <= item.maxAge
  );
  return bracket?.rate ?? 0.07;
}

function getWithholdingTaxRate(canton: string, ruleSet: SwissRuleSet): number {
  return ruleSet.withholdingTaxByCanton[canton] ?? ruleSet.withholdingTaxByCanton.DEFAULT;
}

export function calculateSwissPayroll(
  input: PayrollInput,
  ruleSet: SwissRuleSet = defaultRuleSet2026
): PayrollResult {
  const grossAdjusted =
    input.grossMonthlySalary +
    input.overtimeAmount -
    input.vacationDaysUsed * 25 -
    input.sicknessDays * 15 +
    input.smartworkingDays * 5;

  const avs = grossAdjusted * ruleSet.avsRateEmployee;
  const ai = grossAdjusted * ruleSet.aiRateEmployee;
  const ipg = grossAdjusted * ruleSet.ipgRateEmployee;
  const ad = grossAdjusted * ruleSet.adRateEmployee;
  const lpp = grossAdjusted * getLppRate(input.age, ruleSet);
  const withholdingTax = grossAdjusted * getWithholdingTaxRate(input.taxProfile.canton, ruleSet);

  const totalDeductions = avs + ai + ipg + ad + lpp + withholdingTax;
  const netSalary = Math.max(0, grossAdjusted - totalDeductions);

  const lines: PayslipLine[] = [
    { code: "GROSS", description: "Salario lordo rettificato", amount: round(grossAdjusted) },
    { code: "AVS", description: "Contributo AVS dipendente", amount: -round(avs) },
    { code: "AI", description: "Contributo AI dipendente", amount: -round(ai) },
    { code: "IPG", description: "Contributo IPG dipendente", amount: -round(ipg) },
    { code: "AD", description: "Assicurazione disoccupazione (AD)", amount: -round(ad) },
    { code: "LPP", description: "Previdenza professionale LPP", amount: -round(lpp) },
    { code: "QST", description: "Imposta alla fonte cantonale", amount: -round(withholdingTax) },
    { code: "NET", description: "Netto da pagare", amount: round(netSalary) }
  ];

  return {
    lines,
    grossAdjusted: round(grossAdjusted),
    netSalary: round(netSalary)
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
