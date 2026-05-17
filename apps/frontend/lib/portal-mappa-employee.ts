import type { Route } from "next";
import type { SessionUser } from "@/lib/auth-session";
import { buildEmployeeNavSections } from "@/lib/nexa-employee-nav";
import { hubPathForSlug } from "@/lib/nexa-hub-paths";
import { filterPortalHref } from "@/lib/nexa-route-access";
import { PORTAL_TILES, type PortalTile } from "@/lib/portal-mappa";

export type EmployeeHubColumn = {
  id: string;
  title: string;
  subtitle: string;
  hubHref: Route;
  tiles: PortalTile[];
};

const HUB_META: Record<string, { title: string; subtitle: string }> = {
  home: { title: "Home", subtitle: "Dashboard e giornata" },
  io: { title: "Io", subtitle: "Presenze, flussi e percorso" },
  documenti: { title: "Documenti", subtitle: "Cedolini e profilo" }
};

function tileForHref(href: string): PortalTile | undefined {
  return PORTAL_TILES.find((t) => String(t.href) === href);
}

/** Mappa portale dipendente: tre hub (Oggi, Io, Documenti) con tile figlie. */
export function buildEmployeePortalHubColumns(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): EmployeeHubColumn[] {
  const sections = buildEmployeeNavSections(user, hideSensitiveHr);
  const cols: EmployeeHubColumn[] = [];

  for (const section of sections) {
    const slug = section.id === "emp-home" ? "home" : section.id === "emp-io" ? "io" : "documenti";
    const meta = HUB_META[slug];
    if (!meta) continue;

    const tiles: PortalTile[] = [];
    for (const item of section.items) {
      if (!filterPortalHref(item.href, user, hideSensitiveHr)) continue;
      const t = tileForHref(String(item.href));
      tiles.push(
        t ?? {
          href: item.href,
          title: item.label,
          blurb: "",
          category: meta.title
        }
      );
    }

    cols.push({
      id: slug,
      title: meta.title,
      subtitle: meta.subtitle,
      hubHref: hubPathForSlug(slug),
      tiles
    });
  }

  return cols.filter((c) => c.tiles.length > 0);
}
