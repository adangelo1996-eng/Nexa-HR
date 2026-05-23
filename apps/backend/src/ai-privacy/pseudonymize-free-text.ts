import { randomBytes } from "node:crypto";
import { AI_TOKEN_PREFIX } from "./ai-privacy.constants";
import type { TokenVaultService } from "./token-vault.service";
import type { VaultEntry } from "./vault.types";
import { messageLikelyContainsPersonName } from "../ai-hr/ai-hr-message-policy";

export type PersonDirectoryEntry = {
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function mintFreeTextToken(kind: string): string {
  const id = randomBytes(12)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 16);
  return `${AI_TOKEN_PREFIX}${kind}:${id}__`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function registerReplacement(
  sessionId: string,
  vault: TokenVaultService,
  kind: string,
  value: string
): Promise<string> {
  const token = mintFreeTextToken(kind);
  const entry: VaultEntry = { kind, value };
  await vault.registerToken(sessionId, token, entry);
  return token;
}

type ReplacementSpec = {
  value: string;
  kind: string;
};

function buildDirectoryReplacements(directory: PersonDirectoryEntry[]): ReplacementSpec[] {
  const specs: ReplacementSpec[] = [];
  const seen = new Set<string>();

  const add = (value: string, kind: string) => {
    const key = value.trim().toLowerCase();
    if (!key || key.length < 2 || seen.has(key)) {
      return;
    }
    seen.add(key);
    specs.push({ value: value.trim(), kind });
  };

  for (const row of directory) {
    if (row.fullName?.trim()) {
      add(row.fullName, "full_name");
    }
    const fn = row.firstName?.trim();
    const ln = row.lastName?.trim();
    if (fn && ln) {
      add(`${fn} ${ln}`, "full_name");
    }
    if (row.email?.trim()) {
      add(row.email, "email");
    }
  }

  return specs.sort((a, b) => b.value.length - a.value.length);
}

/**
 * Sostituisce nominativi ed email noti in testo libero con token di sessione (mai inviare PII al modello).
 */
export async function pseudonymizeFreeTextForAi(
  text: string,
  directory: PersonDirectoryEntry[],
  sessionId: string,
  vault: TokenVaultService
): Promise<{ text: string; replacementCount: number }> {
  if (!text.trim()) {
    return { text, replacementCount: 0 };
  }

  let out = text;
  let replacementCount = 0;

  for (const spec of buildDirectoryReplacements(directory)) {
    const pattern = new RegExp(`\\b${escapeRegex(spec.value)}\\b`, "gi");
    if (!pattern.test(out)) {
      continue;
    }
    const token = await registerReplacement(sessionId, vault, spec.kind, spec.value);
    out = out.replace(new RegExp(`\\b${escapeRegex(spec.value)}\\b`, "gi"), token);
    replacementCount += 1;
  }

  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const emails = [...new Set(out.match(emailRe) ?? [])];
  for (const email of emails) {
    const token = await registerReplacement(sessionId, vault, "email", email);
    out = out.replace(new RegExp(escapeRegex(email), "gi"), token);
    replacementCount += 1;
  }

  if (messageLikelyContainsPersonName(out)) {
    const heuristicRe = /\b([A-ZÀ-ÖØÞ][a-zà-öø-ÿ]{1,})\s+([A-ZÀ-ÖØÞ][a-zà-öø-ÿ]{1,})\b/g;
    const pairs: string[] = [];
    const seenPairs = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = heuristicRe.exec(out)) !== null) {
      const pair = `${m[1]} ${m[2]}`;
      const key = pair.toLowerCase();
      if (seenPairs.has(key)) {
        continue;
      }
      seenPairs.add(key);
      pairs.push(pair);
    }
    pairs.sort((a, b) => b.length - a.length);
    for (const pair of pairs) {
      const token = await registerReplacement(sessionId, vault, "person_name", pair);
      out = out.replace(new RegExp(`\\b${escapeRegex(pair)}\\b`, "g"), token);
      replacementCount += 1;
    }
  }

  return { text: out, replacementCount };
}
