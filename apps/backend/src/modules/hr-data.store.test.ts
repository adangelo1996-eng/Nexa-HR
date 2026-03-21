import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HrDataStore } from "./hr-data.store";

describe("HrDataStore", () => {
  it("genera cedolino e lo rende disponibile", async () => {
    const store = new HrDataStore();
    const payslip = await store.generatePayslip("u-employee", "2026-03");
    assert.equal(payslip.userId, "u-employee");
    assert.ok(payslip.netSalary > 0);
    const list = await store.listPayslips("u-employee");
    assert.equal(list.length, 1);
  });

  it("gestisce entrata/uscita con pausa-ripresa e calcola straordinario giornaliero", async () => {
    const store = new HrDataStore();
    const user = await store.createUser({
      firstName: "Mario",
      lastName: "Rossi",
      role: "employee",
      companyId: "comp-1",
      weeklyContractHours: 40
    });
    const day = "2026-03-12";
    await store.addTimeEntry(user.id, "clock_in", `${day}T08:00:00.000Z`);
    await store.addTimeEntry(user.id, "clock_out", `${day}T12:00:00.000Z`);
    await store.addTimeEntry(user.id, "clock_in", `${day}T13:00:00.000Z`);
    await store.addTimeEntry(user.id, "clock_out", `${day}T18:00:00.000Z`);

    const status = await store.getClockStatus(user.id, day);
    assert.equal(status.isRunning, false);
    assert.equal(status.nextType, "clock_in");
    assert.equal(status.dailyTargetSeconds, 28800);
    assert.equal(status.workedSeconds, 32400);
    assert.equal(status.overtimeSeconds, 3600);
    assert.equal(status.remainingSeconds, 0);

    const summaries = await store.listWorkdaySummary(user.id, day);
    assert.equal(summaries[0]?.overtimeSeconds, 3600);
  });

  it("deriva il target giornaliero dalle ore settimanali in anagrafica", async () => {
    const store = new HrDataStore();
    const user = await store.createUser({
      firstName: "Luca",
      lastName: "Bianchi",
      role: "employee",
      companyId: "comp-1",
      weeklyContractHours: 30
    });
    const day = "2026-03-13";
    const status = await store.getClockStatus(user.id, day);
    assert.equal(status.dailyTargetSeconds, 21600);
  });

  it("mantiene il timer in corso quando c'e una entrata aperta", async () => {
    const store = new HrDataStore();
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const day = twoHoursAgo.slice(0, 10);
    await store.addTimeEntry("u-employee", "clock_in", twoHoursAgo);

    const status = await store.getClockStatus("u-employee", day);
    assert.equal(status.isRunning, true);
    assert.equal(status.nextType, "clock_out");
    assert.ok(status.workedSeconds >= 7190);
    assert.ok(status.remainingSeconds <= 21610);
  });

  it("aggrega lo straordinario per settimana, mese e anno", async () => {
    const store = new HrDataStore();
    const user = await store.createUser({
      firstName: "Giulia",
      lastName: "Verdi",
      role: "employee",
      companyId: "comp-1",
      weeklyContractHours: 40
    });
    await store.addTimeEntry(user.id, "clock_in", "2026-03-10T08:00:00.000Z");
    await store.addTimeEntry(user.id, "clock_out", "2026-03-10T17:00:00.000Z"); // +1h
    await store.addTimeEntry(user.id, "clock_in", "2026-03-11T08:00:00.000Z");
    await store.addTimeEntry(user.id, "clock_out", "2026-03-11T18:00:00.000Z"); // +2h

    const aggregates = await store.getOvertimeAggregates(user.id, "2026-03-11");
    if ("scope" in aggregates) {
      assert.fail("Unexpected scoped response");
    }
    assert.equal(aggregates.week.overtimeSeconds, 10800);
    assert.equal(aggregates.month.overtimeSeconds, 10800);
    assert.equal(aggregates.year.overtimeSeconds, 10800);
  });
});
