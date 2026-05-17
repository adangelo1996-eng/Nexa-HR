"use client";

import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { portalCategoryGlassColumnHeaderClass, portalCategoryTileTopAccentClass } from "@/lib/nav-visual-accents";
import type { HubTile, HubTileGroup } from "@/lib/nexa-hub-config";

type SectionHubPageProps = {
  title: string;
  subtitle: string;
  portalCategory?: string;
  tiles?: HubTile[];
  groups?: HubTileGroup[];
  backHref?: Route;
  backLabel?: string;
};

function HubTileLink(props: { tile: HubTile; accent: string }): React.JSX.Element {
  const { tile, accent } = props;
  const Icon = tile.icon;
  return (
    <Link
      href={tile.href}
      scroll={false}
      className={`group relative flex min-h-[112px] flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--card-shadow)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_28%,var(--prom-line-strong))] ${portalCategoryTileTopAccentClass(accent)}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-text)]">
          <Icon className="h-4 w-4 opacity-85" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold text-[var(--prom-text)]">{tile.label}</span>
          {tile.blurb ? (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-[var(--prom-muted)]">{tile.blurb}</p>
          ) : null}
        </div>
      </div>
      <ArrowUpRight className="ml-auto mt-3 h-4 w-4 text-[var(--prom-muted)] opacity-55 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export function SectionHubPage(props: SectionHubPageProps): React.JSX.Element {
  const { title, subtitle, portalCategory, tiles, groups, backHref, backLabel } = props;
  const accent = portalCategory ?? "Quotidiano";
  const flatTiles = tiles ?? groups?.flatMap((g) => g.items) ?? [];
  const hasGroups = Boolean(groups && groups.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {backHref ? (
        <p className="text-sm">
          <Link
            href={backHref}
            className="text-[var(--prom-muted)] underline-offset-2 hover:text-[var(--prom-text)] hover:underline"
          >
            {backLabel ?? "← Indietro"}
          </Link>
        </p>
      ) : null}

      <header className="space-y-2">
        {portalCategory ? (
          <div className="inline-block">
            <span className={portalCategoryGlassColumnHeaderClass(accent, "compact")}>{portalCategory}</span>
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--prom-text)] sm:text-3xl">{title}</h1>
        <p className="max-w-xl text-sm leading-relaxed text-[var(--prom-muted)]">{subtitle}</p>
      </header>

      {flatTiles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--prom-line)] px-4 py-8 text-center text-sm text-[var(--prom-muted)]">
          Nessuna pagina disponibile per il tuo profilo.
        </p>
      ) : hasGroups ? (
        <div className="space-y-8">
          {groups!.map((group) => (
            <section key={group.title}>
              {group.title ? (
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  {group.title}
                </h2>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((tile) => (
                  <HubTileLink key={String(tile.href)} tile={tile} accent={accent} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {flatTiles.map((tile) => (
            <HubTileLink key={String(tile.href)} tile={tile} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}
