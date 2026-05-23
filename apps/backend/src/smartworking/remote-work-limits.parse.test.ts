import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseRemoteWorkLimitsFromBlocks,
  parseRemoteWorkLimitsFromText,
  REMOTE_WORKING_QUOTA_BLOCK_TYPE,
  REMOTE_WORK_LIMITS_BLOCK_TYPE
} from "./remote-work-limits.parse";

describe("parseRemoteWorkLimitsFromBlocks", () => {
  it("reads explicit remote_work_limits block", () => {
    const parsed = parseRemoteWorkLimitsFromBlocks([
      {
        type: REMOTE_WORK_LIMITS_BLOCK_TYPE,
        allowedDaysPerWeek: 3,
        allowedDaysPerMonth: 12
      }
    ]);
    assert.equal(parsed.maxRemoteDaysPerWeek, 3);
    assert.equal(parsed.maxRemoteDaysPerMonth, 12);
  });

  it("reads remote_working_quota metadata from batch templates", () => {
    const parsed = parseRemoteWorkLimitsFromBlocks([
      {
        type: REMOTE_WORKING_QUOTA_BLOCK_TYPE,
        content: "fino a 2 giorni a settimana e 8 al mese",
        metadata: { maxRemoteDaysPerWeek: 2, maxRemoteDaysPerMonth: 8 }
      }
    ]);
    assert.equal(parsed.maxRemoteDaysPerWeek, 2);
    assert.equal(parsed.maxRemoteDaysPerMonth, 8);
  });
});

describe("parseRemoteWorkLimitsFromText", () => {
  it("parses Italian week/month phrases", () => {
    const t =
      "Il dipendente può richiedere fino a 2 giorni di lavoro agile per settimana e 10 giorni per mese.";
    const parsed = parseRemoteWorkLimitsFromText(t);
    assert.equal(parsed.maxRemoteDaysPerWeek, 2);
    assert.equal(parsed.maxRemoteDaysPerMonth, 10);
  });
});
