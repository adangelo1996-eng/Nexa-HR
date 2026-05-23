import assert from "node:assert/strict";
import test from "node:test";
import { batchKeyFor, employmentBlocksForParty, remoteWorkingBlocksForParty } from "./hr-contract-templates";

test("batchKeyFor idempotency keys", () => {
  assert.equal(batchKeyFor("u1", "employment"), "u1:employment");
  assert.equal(batchKeyFor("u1", "remote_working", 2026), "u1:remote_working:2026");
});

test("remote block embeds max remote days in metadata", () => {
  const blocks = remoteWorkingBlocksForParty({
    companyLegalName: "ACME",
    employeeFirstName: "Mario",
    employeeLastName: "Rossi",
    employeeUserId: "u1",
    maxRemoteDaysPerWeek: 2,
    maxRemoteDaysPerMonth: 8
  });
  const quota = blocks.find((b) => b.type === "remote_working_quota");
  assert.ok(quota);
  assert.equal(quota?.metadata?.maxRemoteDaysPerWeek, 2);
  assert.ok(quota?.content.includes("2"));
});

test("employment blocks fill employee name", () => {
  const blocks = employmentBlocksForParty({
    companyLegalName: "ACME",
    employeeFirstName: "Mario",
    employeeLastName: "Rossi",
    employeeUserId: "u1",
    roleTitle: "Developer"
  });
  const parti = blocks.find((b) => b.key === "parti");
  assert.ok(parti?.content.includes("Mario Rossi"));
});
