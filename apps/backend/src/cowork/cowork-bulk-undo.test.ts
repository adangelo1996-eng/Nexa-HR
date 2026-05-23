import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoworkHistoryBatchCategories,
  coworkHistoryCategoryKey,
  coworkHistoryCategoryLabel
} from "./cowork-history.util";
import type { CoworkHistoryBatch } from "./cowork.types";

describe("cowork history categories", () => {
  it("category key unifica dominio e tool", () => {
    assert.equal(coworkHistoryCategoryKey("time_off", "create_leave_plan"), "time_off:create_leave_plan");
  });

  it("category label preferisce titolo sezione", () => {
    assert.equal(
      coworkHistoryCategoryLabel("time_off", "create_leave_plan", "Ferie agosto"),
      "Ferie agosto"
    );
  });

  it("buildCoworkHistoryBatchCategories aggrega undo disponibili", () => {
    const batch: CoworkHistoryBatch = {
      planId: "p1",
      batchId: "b1",
      summary: "Test",
      domain: "time_off",
      actorUserId: "u1",
      appliedAt: "2026-05-01T12:00:00.000Z",
      sections: [],
      categories: [],
      entries: [
        {
          logId: "l1",
          rowId: "r1",
          toolId: "create_leave_plan",
          domain: "time_off",
          categoryKey: "time_off:create_leave_plan",
          categoryLabel: "Ferie",
          subjectFullName: "A",
          detail: "d1",
          undoStatus: "available"
        },
        {
          logId: "l2",
          rowId: "r2",
          toolId: "create_leave_plan",
          domain: "time_off",
          categoryKey: "time_off:create_leave_plan",
          categoryLabel: "Ferie",
          subjectFullName: "B",
          detail: "d2",
          undoStatus: "blocked",
          undoBlockedReason: "x"
        }
      ]
    };

    const cats = buildCoworkHistoryBatchCategories(batch);
    assert.equal(cats.length, 1);
    assert.equal(cats[0]?.appliedCount, 2);
    assert.equal(cats[0]?.undoAvailableCount, 1);
  });
});
