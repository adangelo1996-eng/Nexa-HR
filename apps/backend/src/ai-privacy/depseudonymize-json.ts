import { AI_TOKEN_BODY_RE } from "./ai-privacy.constants";
import { AiPrivacyUnknownTokenError } from "./ai-privacy.errors";
import type { TokenVaultService } from "./token-vault.service";

function uniqueTokensInString(s: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(AI_TOKEN_BODY_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    found.add(m[0]);
  }
  return [...found];
}

async function replaceTokensInString(
  s: string,
  sessionId: string,
  vault: TokenVaultService,
  issued: Set<string>
): Promise<string> {
  const tokens = uniqueTokensInString(s);
  tokens.sort((a, b) => b.length - a.length);
  let out = s;
  for (const t of tokens) {
    if (!issued.has(t)) {
      throw new AiPrivacyUnknownTokenError(t);
    }
    const entry = await vault.getEntry(sessionId, t);
    if (!entry) {
      throw new AiPrivacyUnknownTokenError(t);
    }
    out = out.split(t).join(entry.value);
  }
  return out;
}

async function walk(value: unknown, sessionId: string, vault: TokenVaultService, issued: Set<string>): Promise<unknown> {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (!value.includes("__nexa_ref:")) {
      return value;
    }
    return replaceTokensInString(value, sessionId, vault, issued);
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      out.push(await walk(item, sessionId, vault, issued));
    }
    return out;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = await walk(v, sessionId, vault, issued);
    }
    return out;
  }
  return value;
}

/**
 * Ripristina valori reali sostituendo solo token emessi in questa sessione (fail-closed).
 */
export async function depseudonymizeFromModel(
  data: unknown,
  sessionId: string,
  vault: TokenVaultService
): Promise<unknown> {
  const issued = await vault.listIssuedTokens(sessionId);
  return walk(data, sessionId, vault, issued);
}
