import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Building2,
  Calendar,
  CalendarDays,
  ClipboardList,
  Clock3,
  DoorOpen,
  FileText,
  GraduationCap,
  KeyRound,
  Laptop,
  LayoutDashboard,
  PenLine,
  PieChart,
  Receipt,
  Route as RouteIcon,
  Settings,
  Sparkles,
  UserCog,
  UserPlus,
  UserRoundSearch,
  Users,
  Wallet2,
  Workflow
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { buildEmployeeNavSections } from "@/lib/nexa-employee-nav";
import { employeeSectionIdForHubSlug } from "@/lib/nexa-hub-paths";
import { buildHrLinearPortalSteps } from "@/lib/portal-mappa-linear";
import type { PortalTile } from "@/lib/portal-mappa";

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

/** Hub HR allineati ai passi della mappa portale. */
export const HR_HUB_SECTIONS: HubSectionDef[] = [
  {
    slug: "daily",
    title: "Ogni giorno",
    subtitle: "Timbrature, richieste e documenti personali.",
    portalCategory: "Quotidiano"
  },
  {
    slug: "people",
    title: "Persone e organizzazione",
    subtitle: "Struttura, turni, remoto e vista manager.",
    portalCategory: "Persone"
  },
  {
    slug: "hire",
    title: "Assumere e far entrare",
    subtitle: "Selezione, onboarding assunzioni e contratti.",
    portalCategory: "Selezione"
  },
  {
    slug: "grow",
    title: "Sviluppare e pianificare",
    subtitle: "Formazione, workforce planning e benchmark.",
    portalCategory: "Sviluppo"
  },
  {
    slug: "insight",
    title: "Analisi e budget",
    subtitle: "Analytics, retention, competenze e budget personale.",
    portalCategory: "Analytics"
  },
  {
    slug: "admin",
    title: "Amministrazione",
    subtitle: "Payroll, policy, export e console utenti.",
    portalCategory: "Amministrazione"
  }
];

export const EMPLOYEE_HUB_SECTIONS: HubSectionDef[] = [
  { slug: "home", title: "Home", subtitle: "Dashboard e accessi rapidi." },
  { slug: "io", title: "Io", subtitle: "Presenze, workflow, turni e percorso personale." },
  { slug: "documenti", title: "Documenti", subtitle: "Cedolini e impostazioni profilo." }
];

const HREF_ICON: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/attendance": Clock3,
  "/work-calendar": Calendar,
  "/sale-riunioni": DoorOpen,
  "/workflow": Workflow,
  "/expenses": Receipt,
  "/payslips": FileText,
  "/settings": Settings,
  "/org-chart": Users,
  "/organigramma": Building2,
  "/workforce-planning": BarChart2,
  "/scheduling": CalendarDays,
  "/smartworking": Laptop,
  "/manager-copilot": ClipboardList,
  "/workflow/approvals": ClipboardList,
  "/reports": PieChart,
  "/hr-center/recap": ClipboardList,
  "/analytics": BarChart2,
  "/analytics/retention": BarChart2,
  "/analytics/competenze": BarChart2,
  "/recruiting": UserRoundSearch,
  "/recruiting/onboarding": UserPlus,
  "/contracts": PenLine,
  "/corporate-policies": FileText,
  "/tools/third-party-licenses": KeyRound,
  "/compensation/bench": BarChart2,
  "/personnel-budget": Wallet2,
  "/hr-recap": ClipboardList,
  "/expenses/org": Receipt,
  "/payroll-hebb": Sparkles,
  "/admin": UserCog,
  "/admin/data-export": FileText,
  "/admin/cost-centers": Building2,
  "/hr/formazione": GraduationCap,
  "/il-mio-team": Users,
  "/percorso": RouteIcon
};

const ALL_HUB_SLUGS = new Set([
  ...HR_HUB_SECTIONS.map((s) => s.slug),
  ...EMPLOYEE_HUB_SECTIONS.map((s) => s.slug)
]);

function portalTileToHubTile(tile: PortalTile): HubTile {
  const key = String(tile.href);
  return {
    href: tile.href,
    label: tile.title,
    blurb: tile.blurb,
    icon: HREF_ICON[key] ?? FileText
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
  const step = buildHrLinearPortalSteps(user, hideSensitiveHr).find((s) => s.id === slug);
  if (!meta || !step) {
    return null;
  }
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    portalCategory: meta.portalCategory,
    tiles: step.tiles.map(portalTileToHubTile)
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
  return buildHrHubPageModel(slug, user, hideSensitiveHr)?.tiles ?? [];
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
