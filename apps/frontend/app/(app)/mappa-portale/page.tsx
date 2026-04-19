"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchCurrentUser } from "@/lib/api";
import { getSessionUser, getToken, sessionCanNexaAdmin, type SessionUser } from "@/lib/auth-session";
import {
  portalCategoryGlassColumnHeaderClass,
  portalLeafLinkClass,
  portalSubgroupGlassClass
} from "@/lib/nav-visual-accents";
import { buildPortalColumns } from "@/lib/nexa-portal-column-layout";
import { PORTAL_CATEGORY_ORDER } from "@/lib/portal-mappa";

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

  const columns = useMemo(
    () => buildPortalColumns(user, hideSensitiveHr),
    [user, hideSensitiveHr]
  );
  const byCat = useMemo(() => new Map(columns.map((c) => [c.portalCategory, c])), [columns]);

  return (
    <div className="relative w-full bg-[color-mix(in_srgb,#020b1a_96%,var(--prom-surface))] pb-12 pt-5 sm:pt-6">
      <div
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#002D72] opacity-[0.2] blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-sky-500 opacity-[0.1] blur-[110px]"
        aria-hidden
      />

      <div className="relative z-[1] mx-auto w-[min(100%,1320px)] px-4 sm:px-6">
        <header className="mx-auto mb-8 max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-sky-200/80">Synapse · Nexa HR</p>
          <h1
            className="mt-2 bg-gradient-to-br from-white via-sky-100 to-[#7eb8ff] bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
            style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
          >
            Mappa del portale
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-xs text-sky-100/70 sm:text-sm">
            Sei aree tematiche; sotto ognuna le stesse sottosezioni del menu laterale.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-sky-200/70">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 backdrop-blur-sm">
              {user?.fullName ?? "Profilo…"}
            </span>
            <Link
              href="/settings"
              scroll={false}
              className="rounded-full border border-sky-400/35 bg-sky-500/15 px-3 py-1 font-medium text-sky-100 backdrop-blur-sm hover:border-sky-300/50 hover:bg-sky-500/25"
            >
              Impostazioni
            </Link>
            {hideSensitiveHr ? (
              <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-100/85 backdrop-blur-sm">
                Vista dipendente
              </span>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {PORTAL_CATEGORY_ORDER.map((cat) => {
            const col = byCat.get(cat);
            return (
              <div key={cat} className="flex min-w-0 flex-col gap-1">
                <div className={portalCategoryGlassColumnHeaderClass(cat, "default")}>{cat}</div>
                {col?.subgroups.length ? (
                  col.subgroups.map((sg) => (
                    <div key={sg.id} className="flex flex-col gap-1">
                      <div className={portalSubgroupGlassClass(cat, "default")}>{sg.title}</div>
                      <ul className="flex flex-col gap-1">
                        {sg.tiles.map((tile) => (
                          <li key={String(tile.href)}>
                            <Link
                              href={tile.href}
                              scroll={false}
                              className={`block rounded-md px-1 py-1 text-[13px] leading-snug transition-colors ${portalLeafLinkClass(cat)}`}
                            >
                              {tile.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <p className="px-1 py-2 text-[12px] text-sky-200/40">Nessuna pagina in quest’area.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
