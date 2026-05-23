import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoworkPlanHydrationService } from "./cowork-plan-hydration.service";

describe("cowork plan hydration — recurring smartworking days", () => {
  const svc = Object.create(CoworkPlanHydrationService.prototype) as CoworkPlanHydrationService;

  it("espande ogni lunedì di maggio 2026", () => {
    const days = svc.expandSmartworkingDaysFromMessage(
      "Inserisci remote working ogni lunedì di maggio 2026 per il team"
    );
    assert.deepEqual(days, ["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"]);
  });

  it("espande Mondays in May 2026 (EN)", () => {
    const days = svc.expandSmartworkingDaysFromMessage("Smartworking every Monday in May 2026");
    assert.deepEqual(days, ["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"]);
  });

  it("non espande senza mese né cue ricorrenza", () => {
    const days = svc.expandSmartworkingDaysFromMessage("Remote working domani per Mario");
    assert.deepEqual(days, []);
  });

  it("intervallo ISO con weekday filtra solo i lunedì nel range", () => {
    const days = svc.expandSmartworkingDaysFromMessage(
      "Ogni lunedì dal 2026-05-01 al 2026-05-31"
    );
    assert.deepEqual(days, ["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"]);
  });

  it("buildSmartworkingRequestRows: una riga per dipendente per giorno", () => {
    const users = [{ id: "u1", fullName: "Ada", costCenterId: "c1", teamId: "t1" }];
    const rows = (
      svc as unknown as {
        buildSmartworkingRequestRows: (
          sid: string,
          toolId: string,
          users: typeof users,
          message: string
        ) => Array<{ payload: { day: string; endDay: string }; detail: string }>;
      }
    ).buildSmartworkingRequestRows(
      "sec-1",
      "create_smartworking_request",
      users,
      "Smartworking ogni lunedì di maggio 2026"
    );
    assert.equal(rows.length, 4);
    assert.equal(rows[0]?.payload.day, "2026-05-04");
    assert.equal(rows[0]?.payload.endDay, "2026-05-04");
    assert.equal(rows[3]?.payload.day, "2026-05-25");
  });

  it("singolo giorno: endDay uguale a day (non fine anno)", () => {
    const users = [{ id: "u1", fullName: "Ada", costCenterId: "c1", teamId: "t1" }];
    const rows = (
      svc as unknown as {
        buildSmartworkingRequestRows: (
          sid: string,
          toolId: string,
          users: typeof users,
          message: string
        ) => Array<{ payload: { day: string; endDay: string } }>;
      }
    ).buildSmartworkingRequestRows(
      "sec-1",
      "create_smartworking_request",
      users,
      "Remote 2026-06-10"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.payload.day, "2026-06-10");
    assert.equal(rows[0]?.payload.endDay, "2026-06-10");
  });
});
