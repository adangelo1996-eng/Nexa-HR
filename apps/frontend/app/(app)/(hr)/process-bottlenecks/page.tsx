"use client";

import { useEffect, useState } from "react";
import { fetchProcessCycleMetrics, fetchSuiteAggregateEvents, postAnalyticsNarrative } from "@/lib/api";
import { getSessionUser, getToken, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { suiteAggregateEventTitle } from "@/lib/suite-event-presentations";
import { Button } from "@/components/ui/button";
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
  const [llmBusy, setLlmBusy] = useState(false);
  const [useLlm, setUseLlm] = useState(true);
  const [suggestions, setSuggestions] = useState<{
    title: string;
    bullets: string[];
    summary: string;
    llmApplied: boolean;
  } | null>(null);

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

  const runLlm = async (): Promise<void> => {
    const t = getToken();
    if (!t || !metrics || !suite) {
      return;
    }
    setLlmBusy(true);
    setError(null);
    try {
      const eventSummaries = suite.items.map((ev) => ({
        id: ev.id,
        titoloLeggibile: suiteAggregateEventTitle(ev.id),
        direzione: ev.direction,
        destinatari: [...ev.consumers].join(", "),
        cosaComunica: ev.description
      }));
      const r = await postAnalyticsNarrative(t, {
        topic: "process_bottlenecks",
        payload: {
          metrics,
          eventSummaries
        },
        useLlm: useLlm && sessionCanUseNexaAiOpenAiLlm(getSessionUser())
      });
      setSuggestions({
        title: r.title,
        bullets: r.bullets,
        summary: r.summary,
        llmApplied: r.llmApplied
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggerimenti non disponibili");
    } finally {
      setLlmBusy(false);
    }
  };

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

      {metrics ? (
        <HebbAiGlassPanel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Suggerimenti di ottimizzazione</h2>
            <div className="flex flex-wrap items-center gap-3">
              {sessionCanUseNexaAiOpenAiLlm(getSessionUser()) ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                  <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                  Usa AI su metriche e catalogo eventi
                </label>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={llmBusy || !suite} onClick={() => void runLlm()}>
                {llmBusy ? "Analisi…" : "Suggerisci miglioramenti (AI)"}
              </Button>
            </div>
          </div>
          {suggestions ? (
            <div className="mt-6 space-y-3 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4">
              <p className="text-xs text-[var(--prom-muted)]">
                {suggestions.llmApplied ? "Output LLM" : "Solo template"} — audit registrato.
              </p>
              <p className="font-synapse text-base font-semibold text-[var(--prom-text)]">{suggestions.title}</p>
              <ul className="list-inside list-disc text-sm text-[var(--prom-muted)]">
                {suggestions.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-[var(--prom-muted)]">{suggestions.summary}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--prom-muted)]">
              L’analisi usa solo numeri di campione e il catalogo eventi aggregati (nessun dato individuale).
            </p>
          )}
        </HebbAiGlassPanel>
      ) : null}

      {suite ? (
        <HebbAiGlassPanel>
          <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Eventi verso le suite esterne</h2>
          <p className="mt-2 text-sm text-[var(--prom-muted)]">
            Gli identificativi tecnici restano in piccolo per supporto IT; il titolo in italiano descrive cosa viene
            scambiato (solo aggregati).
          </p>
          <ul className="mt-4 space-y-3 text-sm text-[var(--prom-muted)]">
            {suite.items.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-3"
              >
                <p className="font-synapse text-base font-semibold text-[var(--prom-text)]">{suiteAggregateEventTitle(ev.id)}</p>
                <p className="mt-1 text-sm text-[var(--prom-muted)]">{ev.description}</p>
                <p className="mt-2 text-xs text-[var(--prom-muted)]">
                  Flusso: <strong>{ev.direction}</strong> — sistemi: {ev.consumers.join(", ")}
                </p>
                <p className="mt-1 font-mono text-[10px] text-[var(--prom-muted)]">{ev.id}</p>
              </li>
            ))}
          </ul>
        </HebbAiGlassPanel>
      ) : null}
    </HebbAiExperienceShell>
  );
}
