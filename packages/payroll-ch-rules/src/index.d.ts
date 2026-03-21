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
    lppRatesByAge: Array<{
        minAge: number;
        maxAge: number;
        rate: number;
    }>;
    withholdingTaxByCanton: Record<string, number>;
}
export declare const defaultRuleSet2026: SwissRuleSet;
export declare function calculateSwissPayroll(input: PayrollInput, ruleSet?: SwissRuleSet): PayrollResult;
