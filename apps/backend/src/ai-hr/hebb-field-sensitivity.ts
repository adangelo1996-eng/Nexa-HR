/** Registry GDPR backend (allineato a `apps/frontend/lib/hebb-field-sensitivity.ts`). */
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

function normalizeFieldKey(fieldKey: string): string {
  return fieldKey.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function isHebbFieldSensitive(fieldKey: string): boolean {
  const n = normalizeFieldKey(fieldKey);
  if (SENSITIVE_SET.has(n)) return true;
  for (const s of HEBB_SENSITIVE_FIELD_KEYS) {
    if (n.includes(s) || s.includes(n)) return true;
  }
  return false;
}

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
