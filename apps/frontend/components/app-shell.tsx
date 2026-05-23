"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  UserCog,
  MessageCircle,
  Sparkles,
  Wand2,
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
  sessionCanOpenEmployeeRecapPage,
  sessionCanAccessNexaAiAssistant,
  sessionCanAccessNexaLifecycleHr,
  sessionCanAccessNexaReportsHr,
  sessionCanUseNexaAiOpenAiLlm,
  sessionCanViewOrgExpenseClaims,
  sessionIsPlainEmployee,
  sessionUsesHrReorganizedNav,
  type SessionUser
} from "@/lib/auth-session";
import { AppMainContentFrame } from "@/components/app-experience-frame";
import { SidebarPillarNav } from "@/components/sidebar-pillar-nav";
import { SessionIdleGuard } from "@/components/session-idle-guard";
import { HeaderNotifications } from "@/components/header-notifications";
import { NexaGuidePanel } from "@/components/nexa-guide-panel";
import { fetchAdminCostCenters, fetchCurrentUser, fetchUsers } from "@/lib/api";
import { NEXA_NAV_ROUTE_CATALOG, navCatalogLabelForHref } from "@/lib/nav-routes-catalog";
import {
  portalAccentCategoryForNavSection,
  portalCategoryGlassColumnHeaderClass
} from "@/lib/nav-visual-accents";
import { NexaNavSectionFlyout, type NexaNavFlyoutSection } from "@/components/nexa-nav-section-flyout";
import { buildSixCatNavSections, type SixCatNavItem } from "@/lib/nexa-six-category-nav";
import type { HubTile } from "@/lib/nexa-hub-config";
import {
  buildEmployeePortalMapNavSections,
  buildHrPortalMapNavSections,
  type PortalMapNavSection
} from "@/lib/nexa-portal-map-nav";
import { HR_NAV_DASHBOARD } from "@/lib/nexa-hr-nav";
import {
  addTopSidebarPin,
  NEXA_SIDEBAR_PINS_CHANGED_EVENT,
  readTopSidebarPins,
  removeTopSidebarPin
} from "@/lib/nexa-sidebar-pins";
import { canAccessNexaPortalRoute } from "@/lib/nexa-route-access";
import {
  NEXA_HR_PREFS_CHANGED_EVENT,
  NEXA_HR_PREFS_STORAGE_KEY,
  readNexaHrPrefs
} from "@/lib/synapse-prefs";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";
const SIDEBAR_SCROLL_DESKTOP_KEY = "nexa_hr_sidebar_scroll_desktop_v1";
const SIDEBAR_SCROLL_MOBILE_KEY = "nexa_hr_sidebar_scroll_mobile_v1";

type NavItem = SixCatNavItem;

type GlobalSearchHit = { href: Route; label: string; subtitle?: string };

const NAV_EMPLOYEE_DASHBOARD: NavItem = { href: "/" as Route, label: "Dashboard", icon: LayoutDashboard };
const NAV_PORTAL_MAP: NavItem = { href: "/mappa-portale" as Route, label: "Mappa del portale", icon: Home };

const EMPLOYEE_PORTAL_CATEGORY: Record<string, string> = {
  home: "Oggi",
  io: "Io",
  documenti: "Documenti"
};
function portalSectionToHubTiles(section: PortalMapNavSection): HubTile[] {
  return section.subgroups.flatMap((sg) =>
    sg.items.map((item) => ({
      href: item.href,
      label: item.label,
      blurb: "",
      icon: item.icon
    }))
  );
}

const NAV_HEBB_AI_MATE: NavItem = {
  href: "/hr/cowork" as Route,
  label: "Hebb AI Mate",
  icon: Sparkles
};

const NAV_HEBB_AI_SUPPORT: NavItem = {
  href: "/hebb-ai-support" as Route,
  label: "Hebb AI Support",
  icon: MessageCircle
};

const NAV_HEBB_AI_ANALYTICS: NavItem = {
  href: "/analytics" as Route,
  label: "AI Analytics",
  icon: Wand2
};

const NAV_PROFILE_SECTION: { id: string; title: string; items: NavItem[] } = {
  id: "profile",
  title: "Profilo",
  items: [{ href: "/settings", label: "Impostazioni", icon: Settings }]
};

function pathActive(pathname: string, href: Route, exact?: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function getEmployeeViewOnly(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return sessionStorage.getItem(EMPLOYEE_VIEW_KEY) === "1";
}

function sectionHasActiveRoute(pathname: string, section: NexaNavFlyoutSection): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return section.subgroups.some((sg) =>
    sg.items.some((item) => pathActive(normalized, item.href, item.exact))
  );
}

function SidebarNavLink(props: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
  beforeNavigate?: () => void;
  isActive?: boolean;
}): React.JSX.Element {
  const { item, pathname, onNavigate, beforeNavigate, isActive } = props;
  const { href, label, icon: Icon, exact } = item;
  const active = isActive ?? pathActive(pathname, href, exact);
  return (
    <Link
      href={href}
      scroll={false}
      onClick={() => {
        beforeNavigate?.();
        onNavigate();
      }}
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

type SidebarFlyoutSection = NexaNavFlyoutSection & { portalCategory?: string };

function SidebarMacroSectionButton(props: {
  section: SidebarFlyoutSection;
  pathname: string;
  flyoutOpen: boolean;
  onToggle: (sectionId: string) => void;
}): React.JSX.Element {
  const { section, pathname, flyoutOpen, onToggle } = props;
  const active = sectionHasActiveRoute(pathname, section);
  const pc = section.portalCategory;

  const accentCategory = pc ?? portalAccentCategoryForNavSection(section.id, section.title);

  return (
    <button
      type="button"
      aria-expanded={flyoutOpen}
      aria-haspopup="dialog"
      onClick={() => onToggle(section.id)}
      className={`mx-2 flex w-[calc(100%-1rem)] cursor-pointer list-none items-center justify-between gap-1.5 rounded-xl py-1 text-left transition-opacity duration-300 ${portalCategoryGlassColumnHeaderClass(accentCategory, "compact")} ${
        flyoutOpen || active ? "ring-1 ring-[color-mix(in_srgb,var(--prom-gold)_25%,transparent)]" : ""
      }`}
    >
      <span className="min-w-0 flex-1 pr-1">{section.title}</span>
      <ChevronRight
        className={`h-3.5 w-3.5 shrink-0 text-white/70 transition-transform duration-200 dark:text-white/60 md:h-4 md:w-4 ${
          flyoutOpen ? "translate-x-0.5" : ""
        }`}
        aria-hidden
      />
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const isPortalMap = (pathname.replace(/\/$/, "") || "/") === "/mappa-portale";
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [employeeView, setEmployeeViewState] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [directorySearchHits, setDirectorySearchHits] = useState<GlobalSearchHit[]>([]);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [mobileShortcutHrefs, setMobileShortcutHrefs] = useState<string[]>(() => readNexaHrPrefs().menuShortcutHrefs ?? []);
  const [topSidebarPinsHr, setTopSidebarPinsHr] = useState<string[]>([]);
  const [topSidebarPinsEmployee, setTopSidebarPinsEmployee] = useState<string[]>([]);

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
    function refreshSidebarPins(): void {
      setTopSidebarPinsHr(readTopSidebarPins("hr"));
      setTopSidebarPinsEmployee(readTopSidebarPins("employee"));
    }
    refreshSidebarPins();
    window.addEventListener(NEXA_SIDEBAR_PINS_CHANGED_EVENT, refreshSidebarPins);
    return () => window.removeEventListener(NEXA_SIDEBAR_PINS_CHANGED_EVENT, refreshSidebarPins);
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

  useEffect(() => {
    if (!user) {
      return;
    }
    const normalized = (pathname.replace(/\/$/, "") || "/") as string;
    const allowed = canAccessNexaPortalRoute(normalized, user, hideSensitiveHrBecausePreview);
    if (!allowed) {
      router.replace("/mappa-portale");
    }
  }, [pathname, router, user, hideSensitiveHrBecausePreview]);

  const routeSearchMatches = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) {
      return [];
    }
    const routes = NEXA_NAV_ROUTE_CATALOG.filter((r) =>
      canAccessNexaPortalRoute(String(r.href), user, hideSensitiveHrBecausePreview)
    );
    return routes.filter((r) => r.label.toLowerCase().includes(q) || r.href.includes(q)).slice(0, 8);
  }, [searchQ, user, hideSensitiveHrBecausePreview]);

  useEffect(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q || q.length < 2 || !user || !sessionCanOpenEmployeeRecapPage(user)) {
      setDirectorySearchHits([]);
      return;
    }
    const token = getToken();
    if (!token) {
      setDirectorySearchHits([]);
      return;
    }
    let cancelled = false;
    const tmr = setTimeout(() => {
      void (async () => {
        const hits: GlobalSearchHit[] = [];
        try {
          const allUsers = await fetchUsers(token);
          if (cancelled) {
            return;
          }
          for (const u of allUsers) {
            if (hits.length >= 6) {
              break;
            }
            const hay = `${u.fullName} ${u.email ?? ""}`.toLowerCase();
            if (hay.includes(q)) {
              hits.push({
                href: `/employee/${encodeURIComponent(u.id)}` as Route,
                label: `Dipendente · ${u.fullName}`,
                subtitle: u.email
              });
            }
          }
          if (sessionCanNexaAdmin(user)) {
            const ccs = await fetchAdminCostCenters(token);
            if (cancelled) {
              return;
            }
            for (const c of ccs) {
              if (hits.length >= 10) {
                break;
              }
              const hay = `${c.name} ${c.code}`.toLowerCase();
              if (hay.includes(q)) {
                hits.push({
                  href: `/admin/cost-centers?cc=${encodeURIComponent(c.id)}` as Route,
                  label: `Centro di costo · ${c.code} — ${c.name}`
                });
              }
            }
          }
        } catch {
          if (!cancelled) {
            setDirectorySearchHits([]);
          }
          return;
        }
        if (!cancelled) {
          setDirectorySearchHits(hits);
        }
      })();
    }, 240);
    return () => {
      cancelled = true;
      clearTimeout(tmr);
    };
  }, [searchQ, user]);

  const mergedSearchResults = useMemo((): GlobalSearchHit[] => {
    const q = searchQ.trim().toLowerCase();
    if (!q) {
      return [];
    }
    const fromRoutes: GlobalSearchHit[] = routeSearchMatches.map((r) => ({ href: r.href, label: r.label }));
    return [...directorySearchHits, ...fromRoutes].slice(0, 12);
  }, [directorySearchHits, routeSearchMatches, searchQ]);

  const onLogout = useCallback((): void => {
    // clearSession already does best-effort server logout
    clearSession();
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    } else {
      router.replace("/login");
    }
  }, [router]);

  const toggleEmployeeView = useCallback((): void => {
    const next = !getEmployeeViewOnly();
    sessionStorage.setItem(EMPLOYEE_VIEW_KEY, next ? "1" : "0");
    setEmployeeViewState(next);
    setProfileOpen(false);
    router.refresh();
  }, [router]);

  const usesHrNav = sessionUsesHrReorganizedNav(user ?? undefined, hideSensitiveHrBecausePreview);
  const usesEmployeeNav =
    hideSensitiveHrBecausePreview || sessionIsPlainEmployee(user ?? undefined);

  const hrNavSections = useMemo((): PortalMapNavSection[] => {
    if (!usesHrNav) return [];
    return buildHrPortalMapNavSections(user, hideSensitiveHrBecausePreview);
  }, [user, hideSensitiveHrBecausePreview, usesHrNav]);

  const employeeNavSections = useMemo((): PortalMapNavSection[] => {
    if (!usesEmployeeNav) return [];
    return buildEmployeePortalMapNavSections(user, hideSensitiveHrBecausePreview);
  }, [user, hideSensitiveHrBecausePreview, usesEmployeeNav]);

  const legacySixNavSections = useMemo(() => {
    if (usesHrNav || usesEmployeeNav) return [];
    return buildSixCatNavSections(user, hideSensitiveHrBecausePreview);
  }, [user, hideSensitiveHrBecausePreview, usesHrNav, usesEmployeeNav]);

  const hrCollapsibleSections = useMemo(
    () =>
      hrNavSections.map((section) => ({
        id: section.id,
        title: section.title,
        subgroups: section.subgroups.map((sg) => ({
          id: sg.id,
          title: sg.title,
          items: sg.items
        }))
      })),
    [hrNavSections]
  );

  const employeeCollapsibleSections = useMemo(
    () =>
      employeeNavSections.map((section) => ({
        id: section.id,
        title: section.title,
        subgroups: section.subgroups.map((sg) => ({
          id: sg.id,
          title: sg.title,
          items: sg.items.filter((item) => String(item.href) !== "/")
        }))
      })).filter((section) => section.subgroups.some((sg) => sg.items.length > 0)),
    [employeeNavSections]
  );

  const flyoutNavSections = useMemo((): SidebarFlyoutSection[] => {
    if (usesHrNav) {
      return hrCollapsibleSections;
    }
    if (usesEmployeeNav) {
      return employeeCollapsibleSections;
    }
    return legacySixNavSections;
  }, [usesHrNav, usesEmployeeNav, hrCollapsibleSections, employeeCollapsibleSections, legacySixNavSections]);

  const allPinTiles = useMemo((): HubTile[] => {
    if (usesHrNav) {
      return hrNavSections.flatMap((section) => portalSectionToHubTiles(section));
    }
    if (usesEmployeeNav) {
      return employeeNavSections.flatMap((section) => portalSectionToHubTiles(section));
    }
    return legacySixNavSections.flatMap((section) =>
      section.subgroups.flatMap((sg) =>
        sg.items.map((item) => ({
          href: item.href,
          label: item.label,
          blurb: "",
          icon: item.icon
        }))
      )
    );
  }, [usesHrNav, usesEmployeeNav, hrNavSections, employeeNavSections, legacySixNavSections]);

  const dashboardNavItem = usesHrNav ? HR_NAV_DASHBOARD : NAV_EMPLOYEE_DASHBOARD;

  const [flyoutSectionId, setFlyoutSectionId] = useState<string | null>(null);

  const flyoutSection = useMemo((): SidebarFlyoutSection | null => {
    if (!flyoutSectionId) {
      return null;
    }
    return flyoutNavSections.find((s) => s.id === flyoutSectionId) ?? null;
  }, [flyoutNavSections, flyoutSectionId]);

  const toggleFlyoutSection = useCallback((sectionId: string): void => {
    setFlyoutSectionId((prev) => (prev === sectionId ? null : sectionId));
  }, []);

  const closeFlyout = useCallback((): void => {
    setFlyoutSectionId(null);
  }, []);

  const closeMobile = useCallback((): void => {
    setMobileOpen(false);
    setFlyoutSectionId(null);
  }, []);

  useEffect(() => {
    setFlyoutSectionId(null);
  }, [pathname]);

  const desktopAsideRef = useRef<HTMLElement | null>(null);
  const mobileNavScrollRef = useRef<HTMLDivElement | null>(null);
  const sidebarScrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSidebarScrollPositions = useCallback((): void => {
    const d = desktopAsideRef.current;
    if (d) {
      sessionStorage.setItem(SIDEBAR_SCROLL_DESKTOP_KEY, String(d.scrollTop));
    }
    const m = mobileNavScrollRef.current;
    if (m) {
      sessionStorage.setItem(SIDEBAR_SCROLL_MOBILE_KEY, String(m.scrollTop));
    }
  }, []);

  const schedulePersistSidebarScroll = useCallback((): void => {
    if (sidebarScrollDebounceRef.current) {
      clearTimeout(sidebarScrollDebounceRef.current);
    }
    sidebarScrollDebounceRef.current = setTimeout(() => {
      persistSidebarScrollPositions();
      sidebarScrollDebounceRef.current = null;
    }, 120);
  }, [persistSidebarScrollPositions]);

  useLayoutEffect(() => {
    const rawD = sessionStorage.getItem(SIDEBAR_SCROLL_DESKTOP_KEY);
    if (rawD != null && desktopAsideRef.current) {
      desktopAsideRef.current.scrollTop = parseInt(rawD, 10) || 0;
    }
    const rawM = sessionStorage.getItem(SIDEBAR_SCROLL_MOBILE_KEY);
    if (rawM != null && mobileNavScrollRef.current) {
      mobileNavScrollRef.current.scrollTop = parseInt(rawM, 10) || 0;
    }
  }, [pathname]);

  const sidebarPinsMode = usesHrNav ? "hr" : usesEmployeeNav ? "employee" : null;
  const activeTopSidebarPins = sidebarPinsMode === "hr" ? topSidebarPinsHr : topSidebarPinsEmployee;
  const showTopPinsBlock = Boolean(sidebarPinsMode);
  const showCategoryNav = flyoutNavSections.length > 0;

  const SidebarContent = (
    <div className="flex min-h-0 flex-col gap-1 py-4">
      <Link
        href="/mappa-portale"
        scroll={false}
        className="mb-3 flex items-center gap-2 px-3 transition-opacity hover:opacity-90"
        onClick={() => {
          persistSidebarScrollPositions();
          closeMobile();
        }}
      >
        <span
          className="nexa-wordmark-face text-[clamp(1.05rem,2.2vw,1.35rem)] font-semibold uppercase leading-none tracking-[0.08em] text-[var(--prom-text)]"
          style={synapseSuiteDisplayStyle}
        >
          SYNAPSE
        </span>
      </Link>
      <SidebarNavLink
        item={NAV_PORTAL_MAP}
        pathname={pathname}
        onNavigate={closeMobile}
        beforeNavigate={persistSidebarScrollPositions}
      />
      <SidebarNavLink
        item={dashboardNavItem}
        pathname={pathname}
        onNavigate={closeMobile}
        beforeNavigate={persistSidebarScrollPositions}
      />
      {showTopPinsBlock ? (
        <SidebarPillarNav
          availableTiles={allPinTiles}
          pinnedHrefs={activeTopSidebarPins}
          pathname={pathname}
          onNavigate={closeMobile}
          beforeNavigate={persistSidebarScrollPositions}
          onAddPin={(href) => {
            if (sidebarPinsMode) {
              addTopSidebarPin(sidebarPinsMode, String(href));
            }
          }}
          onRemovePin={(href) => {
            if (sidebarPinsMode) {
              removeTopSidebarPin(sidebarPinsMode, href);
            }
          }}
        />
      ) : null}
      {showCategoryNav ? <div className="my-2 border-t border-[var(--prom-line)]" /> : null}
      {flyoutNavSections.map((section) => (
        <SidebarMacroSectionButton
          key={section.id}
          section={section}
          pathname={pathname}
          flyoutOpen={flyoutSectionId === section.id}
          onToggle={toggleFlyoutSection}
        />
      ))}
      {usesHrNav ? (
        <>
          {sessionCanAccessNexaLifecycleHr(user ?? undefined) ? (
            <SidebarNavLink
              item={NAV_HEBB_AI_MATE}
              pathname={pathname}
              onNavigate={closeMobile}
              beforeNavigate={persistSidebarScrollPositions}
            />
          ) : null}
          {sessionCanAccessNexaAiAssistant(user ?? undefined) &&
          sessionCanUseNexaAiOpenAiLlm(user ?? undefined) ? (
            <SidebarNavLink
              item={NAV_HEBB_AI_SUPPORT}
              pathname={pathname}
              onNavigate={closeMobile}
              beforeNavigate={persistSidebarScrollPositions}
            />
          ) : null}
          {sessionCanAccessNexaReportsHr(user ?? undefined) &&
          sessionCanUseNexaAiOpenAiLlm(user ?? undefined) ? (
            <SidebarNavLink
              item={NAV_HEBB_AI_ANALYTICS}
              pathname={pathname}
              onNavigate={closeMobile}
              beforeNavigate={persistSidebarScrollPositions}
            />
          ) : null}
        </>
      ) : null}
      {showCategoryNav ? <div className="my-2 border-t border-[var(--prom-line)]" /> : null}
      {NAV_PROFILE_SECTION.items.map((item) => (
        <SidebarNavLink
          key={`settings-${item.href}`}
          item={item}
          pathname={pathname}
          onNavigate={closeMobile}
          beforeNavigate={persistSidebarScrollPositions}
        />
      ))}
    </div>
  );

  return (
    <div
      className="flex h-[100dvh] overflow-hidden"
      style={{ ["--nexa-sidebar-width" as string]: "12.5rem" }}
    >
      <SessionIdleGuard />
      {flyoutSection && !mobileOpen ? (
        <NexaNavSectionFlyout
          section={flyoutSection}
          pathname={pathname}
          open
          variant="desktop"
          onClose={closeFlyout}
          onNavigate={() => {
            persistSidebarScrollPositions();
            closeMobile();
          }}
        />
      ) : null}
      {flyoutSection && mobileOpen ? (
        <NexaNavSectionFlyout
          section={flyoutSection}
          pathname={pathname}
          open
          variant="mobile"
          onClose={closeFlyout}
          onNavigate={() => {
            persistSidebarScrollPositions();
            closeMobile();
          }}
        />
      ) : null}
      {!isPortalMap ? (
        <aside
          ref={desktopAsideRef}
          onScroll={schedulePersistSidebarScroll}
          style={{ ["--nexa-sidebar-width" as string]: "12.5rem" }}
          className="hidden h-full min-h-0 w-[200px] shrink-0 overflow-y-auto overscroll-y-contain border-r border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] md:block"
          aria-label="Navigazione principale"
        >
          {SidebarContent}
        </aside>
      ) : null}

      {!isPortalMap && mobileOpen ? (
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
          <div
            ref={mobileNavScrollRef}
            onScroll={schedulePersistSidebarScroll}
            className="relative flex h-full w-[min(100vw,280px)] flex-col overflow-y-auto border-r border-[var(--prom-line)] bg-[var(--prom-surface)] shadow-xl transition-transform duration-200"
          >
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
                    scroll={false}
                    onClick={() => {
                      persistSidebarScrollPositions();
                      closeMobile();
                    }}
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
            {!isPortalMap ? (
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
            ) : (
              <span className="h-9 w-9 shrink-0 md:hidden" aria-hidden />
            )}
            <Link
              href="/mappa-portale"
              scroll={false}
              className="hidden shrink-0 sm:block"
              aria-label="Dashboard"
            >
              <span
                className="nexa-wordmark-face text-[clamp(1.05rem,2.2vw,1.35rem)] font-semibold uppercase leading-none tracking-[0.08em] text-[var(--prom-text)]"
                style={synapseSuiteDisplayStyle}
              >
                SYNAPSE
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
                  placeholder="Cerca pagine, dipendenti, centri di costo…"
                  value={searchQ}
                  onChange={(e) => {
                    setSearchQ(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && mergedSearchResults[0]) {
                      router.push(mergedSearchResults[0].href as Route, { scroll: false });
                      setSearchQ("");
                      setSearchOpen(false);
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_88%,transparent)] py-2 pl-9 pr-3 text-sm text-[var(--prom-text)] outline-none ring-0 transition-[border-color,opacity] placeholder:text-[var(--prom-muted)] focus:border-[color-mix(in_srgb,var(--prom-gold)_45%,var(--prom-line-strong))]"
                />
              </div>
              {searchOpen && mergedSearchResults.length > 0 ? (
                <ul
                  className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] py-1 shadow-[var(--card-shadow)] transition-opacity"
                  role="listbox"
                >
                  {mergedSearchResults.map((r) => (
                    <li key={`${r.href}-${r.label}`} role="option">
                      <Link
                        href={r.href}
                        scroll={false}
                        className="block px-3 py-2 text-sm text-[var(--prom-text)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)]"
                        onClick={() => {
                          setSearchQ("");
                          setSearchOpen(false);
                        }}
                      >
                        <span className="block font-medium leading-snug">{r.label}</span>
                        {r.subtitle ? (
                          <span className="mt-0.5 block text-[11px] text-[var(--prom-muted)]">{r.subtitle}</span>
                        ) : null}
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

        <AppMainContentFrame>
          {isPortalMap ? (
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">{children}</main>
          ) : (
            <>
              <main className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6">{children}</main>
              <footer className="border-t border-[color-mix(in_srgb,var(--prom-line)_85%,transparent)] py-4 text-center text-xs text-[var(--prom-muted)] backdrop-blur-sm">
                © Nexa HR 2026
              </footer>
            </>
          )}
        </AppMainContentFrame>
      </div>
      <NexaGuidePanel />
    </div>
  );
}
