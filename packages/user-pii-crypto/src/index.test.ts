import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decryptUserFromStorage,
  encryptUserForStorage,
  encryptUserPiiString,
  decryptUserPiiString,
  USER_PII_CIPHER_PREFIX
} from "./index";
import type { User } from "@payday/domain";

const key = Buffer.alloc(32, 7);

describe("user-pii-crypto", () => {
  it("round-trips string", () => {
    const enc = encryptUserPiiString("RSSMRA80A01H501U", key);
    assert.ok(enc.startsWith(USER_PII_CIPHER_PREFIX));
    assert.equal(decryptUserPiiString(enc, key), "RSSMRA80A01H501U");
  });

  it("encryptUserForStorage / decryptUserFromStorage", () => {
    const u: User = {
      id: "u1",
      email: "a@b.c",
      fullName: "Test User",
      role: "user",
      companyId: "c1",
      fiscalCode: "RSSMRA80A01H501U",
      iban: "IT60X0542811101000000123456"
    };
    const stored = encryptUserForStorage(u, key);
    assert.notEqual(stored.fiscalCode, u.fiscalCode);
    assert.equal(stored.email, u.email);
    assert.equal(stored.fullName, u.fullName);
    const back = decryptUserFromStorage(stored, key);
    assert.equal(back.fiscalCode, u.fiscalCode);
    assert.equal(back.iban, u.iban);
  });
});
