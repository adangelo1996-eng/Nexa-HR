import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";
import type { User } from "@payday/domain";

/** Prefisso ciphertext salvato in colonne text Postgres. */
export const USER_PII_CIPHER_PREFIX = "nexa1:";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Campi anagrafica/fiscali/bancari crittografati a riposo (testo).
 * Esclusi volutamente: `email`, `fullName`, `firstName`, `lastName` (RLS Supabase su email, ORDER BY nome).
 */
export const USER_PII_ENCRYPTED_FIELDS = [
  "fiscalCode",
  "iban",
  "bankName",
  "bicSwift",
  "accountHolder",
  "phone",
  "address",
  "birthDate",
  "hireDate",
  "avsNumber",
  "taxCanton",
  "taxMunicipality",
  "taxRegion",
  "taxMunicipalityIt",
  "taxDomicileMunicipalityIt",
  "maritalStatus"
] as const satisfies ReadonlyArray<keyof User>;

export type UserPiiEncryptedField = (typeof USER_PII_ENCRYPTED_FIELDS)[number];

function parseKeyMaterial(raw: string): Buffer {
  const t = raw.trim();
  if (t.length === 64 && /^[0-9a-fA-F]+$/.test(t)) {
    return Buffer.from(t, "hex");
  }
  const b64 = Buffer.from(t, "base64");
  if (b64.length === 32) {
    return b64;
  }
  throw new Error(
    "USER_PII_ENCRYPTION_KEY: attesa chiave AES-256 — 32 byte in base64 oppure 64 caratteri esadecimali"
  );
}

/** Legge la chiave da `process.env.USER_PII_ENCRYPTION_KEY` (opzionale in dev). */
export function loadUserPiiKeyFromEnv(): Buffer | null {
  const raw = process.env.USER_PII_ENCRYPTION_KEY?.trim();
  if (!raw) {
    return null;
  }
  return parseKeyMaterial(raw);
}

export function isUserPiiEncryptionConfigured(): boolean {
  return loadUserPiiKeyFromEnv() != null;
}

export function encryptUserPiiString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return USER_PII_CIPHER_PREFIX + Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decryptUserPiiString(payload: string, key: Buffer): string {
  if (!payload.startsWith(USER_PII_CIPHER_PREFIX)) {
    throw new Error("decryptUserPiiString: formato non valido");
  }
  const raw = Buffer.from(payload.slice(USER_PII_CIPHER_PREFIX.length), "base64");
  if (raw.length < IV_LEN + TAG_LEN) {
    throw new Error("decryptUserPiiString: payload troppo corto");
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(raw.length - TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN, raw.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function shouldEncryptValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True se la stringa è già nel formato ciphertext applicativo. */
export function isUserPiiEncryptedPayload(value: string): boolean {
  return value.startsWith(USER_PII_CIPHER_PREFIX);
}

/**
 * Cripta i campi PII configurati prima di INSERT/UPDATE su `users`.
 * Senza chiave env: ritorna una copia identica (solo dev/test — non usare in produzione con dati reali).
 */
export function encryptUserForStorage(user: User, key: Buffer | null): User {
  if (!key) {
    return { ...user };
  }
  const out = { ...user } as User;
  for (const field of USER_PII_ENCRYPTED_FIELDS) {
    const v = out[field];
    if (!shouldEncryptValue(v)) {
      continue;
    }
    if (isUserPiiEncryptedPayload(v)) {
      continue;
    }
    (out as unknown as Record<string, unknown>)[field] = encryptUserPiiString(v, key);
  }
  return out;
}

/**
 * Decripta i campi PII dopo SELECT. Valori senza prefisso restano in chiaro (dati legacy).
 */
export function decryptUserFromStorage(user: User, key: Buffer | null): User {
  if (!key) {
    return { ...user };
  }
  const out = { ...user } as User;
  for (const field of USER_PII_ENCRYPTED_FIELDS) {
    const v = out[field];
    if (typeof v !== "string" || !isUserPiiEncryptedPayload(v)) {
      continue;
    }
    (out as unknown as Record<string, unknown>)[field] = decryptUserPiiString(v, key);
  }
  return out;
}

/**
 * Confronto costante nel tempo tra ciphertext e plaintext atteso (es. ricerca per codice fiscale in import).
 * Richiede che `stored` sia ciphertext nexa1 con la stessa chiave.
 */
/**
 * Cripta solo le chiavi PII presenti in un oggetto parziale (es. patch Supabase da script).
 */
export function encryptPlainObjectFieldsForStorage(
  row: Record<string, unknown>,
  key: Buffer | null
): Record<string, unknown> {
  if (!key) {
    return { ...row };
  }
  const out = { ...row };
  for (const field of USER_PII_ENCRYPTED_FIELDS) {
    const v = out[field];
    if (typeof v !== "string" || !v.trim()) {
      continue;
    }
    if (isUserPiiEncryptedPayload(v)) {
      continue;
    }
    out[field] = encryptUserPiiString(v, key);
  }
  return out;
}

export function userPiiCipherEqualsPlaintext(stored: string | null | undefined, plaintext: string, key: Buffer): boolean {
  if (!stored || !plaintext || !key) {
    return false;
  }
  if (!isUserPiiEncryptedPayload(stored)) {
    return stored === plaintext;
  }
  try {
    const dec = decryptUserPiiString(stored, key);
    const a = Buffer.from(dec, "utf8");
    const b = Buffer.from(plaintext, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
