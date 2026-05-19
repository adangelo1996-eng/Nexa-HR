"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTrackAsyncLoad } from "@/components/nexa-async-loading-provider";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
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
  portalAccentCategoryForNavSection,
  portalCategoryGlassColumnHeaderClass,
  portalCategoryTileTopAccentClass,
  portalMapSectionSurfaceClass
} from "@/lib/nav-visual-accents";
import {
  buildEmployeeLinearPortalSteps,
  buildHrLinearPortalSteps,
  type PortalLinearStep
} from "@/lib/portal-mappa-linear";

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
      className={`group flex h-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--card-shadow)] transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_28%,var(--prom-line-strong))] hover:shadow-[0_12px_32px_-16px_rgba(0,45,114,0.22)] ${portalCategoryTileTopAccentClass(accentCategory)}`}
    >
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--prom-text)]">{title}</span>
          {blurb ? (
            <span className="mt-1.5 block line-clamp-3 text-xs leading-relaxed text-[var(--prom-muted)]">{blurb}</span>
          ) : null}
        </span>
        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--prom-muted)] opacity-50 group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function GridSection(props: { step: PortalLinearStep }): React.JSX.Element {
  const accent = portalAccentCategoryForNavSection(props.step.id, props.step.title);
  return (
    <section
      className={`rounded-2xl border p-4 backdrop-blur-sm sm:p-5 md:p-6 ${portalMapSectionSurfaceClass(accent)}`}
    >
      <div className="mb-5 space-y-2">
        <div className={portalCategoryGlassColumnHeaderClass(accent, "default")}>{props.step.title}</div>
        <p className="max-w-2xl px-0.5 text-sm leading-relaxed text-[var(--prom-muted)]">{props.step.subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {props.step.tiles.map((tile) => (
          <TileCard
            key={String(tile.href)}
            href={tile.href}
            title={tile.title}
            blurb={tile.blurb}
            accentCategory={accent}
          />
        ))}
      </div>
    </section>
  );
}

export default function MappaPortalePage(): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [employeeView, setEmployeeView] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setEmployeeView(sessionStorage.getItem(EMPLOYEE_VIEW_KEY) === "1");
    setUser(getSessionUser());
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchCurrentUser(t)
      .then((u) => setUser(u))
      .catch(() => setUser(getSessionUser()))
      .finally(() => setLoading(false));
  }, []);

  useTrackAsyncLoad(loading && Boolean(getToken()), "load");

  const hideSensitiveHr = Boolean(employeeView && sessionCanNexaAdmin(user ?? undefined));
  const usesHrNav = sessionUsesHrReorganizedNav(user, hideSensitiveHr);
  const usesEmployeePortal =
    hideSensitiveHr || sessionIsPlainEmployee(user ?? undefined) || !usesHrNav;

  const steps = useMemo(() => {
    if (usesEmployeePortal) {
      return buildEmployeeLinearPortalSteps(user, hideSensitiveHr);
    }
    return buildHrLinearPortalSteps(user, hideSensitiveHr);
  }, [user, hideSensitiveHr, usesEmployeePortal]);

  return (
    <div className="relative isolate min-h-[72vh] overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,#002D72_14%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_90%,var(--prom-bg))] px-5 py-10 sm:px-10">
      <header className="relative z-[1] mx-auto max-w-5xl text-center">
        <div className="flex justify-center">
          <NexaPageHelpButton pageKey="mappa-portale" />
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--prom-muted)]">Nexa HR</p>
        <h1
          className="mt-3 text-3xl font-semibold tracking-tight text-[#002D72] sm:text-4xl dark:text-white"
          style={{ fontFamily: "var(--font-synapse-display, inherit)" }}
        >
          Mappa del portale
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--prom-muted)]">
          Sezioni e scorciatoie per il tuo profilo. Ogni blocco raggruppa le funzioni collegate.
        </p>
        <ProfileChips user={user} hideSensitiveHr={hideSensitiveHr} />
      </header>

      <div className="relative z-[1] mx-auto mt-12 max-w-5xl space-y-8">
        {steps.map((step) => (
          <GridSection key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

function ProfileChips(props: {
  user: SessionUser | null;
  hideSensitiveHr: boolean;
}): React.JSX.Element {
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px]">
      <span className="rounded-full border border-[var(--prom-line-strong)] px-3 py-1 text-[var(--prom-text)]">
        {props.user?.fullName ?? "Profilo…"}
      </span>
      {props.hideSensitiveHr ? (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-900 dark:text-amber-100">
          Vista dipendente
        </span>
      ) : null}
    </div>
  );
}
