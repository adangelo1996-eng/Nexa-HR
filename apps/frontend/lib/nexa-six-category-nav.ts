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
  Workflow,
  Building2,
  Laptop,
  CalendarDays
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { filterPortalHref } from "@/lib/nexa-route-access";
import { PORTAL_CATEGORY_ORDER, PORTAL_TILES } from "@/lib/portal-mappa";

export type SixCatNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type SixCatNavSection = {
  id: string;
  portalCategory: string;
  title: string;
  items: SixCatNavItem[];
};

const HREF_ICON: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/attendance": Clock3,
  "/work-calendar": Calendar,
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
  "/ai-hub": Wand2,
  "/insights": TrendingUp,
  "/recruiting": UserRoundSearch,
  "/recruiting/onboarding": UserPlus,
  "/contracts": PenLine,
  "/corporate-policies": Library,
  "/tools/third-party-licenses": KeyRound,
  "/tools/cost-calculator": Calculator,
  "/forecast": TrendingUp,
  "/compensation/bench": BarChart2,
  "/personnel-budget": Wallet2,
  "/hr-recap": ClipboardList,
  "/expenses/org": Receipt,
  "/payroll-hebb": Sparkles,
  "/admin": UserCog,
  "/admin/data-export": FileText,
  "/admin/cost-centers": Building2
};

function slugCategory(cat: string): string {
  return cat
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function portalTileToNavItem(tile: (typeof PORTAL_TILES)[number]): SixCatNavItem {
  const key = String(tile.href);
  const icon = HREF_ICON[key] ?? FileText;
  const exact = key === "/admin";
  return { href: tile.href, label: tile.title, icon, ...(exact ? { exact: true } : {}) };
}

/**
 * Sei blocchi navigazione allineati alle categorie portale (stesso ordine e filtri permessi della mappa).
 */
export function buildSixCatNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): SixCatNavSection[] {
  return PORTAL_CATEGORY_ORDER.map((category) => {
    const items = PORTAL_TILES.filter((t) => t.category === category)
      .filter((t) => filterPortalHref(t.href, user, hideSensitiveHr))
      .map(portalTileToNavItem);
    return {
      id: `six-${slugCategory(category)}`,
      portalCategory: category,
      title: category,
      items
    };
  }).filter((s) => s.items.length > 0);
}
