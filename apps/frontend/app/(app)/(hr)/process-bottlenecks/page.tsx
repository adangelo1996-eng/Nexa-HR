"use client";

import { useEffect, useState } from "react";
import { fetchProcessCycleMetrics, fetchSuiteAggregateEvents } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";

export default function ProcessBottlenecksPage(): React.JSX.Element {
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchProcessCycleMetrics>> | null>(null);
  const [suite, setSuite] = useState<Awaited<ReturnType<typeof fetchSuiteAggregateEvents>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      return;
    }
    void (async (): Promise<void> => {
      setError(null);
      try {
        const [m, s] = await Promise.all([fetchProcessCycleMetrics(t), fetchSuiteAggregateEvents(t)]);
        setMetrics(m);
        setSuite(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore");
      }
    })();
  }, []);

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Ottimizzazione processi"
      subtitle="Tempi di ciclo su ferie, spese e onboarding, più catalogo eventi aggregati verso suite esterne (definizioni e contract, nessun push automatico)."
      headerTrailing={<HebbAiPageHelpButton pageKey="process-bottlenecks" />}
    >
      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {metrics ? (
        <HebbAiGlassPanel>
          <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Metriche ciclo (v0)</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--prom-muted)]">{metrics.note}</p>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Campione ferie</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{metrics.samples.leave}</dd>
            </div>
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Campione spese</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{metrics.samples.expense}</dd>
            </div>
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Campione onboarding</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{metrics.samples.onboarding}</dd>
            </div>
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Finestra (giorni)</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{metrics.windowDays}</dd>
            </div>
          </dl>
        </HebbAiGlassPanel>
      ) : !error ? (
        <HebbAiGlassPanel className="py-14 text-center text-sm text-[var(--prom-muted)]">Caricamento metriche…</HebbAiGlassPanel>
      ) : null}

      {suite ? (
        <HebbAiGlassPanel>
          <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Eventi aggregati (contratto)</h2>
          <ul className="mt-4 space-y-3 text-sm text-[var(--prom-muted)]">
            {suite.items.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2"
              >
                <span className="font-mono text-xs text-[var(--prom-text)]">{ev.id}</span> — {ev.description} (
                {ev.consumers.join(", ")})
              </li>
            ))}
          </ul>
        </HebbAiGlassPanel>
      ) : null}
    </HebbAiExperienceShell>
  );
}
