import type { Route } from "next";
import type { SessionUser } from "@/lib/auth-session";
import { buildEmployeeHubTiles } from "@/lib/nexa-hub-config";
import { filterPortalHref } from "@/lib/nexa-route-access";
import { portalBlurbForHref } from "@/lib/portal-tile-blurb";
import { PORTAL_TILES, type PortalTile } from "@/lib/portal-mappa";

/** Colonne del ciclo di vita per la mappa portale HR. */
export const PORTAL_LIFECYCLE_COLUMNS = [
  { id: "selezione", title: "Selezione", subtitle: "Colloqui e pipeline" },
  { id: "onboarding", title: "Onboarding", subtitle: "Assunzioni e ingresso" },
  { id: "impiego", title: "Impiego", subtitle: "Operatività quotidiana" },
  { id: "sviluppo", title: "Sviluppo", subtitle: "Pianificazione e crescita" },
  { id: "exit", title: "Uscita", subtitle: "Offboarding" }
] as const;

const LIFECYCLE_HREFS: Record<(typeof PORTAL_LIFECYCLE_COLUMNS)[number]["id"], Route[]> = {
  selezione: ["/recruiting" as Route],
  onboarding: ["/recruiting/onboarding" as Route, "/contracts" as Route],
  impiego: [
    "/" as Route,
    "/attendance",
    "/workflow",
    "/expenses",
    "/payslips",
    "/scheduling",
    "/smartworking",
    "/work-calendar"
  ],
  sviluppo: [
    "/organigramma",
    "/org-chart",
    "/workforce-planning" as Route,
    "/hr/formazione" as Route,
    "/manager-copilot" as Route,
    "/compensation/bench" as Route
  ],
  exit: ["/lifecycle/offboard" as Route]
};

/** Tile Analytics (riga dedicata sotto le colonne lifecycle). */
export const PORTAL_ANALYTICS_ROW_HREFS: Route[] = [
  "/personnel-budget" as Route,
  "/analytics/retention" as Route,
  "/analytics/competenze" as Route,
  "/hr-center/recap" as Route
];

function tileByHref(href: string): PortalTile | undefined {
  return PORTAL_TILES.find((t) => String(t.href) === href);
}

export type LifecycleColumnModel = {
  id: (typeof PORTAL_LIFECYCLE_COLUMNS)[number]["id"];
  title: string;
  subtitle: string;
  tiles: PortalTile[];
};

export function buildLifecyclePortalColumns(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): LifecycleColumnModel[] {
  return PORTAL_LIFECYCLE_COLUMNS.map((col) => {
    const hrefs = LIFECYCLE_HREFS[col.id];
    const seen = new Set<string>();
    const tiles: PortalTile[] = [];
    for (const href of hrefs) {
      const key = String(href);
      if (seen.has(key)) continue;
      seen.add(key);
      const tile = tileByHref(key);
      if (!tile || !filterPortalHref(tile.href, user, hideSensitiveHr)) continue;
      tiles.push(tile);
    }
    return { id: col.id, title: col.title, subtitle: col.subtitle, tiles };
  }).filter((c) => c.tiles.length > 0);
}

export function buildAnalyticsPortalRow(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalTile[] {
  const tiles: PortalTile[] = [];
  const seen = new Set<string>();
  for (const href of PORTAL_ANALYTICS_ROW_HREFS) {
    const key = String(href);
    if (seen.has(key)) continue;
    seen.add(key);
    const tile = tileByHref(key);
    if (!tile || !filterPortalHref(tile.href, user, hideSensitiveHr)) continue;
    tiles.push(tile);
  }
  return tiles;
}

/** Colonne hub dipendente (sostituiscono le 6 categorie legacy in mappa portale). */
export const PORTAL_EMPLOYEE_HUB_COLUMNS = [
  { id: "home", title: "Home", subtitle: "Dashboard e giornata", accentCategory: "Home" },
  { id: "io", title: "Io", subtitle: "Presenze, richieste e team", accentCategory: "Io" },
  { id: "documenti", title: "Documenti", subtitle: "Cedolini e profilo", accentCategory: "Documenti" }
] as const;

export type EmployeeHubColumnModel = {
  id: (typeof PORTAL_EMPLOYEE_HUB_COLUMNS)[number]["id"];
  title: string;
  subtitle: string;
  accentCategory: string;
  tiles: PortalTile[];
};

export function buildEmployeeHubPortalColumns(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): EmployeeHubColumnModel[] {
  return PORTAL_EMPLOYEE_HUB_COLUMNS.map((col) => {
    const hubTiles = buildEmployeeHubTiles(col.id, user, hideSensitiveHr);
    const tiles: PortalTile[] = hubTiles.map((t) => ({
      href: t.href,
      title: t.label,
      blurb: portalBlurbForHref(t.href) || t.blurb,
      category: col.accentCategory
    }));
    return {
      id: col.id,
      title: col.title,
      subtitle: col.subtitle,
      accentCategory: col.accentCategory,
      tiles
    };
  }).filter((c) => c.tiles.length > 0);
}
