"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { PortalMapNavSection } from "@/lib/nexa-portal-map-nav";
import {
  portalAccentCategoryForNavSection,
  portalCategoryGlassColumnHeaderClass,
  portalCategoryTileTopAccentClass
} from "@/lib/nav-visual-accents";
import type { SixCatNavSection } from "@/lib/nexa-six-category-nav";

export type NexaNavFlyoutSection = PortalMapNavSection | SixCatNavSection;

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

function FlyoutTile(props: {
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
      className={`group flex min-h-[88px] flex-col rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 shadow-[var(--card-shadow)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_28%,var(--prom-line-strong))] ${portalCategoryTileTopAccentClass(accentCategory)} ${
        active ? "ring-1 ring-[color-mix(in_srgb,var(--prom-gold)_45%,transparent)]" : ""
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 text-[color-mix(in_srgb,#002D72_50%,var(--prom-muted))] dark:text-sky-300/65" aria-hidden />
      <span className="mt-2 line-clamp-2 flex-1 text-xs font-semibold leading-snug text-[var(--prom-text)]">
        {label}
      </span>
      <ArrowUpRight className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 text-[var(--prom-muted)] opacity-50 group-hover:opacity-100" />
    </Link>
  );
}

export function NexaNavSectionFlyout(props: {
  section: NexaNavFlyoutSection;
  pathname: string;
  open: boolean;
  onClose: () => void;
  onNavigate: () => void;
  /** Desktop: panel a destra della sidebar (~200px). Mobile: overlay a tutta larghezza. */
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
    ? "fixed inset-y-0 right-0 z-[60] flex w-[min(100vw,320px)] flex-col border-l border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)] shadow-2xl backdrop-blur-xl md:hidden"
    : "fixed inset-y-0 left-[200px] z-[45] hidden w-[min(360px,calc(100vw-200px))] flex-col border-r border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)] shadow-[8px_0_32px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl md:flex";

  return (
    <>
      <button
        type="button"
        className={
          isMobile
            ? "fixed inset-0 z-[55] bg-black/45 backdrop-blur-[2px] md:hidden"
            : "fixed inset-0 z-[40] hidden bg-black/20 md:block md:left-[200px]"
        }
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
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2 border-b border-[var(--prom-line)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className={portalCategoryGlassColumnHeaderClass(accent, "compact")}>
                <span id={titleId}>{section.title}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-[var(--prom-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] hover:text-[var(--prom-text)]"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
            <div className="space-y-5">
              {section.subgroups.map((sg) => (
                <div key={`${section.id}-${sg.id}`}>
                  {sg.title ? (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                      {sg.title}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    {sg.items.map((item) => (
                      <FlyoutTile
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
