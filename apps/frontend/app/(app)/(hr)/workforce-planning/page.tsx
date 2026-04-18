"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWorkforceCockpit, postAnalyticsNarrative, type WorkforceCockpitScenario } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

export default function WorkforcePlanningPage(): React.JSX.Element {
  const [scenario, setScenario] = useState<WorkforceCockpitScenario>("base");
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchWorkforceCockpit>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeLlm, setNarrativeLlm] = useState(false);
  const [narrative, setNarrative] = useState<{
    title: string;
    bullets: string[];
    summary: string;
    llmApplied: boolean;
  } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    setError(null);
    try {
      const r = await fetchWorkforceCockpit(t, scenario, 6);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    }
  }, [scenario]);

  useEffect(() => {
    void load();
  }, [load]);

  const max = Math.max(1, ...(data?.series.map((s) => s.costEur) ?? [1]));

  const runNarrative = async (): Promise<void> => {
    const t = getToken();
    if (!t || !data) {
      return;
    }
    setNarrativeBusy(true);
    setError(null);
    try {
      const r = await postAnalyticsNarrative(t, {
        topic: "workforce_cockpit",
        payload: {
          scenario: data.scenario,
          summary: data.summary,
          series: data.series
        },
        useLlm: narrativeLlm
      });
      setNarrative({ title: r.title, bullets: r.bullets, summary: r.summary, llmApplied: r.llmApplied });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Narrativa non disponibile");
    } finally {
      setNarrativeBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Workforce planning</h1>
        <p className="mt-1 text-sm text-[var(--prom-muted)]">
          Riepilogo organico e costo massa stipendi mensile, con scenari what-if sullo stesso motore del forecast
          payroll. Per il dettaglio budget per centro di costo usa{" "}
          <Link href="/personnel-budget" className="font-medium text-[#002D72] underline">
            Budget personale
          </Link>{" "}
          e{" "}
          <Link href="/forecast" className="font-medium text-[#002D72] underline">
            Forecast costi
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["base", "Scenario base"],
            ["growth", "+2 FTE (stima costo)"],
            ["freeze", "Costo flat (no crescita)"]
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={scenario === key ? "primary" : "outline"}
            className="rounded-full"
            onClick={() => setScenario(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-4">
              <p className="text-xs font-medium text-[var(--prom-muted)]">Headcount (esclusi superuser)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.headcount}</p>
            </div>
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-4">
              <p className="text-xs font-medium text-[var(--prom-muted)]">Massa RAL mensile stimata</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                  data.summary.monthlyPayrollMassEur
                )}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-4">
              <p className="text-xs font-medium text-[var(--prom-muted)]">Note spese in attesa HR</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                {data.summary.pendingExpenseCount}
              </p>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">Costo mensile previsto (6 mesi)</h2>
            <div className="flex h-48 items-end gap-2">
              {data.series.map((s) => (
                <div key={s.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-[color-mix(in_srgb,var(--prom-gold)_42%,transparent)]"
                    style={{ height: `${(s.costEur / max) * 160}px` }}
                    title={`${s.costEur} EUR`}
                  />
                  <span className="truncate text-[10px] text-[var(--prom-muted)]">{s.month}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--prom-line)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-[var(--prom-text)]">Narrativa su aggregati</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
                  <input type="checkbox" checked={narrativeLlm} onChange={(e) => setNarrativeLlm(e.target.checked)} />
                  Raffinamento LLM (se abilitato in ambiente)
                </label>
                <Button type="button" size="sm" variant="outline" disabled={narrativeBusy} onClick={() => void runNarrative()}>
                  {narrativeBusy ? "Generazione…" : "Genera sintesi"}
                </Button>
              </div>
            </div>
            {narrative ? (
              <div className="mt-3 space-y-2 text-sm text-[var(--prom-text)]">
                <p className="text-xs text-[var(--prom-muted)]">
                  Fonte: template interno{narrative.llmApplied ? " + LLM su numeri aggregati" : ""} (audit Nexa).
                </p>
                <p className="font-medium">{narrative.title}</p>
                <ul className="list-inside list-disc text-xs text-[var(--prom-muted)]">
                  {narrative.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-[var(--prom-muted)]">{narrative.summary}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--prom-muted)]">
                Solo dati aggregati del cockpit vengono inviati al servizio narrative (nessun nominativo).
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
      )}
    </div>
  );
}
