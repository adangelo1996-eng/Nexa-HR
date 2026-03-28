/** Anteprima allineata alla logica backend (normalizzazione locale) — solo UI. */

export function synapseEmailDomain(): string {
  const e = process.env.NEXT_PUBLIC_SYNAPSE_EMAIL_DOMAIN?.trim();
  return e && e.length > 0 ? e.replace(/^@/, "") : "synapse.com";
}

function normalizePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.+/g, ".");
}

export function previewAutoSynapseEmail(firstName: string, lastName: string): string {
  const local = `${normalizePart(firstName)}.${normalizePart(lastName)}`.replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  const safe = local.length > 0 ? local : "utente";
  return `${safe}@${synapseEmailDomain()}`;
}
