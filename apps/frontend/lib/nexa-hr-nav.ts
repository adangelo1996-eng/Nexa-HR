import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  BarChart3,
  Building2,
  Calculator,
  CalendarDays,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  PenLine,
  PieChart,
  Receipt,
  Sparkles,
  TrendingUp,
  UserCog,
  UserPlus,
  UserRoundSearch,
  Users,
  Wallet2,
  Wand2,
  Workflow
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { filterPortalHref } from "@/lib/nexa-route-access";

export type HrNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type HrNavSubgroup = { id: string; title: string; items: HrNavItem[] };

export type HrNavPillar = {
  id: string;
  title: string;
  portalCategory: string;
  subgroups: HrNavSubgroup[];
};

const PILLAR_DEFS: Array<{
  id: string;
  title: string;
  portalCategory: string;
  subgroups: Array<{ id: string; title: string; items: HrNavItem[] }>;
}> = [
  {
    id: "hr-persone",
    title: "Persone",
    portalCategory: "Persone",
    subgroups: [
      {
        id: "p-sel",
        title: "Selezione e onboarding",
        items: [
          { href: "/recruiting" as Route, label: "Colloqui e selezione", icon: UserRoundSearch },
          { href: "/recruiting/onboarding" as Route, label: "Onboarding candidati", icon: UserPlus }
        ]
      },
      {
        id: "p-org",
        title: "Anagrafica e organizzazione",
        items: [
          { href: "/org-chart", label: "Organigramma persone", icon: Users },
          { href: "/organigramma", label: "Organigramma strutturale", icon: Building2 },
          { href: "/workforce-planning" as Route, label: "Workforce planning", icon: BarChart2 }
        ]
      },
      {
        id: "p-exit",
        title: "Uscita",
        items: [{ href: "/lifecycle/offboard" as Route, label: "Offboarding", icon: ClipboardList }]
      }
    ]
  },
  {
    id: "hr-operazioni",
    title: "Operazioni",
    portalCategory: "Operazioni",
    subgroups: [
      {
        id: "o-pres",
        title: "Presenze e turni",
        items: [
          { href: "/reports", label: "Report presenze", icon: PieChart },
          { href: "/scheduling", label: "Turni", icon: CalendarDays },
          { href: "/manager-copilot" as Route, label: "Pannello manager", icon: ClipboardList }
        ]
      },
      {
        id: "o-flussi",
        title: "Flussi e payroll",
        items: [
          { href: "/workflow/approvals", label: "Approvazioni team", icon: Workflow },
          { href: "/expenses/org" as Route, label: "Note spese organico", icon: Receipt },
          { href: "/payroll-hebb", label: "Payroll", icon: Sparkles }
        ]
      }
    ]
  },
  {
    id: "hr-analytics",
    title: "Analytics & Intelligence",
    portalCategory: "Analytics",
    subgroups: [
      {
        id: "a-hub",
        title: "Centro analisi AI",
        items: [
          { href: "/analytics" as Route, label: "Hub Analytics", icon: BarChart3, exact: true },
          { href: "/hr-center/analisi" as Route, label: "Analisi costi HR", icon: PieChart },
          { href: "/insights", label: "Turnover e retention", icon: TrendingUp },
          { href: "/hr-center/recap" as Route, label: "Recap AI dipendenti", icon: ClipboardList }
        ]
      },
      {
        id: "a-budget",
        title: "Budget e forecast",
        items: [
          { href: "/personnel-budget", label: "Budget personale", icon: Wallet2 },
          { href: "/forecast", label: "Forecast costi", icon: TrendingUp },
          { href: "/hr-center/budget-report" as Route, label: "Report budget LLM", icon: Wallet2 },
          { href: "/compensation/bench", label: "Benchmark retribuzione", icon: BarChart2 }
        ]
      },
      {
        id: "a-ai",
        title: "Hebb for HR",
        items: [
          { href: "/ai-hub" as Route, label: "Hebb for HR", icon: Wand2 },
          { href: "/hr-recap" as Route, label: "Recap operativo HR", icon: ClipboardList },
          { href: "/tools/cost-calculator" as Route, label: "Calcolatore costo", icon: Calculator }
        ]
      }
    ]
  },
  {
    id: "hr-admin",
    title: "Amministrazione",
    portalCategory: "Amministrazione",
    subgroups: [
      {
        id: "a-doc",
        title: "Documenti e policy",
        items: [
          { href: "/contracts" as Route, label: "Contratti standard", icon: PenLine },
          { href: "/corporate-policies" as Route, label: "Corporate Policies", icon: FileText },
          { href: "/tools/third-party-licenses" as Route, label: "Licenze terze", icon: KeyRound }
        ]
      },
      {
        id: "a-console",
        title: "Console",
        items: [
          { href: "/admin" as Route, label: "Console utenti", icon: UserCog, exact: true },
          { href: "/admin/data-export" as Route, label: "Export Excel", icon: FileText },
          { href: "/admin/cost-centers" as Route, label: "Centri di costo", icon: Building2 }
        ]
      }
    ]
  }
];

/** Tre pilastri HR + Amministrazione compatta. */
export function buildHrNavPillars(user: SessionUser | null, hideSensitiveHr: boolean): HrNavPillar[] {
  const pillars: HrNavPillar[] = [];
  for (const def of PILLAR_DEFS) {
    const subgroups: HrNavSubgroup[] = [];
    for (const sg of def.subgroups) {
      const items = sg.items.filter((item) => filterPortalHref(item.href, user, hideSensitiveHr));
      if (items.length > 0) {
        subgroups.push({ id: sg.id, title: sg.title, items });
      }
    }
    if (subgroups.length > 0) {
      pillars.push({
        id: def.id,
        title: def.title,
        portalCategory: def.portalCategory,
        subgroups
      });
    }
  }
  return pillars;
}

export const HR_NAV_DASHBOARD: HrNavItem = {
  href: "/" as Route,
  label: "Dashboard",
  icon: LayoutDashboard
};

export const HR_NAV_PORTAL_MAP: HrNavItem = {
  href: "/mappa-portale" as Route,
  label: "Mappa portale",
  icon: LayoutDashboard
};
