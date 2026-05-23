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
import { buildEmployeePortalHubColumns } from "@/lib/portal-mappa-employee";
import { buildAnalyticsPortalRow, buildLifecyclePortalColumns } from "@/lib/portal-mappa-lifecycle";
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

/** Sezioni sidebar allineate alla mappa portale HR (colonne lifecycle + analytics). */
export function buildHrPortalMapNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalMapNavSection[] {
  const lifecycle = buildLifecyclePortalColumns(user, hideSensitiveHr);
  const sections: PortalMapNavSection[] = lifecycle.map((col) => ({
    id: col.id,
    title: col.title,
    portalCategory: "Persone",
    subgroups: [
      {
        id: `${col.id}-items`,
        title: col.subtitle,
        items: col.tiles.map(portalTileToNavItem)
      }
    ]
  }));

  const analytics = buildAnalyticsPortalRow(user, hideSensitiveHr);
  if (analytics.length > 0) {
    sections.push({
      id: "analytics",
      title: "Analytics & Intelligence",
      portalCategory: "HEBB AI for HR",
      subgroups: [
        {
          id: "analytics-items",
          title: "Budget, retention e competenze",
          items: analytics.map(portalTileToNavItem)
        }
      ]
    });
  }

  return sections;
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
