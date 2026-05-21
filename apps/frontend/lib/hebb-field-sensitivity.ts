/**
 * Registry GDPR: campi per cui l'autofill Hebb è vietato (nessun invio a LLM, icona disabilitata).
 * Chiavi in minuscolo; match anche su suffisso/camelCase normalizzato.
 */
export const HEBB_SENSITIVE_FIELD_KEYS = [
  "iban",
  "bic",
  "bicswift",
  "fiscalcode",
  "codicefiscale",
  "taxcode",
  "password",
  "passwd",
  "secret",
  "email",
  "personalemail",
  "privateemail",
  "firstname",
  "lastname",
  "fullname",
  "nome",
  "cognome",
  "buddyname",
  "annualgrosssalary",
  "basesalarymonthly",
  "salary",
  "ral",
  "stipendio",
  "amount",
  "amountcents",
  "importo",
  "health",
  "disability",
  "medical",
  "diagnosis",
  "street",
  "address",
  "fulladdress",
  "residence",
  "domicile",
  "taxdomicile",
  "taxmunicipality",
  "cap",
  "postalcode",
  "zipcode",
  "phone",
  "telefono",
  "mobile",
  "cell"
] as const;

const SENSITIVE_SET = new Set<string>(HEBB_SENSITIVE_FIELD_KEYS);

/** Etichette IT per documentazione / messaggi UI. */
export const HEBB_SENSITIVE_FIELD_LABELS_IT: Record<string, string> = {
  iban: "IBAN",
  fiscalcode: "Codice fiscale",
  codicefiscale: "Codice fiscale",
  email: "Email personale",
  password: "Password",
  annualgrosssalary: "RAL / stipendio esatto",
  basesalarymonthly: "Stipendio mensile esatto",
  amount: "Importo esatto",
  health: "Dati sanitari",
  fulladdress: "Indirizzo completo",
  phone: "Telefono personale"
};

function normalizeFieldKey(fieldKey: string): string {
  return fieldKey.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** True se il campo non deve mai essere suggerito né inviato al modello. */
export function isHebbFieldSensitive(fieldKey: string): boolean {
  const n = normalizeFieldKey(fieldKey);
  if (SENSITIVE_SET.has(n)) return true;
  for (const s of HEBB_SENSITIVE_FIELD_KEYS) {
    if (n.includes(s) || s.includes(n)) return true;
  }
  return false;
}

/** Rimuove chiavi sensibili da partialForm prima di invio API. */
export function stripSensitiveFromPartialForm(
  partial: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!partial || typeof partial !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(partial)) {
    if (!isHebbFieldSensitive(k)) out[k] = v;
  }
  return out;
}
