import type { Route } from "next";
import type { SessionUser } from "@/lib/auth-session";
import { filterPortalHref } from "@/lib/nexa-route-access";
import { portalBlurbForHref } from "@/lib/portal-tile-blurb";
import { PORTAL_TILES, type PortalTile } from "@/lib/portal-mappa";
import { buildEmployeePortalHubColumns } from "@/lib/portal-mappa-employee";

export type PortalLinearStep = {
  id: string;
  title: string;
  subtitle: string;
  tiles: PortalTile[];
};

const HR_LINEAR_STEPS: Array<{
  id: string;
  title: string;
  subtitle: string;
  hrefs: Route[];
}> = [
  {
    id: "daily",
    title: "Ogni giorno",
    subtitle: "Timbrature, richieste e documenti personali del team.",
    hrefs: ["/", "/attendance", "/workflow", "/expenses", "/payslips", "/work-calendar"]
  },
  {
    id: "people",
    title: "Persone e organizzazione",
    subtitle: "Struttura, turni, remoto e vista manager.",
    hrefs: [
      "/organigramma",
      "/org-chart",
      "/scheduling",
      "/smartworking",
      "/manager-copilot",
      "/il-mio-team" as Route
    ]
  },
  {
    id: "hire",
    title: "Assumere e Onboarding",
    subtitle: "Selezione, onboarding assunzioni, contratti e simulatore costo azienda.",
    hrefs: [
      "/recruiting",
      "/recruiting/onboarding",
      "/contracts",
      "/personnel-budget/simulatore-assunzione" as Route
    ]
  },
  {
    id: "grow",
    title: "Sviluppare e pianificare",
    subtitle: "Formazione, workforce planning e benchmark.",
    hrefs: ["/hr/formazione" as Route, "/workforce-planning", "/compensation/bench"]
  },
  {
    id: "insight",
    title: "Analisi e budget",
    subtitle: "Analytics, retention, competenze e budget personale.",
    hrefs: [
      "/analytics" as Route,
      "/personnel-budget",
      "/analytics/advanced" as Route,
      "/analytics/advanced/retention" as Route,
      "/analytics/competenze" as Route,
      "/hr-center/recap"
    ]
  },
  {
    id: "admin",
    title: "Amministrazione",
    subtitle: "Payroll, policy, export e console utenti.",
    hrefs: ["/payroll-hebb", "/corporate-policies", "/admin/contratti" as Route, "/admin", "/expenses/org"]
  },
  {
    id: "hebb-ai-hr",
    title: "HEBB AI for HR",
    subtitle: "Support assistente, copilot HR, hub analytics e centro HR.",
    hrefs: [
      "/nexa-hr-copilot" as Route,
      "/analytics" as Route,
      "/hr-center/recap",
      "/hr-center/analisi" as Route,
      "/hr-center/budget-report" as Route
    ]
  }
];

function tileByHref(href: string): PortalTile | undefined {
  return PORTAL_TILES.find((t) => String(t.href) === href);
}

function dedupeTiles(tiles: PortalTile[]): PortalTile[] {
  const seen = new Set<string>();
  const out: PortalTile[] = [];
  for (const t of tiles) {
    const k = String(t.href);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function buildHrLinearPortalSteps(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalLinearStep[] {
  return HR_LINEAR_STEPS.map((step) => {
    const tiles: PortalTile[] = [];
    for (const href of step.hrefs) {
      const base = tileByHref(String(href));
      if (!base || !filterPortalHref(base.href, user, hideSensitiveHr)) continue;
      tiles.push({
        ...base,
        blurb: portalBlurbForHref(base.href) || base.blurb
      });
    }
    return {
      id: step.id,
      title: step.title,
      subtitle: step.subtitle,
      tiles: dedupeTiles(tiles)
    };
  }).filter((s) => s.tiles.length > 0);
}

export function buildEmployeeLinearPortalSteps(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalLinearStep[] {
  const hubs = buildEmployeePortalHubColumns(user, hideSensitiveHr);
  return hubs.map((hub) => ({
    id: hub.id,
    title: hub.title,
    subtitle: hub.subtitle,
    tiles: hub.tiles
  }));
}
