import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pseudonymizeFreeTextForAi } from "./pseudonymize-free-text";
import { TokenVaultService } from "./token-vault.service";

describe("pseudonymizeFreeTextForAi", () => {
  it("sostituisce nominativo noto in anagrafica con token", async () => {
    const vault = new TokenVaultService();
    const sessionId = await vault.createSession("comp-1", "actor-1");
    const directory = [{ fullName: "Mario Rossi", firstName: "Mario", lastName: "Rossi" }];

    const { text, replacementCount } = await pseudonymizeFreeTextForAi(
      "Estendi ferie per Mario Rossi fino a dicembre",
      directory,
      sessionId,
      vault
    );

    assert.ok(replacementCount >= 1);
    assert.ok(!/mario rossi/i.test(text));
    assert.match(text, /__nexa_ref:/);
    await vault.endSession(sessionId);
  });

  it("sostituisce email nel testo", async () => {
    const vault = new TokenVaultService();
    const sessionId = await vault.createSession("comp-1", "actor-1");

    const { text } = await pseudonymizeFreeTextForAi(
      "Contatta mario.rossi@azienda.it per il piano",
      [],
      sessionId,
      vault
    );

    assert.ok(!text.includes("mario.rossi@azienda.it"));
    await vault.endSession(sessionId);
  });
});
