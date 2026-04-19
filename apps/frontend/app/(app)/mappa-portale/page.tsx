"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { fetchCurrentUser } from "@/lib/api";
import { getSessionUser, getToken, sessionCanNexaAdmin, type SessionUser } from "@/lib/auth-session";
import { groupPortalTiles, PORTAL_CATEGORY_ORDER } from "@/lib/portal-mappa";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

export default function MappaPortalePage(): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const [employeeView, setEmployeeView] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmployeeView(sessionStorage.getItem(EMPLOYEE_VIEW_KEY) === "1");
    }
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
    <div className="relative isolate min-h-[72vh] overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,#002D72_28%,var(--prom-line))] bg-[color-mix(in_srgb,#020b1a_96%,var(--prom-surface))] px-4 py-8 sm:px-8">
      <div
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#002D72] opacity-[0.22] blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-sky-500 opacity-[0.12] blur-[110px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-px w-[min(120%,900px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#002D72]/40 to-transparent"
        aria-hidden
      />

      <header className="relative z-[1] mx-auto max-w-4xl text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-sky-200/80">Synapse · Nexa HR</p>
        <h1
          className="mt-3 bg-gradient-to-br from-white via-sky-100 to-[#7eb8ff] bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl"
          style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
        >
          Mappa del portale
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-sky-100/75">
          Ogni riquadro è un accesso rapido. Passa il cursore per leggere in dissolvenza a cosa serve la pagina, prima
          di aprirla.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-sky-200/70">
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1">
            {user?.fullName ?? "Caricamento profilo…"}
          </span>
          {hideSensitiveHr ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-100/90">
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
              <h2 className="mb-5 flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-200/85">
                <span className="h-px flex-1 max-w-[4rem] bg-gradient-to-r from-[#002D72] to-transparent" />
                {cat}
                <span className="h-px flex-1 bg-gradient-to-l from-[#002D72]/60 to-transparent" />
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tiles.map((tile) => (
                  <Link
                    key={tile.href}
                    href={tile.href}
                    scroll={false}
                    className="group relative flex min-h-[148px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--prom-surface)_55%,#03152d)_0%,color-mix(in_srgb,#002D72_12%,transparent)_120%)] p-5 text-left shadow-[0_16px_40px_-24px_rgba(0,0,0,0.85)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_45%,transparent)] hover:shadow-[0_28px_60px_-28px_rgba(0,45,114,0.55)]"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(120% 80% at 90% 0%, rgba(0,45,114,0.35), transparent 55%), radial-gradient(80% 60% at 0% 100%, rgba(56,189,248,0.12), transparent 50%)"
                      }}
                    />
                    <div className="relative z-[1] flex flex-1 flex-col">
                      <span className="line-clamp-2 text-base font-semibold leading-snug text-white">{tile.title}</span>
                      <ArrowUpRight className="ml-auto mt-3 h-5 w-5 shrink-0 text-sky-300/50 transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-sky-200" />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] p-4 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 translate-y-2">
                      <div className="rounded-xl border border-sky-300/25 bg-slate-950/92 px-3 py-2.5 text-xs leading-snug text-sky-50 shadow-xl backdrop-blur-md ring-1 ring-[#002D72]/30">
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
