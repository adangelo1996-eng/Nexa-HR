import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateItalianPayroll,
  computeAnnualIrpef,
  defaultItalianRuleSet2026,
  employerBudgetBucketsFromGrossIt
} from "./index.js";

test("computeAnnualIrpef uses brackets and detrazione", () => {
  const rs = defaultItalianRuleSet2026;
  const t = computeAnnualIrpef(30_000, rs);
  const raw = 28_000 * 0.23 + 2_000 * 0.33;
  assert.equal(Math.round((raw - rs.detrazioneLavoroAnnuo) * 100) / 100, Math.round(t * 100) / 100);
});

test("calculateItalianPayroll returns net lower than gross", () => {
  const r = calculateItalianPayroll(
    {
      period: "2026-03",
      grossMonthlySalary: 3500,
      weeklyContractHours: 40,
      age: 35,
      vacationDaysUsed: 0,
      sicknessDays: 0,
      smartworkingDays: 0,
      overtimeAmount: 200,
      taxProfile: { regionCode: "LAZ", municipality: "Roma" },
      vacationResidualDays: 18
    },
    defaultItalianRuleSet2026
  );
  assert.ok(r.netSalary > 0);
  assert.ok(r.netSalary < r.grossAdjusted);
  assert.ok(r.lines.some((l) => l.code === "INPS" && l.amount < 0));
});

test("employerBudgetBucketsFromGrossIt sums cost", () => {
  const b = employerBudgetBucketsFromGrossIt(3000, defaultItalianRuleSet2026);
  assert.ok(b.totalCompanyCost > 3000);
});
