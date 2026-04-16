import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { depseudonymizeFromModel } from "./depseudonymize-json";
import { AiPrivacyUnknownTokenError } from "./ai-privacy.errors";
import { pseudonymizeForAi } from "./pseudonymize-json";
import { TokenVaultService } from "./token-vault.service";
import { AiPrivacyGateway } from "./ai-privacy-gateway.service";
import { isDeepStrictEqual } from "node:util";

describe("ai-privacy", () => {
  it("round-trip: PII sostituiti e ripristinati", async () => {
    const vault = new TokenVaultService();
    const gateway = new AiPrivacyGateway(vault);
    const { sessionId } = await gateway.beginSession("co1", "actor1");
    const raw = {
      email: "segreto@azienda.it",
      nested: { phone: "+39 02 1234567", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }
    };
    const { pseudonymized, tokenCount } = await gateway.toModelPayload(sessionId, raw, "test_v1");
    assert.ok(tokenCount >= 1);
    const flat = JSON.stringify(pseudonymized);
    assert.ok(!flat.includes("segreto@azienda.it"));
    assert.ok(!flat.includes("+39 02 1234567"));
    const back = await gateway.fromModelResponse(sessionId, pseudonymized);
    assert.equal(isDeepStrictEqual(back, raw), true);
    await gateway.endSession(sessionId);
  });

  it("fail-closed: token non emesso nella risposta", async () => {
    const vault = new TokenVaultService();
    const sid = await vault.createSession("c", "u");
    await pseudonymizeForAi({ email: "a@b.co" }, sid, vault);
    const bad = { text: "__nexa_ref:email:ZZZZZZZZZZZZZZZZ__" };
    await assert.rejects(() => depseudonymizeFromModel(bad, sid, vault), (e: unknown) => e instanceof AiPrivacyUnknownTokenError);
    await vault.endSession(sid);
  });

  it("sessione chiusa: depseudonymize fallisce", async () => {
    const vault = new TokenVaultService();
    const gateway = new AiPrivacyGateway(vault);
    const { sessionId } = await gateway.beginSession("c", "u");
    const { pseudonymized } = await gateway.toModelPayload(sessionId, { email: "x@y.z" }, "t");
    await gateway.endSession(sessionId);
    await assert.rejects(() => gateway.fromModelResponse(sessionId, pseudonymized));
  });
});
