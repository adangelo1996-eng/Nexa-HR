"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
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
  portalMapSectionSurfaceClass,
  portalSubgroupGlassClass
} from "@/lib/nav-visual-accents";
import {
  buildEmployeePortalMapNavSections,
  buildHrPortalMapNavSections,
  type PortalMapNavItem,
  type PortalMapNavSection
} from "@/lib/nexa-portal-map-nav";
import { portalBlurbForHref } from "@/lib/portal-tile-blurb";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

function TileCard(props: {
  item: PortalMapNavItem;
  accentCategory: string;
}): React.JSX.Element {
  const { item, accentCategory } = props;
  const blurb = portalBlurbForHref(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      scroll={false}
      className={`group flex h-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--card-shadow)] transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,#002D72_28%,var(--prom-line-strong))] hover:shadow-[0_12px_32px_-16px_rgba(0,45,114,0.22)] ${portalCategoryTileTopAccentClass(accentCategory)}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] text-[var(--prom-muted)] group-hover:text-[var(--prom-text)]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--prom-text)]">{item.label}</span>
          {blurb ? (
            <span className="mt-1.5 block line-clamp-3 text-xs leading-relaxed text-[var(--prom-muted)]">{blurb}</span>
          ) : null}
        </span>
        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--prom-muted)] opacity-50 group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function CollapsibleSection(props: { section: PortalMapNavSection }): React.JSX.Element {
  const accent =
    props.section.portalCategory ??
    portalAccentCategoryForNavSection(props.section.id, props.section.title);

  return (
    <details
      className={`group/section rounded-2xl border backdrop-blur-sm ${portalMapSectionSurfaceClass(accent)}`}
    >
      <summary className="cursor-pointer list-none p-4 sm:p-5 md:p-6 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <div className={`min-w-0 flex-1 ${portalCategoryGlassColumnHeaderClass(accent, "default")}`}>
            {props.section.title}
          </div>
          <ChevronDown
            className="h-5 w-5 shrink-0 text-[var(--prom-muted)] transition-transform duration-200 group-open/section:rotate-180"
            aria-hidden
          />
        </div>
      </summary>
      <div className="space-y-6 border-t border-[color-mix(in_srgb,var(--prom-line)_60%,transparent)] px-4 pb-4 pt-5 sm:px-5 sm:pb-5 md:px-6 md:pb-6">
        {props.section.subgroups.map((subgroup) => (
          <div key={subgroup.id}>
            {subgroup.title ? (
              <div className={portalSubgroupGlassClass(accent, "default")}>{subgroup.title}</div>
            ) : null}
            <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${subgroup.title ? "mt-3" : ""}`}>
              {subgroup.items.map((item) => (
                <TileCard key={String(item.href)} item={item} accentCategory={accent} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
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
  const usesEmployeeNav = hideSensitiveHr || sessionIsPlainEmployee(user ?? undefined);

  const sections = useMemo((): PortalMapNavSection[] => {
    if (usesHrNav) {
      return buildHrPortalMapNavSections(user, hideSensitiveHr);
    }
    if (usesEmployeeNav) {
      return buildEmployeePortalMapNavSections(user, hideSensitiveHr);
    }
    return buildHrPortalMapNavSections(user, hideSensitiveHr);
  }, [user, hideSensitiveHr, usesHrNav, usesEmployeeNav]);

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
          Stesse sezioni del menu laterale: espandi una categoria per vedere le pagine collegate.
        </p>
        <ProfileChips user={user} hideSensitiveHr={hideSensitiveHr} />
      </header>

      <div className="relative z-[1] mx-auto mt-12 max-w-5xl space-y-4">
        {sections.map((section) => (
          <CollapsibleSection key={section.id} section={section} />
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
