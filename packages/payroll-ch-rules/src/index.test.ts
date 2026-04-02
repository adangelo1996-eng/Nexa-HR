import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateSwissPayroll, employerBudgetBucketsFromGrossChf } from "./index";

describe("calculateSwissPayroll", () => {
  it("calcola netto e linee principali", () => {
    const result = calculateSwissPayroll({
      grossMonthlySalary: 6000,
      age: 36,
      vacationDaysUsed: 1,
      sicknessDays: 0,
      smartworkingDays: 4,
      overtimeAmount: 300,
      period: "2026-02",
      taxProfile: {
        canton: "TI",
        municipality: "Lugano",
        permitType: "B",
        companyType: "commerciale",
        companySite: "TI-LUG"
      }
    });

    assert.ok(result.grossAdjusted > 0);
    assert.ok(result.netSalary > 0);
    assert.ok(result.lines.some((line) => line.code === "AVS"));
    assert.ok(result.lines.some((line) => line.code === "NET"));
  });
});

describe("employerBudgetBucketsFromGrossChf", () => {
  it("somma oneri e costo azienda sopra il lordo", () => {
    const b = employerBudgetBucketsFromGrossChf(6000, 36);
    assert.ok(b.totalEmployerContributions > 0);
    assert.ok(b.totalCompanyCost > 6000);
    assert.ok(Math.abs(b.totalCompanyCost - 6000 - b.totalEmployerContributions) < 0.02);
  });
});
