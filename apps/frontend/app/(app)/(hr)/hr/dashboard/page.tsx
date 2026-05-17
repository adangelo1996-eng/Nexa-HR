"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, ClipboardList, Workflow } from "lucide-react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import {
  fetchAnalyticsHubCatalog,
  fetchHrRecapSummary,
  fetchHrRecapTasks,
  type AnalyticsHubCardDto,
  type HrRecapTaskDto
} from "@/lib/api";
import { getSessionUser, getToken, sessionCanAccessHrRecapDashboard } from "@/lib/auth-session";
import { useRouter } from "next/navigation";

export default function HrDashboardPage(): React.JSX.Element | null {
  const router = useRouter();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchHrRecapSummary>> | null>(null);
  const [tasks, setTasks] = useState<HrRecapTaskDto[]>([]);
  const [cards, setCards] = useState<AnalyticsHubCardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    if (!sessionCanAccessHrRecapDashboard(getSessionUser())) {
      router.replace("/");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [s, tk, hub] = await Promise.all([
        fetchHrRecapSummary(token),
        fetchHrRecapTasks(token),
        fetchAnalyticsHubCatalog(token).catch(() => ({ cards: [] as AnalyticsHubCardDto[] }))
      ]);
      setSummary(s);
      setTasks(tk.tasks.slice(0, 8));
      setCards(hub.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <NexaHrAppPage
      title="Dashboard HR"
      subtitle="Organico, task urgenti e accessi rapidi."
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
      ) : (
        <>
          <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary ? (
              <>
                <StatCard label="Organico attivo" value={String(summary.active)} />
                <StatCard label="In onboarding HR" value={String(summary.hrOnboarding)} />
                <StatCard label="In offboarding" value={String(summary.offboarding)} />
                <StatCard label="Contratti da firmare" value={String(summary.contractsToSign)} />
              </>
            ) : null}
          </section>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-[var(--card-border)] p-5" style={{ background: "var(--card-bg)" }}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--prom-text)]">
                  <ClipboardList className="h-5 w-5" aria-hidden />
                  Task prioritari
                </h2>
                <Link
                  href={"/hr-recap" as Route}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#002D72] hover:underline dark:text-sky-200"
                >
                  Attività HR
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
              {tasks.length === 0 ? (
                <p className="text-sm text-[var(--prom-muted)]">Nessun task urgente in coda.</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={t.href as Route}
                        className="block rounded-lg border border-[var(--prom-line)] px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
                      >
                        <span className="font-medium text-[var(--prom-text)]">{t.title}</span>
                        {t.subtitle ? (
                          <span className="mt-0.5 block text-xs text-[var(--prom-muted)]">{t.subtitle}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--card-border)] p-5" style={{ background: "var(--card-bg)" }}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--prom-text)]">
                  <Workflow className="h-5 w-5" aria-hidden />
                  Azioni rapide
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                <QuickLink href="/workflow/approvals" label="Approvazioni team" />
                <QuickLink href="/analytics" label="Hub Analytics" />
                <QuickLink href="/personnel-budget" label="Budget personale" />
              </div>
            </section>
          </div>

          {cards.length > 0 ? (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#002D72] dark:text-sky-300" aria-hidden />
                <h2 className="text-base font-semibold text-[var(--prom-text)]">Analisi strategiche</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {cards.map((c) => (
                  <Link
                    key={c.id}
                    href={c.href as Route}
                    className="rounded-xl border border-[var(--card-border)] p-4 transition hover:border-[#002D72]/40"
                    style={{ background: "var(--card-bg)" }}
                  >
                    <p className="text-sm font-semibold text-[var(--prom-text)]">{c.titleIt}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">{c.blurbIt}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </NexaHrAppPage>
  );
}

function StatCard(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--card-border)] p-4" style={{ background: "var(--card-bg)" }}>
      <p className="text-xs text-[var(--prom-muted)]">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--prom-text)]">{props.value}</p>
    </div>
  );
}

function QuickLink(props: { href: string; label: string }): React.JSX.Element {
  return (
    <Link
      href={props.href as Route}
      className="rounded-lg border border-[var(--prom-line)] px-3 py-2 text-sm font-medium text-[var(--prom-text)] hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
    >
      {props.label}
    </Link>
  );
}
