"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronRight,
  Clock3,
  ChevronDown,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PenLine,
  UserRoundSearch,
  Receipt,
  Search,
  Settings,
  Sparkles,
  Sun,
  Upload,
  User,
  UserCog,
  Wallet2,
  Workflow,
  Network,
  type LucideIcon,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { synapseSuiteDisplayStyle } from "@/lib/synapse-typography";
import {
  clearSession,
  getSessionUser,
  getToken,
  sessionCanAccessPayrollArea,
  sessionCanNexaAdmin,
  sessionCanViewOrgExpenseClaims,
  type SessionUser
} from "@/lib/auth-session";
import { HeaderNotifications } from "@/components/header-notifications";
import { SelfServiceChat } from "@/components/self-service-chat";
import { fetchCurrentUser } from "@/lib/api";
import { NEXA_NAV_ROUTE_CATALOG, navCatalogLabelForHref } from "@/lib/nav-routes-catalog";
import { NEXA_HR_PREFS_CHANGED_EVENT, readNexaHrPrefs, NEXA_HR_PREFS_STORAGE_KEY } from "@/lib/synapse-prefs";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

const SIDEBAR_STORAGE_KEY = "nexa_hr_sidebar_sections_v1";

type NavItem = { href: Route; label: string; icon: LucideIcon; exact?: boolean };

const NAV_DASHBOARD: NavItem = { href: "/", label: "Dashboard", icon: LayoutDashboard };

const NAV_SECTIONS_MAIN: { id: string; title: string; items: NavItem[] }[] = [
  {
    id: "work",
    title: "Tempo e attività",
    items: [
      { href: "/attendance", label: "Presenze", icon: Clock3 },
      { href: "/work-calendar", label: "Calendario lavoro", icon: Calendar },
      { href: "/workflow", label: "Workflow", icon: Workflow }
    ]
  },
  {
    id: "data",
    title: "Compensi e dati",
    items: [
      { href: "/organigramma", label: "Organigramma", icon: Network },
      { href: "/expenses", label: "Spese", icon: Receipt },
      { href: "/payslips", label: "Cedolini", icon: FileText }
    ]
  },
  {
    id: "profile",
    title: "Profilo",
    items: [{ href: "/settings", label: "Impostazioni", icon: Settings }]
  }
];

function pathActive(pathname: string, href: Route, exact?: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function sectionHasActivePath(pathname: string, items: NavItem[]): boolean {
  return items.some((it) => pathActive(pathname, it.href, it.exact));
}

function getEmployeeViewOnly(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return sessionStorage.getItem(EMPLOYEE_VIEW_KEY) === "1";
}

function readSidebarSectionPrefs(): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeSidebarSectionPrefs(next: Record<string, boolean>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

function SidebarNavLink(props: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}): React.JSX.Element {
  const { item, pathname, onNavigate } = props;
  const { href, label, icon: Icon, exact } = item;
  const active = pathActive(pathname, href, exact);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`mx-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-[background,opacity] duration-200 ${
        active
          ? "bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] text-[var(--prom-text)]"
          : "text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:text-[var(--prom-text)]"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

function SidebarCollapsibleSection(props: {
  section: { id: string; title: string; items: NavItem[] };
  pathname: string;
  open: boolean;
  onOpenChange: (id: string, nextOpen: boolean) => void;
  onNavigate: () => void;
}): React.JSX.Element {
  const { section, pathname, open, onOpenChange, onNavigate } = props;
  return (
    <details
      className="group mx-0 border-b border-transparent py-0.5 last:border-b-0"
      open={open}
      onToggle={(e) => onOpenChange(section.id, e.currentTarget.open)}
    >
      <summary
        className={`mx-2 flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--prom-muted)] transition-[background,color] marker:content-none [&::-webkit-details-marker]:hidden ${
          open
            ? "bg-[color-mix(in_srgb,var(--prom-surface)_55%,transparent)] text-[var(--prom-text)]"
            : "hover:bg-[color-mix(in_srgb,var(--prom-surface)_70%,transparent)] hover:text-[var(--prom-text)]"
        }`}
      >
        <span>{section.title}</span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
      </summary>
      <div className="mt-0.5 space-y-0.5 pb-1">
        {section.items.map((item) => (
          <SidebarNavLink key={`${section.id}-${item.href}`} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </div>
    </details>
  );
}

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [employeeView, setEmployeeViewState] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [mobileShortcutHrefs, setMobileShortcutHrefs] = useState<string[]>(() => readNexaHrPrefs().menuShortcutHrefs ?? []);

  useEffect(() => {
    function refreshMenuShortcuts(): void {
      setMobileShortcutHrefs(readNexaHrPrefs().menuShortcutHrefs ?? []);
    }
    refreshMenuShortcuts();
    function onStorage(e: StorageEvent): void {
      if (e.key === NEXA_HR_PREFS_STORAGE_KEY) {
        refreshMenuShortcuts();
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(NEXA_HR_PREFS_CHANGED_EVENT, refreshMenuShortcuts);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(NEXA_HR_PREFS_CHANGED_EVENT, refreshMenuShortcuts);
    };
  }, []);

  useEffect(() => {
    setUser(getSessionUser());
    setEmployeeViewState(getEmployeeViewOnly());
    const token = getToken();
    if (!token) {
      return;
    }
    let cancelled = false;
    void fetchCurrentUser(token)
      .then((fresh) => {
        if (!cancelled) {
          setUser(fresh);
        }
      })
      .catch(() => {
        /* mantieni sessione da localStorage */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const isAdminUi = sessionCanNexaAdmin(user ?? undefined);
  const hideSensitiveHrBecausePreview = Boolean(employeeView && isAdminUi);
  const showPayrollNav = Boolean(
    user && !hideSensitiveHrBecausePreview && sessionCanAccessPayrollArea(user)
  );
  const showBudgetNav = Boolean(user && !hideSensitiveHrBecausePreview && sessionCanNexaAdmin(user));
  const showHrToolsNav = Boolean(user && !hideSensitiveHrBecausePreview && sessionCanNexaAdmin(user));
  const showAdminNav = Boolean(isAdminUi && !hideSensitiveHrBecausePreview);
  const showOrgExpensesNav = Boolean(
    user && !hideSensitiveHrBecausePreview && sessionCanViewOrgExpenseClaims(user)
  );
  const showHrSidebarSection =
    showPayrollNav || showBudgetNav || showHrToolsNav || showAdminNav || showOrgExpensesNav;

  const filteredSearch = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) {
      return [];
    }
    let routes = NEXA_NAV_ROUTE_CATALOG;
    if (!sessionCanAccessPayrollArea(user ?? undefined)) {
      routes = routes.filter((r) => r.href !== "/payroll-hebb");
    }
    if (!sessionCanNexaAdmin(user ?? undefined)) {
      routes = routes.filter((r) => r.href !== "/personnel-budget");
    }
    if (!sessionCanNexaAdmin(user ?? undefined)) {
      routes = routes.filter(
        (r) =>
          r.href !== "/admin" &&
          r.href !== ("/admin/data-export" as Route) &&
          r.href !== ("/admin/data-import" as Route)
      );
    }
    if (!sessionCanViewOrgExpenseClaims(user ?? undefined)) {
      routes = routes.filter((r) => r.href !== ("/expenses/org" as Route));
    }
    return routes.filter((r) => r.label.toLowerCase().includes(q) || r.href.includes(q)).slice(0, 8);
  }, [searchQ, user]);

  const onLogout = useCallback((): void => {
    // clearSession already does best-effort server logout
    clearSession();
    router.push("/login");
  }, [router]);

  const toggleEmployeeView = useCallback((): void => {
    const next = !getEmployeeViewOnly();
    sessionStorage.setItem(EMPLOYEE_VIEW_KEY, next ? "1" : "0");
    setEmployeeViewState(next);
    setProfileOpen(false);
    router.refresh();
  }, [router]);

  const sidebarHrSections = useMemo(() => {
    const hrBlocks: { id: string; title: string; items: NavItem[] }[] = [];
    const hrOps: NavItem[] = [];
    if (showHrToolsNav) {
      hrOps.push({
        href: "/tools/cost-calculator" as Route,
        label: "Calcolatore costo/netto",
        icon: Sparkles
      });
      hrOps.push({ href: "/recruiting" as Route, label: "Colloqui e selezione", icon: UserRoundSearch });
      hrOps.push({ href: "/contracts" as Route, label: "Contratti standard", icon: PenLine });
      hrOps.push({
        href: "/tools/third-party-licenses" as Route,
        label: "Utenze e licenze terze",
        icon: KeyRound
      });
    }
    if (showPayrollNav) {
      hrOps.push({ href: "/payroll-hebb" as Route, label: "Hebb - Payroll", icon: Sparkles });
    }
    if (showBudgetNav) {
      hrOps.push({ href: "/personnel-budget" as Route, label: "Budget personale", icon: Wallet2 });
    }
    if (showOrgExpensesNav) {
      hrOps.push({ href: "/expenses/org" as Route, label: "Note spese (dipendenti)", icon: Receipt });
    }
    if (hrOps.length > 0) {
      hrBlocks.push({ id: "hr-ops", title: "Strumenti HR", items: hrOps });
    }
    const hrAdmin: NavItem[] = [];
    if (showAdminNav) {
      hrAdmin.push({ href: "/admin" as Route, label: "Admin", icon: UserCog, exact: true });
      hrAdmin.push({ href: "/admin/data-export" as Route, label: "Export Excel", icon: FileText });
      hrAdmin.push({ href: "/admin/data-import" as Route, label: "Import Excel", icon: Upload });
    }
    if (hrAdmin.length > 0) {
      hrBlocks.push({ id: "hr-admin", title: "Amministrazione", items: hrAdmin });
    }
    return hrBlocks;
  }, [showPayrollNav, showBudgetNav, showOrgExpensesNav, showAdminNav]);

  const allCollapsibleSections = useMemo(
    () => [...NAV_SECTIONS_MAIN, ...sidebarHrSections],
    [sidebarHrSections]
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenSections((prev) => ({ ...readSidebarSectionPrefs(), ...prev }));
  }, []);

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const sec of allCollapsibleSections) {
        if (sectionHasActivePath(pathname, sec.items)) {
          next[sec.id] = true;
        }
      }
      return next;
    });
  }, [pathname, allCollapsibleSections]);

  const onSectionOpenChange = useCallback((id: string, isOpen: boolean): void => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: isOpen };
      writeSidebarSectionPrefs(next);
      return next;
    });
  }, []);

  const closeMobile = useCallback((): void => {
    setMobileOpen(false);
  }, []);

  const SidebarContent = (
    <div className="flex min-h-0 flex-col gap-1 py-4">
      <Link
        href="/"
        className="mb-3 flex items-center gap-2 px-3 transition-opacity hover:opacity-90"
        onClick={closeMobile}
      >
        <span
          className="nexa-wordmark-face text-sm font-semibold uppercase tracking-[0.12em] text-[var(--prom-text)]"
          style={synapseSuiteDisplayStyle}
        >
          Nexa HR
        </span>
      </Link>
      <SidebarNavLink item={NAV_DASHBOARD} pathname={pathname} onNavigate={closeMobile} />
      {NAV_SECTIONS_MAIN.map((section) => (
        <SidebarCollapsibleSection
          key={section.id}
          section={section}
          pathname={pathname}
          open={Boolean(openSections[section.id])}
          onOpenChange={onSectionOpenChange}
          onNavigate={closeMobile}
        />
      ))}
      {showHrSidebarSection && sidebarHrSections.length > 0 ? (
        <>
          <div className="my-2 border-t border-[var(--prom-line)]" />
          {sidebarHrSections.map((section) => (
            <SidebarCollapsibleSection
              key={section.id}
              section={section}
              pathname={pathname}
              open={Boolean(openSections[section.id])}
              onOpenChange={onSectionOpenChange}
              onNavigate={closeMobile}
            />
          ))}
        </>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <aside
        className="hidden h-full min-h-0 w-[200px] shrink-0 overflow-y-auto overscroll-y-contain border-r border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] md:block"
        aria-label="Navigazione principale"
      >
        {SidebarContent}
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 transition-opacity"
            aria-label="Chiudi menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-[min(100vw,280px)] flex-col overflow-y-auto border-r border-[var(--prom-line)] bg-[var(--prom-surface)] shadow-xl transition-transform duration-200">
            <div className="flex justify-end p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 rounded-full p-0"
                onClick={() => setMobileOpen(false)}
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {mobileShortcutHrefs.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-b border-[var(--prom-line)] px-3 pb-3">
                <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  Preferiti
                </span>
                {mobileShortcutHrefs.map((href) => (
                  <Link
                    key={href}
                    href={href as Route}
                    onClick={closeMobile}
                    className="rounded-full border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-2.5 py-1 text-xs text-[var(--prom-text)] transition-colors hover:border-[color-mix(in_srgb,var(--prom-gold)_35%,var(--prom-line-strong))]"
                  >
                    {navCatalogLabelForHref(href)}
                  </Link>
                ))}
              </div>
            ) : null}
            {SidebarContent}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="z-30 shrink-0 border-b backdrop-blur-xl transition-colors duration-300"
          style={{
            background: "var(--bar-bg)",
            borderColor: "var(--bar-border)",
            boxShadow: "var(--bar-shadow)"
          }}
        >
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-full p-0 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Apri menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Link href="/" className="hidden shrink-0 sm:block" aria-label="Home">
              <span
                className="nexa-wordmark-face text-xs font-semibold uppercase tracking-[0.1em] text-[var(--prom-text)]"
                style={synapseSuiteDisplayStyle}
              >
                Nexa
              </span>
            </Link>
            <div ref={searchRef} className="relative min-w-0 flex-1 max-w-xl">
              <label className="sr-only" htmlFor="global-search">
                Cerca nel portale
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                <input
                  id="global-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Cerca pagine…"
                  value={searchQ}
                  onChange={(e) => {
                    setSearchQ(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filteredSearch[0]) {
                      router.push(filteredSearch[0].href as Route);
                      setSearchQ("");
                      setSearchOpen(false);
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_88%,transparent)] py-2 pl-9 pr-3 text-sm text-[var(--prom-text)] outline-none ring-0 transition-[border-color,opacity] placeholder:text-[var(--prom-muted)] focus:border-[color-mix(in_srgb,var(--prom-gold)_45%,var(--prom-line-strong))]"
                />
              </div>
              {searchOpen && filteredSearch.length > 0 ? (
                <ul
                  className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] py-1 shadow-[var(--card-shadow)] transition-opacity"
                  role="listbox"
                >
                  {filteredSearch.map((r) => (
                    <li key={r.href} role="option">
                      <Link
                        href={r.href}
                        className="block px-3 py-2 text-sm text-[var(--prom-text)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)]"
                        onClick={() => {
                          setSearchQ("");
                          setSearchOpen(false);
                        }}
                      >
                        {r.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <HeaderNotifications />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-full px-0"
              onClick={() => toggleTheme()}
              disabled={!mounted}
              aria-label={theme === "dark" ? "Tema chiaro" : "Tema scuro"}
              title={theme === "dark" ? "Tema chiaro" : "Tema scuro"}
            >
              {mounted ? (
                theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )
              ) : (
                <span className="inline-block h-4 w-4 rounded-full bg-black/10 dark:bg-white/20" />
              )}
            </Button>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-1 rounded-lg border border-[var(--prom-line-strong)] px-2 py-1.5 text-sm text-[var(--prom-text)] transition-[background,opacity] hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
                aria-expanded={profileOpen}
                aria-haspopup="true"
              >
                <User className="h-4 w-4 opacity-70" />
                <span className="max-w-[120px] truncate hidden sm:inline">
                  {user?.fullName ?? "Profilo"}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
              {profileOpen ? (
                <div className="absolute right-0 top-full z-40 mt-1 min-w-[200px] rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] py-1 shadow-[var(--card-shadow)] transition-opacity">
                  {isAdminUi ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--prom-text)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)]"
                      onClick={toggleEmployeeView}
                    >
                      <UserCog className="h-4 w-4" />
                      {employeeView ? "Vista HR completa" : "Vista solo dipendente"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 dark:text-rose-400 hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
                    onClick={onLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    Esci
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6">{children}</main>
          <footer className="border-t border-[var(--prom-line)] py-4 text-center text-xs text-[var(--prom-muted)]">
            © Nexa HR 2026
          </footer>
        </div>
      </div>
      <SelfServiceChat />
    </div>
  );
}
