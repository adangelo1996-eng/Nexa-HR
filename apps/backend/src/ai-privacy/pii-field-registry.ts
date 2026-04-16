/** Chiavi JSON (case-insensitive) da pseudonimizzare come stringa PII. */
const SENSITIVE_STRING_KEYS = new Set([
  "email",
  "phone",
  "mobile",
  "iban",
  "fiscal_code",
  "codice_fiscale",
  "tax_id",
  "cf",
  "address",
  "street",
  "residence_address",
  "indirizzo",
  "domicile",
  "pec",
  "first_name",
  "lastname",
  "last_name",
  "given_name",
  "family_name",
  "display_name",
  "full_name",
  "bank_account",
  "account_holder",
  "passport",
  "document_number",
  "notes",
  "description",
  "reason",
  "iban_code"
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Restituisce il `kind` vault per pseudonimizzare il valore, o `null` se non va toccato.
 */
export function piiKindForKeyValue(key: string, value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const lk = key.toLowerCase();
  if (SENSITIVE_STRING_KEYS.has(lk)) {
    return lk;
  }
  if (lk === "id" || lk.endsWith("_id")) {
    if (UUID_RE.test(value)) {
      return "opaque_id";
    }
  }
  return null;
}
