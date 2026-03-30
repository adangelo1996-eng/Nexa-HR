"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Clock3,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Search,
  Settings,
  Sun,
  User,
  UserCog,
  Workflow,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { synapseSuiteDisplayStyle } from "@/lib/synapse-typography";
import {
  clearSession,
  getSessionUser,
  sessionCanNexaAdmin,
  type SessionUser
} from "@/lib/auth-session";
import { HeaderNotifications } from "@/components/header-notifications";
import { SelfServiceChat } from "@/components/self-service-chat";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

const NAV_MAIN: { href: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Presenze", icon: Clock3 },
  { href: "/workflow", label: "Workflow", icon: Workflow },
  { href: "/expenses", label: "Spese", icon: Receipt },
  { href: "/settings", label: "Impostazioni", icon: Settings }
];

const SEARCH_ROUTES: { href: Route; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/attendance", label: "Presenze" },
  { href: "/workflow", label: "Workflow" },
  { href: "/expenses", label: "Spese" },
  { href: "/settings", label: "Impostazioni" },
  { href: "/org-chart", label: "Organigramma" },
  { href: "/payslips", label: "Cedolini" },
  { href: "/smartworking", label: "Smartworking" },
  { href: "/workflow/approvals", label: "Approvazioni team" },
  { href: "/reports", label: "Report HR" },
  { href: "/payroll-calc", label: "Payroll" },
  { href: "/admin", label: "Admin" },
  { href: "/insights", label: "People insights" },
  { href: "/scheduling", label: "Turni" },
  { href: "/compensation/bench", label: "Benchmark retribuzione" },
  { href: "/lifecycle/offboard", label: "Offboarding" },
  { href: "/forecast", label: "Forecast costi" }
];

function getEmployeeViewOnly(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return sessionStorage.getItem(EMPLOYEE_VIEW_KEY) === "1";
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

  useEffect(() => {
    setUser(getSessionUser());
    setEmployeeViewState(getEmployeeViewOnly());
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
  const showHrExtras =
    user && user.role !== "employee" && !(employeeView && isAdminUi);

  const filteredSearch = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return SEARCH_ROUTES.filter((r) => r.label.toLowerCase().includes(q) || r.href.includes(q)).slice(0, 8);
  }, [searchQ]);

  const onLogout = useCallback((): void => {
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

  const SidebarContent = (
    <div className="flex h-full flex-col gap-1 py-4">
      <Link
        href="/"
        className="mb-3 flex items-center gap-2 px-3 transition-opacity hover:opacity-90"
        onClick={() => setMobileOpen(false)}
      >
        <span
          className="nexa-wordmark-face text-sm font-semibold uppercase tracking-[0.12em] text-[var(--prom-text)]"
          style={synapseSuiteDisplayStyle}
        >
          Nexa HR
        </span>
      </Link>
      {NAV_MAIN.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
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
      })}
      {showHrExtras ? (
        <>
          <div className="my-2 border-t border-[var(--prom-line)]" />
          <Link
            href="/payroll-calc"
            onClick={() => setMobileOpen(false)}
            className={`mx-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-[background,opacity] duration-200 ${
              pathname.startsWith("/payroll-calc")
                ? "bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] text-[var(--prom-text)]"
                : "text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:text-[var(--prom-text)]"
            }`}
          >
            <Calculator className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Payroll
          </Link>
          {isAdminUi ? (
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className={`mx-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-[background,opacity] duration-200 ${
                pathname.startsWith("/admin")
                  ? "bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] text-[var(--prom-text)]"
                  : "text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:text-[var(--prom-text)]"
              }`}
            >
              <UserCog className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              Admin
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className="hidden w-[200px] shrink-0 border-r border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] md:block"
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
          <div className="relative flex h-full w-[min(100vw,280px)] flex-col border-r border-[var(--prom-line)] bg-[var(--prom-surface)] shadow-xl transition-transform duration-200">
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
            {SidebarContent}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 border-b backdrop-blur-xl transition-colors duration-300"
          style={{
            background: "var(--bar-bg)",
            borderColor: "var(--bar-border)",
            boxShadow: "var(--bar-shadow)"
          }}
        >
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-6 py-3">
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

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">{children}</main>

        <footer className="mt-auto border-t border-[var(--prom-line)] py-4 text-center text-xs text-[var(--prom-muted)]">
          © Nexa HR 2026
        </footer>
      </div>
      <SelfServiceChat />
    </div>
  );
}
