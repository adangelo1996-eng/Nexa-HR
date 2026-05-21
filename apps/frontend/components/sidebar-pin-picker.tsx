"use client";

import type { Route } from "next";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portalCategoryTileTopAccentClass } from "@/lib/nav-visual-accents";
import type { HubTile } from "@/lib/nexa-hub-config";

type SidebarPinPickerProps = {
  open: boolean;
  sectionTitle: string;
  portalCategory?: string;
  tiles: HubTile[];
  pinnedHrefs: string[];
  onClose: () => void;
  onPin: (href: Route) => void;
};

export function SidebarPinPicker(props: SidebarPinPickerProps): React.JSX.Element | null {
  const { open, sectionTitle, portalCategory, tiles, pinnedHrefs, onClose, onPin } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const accent = portalCategory ?? "Quotidiano";
  const unpinned = tiles.filter((t) => !pinnedHrefs.includes(String(t.href)));

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
    function onDocClick(e: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center"
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidebar-pin-picker-title"
        className="flex max-h-[min(85dvh,520px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--prom-surface)] shadow-[var(--card-shadow)]"
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--prom-line)] px-4 py-3">
          <div>
            <h2 id="sidebar-pin-picker-title" className="text-sm font-semibold text-[var(--prom-text)]">
              Aggiungi scorciatoia
            </h2>
            <p className="mt-0.5 text-xs text-[var(--prom-muted)]">{sectionTitle}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-full p-0"
            onClick={onClose}
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {unpinned.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-[var(--prom-muted)]">
              Nessuna pagina disponibile da aggiungere.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {unpinned.map((tile) => {
                const Icon = tile.icon;
                return (
                  <button
                    key={String(tile.href)}
                    type="button"
                    onClick={() => {
                      onPin(tile.href);
                      onClose();
                    }}
                    className={`group relative flex min-h-[96px] flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left shadow-[var(--card-shadow)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_28%,var(--prom-line-strong))] ${portalCategoryTileTopAccentClass(accent)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-text)]">
                        <Icon className="h-4 w-4 opacity-85" aria-hidden />
                      </span>
                      <span className="line-clamp-2 text-sm font-semibold text-[var(--prom-text)]">{tile.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
