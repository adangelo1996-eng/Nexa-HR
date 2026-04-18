"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWorkforceCockpit, postAnalyticsNarrative, type WorkforceCockpitScenario } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile,
  hebbAiLinkClassName
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";

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

  const linkCn = hebbAiLinkClassName();

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Workforce planning"
      subtitle={
        <>
          Riepilogo organico e costo massa stipendi mensile, con scenari what-if sullo stesso motore del forecast
          payroll. Per il dettaglio per centro di costo apri{" "}
          <Link href="/personnel-budget" className={linkCn}>
            Budget personale
          </Link>{" "}
          e{" "}
          <Link href="/forecast" className={linkCn}>
            Forecast costi
          </Link>
          .
        </>
      }
      headerTrailing={<HebbAiPageHelpButton pageKey="workforce-planning" />}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {(
          [
            ["base", "Scenario base"],
            ["growth", "+2 FTE (stima costo)"],
            ["freeze", "Costo flat (no crescita)"]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScenario(key)}
            className={[
              "group flex min-w-[140px] flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-[var(--glass-shadow)] backdrop-blur-md transition sm:max-w-[200px]",
              scenario === key
                ? "border-[color-mix(in_srgb,var(--prom-gold)_55%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)]"
                : "border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:border-[color-mix(in_srgb,var(--prom-gold)_45%,var(--prom-line))]"
            ].join(" ")}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#002D72] to-[#1a4d8c] text-xs font-bold text-white">
              {key === "base" ? "A" : key === "growth" ? "+" : "═"}
            </span>
            <span className="min-w-0 text-sm font-semibold text-[var(--prom-text)]">{label}</span>
          </button>
        ))}
      </div>

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <HebbAiGlassTile>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                Headcount (esclusi superuser)
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.headcount}</p>
            </HebbAiGlassTile>
            <HebbAiGlassTile>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                Massa RAL mensile stimata
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                  data.summary.monthlyPayrollMassEur
                )}
              </p>
            </HebbAiGlassTile>
            <HebbAiGlassTile>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                Note spese in attesa HR
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                {data.summary.pendingExpenseCount}
              </p>
            </HebbAiGlassTile>
          </div>

          <HebbAiGlassPanel>
            <h2 className="text-sm font-semibold tracking-wide text-[var(--prom-text)]">Costo mensile previsto (6 mesi)</h2>
            <div className="mt-6 flex h-52 items-end gap-2 border-t border-[var(--prom-line)] pt-4">
              {data.series.map((s) => (
                <div key={s.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full max-w-[3rem] rounded-t-lg bg-gradient-to-t from-[#002D72] to-[color-mix(in_srgb,var(--prom-gold)_55%,#002d72)] shadow-md transition hover:opacity-95"
                    style={{ height: `${(s.costEur / max) * 168}px` }}
                    title={`${s.costEur} EUR`}
                  />
                  <span className="truncate text-[10px] font-medium text-[var(--prom-muted)]">{s.month}</span>
                </div>
              ))}
            </div>
          </HebbAiGlassPanel>

          <HebbAiGlassPanel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Narrativa su aggregati</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                  <input
                    type="checkbox"
                    className="rounded border-[var(--prom-line-strong)]"
                    checked={narrativeLlm}
                    onChange={(e) => setNarrativeLlm(e.target.checked)}
                  />
                  Raffinamento LLM (se abilitato)
                </label>
                <Button type="button" size="sm" variant="outline" disabled={narrativeBusy} onClick={() => void runNarrative()}>
                  {narrativeBusy ? "Generazione…" : "Genera sintesi"}
                </Button>
              </div>
            </div>
            {narrative ? (
              <div className="mt-6 space-y-3 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 text-sm text-[var(--prom-text)]">
                <p className="text-xs text-[var(--prom-muted)]">
                  Fonte: template interno{narrative.llmApplied ? " + LLM su numeri aggregati" : ""} (audit Nexa).
                </p>
                <p className="font-synapse text-base font-semibold">{narrative.title}</p>
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-[var(--prom-muted)]">
                  {narrative.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-[var(--prom-muted)]">{narrative.summary}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--prom-muted)]">
                Solo dati aggregati del cockpit vengono inviati al servizio narrative (nessun nominativo).
              </p>
            )}
          </HebbAiGlassPanel>
        </>
      ) : (
        <HebbAiGlassPanel className="py-12 text-center">
          <p className="text-sm text-[var(--prom-muted)]">Caricamento cockpit…</p>
        </HebbAiGlassPanel>
      )}
    </HebbAiExperienceShell>
  );
}
