import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  BarChart3,
  Building2,
  Calculator,
  MessageCircle,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FileText,
  KeyRound,
  LayoutDashboard,
  PenLine,
  PieChart,
  Receipt,
  Sparkles,
  UserCog,
  UserPlus,
  UserRoundSearch,
  Users,
  GraduationCap,
  Workflow
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { hubPathForSlug } from "@/lib/nexa-hub-paths";
import { filterPortalHref } from "@/lib/nexa-route-access";

export type HrNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type HrNavSubgroup = { id: string; title: string; items: HrNavItem[] };

export type HrNavPillar = {
  id: string;
  title: string;
  hubSlug: string;
  hubHref: Route;
  portalCategory: string;
  subgroups: HrNavSubgroup[];
};

const PILLAR_DEFS: Array<{
  id: string;
  title: string;
  hubSlug: string;
  portalCategory: string;
  subgroups: Array<{ id: string; title: string; items: HrNavItem[] }>;
}> = [
  {
    id: "hr-persone",
    title: "Persone",
    hubSlug: "persone",
    portalCategory: "Persone",
    subgroups: [
      {
        id: "p-grow",
        title: "Sviluppo",
        items: [{ href: "/hr/formazione" as Route, label: "Formazione", icon: GraduationCap }]
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
    id: "hire",
    title: "Assumere e Onboarding",
    hubSlug: "hire",
    portalCategory: "Assumere e Onboarding",
    subgroups: [
      {
        id: "h-sel",
        title: "Selezione e onboarding",
        items: [
          { href: "/recruiting" as Route, label: "Colloqui e selezione", icon: UserRoundSearch },
          { href: "/recruiting/onboarding" as Route, label: "Onboarding candidati", icon: UserPlus }
        ]
      },
      {
        id: "h-doc",
        title: "Contratti e costi",
        items: [
          { href: "/contracts" as Route, label: "Contratti standard", icon: PenLine },
          {
            href: "/personnel-budget/simulatore-assunzione" as Route,
            label: "Simulatore costo azienda",
            icon: Calculator
          }
        ]
      }
    ]
  },
  {
    id: "hr-operazioni",
    title: "Operazioni",
    hubSlug: "operazioni",
    portalCategory: "Operazioni",
    subgroups: [
      {
        id: "o-pres",
        title: "Presenze e turni",
        items: [
          { href: "/reports", label: "Report presenze", icon: PieChart },
          { href: "/scheduling", label: "Turni", icon: CalendarDays },
          { href: "/sale-riunioni" as Route, label: "Sale riunioni", icon: DoorOpen },
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
    title: "Analisi HR",
    hubSlug: "analisi",
    portalCategory: "Analytics",
    subgroups: [
      {
        id: "a-assist",
        title: "Assistente AI",
        items: [{ href: "/nexa-hr-copilot" as Route, label: "NEXA HR Copilot", icon: Sparkles }]
      },
      {
        id: "a-hub",
        title: "Centro analisi",
        items: [
          { href: "/hr/dashboard" as Route, label: "Dashboard HR", icon: LayoutDashboard },
          { href: "/analytics" as Route, label: "Hub Analytics", icon: BarChart3, exact: true },
          { href: "/analytics/advanced" as Route, label: "Advanced analysis", icon: BarChart2 },
          { href: "/analytics/advanced/economico" as Route, label: "Controllo economico", icon: BarChart2 },
          { href: "/analytics/advanced/retention" as Route, label: "Retention", icon: BarChart2 },
          { href: "/analytics/advanced/competenze" as Route, label: "Competenze", icon: BarChart2 },
          { href: "/analytics/advanced/operativo" as Route, label: "Sintesi operativa", icon: ClipboardList },
          { href: "/hr-recap" as Route, label: "Attività HR", icon: ClipboardList }
        ]
      }
    ]
  },
  {
    id: "hr-admin",
    title: "Amministrazione",
    hubSlug: "amministrazione",
    portalCategory: "Amministrazione",
    subgroups: [
      {
        id: "a-doc",
        title: "Documenti e policy",
        items: [
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

/** Pilastri HR sidebar + mappa portale (incluso Assumere e Onboarding). */
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
        hubSlug: def.hubSlug,
        hubHref: hubPathForSlug(def.hubSlug),
        portalCategory: def.portalCategory,
        subgroups
      });
    }
  }
  return pillars;
}

export const HR_NAV_DASHBOARD: HrNavItem = {
  href: "/hr/dashboard" as Route,
  label: "Dashboard",
  icon: LayoutDashboard
};

export const HR_NAV_HEBB_AI_SUPPORT: HrNavItem = {
  href: "/hebb-ai-support" as Route,
  label: "Hebb AI Support",
  icon: MessageCircle
};

export const HR_NAV_PORTAL_MAP: HrNavItem = {
  href: "/mappa-portale" as Route,
  label: "Mappa del portale",
  icon: LayoutDashboard
};
