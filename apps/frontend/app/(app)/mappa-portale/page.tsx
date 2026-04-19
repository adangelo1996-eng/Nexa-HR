"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { fetchCurrentUser } from "@/lib/api";
import { getSessionUser, getToken, sessionCanNexaAdmin, type SessionUser } from "@/lib/auth-session";
import {
  portalCategoryGlassColumnHeaderClass,
  portalCategoryTileTopAccentClass
} from "@/lib/nav-visual-accents";
import { groupPortalTiles, PORTAL_CATEGORY_ORDER } from "@/lib/portal-mappa";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

export default function MappaPortalePage(): React.JSX.Element {
  /** Mai leggere localStorage nello initializer: sul server è sempre null e sul client no → hydration #418. */
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

  const grouped = useMemo(() => groupPortalTiles(user, hideSensitiveHr), [user, hideSensitiveHr]);

  return (
    <div className="relative isolate min-h-[72vh] overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,#002D72_18%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_88%,var(--prom-bg))] px-4 py-8 shadow-[var(--card-shadow)] sm:px-8">
      <div
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#002D72] opacity-[0.07] blur-[100px] dark:opacity-[0.22]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-sky-500 opacity-[0.05] blur-[110px] dark:opacity-[0.12]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-px w-[min(120%,900px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,#002D72_22%,transparent)] to-transparent dark:via-[color-mix(in_srgb,#002D72_45%,transparent)]"
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
          Ogni riquadro è un accesso rapido. Passa il cursore per leggere in dissolvenza a cosa serve la pagina, prima
          di aprirla.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-[var(--prom-muted)]">
          <span className="rounded-full border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,var(--prom-gold)_6%)] px-3 py-1 text-[var(--prom-text)]">
            {user?.fullName ?? "Caricamento profilo…"}
          </span>
          <Link
            href="/settings"
            scroll={false}
            className="rounded-full border border-[color-mix(in_srgb,#002D72_35%,var(--prom-line-strong))] bg-[color-mix(in_srgb,#002D72_10%,var(--prom-surface))] px-3 py-1 font-medium text-[#002D72] backdrop-blur-sm transition-colors hover:border-[color-mix(in_srgb,#002D72_50%,var(--prom-line-strong))] hover:bg-[color-mix(in_srgb,#002D72_14%,var(--prom-surface))] dark:border-sky-400/35 dark:bg-sky-500/15 dark:text-sky-100 dark:hover:border-sky-300/50 dark:hover:bg-sky-500/25"
          >
            Impostazioni
          </Link>
          {hideSensitiveHr ? (
            <span className="rounded-full border border-amber-500/35 bg-amber-500/12 px-3 py-1 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100/90">
              Vista dipendente: sezioni HR riservate nascoste
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative z-[1] mx-auto mt-12 max-w-6xl space-y-14">
        {PORTAL_CATEGORY_ORDER.map((cat) => {
          const tiles = grouped.get(cat);
          if (!tiles?.length) return null;
          return (
            <section key={cat}>
              <div className="mb-5">
                <div className={portalCategoryGlassColumnHeaderClass(cat, "default")}>{cat}</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tiles.map((tile) => (
                  <Link
                    key={String(tile.href)}
                    href={tile.href}
                    scroll={false}
                    style={{
                      background: "var(--card-bg)",
                      boxShadow: "var(--card-shadow)"
                    }}
                    className={`group relative flex min-h-[148px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] p-5 text-left transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_32%,var(--prom-line-strong))] hover:shadow-[0_20px_44px_-18px_rgba(0,45,114,0.18)] dark:hover:border-[color-mix(in_srgb,#002D72_45%,transparent)] dark:hover:shadow-[0_28px_60px_-28px_rgba(0,45,114,0.55)] ${portalCategoryTileTopAccentClass(cat)}`}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:hidden"
                      style={{
                        background:
                          "radial-gradient(120% 80% at 90% 0%, rgba(0,45,114,0.14), transparent 55%), radial-gradient(80% 60% at 0% 100%, rgba(56,189,248,0.1), transparent 50%)"
                      }}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:block"
                      style={{
                        background:
                          "radial-gradient(120% 80% at 90% 0%, rgba(0,45,114,0.35), transparent 55%), radial-gradient(80% 60% at 0% 100%, rgba(56,189,248,0.12), transparent 50%)"
                      }}
                    />
                    <div className="relative z-[1] flex flex-1 flex-col">
                      <span className="line-clamp-2 text-base font-semibold leading-snug text-[var(--prom-text)]">
                        {tile.title}
                      </span>
                      <ArrowUpRight className="ml-auto mt-3 h-5 w-5 shrink-0 text-[color-mix(in_srgb,#002D72_50%,var(--prom-muted))] transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#002D72] dark:text-sky-300/55 dark:group-hover:text-sky-200" />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] p-4 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 translate-y-2">
                      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-xs leading-snug text-[var(--prom-text)] shadow-[var(--glass-shadow)] backdrop-blur-md dark:border-sky-300/25 dark:bg-slate-950/92 dark:text-sky-50 dark:shadow-xl dark:ring-1 dark:ring-[#002D72]/30">
                        {tile.blurb}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
