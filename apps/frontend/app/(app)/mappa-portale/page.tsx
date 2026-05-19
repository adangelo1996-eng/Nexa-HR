"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
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
  buildEmployeeLinearPortalSteps,
  buildHrLinearPortalSteps,
  type PortalLinearStep
} from "@/lib/portal-mappa-linear";
const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

function TileCard(props: {
  href: Route;
  title: string;
  blurb: string;
  stepIndex: number;
}): React.JSX.Element {
  const { href, title, blurb, stepIndex } = props;
  return (
    <Link
      href={href}
      scroll={false}
      className="group flex items-start gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--card-shadow)] transition hover:border-[color-mix(in_srgb,#002D72_28%,var(--prom-line-strong))] hover:shadow-[0_12px_32px_-16px_rgba(0,45,114,0.22)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-sm font-semibold text-[#002D72] dark:text-sky-200">
        {stepIndex}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--prom-text)]">{title}</span>
        {blurb ? <span className="mt-1 block text-xs leading-relaxed text-[var(--prom-muted)]">{blurb}</span> : null}
      </span>
      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--prom-muted)] opacity-50 group-hover:opacity-100" />
    </Link>
  );
}

function LinearSection(props: { step: PortalLinearStep; index: number }): React.JSX.Element {
  const n = props.index + 1;
  return (
    <section className="relative pl-0 sm:pl-2">
      <PortalSectionHeader step={props.step} index={n} />
      <div className="mt-4 space-y-2 border-l-2 border-[color-mix(in_srgb,#002D72_22%,var(--prom-line))] pl-4 sm:pl-6">
        {props.step.tiles.map((tile) => (
          <TileCard
            key={String(tile.href)}
            href={tile.href}
            title={tile.title}
            blurb={tile.blurb}
            stepIndex={n}
          />
        ))}
      </div>
    </section>
  );
}

function PortalSectionHeader(props: { step: PortalLinearStep; index: number }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#002D72] dark:text-sky-200">
        Passo {props.index}
      </span>
      <h2 className="text-lg font-semibold text-[var(--prom-text)]">{props.step.title}</h2>
      <p className="w-full text-sm text-[var(--prom-muted)] sm:w-auto sm:flex-1">{props.step.subtitle}</p>
    </div>
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

  const steps = useMemo(() => {
    if (usesEmployeePortal) {
      return buildEmployeeLinearPortalSteps(user, hideSensitiveHr);
    }
    return buildHrLinearPortalSteps(user, hideSensitiveHr);
  }, [user, hideSensitiveHr, usesEmployeePortal]);

  return (
    <div className="relative isolate min-h-[72vh] overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,#002D72_14%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_90%,var(--prom-bg))] px-5 py-10 sm:px-10">
      <header className="relative z-[1] mx-auto max-w-3xl text-center">
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
          Percorso lineare dall&apos;alto verso il basso: ogni passo raggruppa le funzioni che ti servono in quella fase,
          senza colonne da interpretare.
        </p>
        <ProfileChips user={user} hideSensitiveHr={hideSensitiveHr} />
      </header>

      <div className="relative z-[1] mx-auto mt-12 max-w-3xl space-y-14">
        {steps.map((step, i) => (
          <LinearSection key={step.id} step={step} index={i} />
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
