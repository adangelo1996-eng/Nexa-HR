"use client";

import { useEffect, useState } from "react";
import { fetchProcessCycleMetrics, fetchSuiteAggregateEvents } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

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

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Ottimizzazione processi</h1>
        <p className="mt-1 text-sm text-[var(--prom-muted)]">
          Tempi di ciclo ferie / spese / onboarding e catalogo eventi aggregati verso suite esterne (solo definizioni,
          nessun push automatico).
        </p>
      </div>

      {metrics ? (
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Metriche ciclo (v0)</h2>
          <p className="mt-2 text-sm text-[var(--prom-muted)]">{metrics.note}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--prom-muted)]">Campione ferie</dt>
              <dd className="tabular-nums">{metrics.samples.leave}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--prom-muted)]">Campione spese</dt>
              <dd className="tabular-nums">{metrics.samples.expense}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--prom-muted)]">Campione onboarding</dt>
              <dd className="tabular-nums">{metrics.samples.onboarding}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--prom-muted)]">Finestra (giorni)</dt>
              <dd className="tabular-nums">{metrics.windowDays}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento metriche…</p>
      )}

      {suite ? (
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Eventi aggregati (contratto)</h2>
          <ul className="mt-2 space-y-2 text-sm text-[var(--prom-muted)]">
            {suite.items.map((ev) => (
              <li key={ev.id}>
                <span className="font-mono text-xs text-[var(--prom-text)]">{ev.id}</span> — {ev.description} (
                {ev.consumers.join(", ")})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
