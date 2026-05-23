import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COWORK_HIGH_RISK_TOOL_IDS } from "./cowork-tool-catalog";
import {
  coworkHistoryMonthKey,
  coworkHistoryMonthLabelIt,
  groupCoworkHistoryBatchesByMonth,
  paginateCoworkHistoryMonths
} from "./cowork-history.util";
import type { CoworkHistoryBatch } from "./cowork.types";
import { CoworkUndoService } from "./cowork-undo.service";

describe("cowork undo reversibility", () => {
  const undo = Object.create(CoworkUndoService.prototype) as CoworkUndoService;

  it("blocca publish payslips e payroll batch", () => {
    const pub = undo.isToolReversible("publish_payslips_period");
    assert.equal(pub.reversible, false);
    assert.match(pub.reason ?? "", /payroll/i);

    const batch = undo.isToolReversible("payroll_batch_generate");
    assert.equal(batch.reversible, false);
    assert.ok(COWORK_HIGH_RISK_TOOL_IDS.has("payroll_batch_generate"));
  });

  it("blocca renew_agreements", () => {
    const r = undo.isToolReversible("renew_agreements");
    assert.equal(r.reversible, false);
    assert.match(r.reason ?? "", /accord/i);
  });

  it("consente undo su ferie, SW, prenotazione sala", () => {
    assert.equal(undo.isToolReversible("create_leave_plan").reversible, true);
    assert.equal(undo.isToolReversible("create_smartworking_request").reversible, true);
    assert.equal(undo.isToolReversible("create_meeting_room_booking").reversible, true);
    assert.equal(undo.isToolReversible("extend_approved_requests").reversible, true);
  });

  it("buildLogUndoMeta marca blocked per payroll", () => {
    const meta = undo.buildLogUndoMeta("publish_payslips_period");
    assert.equal(meta.undoStatus, "blocked");
    assert.ok(meta.undoBlockedReason);
  });

  it("buildLogUndoMeta available per leave", () => {
    const meta = undo.buildLogUndoMeta("create_leave_plan");
    assert.equal(meta.undoStatus, "available");
    assert.equal(meta.undoBlockedReason, null);
  });
});

describe("cowork history monthly grouping", () => {
  const sampleBatch = (appliedAt: string, planId: string): CoworkHistoryBatch => ({
    planId,
    batchId: `b-${planId}`,
    summary: "Test",
    domain: "time_off",
    actorUserId: "u1",
    appliedAt,
    sections: [],
    categories: [],
    entries: []
  });

  it("month key e label IT", () => {
    assert.equal(coworkHistoryMonthKey("2026-05-15T10:00:00.000Z"), "2026-05");
    assert.match(coworkHistoryMonthLabelIt("2026-05"), /maggio 2026/i);
  });

  it("raggruppa batch per mese ordinati desc", () => {
    const grouped = groupCoworkHistoryBatchesByMonth([
      sampleBatch("2026-04-10T12:00:00.000Z", "p1"),
      sampleBatch("2026-05-02T12:00:00.000Z", "p2"),
      sampleBatch("2026-05-20T12:00:00.000Z", "p3")
    ]);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0]?.month, "2026-05");
    assert.equal(grouped[0]?.batches.length, 2);
    assert.equal(grouped[1]?.month, "2026-04");
  });

  it("pagina per mese", () => {
    const grouped = groupCoworkHistoryBatchesByMonth([
      sampleBatch("2026-01-01T00:00:00.000Z", "a"),
      sampleBatch("2026-02-01T00:00:00.000Z", "b"),
      sampleBatch("2026-03-01T00:00:00.000Z", "c")
    ]);
    const page1 = paginateCoworkHistoryMonths(grouped, 1, 2);
    assert.equal(page1.totalMonths, 3);
    assert.equal(page1.months.length, 2);
    const page2 = paginateCoworkHistoryMonths(grouped, 2, 2);
    assert.equal(page2.months.length, 1);
  });
});
