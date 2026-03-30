/** Allowlist server-side per operazioni riservate (import massivo, ecc.). */
export function isSynapseSuperuserEmail(email: string | undefined): boolean {
  if (!email) {
    return false;
  }
  const raw = process.env.SYNAPSE_SUPERUSER_EMAILS ?? "admin@synapse.com";
  const list = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/**
 * Se `SYNAPSE_IMPORT_OPERATOR_EMAIL_DOMAINS` è valorizzata (es. `azienda.ch,synapse.com`),
 * l'email dell'operatore import deve avere dominio in elenco (allineamento dominio aziendale).
 */
export function isSynapseImportOperatorDomainAllowed(email: string | undefined): boolean {
  if (!email) {
    return false;
  }
  const raw = process.env.SYNAPSE_IMPORT_OPERATOR_EMAIL_DOMAINS?.trim();
  if (!raw) {
    return true;
  }
  const domains = raw
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (domains.length === 0) {
    return true;
  }
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at < 0) {
    return false;
  }
  const dom = lower.slice(at + 1);
  return domains.some((d) => dom === d || dom.endsWith(`.${d}`));
}
