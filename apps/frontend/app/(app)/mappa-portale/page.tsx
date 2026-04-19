"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PortalConceptMap } from "@/components/portal-concept-map";
import { fetchCurrentUser } from "@/lib/api";
import { getSessionUser, getToken, sessionCanNexaAdmin, type SessionUser } from "@/lib/auth-session";
import { portalCategoryGlassColumnHeaderClass } from "@/lib/nav-visual-accents";
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
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,#020b1a_96%,var(--prom-surface))]">
      <div
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#002D72] opacity-[0.2] blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-sky-500 opacity-[0.1] blur-[110px]"
        aria-hidden
      />

      <PortalConceptMap className="min-h-0 flex-1">
        <div className="relative box-border min-h-full px-4 py-5 sm:px-6 sm:py-6">
          <header className="pointer-events-auto relative z-[2] mx-auto mb-8 max-w-2xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-sky-200/75">Synapse · Nexa HR</p>
            <h1
              className="mt-2 bg-gradient-to-br from-white via-sky-100 to-[#7eb8ff] bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
              style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
            >
              Mappa del portale
            </h1>
            <p className="mx-auto mt-2 max-w-lg text-xs text-sky-100/65 sm:text-sm">
              Sei aree tematiche. Trascina per spostarti se serve più spazio.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-sky-200/65">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 backdrop-blur-sm">
                {user?.fullName ?? "Profilo…"}
              </span>
              {hideSensitiveHr ? (
                <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-100/85 backdrop-blur-sm">
                  Vista dipendente
                </span>
              ) : null}
            </div>
          </header>

          <div className="relative z-[1] mx-auto w-[min(100%,1320px)]">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {PORTAL_CATEGORY_ORDER.map((cat) => {
                const tiles = grouped.get(cat);
                return (
                  <div key={cat} className="flex min-w-0 flex-col gap-2">
                    <div className={portalCategoryGlassColumnHeaderClass(cat, "default")}>{cat}</div>
                    <ul className="flex flex-col gap-1.5">
                      {tiles?.length ? (
                        tiles.map((tile) => (
                          <li key={String(tile.href)}>
                            <Link
                              href={tile.href}
                              scroll={false}
                              className="block rounded-lg border border-transparent px-2 py-1.5 text-left text-[13px] leading-snug text-sky-100/85 transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                            >
                              {tile.title}
                            </Link>
                          </li>
                        ))
                      ) : (
                        <li className="px-2 py-1.5 text-[12px] text-sky-200/35">—</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </PortalConceptMap>
    </div>
  );
}
