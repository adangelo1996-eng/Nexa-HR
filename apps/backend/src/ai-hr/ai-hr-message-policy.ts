import { BadRequestException } from "@nestjs/common";

/** Messaggio standard per rifiuti lato server (chat Hebb / ai-hr). */
export const HEBB_PSEUDONYMIZATION_POLICY_IT =
  "Per la pseudonimizzazione dei dati HR non è consentito inserire nel messaggio nomi, cognomi o indirizzi email di persone. " +
  "Seleziona la persona o il gruppo dall’ambito strutturato sopra la chat, oppure descrivi solo aggregati e numeri (senza nominativi).";

const IT_COMMON_WORDS = new Set([
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "una",
  "uno",
  "dei",
  "delle",
  "del",
  "della",
  "dei",
  "degli",
  "nel",
  "nella",
  "sul",
  "sulla",
  "per",
  "con",
  "che",
  "non",
  "sono",
  "essere",
  "avere",
  "fare",
  "buon",
  "buona",
  "buongiorno",
  "buonasera",
  "ciao",
  "grazie",
  "prego",
  "nexa",
  "hr",
  "hebb",
  "ai",
  "open",
  "workflow",
  "report",
  "team",
  "budget",
  "ferie",
  "permessi",
  "cedolino",
  "cedolini",
  "stipendio",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
  "domenica",
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre"
]);

function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function messageContainsEmail(message: string): boolean {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(message);
}

/**
 * Euristica: due parole con iniziale maiuscola consecutive (es. «Mario Rossi»), escludendo stopword italiane comuni.
 */
export function messageLikelyContainsPersonName(message: string): boolean {
  if (messageContainsEmail(message)) {
    return true;
  }
  const re = /\b([A-ZÀ-ÖØÞ][a-zà-öø-ÿ]{1,})\s+([A-ZÀ-ÖØÞ][a-zà-öø-ÿ]{1,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const a = m[1]!.toLowerCase();
    const b = m[2]!.toLowerCase();
    if (IT_COMMON_WORDS.has(a) || IT_COMMON_WORDS.has(b)) {
      continue;
    }
    if (a.length >= 2 && b.length >= 2) {
      return true;
    }
  }
  return false;
}

/**
 * Impedisce che il testo libero contenga nominativi noti in anagrafica (nome completo).
 * L’identificazione della persona avviene solo tramite scope strutturato, non dalla chat.
 */
export function assertMessageHasNoKnownPersonFullNames(
  message: string,
  directory: { fullName: string; firstName?: string; lastName?: string }[]
): void {
  const msg = normName(message);
  if (!msg) {
    return;
  }
  for (const row of directory) {
    const full = normName(row.fullName);
    if (full.length >= 5 && msg.includes(full)) {
      throw new BadRequestException(HEBB_PSEUDONYMIZATION_POLICY_IT);
    }
    const fn = row.firstName ? normName(row.firstName) : "";
    const ln = row.lastName ? normName(row.lastName) : "";
    if (fn.length >= 2 && ln.length >= 2) {
      const combo = `${fn} ${ln}`;
      if (combo.length >= 5 && msg.includes(combo)) {
        throw new BadRequestException(HEBB_PSEUDONYMIZATION_POLICY_IT);
      }
    }
  }
}

/** Controllo unificato per messaggi utente verso LLM Hebb / ai-hr / analytics chat. */
export function assertHebbUserMessageAllowed(
  message: string,
  directory?: { fullName: string; firstName?: string; lastName?: string }[]
): void {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }
  if (messageLikelyContainsPersonName(trimmed)) {
    throw new BadRequestException(HEBB_PSEUDONYMIZATION_POLICY_IT);
  }
  if (directory?.length) {
    assertMessageHasNoKnownPersonFullNames(trimmed, directory);
  }
}
