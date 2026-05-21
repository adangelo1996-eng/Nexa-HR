"use client";

import { usePathname } from "next/navigation";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { navCatalogBestLabelForPathname } from "@/lib/nav-routes-catalog";

/** Pagine che avvolgono già tutto il contenuto in `HebbAiExperienceShell` (titoli / eyebrow dedicati). */
function routeDefinesOwnShell(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/";
  if (p.startsWith("/admin")) {
    return true;
  }
  const own = new Set([
    "/ai-hub",
    "/analytics",
    "/analytics/advanced",
    "/analytics/advanced/economico",
    "/analytics/advanced/retention",
    "/analytics/advanced/competenze",
    "/analytics/advanced/operativo",
    "/analytics/advanced/produttivita",
    "/analytics/advanced/equita-retributiva",
    "/analytics/advanced/carico-manager",
    "/analytics/advanced/what-if",
    "/hr/dashboard",
    "/workforce-planning",
    "/manager-copilot",
    "/payroll-hebb",
    "/tools/cost-calculator",
    "/mappa-portale"
  ]);
  return own.has(p);
}

/**
 * Applica il guscio visivo «Pannello manager» a tutte le route autenticate,
 * tranne admin (layout dedicato) e le pagine che definiscono già lo shell Hebb.
 */
export function NexaHrRouteChrome(props: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname() ?? "/";
  if (routeDefinesOwnShell(pathname)) {
    return <>{props.children}</>;
  }
  const title = navCatalogBestLabelForPathname(pathname);
  return <NexaHrAppPage title={title} contentMax="wide">{props.children}</NexaHrAppPage>;
}
