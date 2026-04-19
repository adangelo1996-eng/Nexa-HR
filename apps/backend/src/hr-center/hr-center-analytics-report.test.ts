import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOfflineHrCenterAnalyticsReport } from "./hr-center-analytics-report";

describe("buildOfflineHrCenterAnalyticsReport", () => {
  it("produce envelope completo con narrativa e priorità", () => {
    const facts = {
      scope: "company" as const,
      byCostCenter: [
        { costCenterId: "cc-a", headcount: 10, monthlyGrossSum: 50_000 },
        { costCenterId: "cc-b", headcount: 2, monthlyGrossSum: 8000 }
      ],
      totals: { headcount: 12, monthlyGrossSum: 58_000, avgWeeklyContractHours: 39 },
      disclaimer: "Test disclaimer"
    };
    const r = buildOfflineHrCenterAnalyticsReport(facts);
    assert.ok(r.envelope.executiveSummary.includes("12"));
    assert.ok(
      r.envelope.executiveSummary.includes("58.000") ||
        r.envelope.executiveSummary.includes("58,000") ||
        r.envelope.executiveSummary.includes("58000")
    );
    assert.equal(r.envelope.costCenterNarratives.length, 2);
    assert.ok(r.envelope.strategicInsights.length >= 3);
    assert.ok(r.envelope.priorities.length >= 2);
    assert.equal(r.envelope.methodologyNote, "Test disclaimer");
  });
});
