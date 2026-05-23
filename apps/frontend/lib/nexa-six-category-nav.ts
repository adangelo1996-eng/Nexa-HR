import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Calculator,
  ClipboardList,
  Calendar,
  Clock3,
  FileText,
  KeyRound,
  Library,
  LayoutDashboard,
  PenLine,
  PieChart,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  UserCog,
  UserPlus,
  UserRoundSearch,
  Users,
  Wallet2,
  Wand2,
  MessageCircle,
  Workflow,
  Building2,
  Laptop,
  CalendarDays,
  DoorOpen
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { buildPortalColumns } from "@/lib/nexa-portal-column-layout";
import type { PortalTile } from "@/lib/portal-mappa";

export type SixCatNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type SixCatNavSubgroup = { id: string; title: string; items: SixCatNavItem[] };

export type SixCatNavSection = {
  id: string;
  portalCategory: string;
  title: string;
  subgroups: SixCatNavSubgroup[];
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
  "/hr-center": Sparkles,
  "/hr-center/analisi": PieChart,
  "/hr-center/recap": ClipboardList,
  "/hr-center/budget-report": Wallet2,
  "/hebb-ai-support": MessageCircle,
  "/ai-hub": Wand2,
  "/nexa-hr-copilot": Sparkles,
  "/analytics/advanced": TrendingUp,
  "/analytics/advanced/retention": TrendingUp,
  "/recruiting": UserRoundSearch,
  "/recruiting/onboarding": UserPlus,
  "/contracts": PenLine,
  "/corporate-policies": Library,
  "/tools/third-party-licenses": KeyRound,
  "/tools/cost-calculator": Calculator,
  "/forecast": TrendingUp,
  "/compensation/bench": BarChart2,
  "/personnel-budget": Wallet2,
  "/personnel-budget/simulatore-assunzione": Calculator,
  "/hr-recap": ClipboardList,
  "/expenses/org": Receipt,
  "/payroll-hebb": Sparkles,
  "/admin": UserCog,
  "/admin/data-export": FileText,
  "/admin/cost-centers": Building2,
  "/analytics": BarChart2,
  "/il-mio-team": Users,
  "/percorso": Calendar
};

function slugCategory(cat: string): string {
  return cat
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function portalTileToNavItem(tile: PortalTile): SixCatNavItem {
  const key = String(tile.href);
  const icon = HREF_ICON[key] ?? FileText;
  const exact = key === "/admin";
  return { href: tile.href, label: tile.title, icon, ...(exact ? { exact: true } : {}) };
}

/** Sei categorie portale con sottogruppi come nel menu legacy (solo voci permesse). */
export function buildSixCatNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): SixCatNavSection[] {
  const columns = buildPortalColumns(user, hideSensitiveHr);
  return columns
    .filter((c) => c.subgroups.length > 0)
    .map((c) => ({
      id: `six-${slugCategory(c.portalCategory)}`,
      portalCategory: c.portalCategory,
      title: c.portalCategory,
      subgroups: c.subgroups.map((sg) => ({
        id: sg.id,
        title: sg.title,
        items: sg.tiles.map(portalTileToNavItem)
      }))
    }));
}
