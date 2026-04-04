import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateItalianPayroll,
  computeAnnualIrpef,
  computeAnnualIrpefLorda,
  computeDetrazioneLavoroDipendenteIt2025,
  defaultItalianRuleSet2026,
  employerBudgetBucketsFromGrossIt,
  employerRatesFromItalianProfile,
  resolveComoMunicipalAddizionaleRate
} from "./index.js";

test("computeAnnualIrpef uses 35% middle bracket and detrazioni a tratti", () => {
  const rs = defaultItalianRuleSet2026;
  const lorda = computeAnnualIrpefLorda(30_000, rs);
  const raw = 28_000 * 0.23 + 2_000 * 0.35;
  assert.equal(Math.round(lorda * 100) / 100, Math.round(raw * 100) / 100);
  const det = computeDetrazioneLavoroDipendenteIt2025(30_000, false);
  const t = computeAnnualIrpef(30_000, rs);
  assert.equal(Math.round((lorda - det) * 100) / 100, Math.round(t * 100) / 100);
});

test("computeAnnualIrpef legacy flat detrazione matches old behaviour", () => {
  const rs = defaultItalianRuleSet2026;
  const lorda = computeAnnualIrpefLorda(30_000, rs);
  const t = computeAnnualIrpef(30_000, rs, { legacyFlatDetrazione: true });
  assert.equal(Math.round((lorda - rs.detrazioneLavoroAnnuo) * 100) / 100, Math.round(t * 100) / 100);
});

test("calculateItalianPayroll may include TIR for low projected annual income", () => {
  const r = calculateItalianPayroll({
    period: "2026-03",
    grossMonthlySalary: 950,
    weeklyContractHours: 40,
    age: 30,
    vacationDaysUsed: 0,
    sicknessDays: 0,
    smartworkingDays: 0,
    overtimeAmount: 0,
    taxProfile: { regionCode: "LAZ", municipality: "Roma" }
  });
  const tir = r.lines.find((l) => l.code === "TIR");
  assert.ok(tir && tir.amount > 0);
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
  assert.ok(r.lines.some((l) => l.code === "DAT_INPS" && l.amount > 0));
  assert.ok(r.lines.some((l) => l.code === "DAT_INAIL" && l.amount > 0));
});

test("employerBudgetBucketsFromGrossIt sums cost", () => {
  const b = employerBudgetBucketsFromGrossIt(3000, { ruleSet: defaultItalianRuleSet2026 });
  assert.ok(b.totalCompanyCost > 3000);
});

test("employerRatesFromItalianProfile uses INAIL permille", () => {
  const r = employerRatesFromItalianProfile(
    { sector: "commerce", inailPermille: 4 },
    defaultItalianRuleSet2026
  );
  assert.equal(r.inailRate, 0.004);
  assert.ok(r.employerInpsRate > 0);
});

test("resolveComoMunicipalAddizionaleRate matches addizionali_como_2025", () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.ok(near(resolveComoMunicipalAddizionaleRate("Como") ?? 0, 0.007));
  assert.ok(near(resolveComoMunicipalAddizionaleRate("Cantù") ?? 0, 0.0076));
  assert.ok(near(resolveComoMunicipalAddizionaleRate("Campione D'Italia") ?? 0, 0.008));
});

test("addizionaleComunaleRate override affects ADD_COM line", () => {
  const r = calculateItalianPayroll({
    period: "2026-03",
    grossMonthlySalary: 3500,
    weeklyContractHours: 40,
    age: 35,
    vacationDaysUsed: 0,
    sicknessDays: 0,
    smartworkingDays: 0,
    overtimeAmount: 0,
    taxProfile: { regionCode: "LOM", municipality: "Como" },
    addizionaleComunaleRate: 0.007
  });
  const add = r.lines.find((l) => l.code === "ADD_COM");
  assert.ok(add && add.description.includes("0.70%"));
  assert.ok(add && add.amount < 0);
});
