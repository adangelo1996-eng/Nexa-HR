"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { fetchCurrentUser } from "@/lib/api";
import { getSessionUser, getToken, sessionCanNexaAdmin, sessionUsesHrReorganizedNav, type SessionUser } from "@/lib/auth-session";
import {
  portalCategoryGlassColumnHeaderClass,
  portalCategoryTileTopAccentClass
} from "@/lib/nav-visual-accents";
import { groupPortalTiles, PORTAL_CATEGORY_ORDER } from "@/lib/portal-mappa";
import { buildAnalyticsPortalRow, buildLifecyclePortalColumns } from "@/lib/portal-mappa-lifecycle";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

function TileCard(props: { href: Route; title: string; blurb: string; accentCategory: string }): React.JSX.Element {
  const { href, title, blurb, accentCategory } = props;
  return (
    <Link
      href={href}
      scroll={false}
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)"
      }}
      className={`group relative flex min-h-[132px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] p-4 text-left transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_32%,var(--prom-line-strong))] hover:shadow-[0_20px_44px_-18px_rgba(0,45,114,0.18)] dark:hover:border-[color-mix(in_srgb,#002D72_45%,transparent)] dark:hover:shadow-[0_28px_60px_-28px_rgba(0,45,114,0.55)] ${portalCategoryTileTopAccentClass(accentCategory)}`}
    >
      <div className="relative z-[1] flex flex-1 flex-col">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--prom-text)]">{title}</span>
        <ArrowUpRight className="ml-auto mt-2 h-4 w-4 shrink-0 text-[color-mix(in_srgb,#002D72_50%,var(--prom-muted))] dark:text-sky-300/55" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] p-3 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 translate-y-2">
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-xs leading-snug text-[var(--prom-text)] shadow-[var(--glass-shadow)] backdrop-blur-md">
          {blurb}
        </div>
      </div>
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
    if (!t) {
      return;
    }
    void fetchCurrentUser(t)
      .then((u) => setUser(u))
      .catch(() => setUser(getSessionUser()));
  }, []);

  const hideSensitiveHr = Boolean(employeeView && sessionCanNexaAdmin(user ?? undefined));
  const usesLifecycle = sessionUsesHrReorganizedNav(user, hideSensitiveHr);

  const grouped = useMemo(() => groupPortalTiles(user, hideSensitiveHr), [user, hideSensitiveHr]);
  const lifecycleCols = useMemo(
    () => buildLifecyclePortalColumns(user, hideSensitiveHr),
    [user, hideSensitiveHr]
  );
  const analyticsRow = useMemo(() => buildAnalyticsPortalRow(user, hideSensitiveHr), [user, hideSensitiveHr]);

  return (
    <div className="relative isolate min-h-[72vh] overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,#002D72_18%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_88%,var(--prom-bg))] px-4 py-8 shadow-[var(--card-shadow)] sm:px-8">
      <div
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#002D72] opacity-[0.07] blur-[100px] dark:opacity-[0.22]"
        aria-hidden
      />
      <header className="relative z-[1] mx-auto max-w-4xl text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--prom-muted)]">
          Synapse · Nexa HR
        </p>
        <h1
          className="mt-3 text-3xl font-semibold tracking-tight text-[#002D72] sm:text-4xl dark:bg-gradient-to-br dark:from-white dark:via-sky-100 dark:to-[#7eb8ff] dark:bg-clip-text dark:text-transparent"
          style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
        >
          Mappa del portale
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--prom-muted)]">
          {usesLifecycle
            ? "Percorso del personale per fasi del ciclo di vita, con riga dedicata ad Analytics & Intelligence."
            : "Ogni riquadro è un accesso rapido alle sezioni consentite dal tuo profilo."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-[var(--prom-muted)]">
          <span className="rounded-full border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,var(--prom-gold)_6%)] px-3 py-1 text-[var(--prom-text)]">
            {user?.fullName ?? "Caricamento profilo…"}
          </span>
          {hideSensitiveHr ? (
            <span className="rounded-full border border-amber-500/35 bg-amber-500/12 px-3 py-1 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100/90">
              Vista dipendente: sezioni HR riservate nascoste
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative z-[1] mx-auto mt-12 max-w-6xl space-y-14">
        {usesLifecycle ? (
          <>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-[min(100%,720px)] gap-3 md:min-w-0 md:grid md:grid-cols-5">
                {lifecycleCols.map((col) => (
                  <section
                    key={col.id}
                    className="min-w-[200px] flex-1 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] p-3 md:min-w-0"
                  >
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-200">
                        {col.title}
                      </p>
                      <p className="text-[10px] text-[var(--prom-muted)]">{col.subtitle}</p>
                    </div>
                    <div className="space-y-2">
                      {col.tiles.map((tile) => (
                        <TileCard
                          key={String(tile.href)}
                          href={tile.href}
                          title={tile.title}
                          blurb={tile.blurb}
                          accentCategory="Persone e organizzazione"
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            {analyticsRow.length > 0 ? (
              <section>
                <div className="mb-5">
                  <div className={portalCategoryGlassColumnHeaderClass("HEBB AI for HR", "default")}>
                    Analytics & Intelligence
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <div className="mb-5">
                  <div className={portalCategoryGlassColumnHeaderClass(cat, "default")}>{cat}</div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
