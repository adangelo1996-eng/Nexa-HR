import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarDays,
  Clock3,
  DoorOpen,
  FileText,
  LayoutDashboard,
  Laptop,
  Receipt,
  Route as RouteIcon,
  Settings,
  Users,
  Workflow
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { filterPortalHref } from "@/lib/nexa-route-access";

export type EmployeeNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type EmployeeNavSection = {
  id: string;
  title: string;
  items: EmployeeNavItem[];
};

const ALL_SECTIONS: EmployeeNavSection[] = [
  {
    id: "emp-home",
    title: "Home",
    items: [{ href: "/" as Route, label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    id: "emp-io",
    title: "Io",
    items: [
      { href: "/attendance", label: "Presenze", icon: Clock3 },
      { href: "/workflow", label: "Workflow", icon: Workflow },
      { href: "/expenses", label: "Note spese", icon: Receipt },
      { href: "/scheduling", label: "Turni", icon: CalendarDays },
      { href: "/smartworking", label: "Remote working", icon: Laptop },
      { href: "/work-calendar", label: "Calendario lavoro", icon: Calendar },
      { href: "/sale-riunioni" as Route, label: "Sale riunioni", icon: DoorOpen },
      { href: "/il-mio-team" as Route, label: "Manager e colleghi", icon: Users },
      { href: "/percorso" as Route, label: "Onboarding e uscita", icon: RouteIcon },
      { href: "/percorso/formazione" as Route, label: "Formazione", icon: FileText }
    ]
  },
  {
    id: "emp-docs",
    title: "Documenti",
    items: [
      { href: "/payslips", label: "Cedolini", icon: FileText },
      { href: "/settings", label: "Impostazioni", icon: Settings }
    ]
  }
];

/** Menu sidebar semplificato per dipendenti (tre sezioni top-level). */
export function buildEmployeeNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): EmployeeNavSection[] {
  return ALL_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => filterPortalHref(item.href, user, hideSensitiveHr))
  })).filter((s) => s.items.length > 0);
}
