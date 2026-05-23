import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Building2,
  Calculator,
  Calendar,
  CalendarDays,
  ClipboardList,
  Clock3,
  DoorOpen,
  FileText,
  GraduationCap,
  KeyRound,
  Laptop,
  MessageCircle,
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
  Wand2,
  Workflow
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { portalAccentCategoryForNavSection } from "@/lib/nav-visual-accents";
import { buildEmployeePortalHubColumns } from "@/lib/portal-mappa-employee";
import { buildHrLinearPortalSteps } from "@/lib/portal-mappa-linear";
import type { PortalTile } from "@/lib/portal-mappa";

export type PortalMapNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type PortalMapNavSubgroup = { id: string; title: string; items: PortalMapNavItem[] };

export type PortalMapNavSection = {
  id: string;
  title: string;
  /** Accento colonna portale (header sidebar + flyout). */
  portalCategory?: string;
  subgroups: PortalMapNavSubgroup[];
};

/** Macro sezioni sidebar HR (stesse del percorso lineare mappa, esclusi link standalone Hebb). */
const HR_SIDEBAR_LINEAR_STEP_IDS = new Set(["daily", "people", "hire", "grow", "insight", "admin"]);

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
  "/hr-center/budget-report": Wallet2,
  "/analytics": BarChart2,
  "/analytics/advanced": BarChart2,
  "/analytics/advanced/retention": BarChart2,
  "/analytics/competenze": BarChart2,
  "/recruiting": UserRoundSearch,
  "/recruiting/onboarding": UserPlus,
  "/contracts": PenLine,
  "/corporate-policies": FileText,
  "/tools/third-party-licenses": KeyRound,
  "/compensation/bench": BarChart2,
  "/personnel-budget": Wallet2,
  "/personnel-budget/simulatore-assunzione": Calculator,
  "/hr-recap": ClipboardList,
  "/expenses/org": Receipt,
  "/payroll-hebb": Sparkles,
  "/admin": UserCog,
  "/admin/data-export": FileText,
  "/admin/cost-centers": Building2,
  "/hr/formazione": GraduationCap,
  "/hr/cowork": Sparkles,
  "/hebb-ai-support": MessageCircle,
  "/nexa-hr-copilot": Sparkles,
  "/ai-hub": Wand2,
  "/hr-center/analisi": BarChart2,
  "/il-mio-team": Users,
  "/percorso": RouteIcon,
  "/percorso/formazione": GraduationCap,
  "/formazione": GraduationCap,
  "/lifecycle/offboard": ClipboardList
};

function portalTileToNavItem(tile: PortalTile): PortalMapNavItem {
  const key = String(tile.href);
  const icon = HREF_ICON[key] ?? FileText;
  const exact = key === "/admin";
  return { href: tile.href, label: tile.title, icon, ...(exact ? { exact: true } : {}) };
}

/** Sezioni sidebar allineate a `buildHrLinearPortalSteps` (titoli e vetri mappa portale). */
export function buildHrPortalMapNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalMapNavSection[] {
  return buildHrLinearPortalSteps(user, hideSensitiveHr)
    .filter((step) => HR_SIDEBAR_LINEAR_STEP_IDS.has(step.id))
    .map((step) => ({
      id: step.id,
      title: step.title,
      portalCategory: portalAccentCategoryForNavSection(step.id, step.title),
      subgroups: [
        {
          id: `${step.id}-items`,
          title: step.subtitle,
          items: step.tiles.map(portalTileToNavItem)
        }
      ]
    }));
}

/** Sezioni sidebar allineate alla mappa portale dipendente (Oggi / Io / Documenti). */
export function buildEmployeePortalMapNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalMapNavSection[] {
  return buildEmployeePortalHubColumns(user, hideSensitiveHr).map((hub) => ({
    id: hub.id,
    title: hub.title,
    portalCategory: hub.title,
    subgroups: [
      {
        id: `${hub.id}-items`,
        title: hub.subtitle,
        items: hub.tiles.map(portalTileToNavItem)
      }
    ]
  }));
}
