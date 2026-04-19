"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalConceptMap } from "@/components/portal-concept-map";
import { PortalMindMap } from "@/components/portal-mind-map";
import { fetchCurrentUser } from "@/lib/api";
import { getSessionUser, getToken, sessionCanNexaAdmin, type SessionUser } from "@/lib/auth-session";
import { filterPortalHref } from "@/lib/nexa-route-access";
import {
  buildPortalMindMapBranches,
  groupPortalTiles,
  PORTAL_TILES
} from "@/lib/portal-mappa";
import type { Route } from "next";

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
  const branches = useMemo(() => buildPortalMindMapBranches(grouped), [grouped]);
  const showDashboardCenter = useMemo(
    () => !user || filterPortalHref("/" as Route, user, hideSensitiveHr),
    [user, hideSensitiveHr]
  );
  const dashboardMeta = PORTAL_TILES.find((t) => t.href === "/");

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,#020b1a_96%,var(--prom-surface))]">
      <div
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#002D72] opacity-[0.22] blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-sky-500 opacity-[0.12] blur-[110px]"
        aria-hidden
      />

      <PortalConceptMap className="min-h-0 flex-1">
        <div
          className="relative box-border inline-block min-h-full min-w-full"
          style={{ padding: "8vh 8vw 28vh 8vw" }}
        >
          <header className="pointer-events-auto relative z-[2] mx-auto mb-10 max-w-2xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-sky-200/80">Synapse · Nexa HR</p>
            <h1
              className="mt-2 bg-gradient-to-br from-white via-sky-100 to-[#7eb8ff] bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
              style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
            >
              Mappa del portale
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-sky-100/75 sm:text-sm">
              Dashboard al centro: da lì si diramano le aree tematiche e le pagine. Trascina lo sfondo o usa la rotellina
              per spostarti sulla mappa.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-sky-200/70">
              <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 backdrop-blur-md">
                {user?.fullName ?? "Caricamento profilo…"}
              </span>
              {hideSensitiveHr ? (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-100/90 backdrop-blur-md">
                  Vista dipendente: sezioni HR riservate nascoste
                </span>
              ) : null}
            </div>
          </header>

          <div className="relative z-[1] mx-auto">
            <PortalMindMap
              branches={branches}
              showDashboardCenter={showDashboardCenter}
              dashboardBlurb={dashboardMeta?.blurb}
            />
          </div>
        </div>
      </PortalConceptMap>
    </div>
  );
}
