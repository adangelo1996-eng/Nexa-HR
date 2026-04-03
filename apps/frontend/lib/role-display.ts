import type { Role, User } from "./api";

/** Etichette per slug noti (catalogo o ruolo piattaforma). */
const KNOWN_SLUG_LABELS: Record<string, string> = {
  employee: "Dipendente",
  admin: "Amministratore",
  team_lead: "Responsabile team",
  manager_controllo_gestione: "Responsabile team"
};

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

function humanizeCatalogName(name: string): string {
  const t = name.trim();
  if (!t) {
    return "—";
  }
  if (!t.includes("_")) {
    return t;
  }
  return t
    .split(/_+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Etichetta unica da mostrare in UI: nome ruolo dal catalogo (permessi),
 * mai il solo ruolo di accesso piattaforma se il catalogo è valorizzato.
 */
export function displayUserCatalogRole(user: Pick<User, "roleId" | "role">, catalog: Role[]): string {
  const catalogRow = user.roleId ? catalog.find((r) => r.id === user.roleId) : undefined;
  const rawName = catalogRow?.name ?? String(user.role ?? "");
  const slug = normalizeSlug(rawName);
  if (KNOWN_SLUG_LABELS[slug]) {
    return KNOWN_SLUG_LABELS[slug];
  }
  return humanizeCatalogName(rawName);
}
