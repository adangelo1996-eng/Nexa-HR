import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { buildEmployeeNavSections } from "@/lib/nexa-employee-nav";
import { buildHrNavPillars } from "@/lib/nexa-hr-nav";
import { portalAccentCategoryForNavSection } from "@/lib/nav-visual-accents";

export type PortalMapNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type PortalMapNavSubgroup = { id: string; title: string; items: PortalMapNavItem[] };

export type PortalMapNavSection = {
  id: string;
  title: string;
  /** Accento colonna portale (header sidebar + flyout + mappa). */
  portalCategory?: string;
  subgroups: PortalMapNavSubgroup[];
};

/** Link mostrati in sidebar top-level, esclusi dalle sezioni collassabili dipendente. */
const EMPLOYEE_COLLAPSIBLE_EXCLUDED_HREFS = new Set<string>(["/", "/hebb-ai-support"]);

function navItemToPortalMapNavItem(item: {
  href: Route;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}): PortalMapNavItem {
  return {
    href: item.href,
    label: item.label,
    icon: item.icon,
    ...(item.exact ? { exact: true } : {})
  };
}

/** Sezioni sidebar HR — stessa struttura di `buildHrNavPillars` (pilastri + sottogruppi). */
export function buildHrPortalMapNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalMapNavSection[] {
  return buildHrNavPillars(user, hideSensitiveHr).map((pillar) => ({
    id: pillar.id,
    title: pillar.title,
    portalCategory: pillar.portalCategory,
    subgroups: pillar.subgroups.map((sg) => ({
      id: sg.id,
      title: sg.title,
      items: sg.items.map(navItemToPortalMapNavItem)
    }))
  }));
}

/** Sezioni sidebar dipendente — stessa struttura di `buildEmployeeNavSections`. */
export function buildEmployeePortalMapNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalMapNavSection[] {
  return buildEmployeeNavSections(user, hideSensitiveHr)
    .map((section) => ({
      id: section.id,
      title: section.title,
      portalCategory: portalAccentCategoryForNavSection(section.id, section.title),
      subgroups: [
        {
          id: `${section.id}-items`,
          title: "",
          items: section.items
            .filter((item) => !EMPLOYEE_COLLAPSIBLE_EXCLUDED_HREFS.has(String(item.href)))
            .map(navItemToPortalMapNavItem)
        }
      ]
    }))
    .filter((section) => section.subgroups.some((sg) => sg.items.length > 0));
}
