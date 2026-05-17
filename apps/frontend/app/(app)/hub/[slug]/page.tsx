"use client";

import type { Route } from "next";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SectionHubPage } from "@/components/section-hub-page";
import { fetchCurrentUser } from "@/lib/api";
import {
  getSessionUser,
  getToken,
  sessionCanNexaAdmin,
  sessionUsesHrReorganizedNav,
  type SessionUser
} from "@/lib/auth-session";
import {
  buildEmployeeHubPageModel,
  buildHrHubPageModel,
  EMPLOYEE_HUB_SECTIONS,
  HR_HUB_SECTIONS,
  isKnownHubSlug
} from "@/lib/nexa-hub-config";

const EMPLOYEE_VIEW_KEY = "nexa_hr_employee_view";

export default function HubSectionPage(): React.JSX.Element {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [user, setUser] = useState<SessionUser | null>(null);
  const [employeeView, setEmployeeView] = useState(false);

  useEffect(() => {
    setEmployeeView(sessionStorage.getItem(EMPLOYEE_VIEW_KEY) === "1");
    setUser(getSessionUser());
    const token = getToken();
    if (!token) {
      return;
    }
    void fetchCurrentUser(token)
      .then((u) => setUser(u))
      .catch(() => setUser(getSessionUser()));
  }, []);

  const hideSensitiveHr = Boolean(employeeView && sessionCanNexaAdmin(user ?? undefined));
  const hrMode = sessionUsesHrReorganizedNav(user, hideSensitiveHr);

  const model = useMemo(() => {
    if (!isKnownHubSlug(slug)) {
      return null;
    }
    return hrMode
      ? buildHrHubPageModel(slug, user, hideSensitiveHr)
      : buildEmployeeHubPageModel(slug, user, hideSensitiveHr);
  }, [slug, user, hideSensitiveHr, hrMode]);

  if (!isKnownHubSlug(slug)) {
    notFound();
  }

  if (!model) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento sezione…</p>;
  }

  const hubList = hrMode ? HR_HUB_SECTIONS : EMPLOYEE_HUB_SECTIONS;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Sezioni hub">
        {hubList.map((h) => (
          <Link
            key={h.slug}
            href={`/hub/${h.slug}` as Route}
            scroll={false}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              h.slug === slug
                ? "border border-[color-mix(in_srgb,var(--prom-text)_18%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-text)]"
                : "border border-transparent text-[var(--prom-muted)] hover:border-[var(--prom-line)] hover:text-[var(--prom-text)]"
            }`}
          >
            {h.title}
          </Link>
        ))}
      </nav>
      <SectionHubPage
        title={model.title}
        subtitle={model.subtitle}
        portalCategory={model.portalCategory}
        tiles={model.tiles}
        groups={model.groups}
        backHref="/mappa-portale"
        backLabel="← Mappa portale"
      />
    </div>
  );
}
