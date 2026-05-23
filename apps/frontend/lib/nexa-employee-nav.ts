import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarDays,
  Clock3,
  DoorOpen,
  FileText,
  Home,
  LayoutDashboard,
  MessageCircle,
  Laptop,
  Receipt,
  Route as RouteIcon,
  Settings,
  User,
  Users,
  Workflow
} from "lucide-react";
import type { SessionUser } from "@/lib/auth-session";
import { employeeHubSlugForSectionId, hubPathForSlug } from "@/lib/nexa-hub-paths";
import { filterPortalHref } from "@/lib/nexa-route-access";

export type EmployeeNavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

export type EmployeeNavSection = {
  id: string;
  title: string;
  hubHref: Route;
  sectionIcon: LucideIcon;
  items: EmployeeNavItem[];
};

const ALL_SECTIONS: Omit<EmployeeNavSection, "hubHref">[] = [
  {
    id: "emp-home",
    title: "Oggi",
    sectionIcon: Home,
    items: [
      { href: "/" as Route, label: "Dashboard", icon: LayoutDashboard },
      { href: "/hebb-ai-support" as Route, label: "Hebb AI Support", icon: MessageCircle }
    ]
  },
  {
    id: "emp-io",
    title: "Io",
    sectionIcon: User,
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
    sectionIcon: FileText,
    items: [
      { href: "/payslips", label: "Cedolini", icon: FileText },
      { href: "/settings", label: "Impostazioni", icon: Settings }
    ]
  }
];

/** Menu sidebar semplificato per dipendenti (tre sezioni top-level). */
function withHubHref(section: Omit<EmployeeNavSection, "hubHref">): EmployeeNavSection {
  const slug = employeeHubSlugForSectionId(section.id);
  return {
    ...section,
    hubHref: slug ? hubPathForSlug(slug) : ("/" as Route)
  };
}

export function buildEmployeeNavSections(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): EmployeeNavSection[] {
  return ALL_SECTIONS.map((section) =>
    withHubHref({
      ...section,
      items: section.items.filter((item) => filterPortalHref(item.href, user, hideSensitiveHr))
    })
  ).filter((s) => s.items.length > 0);
}
