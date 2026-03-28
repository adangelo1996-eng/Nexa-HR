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
