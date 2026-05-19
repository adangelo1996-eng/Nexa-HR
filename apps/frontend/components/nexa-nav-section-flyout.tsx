"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import type { PortalMapNavSection } from "@/lib/nexa-portal-map-nav";
import {
  portalAccentCategoryForNavSection,
  portalCategoryAccentClass,
  portalCategoryFlyoutAccentBarClass,
  portalSubgroupGlassClass
} from "@/lib/nav-visual-accents";
import type { SixCatNavSection } from "@/lib/nexa-six-category-nav";

export type NexaNavFlyoutSection = PortalMapNavSection | SixCatNavSection;

const SIDEBAR_OFFSET = "var(--nexa-sidebar-width, 15.5rem)";

function pathActive(pathname: string, href: Route, exact?: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function accentForSection(section: NexaNavFlyoutSection): string {
  if ("portalCategory" in section && section.portalCategory) {
    return section.portalCategory;
  }
  return portalAccentCategoryForNavSection(section.id, section.title);
}

function FlyoutLink(props: {
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  accentCategory: string;
  pathname: string;
  onNavigate: () => void;
}): React.JSX.Element {
  const { href, label, icon: Icon, exact, accentCategory, pathname, onNavigate } = props;
  const active = pathActive(pathname, href, exact);
  return (
    <Link
      href={href}
      scroll={false}
      onClick={onNavigate}
      className={`nexa-nav-flyout-link group border-l-2 ${portalCategoryFlyoutAccentBarClass(accentCategory)} ${
        active ? "nexa-nav-flyout-link--active" : "border-l-transparent"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <span className="nexa-nav-flyout-link__icon">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight
        className="h-3.5 w-3.5 shrink-0 text-[var(--prom-muted)] opacity-0 transition-opacity group-hover:opacity-60"
        aria-hidden
      />
    </Link>
  );
}

export function NexaNavSectionFlyout(props: {
  section: NexaNavFlyoutSection;
  pathname: string;
  open: boolean;
  onClose: () => void;
  onNavigate: () => void;
  /** Desktop: panel a destra della sidebar. Mobile: overlay a tutta larghezza. */
  variant?: "desktop" | "mobile";
}): React.JSX.Element | null {
  const { section, pathname, open, onClose, onNavigate, variant = "desktop" } = props;
  const panelRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const accent = accentForSection(section);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const t = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) {
    return null;
  }

  const isMobile = variant === "mobile";
  const panelClass = isMobile
    ? "nexa-nav-flyout fixed inset-y-0 right-0 z-[60] flex w-[min(100vw,22rem)] flex-col border-l border-[var(--prom-line)] shadow-2xl md:hidden"
    : "nexa-nav-flyout fixed inset-y-0 z-[45] hidden w-[min(22rem,calc(100vw-var(--nexa-sidebar-width,15.5rem)))] flex-col border-r border-[var(--prom-line)] shadow-[6px_0_28px_-10px_rgba(0,0,0,0.28)] md:flex";

  const panelStyle = isMobile ? undefined : { left: SIDEBAR_OFFSET };

  return (
    <>
      <button
        type="button"
        className={
          isMobile
            ? "fixed inset-0 z-[55] bg-black/40 backdrop-blur-[3px] md:hidden"
            : "fixed inset-y-0 right-0 z-[40] hidden bg-black/15 backdrop-blur-[1px] md:block"
        }
        style={isMobile ? undefined : { left: SIDEBAR_OFFSET }}
        aria-label="Chiudi pannello navigazione"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={panelClass}
        style={panelStyle}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={`flex items-center justify-between gap-3 border-b border-[var(--prom-line)] px-4 py-3.5 ${portalCategoryFlyoutAccentBarClass(accent)} border-l-[3px] pl-[calc(1rem-3px)]`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--prom-muted)]">
                Sezione
              </p>
              <h2
                id={titleId}
                className={`mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-[-0.02em] ${portalCategoryAccentClass(accent)}`}
              >
                {section.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-[var(--prom-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] hover:text-[var(--prom-text)]"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
            <div className="space-y-4">
              {section.subgroups.map((sg) => (
                <div key={`${section.id}-${sg.id}`}>
                  {sg.title ? (
                    <p className={portalSubgroupGlassClass(accent, "compact")}>{sg.title}</p>
                  ) : null}
                  <nav className="flex flex-col gap-0.5" aria-label={sg.title ?? section.title}>
                    {sg.items.map((item) => (
                      <FlyoutLink
                        key={`${section.id}-${sg.id}-${String(item.href)}`}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        exact={item.exact}
                        accentCategory={accent}
                        pathname={pathname}
                        onNavigate={() => {
                          onNavigate();
                          onClose();
                        }}
                      />
                    ))}
                  </nav>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
