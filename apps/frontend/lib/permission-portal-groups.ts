import type { Route } from "next";
import type { PermissionDefinition } from "@/lib/api";
import { PORTAL_COLUMN_SUBGROUPS } from "@/lib/nexa-portal-column-layout";
import { PORTAL_CATEGORY_ORDER } from "@/lib/portal-mappa";

/** Collegamento route portale → resourceKey permesso Nexa (catalogo). */
const HREF_TO_RESOURCE_KEY: Partial<Record<string, string>> = {
  "/": "attendance",
  "/attendance": "attendance",
  "/work-calendar": "work_calendar",
  "/sale-riunioni": "work_calendar",
  "/workflow": "leaves",
  "/expenses": "expenses",
  "/payslips": "payslips",
  "/org-chart": "org",
  "/organigramma": "org",
  "/workforce-planning": "reports_hr",
  "/scheduling": "shifts",
  "/smartworking": "attendance",
  "/manager-copilot": "reports_hr",
  "/nexa-hr-copilot": "ai_assistant",
  "/workflow/approvals": "approvals",
  "/hr/cowork": "lifecycle",
  "/reports": "reports_hr",
  "/hr-center/analisi": "reports_hr",
  "/hr-center/recap": "reports_hr",
  "/hr-center/budget-report": "personnel_budget",
  "/ai-hub": "ai_assistant",
  "/analytics/advanced": "reports_hr",
  "/analytics/advanced/retention": "reports_hr",
  "/recruiting": "recruiting",
  "/recruiting/onboarding": "lifecycle",
  "/contracts": "standard_contracts",
  "/tools/third-party-licenses": "third_party_licenses",
  "/corporate-policies": "corporate_policies",
  "/tools/cost-calculator": "payroll",
  "/forecast": "reports_hr",
  "/compensation/bench": "reports_hr",
  "/personnel-budget": "personnel_budget",
  "/hr-recap": "reports_hr",
  "/expenses/org": "expenses",
  "/payroll-hebb": "payroll",
  "/admin": "admin_users",
  "/admin/data-export": "import",
  "/admin/cost-centers": "admin_cost_centers",
  "/admin/roles": "admin_roles"
};

/** Permessi senza tile dedicata: bucket per macro-sezione portale. */
const RESOURCE_MACRO_FALLBACK: Partial<Record<string, (typeof PORTAL_CATEGORY_ORDER)[number]>> = {
  sickness: "Quotidiano",
  documents: "Selezione e documenti",
  benefits: "Persone e organizzazione",
  innovation: "Hebb AI Analytics",
  consultant: "Amministrazione e dati",
  ai_assistant_scope_managed: "Hebb AI Analytics",
  ai_assistant_scope_org: "Hebb AI Analytics",
  ai_nl_query: "Hebb AI Analytics",
  ai_anomalies: "Hebb AI Analytics",
  ai_triage: "Hebb AI Analytics"
};

export type PermissionResourceGroup = {
  resourceKey: string;
  labelIt: string;
  read?: PermissionDefinition;
  write?: PermissionDefinition;
};

export type PermissionPortalSubgroup = {
  id: string;
  title: string;
  resources: PermissionResourceGroup[];
};

export type PermissionPortalMacro = {
  portalCategory: (typeof PORTAL_CATEGORY_ORDER)[number];
  subgroups: PermissionPortalSubgroup[];
};

function groupByResource(defs: PermissionDefinition[]): PermissionResourceGroup[] {
  const map = new Map<string, PermissionDefinition[]>();
  for (const d of defs) {
    const list = map.get(d.resourceKey) ?? [];
    list.push(d);
    map.set(d.resourceKey, list);
  }
  return Array.from(map.entries()).map(([resourceKey, arr]) => {
    const read = arr.find((x) => x.suffix === "read");
    const write = arr.find((x) => x.suffix === "write");
    return {
      resourceKey,
      labelIt: read?.labelIt ?? write?.labelIt ?? resourceKey,
      read,
      write
    };
  });
}

function subgroupForResource(
  resourceKey: string
): { macro: (typeof PORTAL_CATEGORY_ORDER)[number]; subgroupId: string; subgroupTitle: string } | null {
  for (const macro of PORTAL_CATEGORY_ORDER) {
    const subgroups = PORTAL_COLUMN_SUBGROUPS[macro];
    for (const sg of subgroups) {
      for (const href of sg.hrefs) {
        if (HREF_TO_RESOURCE_KEY[String(href)] === resourceKey) {
          return { macro, subgroupId: sg.id, subgroupTitle: sg.title };
        }
      }
    }
  }
  const fallbackMacro = RESOURCE_MACRO_FALLBACK[resourceKey];
  if (fallbackMacro) {
    const first = PORTAL_COLUMN_SUBGROUPS[fallbackMacro][0];
    return {
      macro: fallbackMacro,
      subgroupId: `misc-${resourceKey}`,
      subgroupTitle: first?.title ?? "Altri permessi"
    };
  }
  return null;
}

/** Raggruppa permessi Nexa HR come macro-sezioni e sottosezioni della mappa portale. */
export function buildNexaPermissionPortalTree(nexaDefs: PermissionDefinition[]): PermissionPortalMacro[] {
  const resources = groupByResource(nexaDefs);
  const macroMap = new Map<
    (typeof PORTAL_CATEGORY_ORDER)[number],
    Map<string, PermissionPortalSubgroup>
  >();

  for (const macro of PORTAL_CATEGORY_ORDER) {
    macroMap.set(macro, new Map());
  }

  const unplaced: PermissionResourceGroup[] = [];

  for (const res of resources) {
    const placement = subgroupForResource(res.resourceKey);
    if (!placement) {
      unplaced.push(res);
      continue;
    }
    const sgMap = macroMap.get(placement.macro)!;
    let sg = sgMap.get(placement.subgroupId);
    if (!sg) {
      sg = { id: placement.subgroupId, title: placement.subgroupTitle, resources: [] };
      sgMap.set(placement.subgroupId, sg);
    }
    sg.resources.push(res);
  }

  if (unplaced.length > 0) {
    const adminMap = macroMap.get("Amministrazione e dati")!;
    adminMap.set("misc-unmapped", {
      id: "misc-unmapped",
      title: "Altri permessi HR",
      resources: unplaced.sort((a, b) => a.labelIt.localeCompare(b.labelIt, "it"))
    });
  }

  return PORTAL_CATEGORY_ORDER.map((portalCategory) => {
    const sgMap = macroMap.get(portalCategory)!;
    const subgroups = Array.from(sgMap.values())
      .filter((sg) => sg.resources.length > 0)
      .map((sg) => ({
        ...sg,
        resources: [...sg.resources].sort((a, b) => a.labelIt.localeCompare(b.labelIt, "it"))
      }));
    return { portalCategory, subgroups };
  }).filter((m) => m.subgroups.length > 0);
}

export function permissionIdsInMacro(macro: PermissionPortalMacro): string[] {
  const ids: string[] = [];
  for (const sg of macro.subgroups) {
    for (const r of sg.resources) {
      if (r.read?.id) ids.push(r.read.id);
      if (r.write?.id) ids.push(r.write.id);
    }
  }
  return ids;
}

export function permissionIdsInSubgroup(sg: PermissionPortalSubgroup): string[] {
  const ids: string[] = [];
  for (const r of sg.resources) {
    if (r.read?.id) ids.push(r.read.id);
    if (r.write?.id) ids.push(r.write.id);
  }
  return ids;
}

/** Solo lettura (consultazione) per macro/sottosezione — non forza write. */
export function permissionReadIdsInMacro(macro: PermissionPortalMacro): string[] {
  const ids: string[] = [];
  for (const sg of macro.subgroups) {
    for (const r of sg.resources) {
      if (r.read?.id) ids.push(r.read.id);
    }
  }
  return ids;
}

export function permissionReadIdsInSubgroup(sg: PermissionPortalSubgroup): string[] {
  const ids: string[] = [];
  for (const r of sg.resources) {
    if (r.read?.id) ids.push(r.read.id);
  }
  return ids;
}

export function hrefsForResourceKey(resourceKey: string): Route[] {
  const out: Route[] = [];
  for (const [href, key] of Object.entries(HREF_TO_RESOURCE_KEY)) {
    if (key === resourceKey) {
      out.push(href as Route);
    }
  }
  return out;
}
