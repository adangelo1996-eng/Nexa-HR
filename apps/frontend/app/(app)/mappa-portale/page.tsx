"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { fetchCurrentUser } from "@/lib/api";
import {
  getSessionUser,
  getToken,
  sessionCanNexaAdmin,
  sessionIsPlainEmployee,
  sessionUsesHrReorganizedNav,
  type SessionUser
} from "@/lib/auth-session";
import {
  portalCategoryGlassColumnHeaderClass,
  portalCategoryTileTopAccentClass
} from "@/lib/nav-visual-accents";
import { groupPortalTiles, PORTAL_CATEGORY_ORDER } from "@/lib/portal-mappa";
import { buildAnalyticsPortalRow, buildLifecyclePortalColumns } from "@/lib/portal-mappa-lifecycle";
import { buildEmployeePortalHubColumns } from "@/lib/portal-mappa-employee";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

function TileCard(props: {
  href: Route;
  title: string;
  blurb: string;
  accentCategory: string;
}): React.JSX.Element {
  const { href, title, blurb, accentCategory } = props;
  return (
    <Link
      href={href}
      scroll={false}
      className={`group relative flex min-h-[128px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--card-shadow)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_28%,var(--prom-line-strong))] hover:shadow-[0_16px_40px_-20px_rgba(0,45,114,0.2)] ${portalCategoryTileTopAccentClass(accentCategory)}`}
    >
      <span className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--prom-text)]">{title}</span>
      {blurb ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--prom-muted)]">{blurb}</p>
      ) : null}
      <ArrowUpRight className="ml-auto mt-auto h-4 w-4 text-[var(--prom-muted)] opacity-50 group-hover:opacity-100" />
    </Link>
  );
}

function HubColumnCard(props: {
  hubHref: Route;
  title: string;
  subtitle: string;
  tileCount: number;
  accent: string;
}): React.JSX.Element {
  return (
    <Link
      href={props.hubHref}
      scroll={false}
      className={`flex min-h-[140px] flex-col justify-between rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-[var(--card-shadow)] transition hover:-translate-y-0.5 ${portalCategoryTileTopAccentClass(props.accent)}`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-200">{props.title}</p>
        <p className="mt-1 text-sm text-[var(--prom-muted)]">{props.subtitle}</p>
      </div>
      <p className="text-xs text-[var(--prom-muted)]">{props.tileCount} accessi rapidi →</p>
    </Link>
  );
}

export default function MappaPortalePage(): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [employeeView, setEmployeeView] = useState(false);

  useEffect(() => {
    setEmployeeView(sessionStorage.getItem(EMPLOYEE_VIEW_KEY) === "1");
    setUser(getSessionUser());
    const t = getToken();
    if (!t) return;
    void fetchCurrentUser(t)
      .then((u) => setUser(u))
      .catch(() => setUser(getSessionUser()));
  }, []);

  const hideSensitiveHr = Boolean(employeeView && sessionCanNexaAdmin(user ?? undefined));
  const usesHrNav = sessionUsesHrReorganizedNav(user, hideSensitiveHr);
  const usesEmployeePortal =
    hideSensitiveHr || sessionIsPlainEmployee(user ?? undefined) || !usesHrNav;

  const grouped = useMemo(() => groupPortalTiles(user, hideSensitiveHr), [user, hideSensitiveHr]);
  const lifecycleCols = useMemo(
    () => buildLifecyclePortalColumns(user, hideSensitiveHr),
    [user, hideSensitiveHr]
  );
  const analyticsRow = useMemo(() => buildAnalyticsPortalRow(user, hideSensitiveHr), [user, hideSensitiveHr]);
  const employeeHubs = useMemo(
    () => buildEmployeePortalHubColumns(user, hideSensitiveHr),
    [user, hideSensitiveHr]
  );

  return (
    <div className="relative isolate min-h-[72vh] overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,#002D72_14%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_90%,var(--prom-bg))] px-5 py-10 sm:px-10">
      <header className="relative z-[1] mx-auto max-w-3xl text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--prom-muted)]">Nexa HR</p>
        <h1
          className="mt-3 text-3xl font-semibold tracking-tight text-[#002D72] sm:text-4xl dark:text-white"
          style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
        >
          Mappa del portale
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--prom-muted)]">
          {usesEmployeePortal
            ? "Tre aree — Oggi, Io e Documenti — con le pagine che ti servono ogni giorno."
            : usesHrNav
              ? "Percorso del personale per fasi del ciclo di vita, con analytics dedicata."
              : "Accessi rapidi alle sezioni del tuo profilo."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px]">
          <span className="rounded-full border border-[var(--prom-line-strong)] px-3 py-1 text-[var(--prom-text)]">
            {user?.fullName ?? "Profilo…"}
          </span>
          {hideSensitiveHr ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-900 dark:text-amber-100">
              Vista dipendente
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative z-[1] mx-auto mt-12 max-w-6xl space-y-12">
        {usesEmployeePortal ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {employeeHubs.map((hub) => (
                <HubColumnCard
                  key={hub.id}
                  hubHref={hub.hubHref}
                  title={hub.title}
                  subtitle={hub.subtitle}
                  tileCount={hub.tiles.length}
                  accent={hub.title}
                />
              ))}
            </div>
            {employeeHubs.map((hub) => (
              <section key={`tiles-${hub.id}`}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div className={portalCategoryGlassColumnHeaderClass(hub.title, "compact")}>{hub.title}</div>
                  <Link href={hub.hubHref} className="text-xs text-[var(--prom-muted)] hover:text-[var(--prom-text)]">
                    Apri hub →
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {hub.tiles.map((tile) => (
                    <TileCard
                      key={String(tile.href)}
                      href={tile.href}
                      title={tile.title}
                      blurb={tile.blurb}
                      accentCategory={hub.title}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : usesHrNav ? (
          <>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-[min(100%,720px)] gap-3 md:min-w-0 md:grid md:grid-cols-5">
                {lifecycleCols.map((col) => (
                  <section
                    key={col.id}
                    className="min-w-[200px] flex-1 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)] p-3 md:min-w-0"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-200">
                      {col.title}
                    </p>
                    <p className="mb-3 text-[10px] text-[var(--prom-muted)]">{col.subtitle}</p>
                    <div className="space-y-2">
                      {col.tiles.map((tile) => (
                        <TileCard
                          key={String(tile.href)}
                          href={tile.href}
                          title={tile.title}
                          blurb={tile.blurb}
                          accentCategory="Persone"
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            {analyticsRow.length > 0 ? (
              <section>
                <div className="mb-4">
                  <span className={portalCategoryGlassColumnHeaderClass("HEBB AI for HR", "compact")}>
                    Analytics & Intelligence
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {analyticsRow.map((tile) => (
                    <TileCard
                      key={String(tile.href)}
                      href={tile.href}
                      title={tile.title}
                      blurb={tile.blurb}
                      accentCategory="HEBB AI for HR"
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          PORTAL_CATEGORY_ORDER.map((cat) => {
            const tiles = grouped.get(cat);
            if (!tiles?.length) return null;
            return (
              <section key={cat}>
                <div className="mb-4">
                  <span className={portalCategoryGlassColumnHeaderClass(cat, "default")}>{cat}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {tiles.map((tile) => (
                    <TileCard
                      key={String(tile.href)}
                      href={tile.href}
                      title={tile.title}
                      blurb={tile.blurb}
                      accentCategory={cat}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
