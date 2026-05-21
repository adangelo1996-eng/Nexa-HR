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
import { buildEmployeeNavSections, type EmployeeNavItem } from "@/lib/nexa-employee-nav";
import { buildHrLinearPortalSteps } from "@/lib/portal-mappa-linear";
import type { PortalTile } from "@/lib/portal-mappa";

export type PortalMapNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type PortalMapNavSubgroup = { id: string; title: string; items: PortalMapNavItem[] };

export type PortalMapNavSection = {
  id: string;
  title: string;
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

function employeeItemToNavItem(item: EmployeeNavItem): PortalMapNavItem {
  return { href: item.href, label: item.label, icon: item.icon, exact: item.exact };
}

/** Sezioni sidebar allineate alla mappa portale HR (passi lineari). */
export function buildHrPortalMapNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalMapNavSection[] {
  return buildHrLinearPortalSteps(user, hideSensitiveHr).map((step) => ({
    id: step.id,
    title: step.title,
    subgroups: [
      {
        id: `${step.id}-items`,
        title: "",
        items: step.tiles.map(portalTileToNavItem)
      }
    ]
  }));
}

/** Sezioni sidebar allineate alla mappa portale dipendente (Home / Io / Documenti). */
export function buildEmployeePortalMapNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): PortalMapNavSection[] {
  return buildEmployeeNavSections(user, hideSensitiveHr).map((section) => ({
    id: section.id,
    title: section.title,
    subgroups: [
      {
        id: `${section.id}-items`,
        title: "",
        items: section.items.map(employeeItemToNavItem)
      }
    ]
  }));
}
