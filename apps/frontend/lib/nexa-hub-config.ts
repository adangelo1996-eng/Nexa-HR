import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { buildEmployeeNavSections } from "@/lib/nexa-employee-nav";
import { buildHrNavPillars, type HrNavItem } from "@/lib/nexa-hr-nav";
import { employeeSectionIdForHubSlug, hubPathForSlug } from "@/lib/nexa-hub-paths";

export type HubTile = {
  href: Route;
  label: string;
  blurb: string;
  icon: LucideIcon;
};

export type HubTileGroup = {
  title: string;
  items: HubTile[];
};

export type HubPageModel = {
  title: string;
  subtitle: string;
  portalCategory?: string;
  tiles?: HubTile[];
  groups?: HubTileGroup[];
};

export type HubSectionDef = {
  slug: string;
  title: string;
  subtitle: string;
  portalCategory?: string;
};

export const HR_HUB_SECTIONS: HubSectionDef[] = [
  {
    slug: "persone",
    title: "Persone",
    subtitle: "Selezione, organigramma, formazione e uscita.",
    portalCategory: "Persone"
  },
  {
    slug: "operazioni",
    title: "Operazioni",
    subtitle: "Presenze, turni, approvazioni e payroll.",
    portalCategory: "Operazioni"
  },
  {
    slug: "analisi",
    title: "Analisi HR",
    subtitle: "Dashboard, analytics e recap operativo.",
    portalCategory: "Analytics"
  },
  {
    slug: "amministrazione",
    title: "Amministrazione",
    subtitle: "Policy, contratti e console utenti.",
    portalCategory: "Amministrazione"
  }
];

export const EMPLOYEE_HUB_SECTIONS: HubSectionDef[] = [
  { slug: "home", title: "Home", subtitle: "Dashboard e accessi rapidi." },
  { slug: "io", title: "Io", subtitle: "Presenze, workflow, turni e percorso personale." },
  { slug: "documenti", title: "Documenti", subtitle: "Cedolini e impostazioni profilo." }
];

const ALL_HUB_SLUGS = new Set([
  ...HR_HUB_SECTIONS.map((s) => s.slug),
  ...EMPLOYEE_HUB_SECTIONS.map((s) => s.slug)
]);

function navItemToHubTile(item: HrNavItem): HubTile {
  return {
    href: item.href,
    label: item.label,
    blurb: "",
    icon: item.icon
  };
}

export function isKnownHubSlug(slug: string): boolean {
  return ALL_HUB_SLUGS.has(slug);
}

export function buildHrHubPageModel(
  slug: string,
  user: SessionUser | null,
  hideSensitiveHr: boolean
): HubPageModel | null {
  const meta = HR_HUB_SECTIONS.find((s) => s.slug === slug);
  const pillar = buildHrNavPillars(user, hideSensitiveHr).find((p) => p.hubSlug === slug);
  if (!meta || !pillar) {
    return null;
  }
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    portalCategory: meta.portalCategory,
    groups: pillar.subgroups.map((sg) => ({
      title: sg.title,
      items: sg.items.map(navItemToHubTile)
    }))
  };
}

export function buildEmployeeHubPageModel(
  slug: string,
  user: SessionUser | null,
  hideSensitiveHr: boolean
): HubPageModel | null {
  const meta = EMPLOYEE_HUB_SECTIONS.find((s) => s.slug === slug);
  const sectionId = employeeSectionIdForHubSlug(slug);
  if (!meta || !sectionId) {
    return null;
  }
  const section = buildEmployeeNavSections(user, hideSensitiveHr).find((s) => s.id === sectionId);
  if (!section) {
    return null;
  }
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    tiles: section.items.map((item) => ({
      href: item.href,
      label: item.label,
      blurb: "",
      icon: item.icon
    }))
  };
}

export function buildHrHubTiles(
  slug: string,
  user: SessionUser | null,
  hideSensitiveHr: boolean
): HubTile[] {
  const model = buildHrHubPageModel(slug, user, hideSensitiveHr);
  return model?.groups?.flatMap((g) => g.items) ?? [];
}

export function buildEmployeeHubTiles(
  slug: string,
  user: SessionUser | null,
  hideSensitiveHr: boolean
): HubTile[] {
  return buildEmployeeHubPageModel(slug, user, hideSensitiveHr)?.tiles ?? [];
}

export function resolveHubSection(slug: string, mode: "hr" | "employee"): HubSectionDef | undefined {
  const list = mode === "hr" ? HR_HUB_SECTIONS : EMPLOYEE_HUB_SECTIONS;
  return list.find((s) => s.slug === slug);
}

export { hubPathForSlug };
