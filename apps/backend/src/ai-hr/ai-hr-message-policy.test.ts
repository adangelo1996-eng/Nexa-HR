import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  assertHebbUserMessageAllowed,
  assertMessageHasNoKnownPersonFullNames,
  messageLikelyContainsPersonName
} from "./ai-hr-message-policy";

describe("ai-hr-message-policy", () => {
  const directory = [{ fullName: "Mario Rossi", firstName: "Mario", lastName: "Rossi" }];

  it("detects email in message", () => {
    assert.equal(messageLikelyContainsPersonName("contatta mario.rossi@azienda.it"), true);
  });

  it("detects capitalized name pair", () => {
    assert.equal(messageLikelyContainsPersonName("Come sta Mario Rossi nel team?"), true);
  });

  it("ignores common Italian phrase starters", () => {
    assert.equal(messageLikelyContainsPersonName("Buon giorno, quante ferie ho?"), false);
  });

  it("blocks known full name from directory", () => {
    assert.throws(
      () => assertMessageHasNoKnownPersonFullNames("aggiorna mario rossi", directory),
      BadRequestException
    );
  });

  it("allows aggregate questions without names", () => {
    assert.doesNotThrow(() =>
      assertHebbUserMessageAllowed("quante approvazioni sono in sospeso?", directory)
    );
  });

  it("blocks heuristic before directory match", () => {
    assert.throws(() => assertHebbUserMessageAllowed("parlami di Luca Bianchi", []), BadRequestException);
  });
});
