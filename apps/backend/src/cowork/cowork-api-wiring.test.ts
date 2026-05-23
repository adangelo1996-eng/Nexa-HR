import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COWORK_EXECUTABLE_TOOL_IDS,
  COWORK_TOOL_CATALOG,
  COWORK_TOOL_LIST
} from "./cowork-tool-catalog";

describe("cowork catalog completeness", () => {
  it("tutti i tool del catalogo sono eseguibili (37/37)", () => {
    const nonExecutable = COWORK_TOOL_LIST.filter((t) => !t.executable);
    assert.deepEqual(
      nonExecutable.map((t) => t.id),
      [],
      `Tool ancora bloccati: ${nonExecutable.map((t) => t.id).join(", ")}`
    );
    assert.equal(COWORK_TOOL_LIST.length, 37);
    assert.equal(COWORK_EXECUTABLE_TOOL_IDS.size, 37);
  });

  it("tool precedentemente non eseguibili ora attivi", () => {
    assert.equal(COWORK_TOOL_CATALOG.sync_team_calendar_view.executable, true);
    assert.equal(COWORK_TOOL_CATALOG.attendance_qr_batch.executable, true);
    assert.equal(COWORK_TOOL_CATALOG.link_document_ack.executable, true);
    assert.equal(COWORK_TOOL_CATALOG.onboarding_wizard_reminder.executable, true);
  });
});
