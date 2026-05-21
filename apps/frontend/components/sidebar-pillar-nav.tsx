"use client";

import type { Route } from "next";
import Link from "next/link";
import { Home, Plus, X } from "lucide-react";
import type { HubTile } from "@/lib/nexa-hub-config";
import { SidebarPinPicker } from "@/components/sidebar-pin-picker";
import { useState } from "react";

function pathActive(pathname: string, href: Route, exact?: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

type SidebarPillarNavProps = {
  sectionId: string;
  title: string;
  hubHref: Route;
  portalCategory?: string;
  mapLabel?: string;
  availableTiles: HubTile[];
  pinnedHrefs: string[];
  pathname: string;
  onNavigate: () => void;
  beforeNavigate?: () => void;
  onAddPin: (href: Route) => void;
  onRemovePin: (href: string) => void;
};

export function SidebarPillarNav(props: SidebarPillarNavProps): React.JSX.Element {
  const {
    sectionId,
    title,
    hubHref,
    portalCategory,
    mapLabel = "Mappa del portale",
    availableTiles,
    pinnedHrefs,
    pathname,
    onNavigate,
    beforeNavigate,
    onAddPin,
    onRemovePin
  } = props;

  const [pickerOpen, setPickerOpen] = useState(false);
  const tileByHref = new Map(availableTiles.map((t) => [String(t.href), t]));
  const pinnedTiles = pinnedHrefs
    .map((href) => tileByHref.get(href))
    .filter((t): t is HubTile => Boolean(t));

  const childHrefs = [hubHref, ...pinnedHrefs.map((h) => h as Route)];
  const sectionActive = childHrefs.some((href) => pathActive(pathname, href));

  return (
    <div className="py-0.5" data-sidebar-section={sectionId}>
      <div
        className={`mx-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${
          sectionActive ? "text-[var(--prom-text)]" : "text-[var(--prom-muted)]"
        }`}
      >
        {title}
      </div>
      <Link
        href={hubHref}
        scroll={false}
        onClick={() => {
          beforeNavigate?.();
          onNavigate();
        }}
        className={`mx-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-[background,opacity] duration-200 ${
          pathActive(pathname, hubHref)
            ? "bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] text-[var(--prom-text)]"
            : "text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:text-[var(--prom-text)]"
        }`}
      >
        <Home className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <span>{mapLabel}</span>
      </Link>
      {pinnedTiles.map((tile) => {
        const Icon = tile.icon;
        const href = tile.href;
        const active = pathActive(pathname, href);
        return (
          <div key={String(href)} className="group relative mx-2">
            <Link
              href={href}
              scroll={false}
              onClick={() => {
                beforeNavigate?.();
                onNavigate();
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 pr-9 text-sm transition-[background,opacity] duration-200 ${
                active
                  ? "bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] text-[var(--prom-text)]"
                  : "text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:text-[var(--prom-text)]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="truncate">{tile.label}</span>
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemovePin(String(href));
              }}
              className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--prom-muted)] opacity-0 transition-opacity hover:bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:text-[var(--prom-text)] group-hover:opacity-100 focus:opacity-100"
              aria-label={`Rimuovi ${tile.label} dai preferiti`}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
      {pinnedHrefs.length < 8 && availableTiles.length > pinnedHrefs.length ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mx-2 mt-0.5 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-dashed border-[var(--prom-line-strong)] px-3 py-2 text-sm text-[var(--prom-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--prom-gold)_35%,var(--prom-line-strong))] hover:text-[var(--prom-text)]"
          aria-label={`Aggiungi pagina in ${title}`}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          <span>Aggiungi</span>
        </button>
      ) : null}
      <SidebarPinPicker
        open={pickerOpen}
        sectionTitle={title}
        portalCategory={portalCategory}
        tiles={availableTiles}
        pinnedHrefs={pinnedHrefs}
        onClose={() => setPickerOpen(false)}
        onPin={onAddPin}
      />
    </div>
  );
}
