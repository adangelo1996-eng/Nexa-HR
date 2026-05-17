import type { Route } from "next";
import type { SessionUser } from "@/lib/auth-session";
import { filterPortalHref } from "@/lib/nexa-route-access";
import { PORTAL_CATEGORY_ORDER, PORTAL_TILES, type PortalTile } from "@/lib/portal-mappa";

export type PortalColumnSubgroupDef = { id: string; title: string; hrefs: Route[] };

/** Sottosezioni storiche del menu, sotto le 6 categorie portale. */
export const PORTAL_COLUMN_SUBGROUPS: Record<(typeof PORTAL_CATEGORY_ORDER)[number], PortalColumnSubgroupDef[]> = {
  Quotidiano: [
    {
      id: "q-presenza",
      title: "Presenza e pianificazione",
      hrefs: ["/", "/attendance", "/work-calendar", "/workflow"]
    },
    {
      id: "q-retrib",
      title: "Retribuzione, spese e report",
      hrefs: ["/expenses", "/payslips"]
    }
  ],
  "Persone e organizzazione": [
    {
      id: "p-persone",
      title: "Persone e organizzazione",
      hrefs: ["/org-chart", "/organigramma", "/workforce-planning" as Route]
    },
    {
      id: "p-piano",
      title: "Pianificazione e presenza team",
      hrefs: [
        "/scheduling",
        "/smartworking",
        "/manager-copilot" as Route,
        "/workflow/approvals",
        "/reports"
      ]
    }
  ],
  "HEBB AI for HR": [
    {
      id: "h-centro",
      title: "Analisi e report HR",
      hrefs: ["/hr-center/analisi" as Route, "/hr-center/recap" as Route, "/hr-center/budget-report" as Route]
    },
    {
      id: "h-ai",
      title: "Assistente e sintesi AI",
      hrefs: ["/ai-hub" as Route, "/analytics/retention" as Route]
    }
  ],
  "Selezione e documenti": [
    { id: "s-sel", title: "Selezione personale", hrefs: ["/recruiting" as Route] },
    { id: "s-onb", title: "Sintesi e assunzioni", hrefs: ["/recruiting/onboarding" as Route] },
    {
      id: "s-doc",
      title: "Contratti e policy",
      hrefs: ["/contracts" as Route, "/tools/third-party-licenses" as Route, "/corporate-policies" as Route]
    }
  ],
  "Analisi e pianificazione": [
    {
      id: "a-analisi",
      title: "Analisi HR",
      hrefs: ["/tools/cost-calculator" as Route, "/forecast", "/compensation/bench" as Route]
    },
    {
      id: "a-budget",
      title: "Budget e recap operativo",
      hrefs: ["/personnel-budget", "/hr-recap" as Route]
    }
  ],
  "Amministrazione e dati": [
    {
      id: "a-flussi",
      title: "Flussi operativi",
      hrefs: ["/expenses/org" as Route, "/payroll-hebb"]
    },
    {
      id: "a-console",
      title: "Console amministrativa",
      hrefs: ["/admin" as Route, "/admin/data-export" as Route, "/admin/cost-centers" as Route]
    }
  ]
};

export type PortalColumnSubgroupModel = {
  id: string;
  title: string;
  tiles: PortalTile[];
};

export type PortalColumnModel = {
  portalCategory: (typeof PORTAL_CATEGORY_ORDER)[number];
  subgroups: PortalColumnSubgroupModel[];
};

function tileByHref(href: string): PortalTile | undefined {
  return PORTAL_TILES.find((t) => String(t.href) === href);
}

export function buildPortalColumns(user: SessionUser | null, hideSensitiveHr: boolean): PortalColumnModel[] {
  return PORTAL_CATEGORY_ORDER.map((portalCategory) => {
    const defs = PORTAL_COLUMN_SUBGROUPS[portalCategory];
    const subgroups: PortalColumnSubgroupModel[] = [];
    for (const def of defs) {
      const tiles: PortalTile[] = [];
      for (const href of def.hrefs) {
        const tile = tileByHref(String(href));
        if (!tile || tile.category !== portalCategory) {
          continue;
        }
        if (!filterPortalHref(tile.href, user, hideSensitiveHr)) {
          continue;
        }
        tiles.push(tile);
      }
      if (tiles.length > 0) {
        subgroups.push({ id: def.id, title: def.title, tiles });
      }
    }
    return { portalCategory, subgroups };
  });
}
