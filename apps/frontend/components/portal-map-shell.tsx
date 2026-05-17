"use client";

import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import {
  portalCategoryGlassColumnHeaderClass,
  portalCategoryTileTopAccentClass
} from "@/lib/nav-visual-accents";

export function PortalMapShell(props: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const { children, className } = props;
  return (
    <div className={`relative isolate overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,#002D72_18%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_88%,var(--prom-bg))] px-4 py-8 shadow-[var(--card-shadow)] sm:px-8 ${className ?? ""}`}>
      <div
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#002D72] opacity-[0.07] blur-[100px] dark:opacity-[0.22]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-[color-mix(in_srgb,var(--prom-gold)_40%,#002D72)] opacity-[0.06] blur-[90px] dark:opacity-[0.14]"
        aria-hidden
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export function PortalMapHeader(props: {
  title: string;
  subtitle: string;
  profileName?: string;
  badge?: React.ReactNode;
}): React.JSX.Element {
  const { title, subtitle, profileName, badge } = props;
  return (
    <header className="mx-auto max-w-4xl text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--prom-muted)]">
        Synapse · Nexa HR
      </p>
      <h1
        className="mt-3 text-3xl font-semibold tracking-tight text-[#002D72] sm:text-4xl dark:bg-gradient-to-br dark:from-white dark:via-sky-100 dark:to-[#7eb8ff] dark:bg-clip-text dark:text-transparent"
        style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
      >
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--prom-muted)]">{subtitle}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-[var(--prom-muted)]">
        {profileName ? (
          <span className="rounded-full border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,var(--prom-gold)_6%)] px-3 py-1 text-[var(--prom-text)]">
            {profileName}
          </span>
        ) : null}
        {badge}
      </div>
    </header>
  );
}

export function PortalMapTile(props: {
  href: Route;
  title: string;
  blurb: string;
  accentCategory: string;
  icon?: LucideIcon;
}): React.JSX.Element {
  const { href, title, blurb, accentCategory, icon: Icon } = props;
  return (
    <Link
      href={href}
      scroll={false}
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)"
      }}
      className={`group relative flex min-h-[128px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] p-4 text-left transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_32%,var(--prom-line-strong))] hover:shadow-[0_20px_44px_-18px_rgba(0,45,114,0.18)] dark:hover:border-[color-mix(in_srgb,#002D72_45%,transparent)] dark:hover:shadow-[0_28px_60px_-28px_rgba(0,45,114,0.55)] ${portalCategoryTileTopAccentClass(accentCategory)}`}
    >
      <div className="relative z-[1] flex flex-1 flex-col gap-2">
        {Icon ? (
          <Icon className="h-5 w-5 shrink-0 text-[color-mix(in_srgb,#002D72_55%,var(--prom-muted))] dark:text-sky-300/70" aria-hidden />
        ) : null}
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--prom-text)]">{title}</span>
        <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-[color-mix(in_srgb,#002D72_50%,var(--prom-muted))] dark:text-sky-300/55" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] translate-y-2 p-3 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100">
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-xs leading-snug text-[var(--prom-text)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          {blurb}
        </div>
      </div>
    </Link>
  );
}

export function PortalMapColumnSection(props: {
  title: string;
  subtitle?: string;
  accentCategory: string;
  children: React.ReactNode;
  compact?: boolean;
  tilesClassName?: string;
}): React.JSX.Element {
  const { title, subtitle, accentCategory, children, compact, tilesClassName } = props;
  const tilesLayout =
    tilesClassName ?? (compact ? "space-y-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3");
  return (
    <section
      className={`rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] ${compact ? "min-w-[200px] flex-1 p-3" : "p-4 md:p-5"}`}
    >
      <div className={compact ? "mb-3" : "mb-5"}>
        {compact ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-200">{title}</p>
            {subtitle ? <p className="text-[10px] text-[var(--prom-muted)]">{subtitle}</p> : null}
          </>
        ) : (
          <div className={portalCategoryGlassColumnHeaderClass(accentCategory, "default")}>{title}</div>
        )}
      </div>
      <div className={tilesLayout}>{children}</div>
    </section>
  );
}
