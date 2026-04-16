import { randomBytes } from "node:crypto";
import { AI_TOKEN_PREFIX } from "./ai-privacy.constants";
import type { TokenVaultService } from "./token-vault.service";
import type { VaultEntry } from "./vault.types";
import { piiKindForKeyValue } from "./pii-field-registry";

function mintToken(kind: string): string {
  const id = randomBytes(16)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 20);
  return `${AI_TOKEN_PREFIX}${kind}:${id}__`;
}

async function walk(value: unknown, sessionId: string, vault: TokenVaultService): Promise<unknown> {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      out.push(await walk(item, sessionId, vault));
    }
    return out;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const kind = piiKindForKeyValue(k, v);
      if (kind && typeof v === "string") {
        const token = mintToken(kind);
        const entry: VaultEntry = { kind, value: v };
        await vault.registerToken(sessionId, token, entry);
        out[k] = token;
      } else {
        out[k] = await walk(v, sessionId, vault);
      }
    }
    return out;
  }
  return value;
}

/**
 * Clona struttura JSON sostituendo campi sensibili con token registrati nel vault sessione.
 */
export async function pseudonymizeForAi(data: unknown, sessionId: string, vault: TokenVaultService): Promise<unknown> {
  return walk(data, sessionId, vault);
}

export async function countVaultTokens(sessionId: string, vault: TokenVaultService): Promise<number> {
  return (await vault.listIssuedTokens(sessionId)).size;
}
