import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHebbFieldSensitive, stripSensitiveFromPartialForm } from "./hebb-field-sensitivity";

describe("hebb-field-sensitivity", () => {
  it("blocks fiscal code and email keys", () => {
    assert.equal(isHebbFieldSensitive("fiscalCode"), true);
    assert.equal(isHebbFieldSensitive("email"), true);
    assert.equal(isHebbFieldSensitive("contractType"), false);
  });

  it("strips sensitive keys from partial form", () => {
    const out = stripSensitiveFromPartialForm({
      contractType: "TI",
      email: "a@b.it",
      dueDate: "2026-06-01"
    });
    assert.equal(out.contractType, "TI");
    assert.equal(out.dueDate, "2026-06-01");
    assert.equal("email" in out, false);
  });
});
