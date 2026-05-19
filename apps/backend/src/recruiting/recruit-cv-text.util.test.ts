import assert from "node:assert/strict";
import test from "node:test";
import { mergeCvTextSources, normalizeCvText } from "./recruit-cv-text.util";

test("normalizeCvText collapses whitespace and caps length", () => {
  const long = "a ".repeat(20_000);
  const out = normalizeCvText(`  hello   world  \n\n${long}`);
  assert.ok(out.startsWith("hello world"));
  assert.ok(out.length <= 12_000);
});

test("mergeCvTextSources joins non-empty parts", () => {
  const merged = mergeCvTextSources([" CV body ", null, "", "notes line"]);
  assert.match(merged, /CV body/);
  assert.match(merged, /notes line/);
});
