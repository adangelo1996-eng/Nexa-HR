"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchCurrentUser, fetchWorkforceCockpit, postAnalyticsNarrative, type WorkforceCockpitScenario } from "@/lib/api";
import { getSessionUser, getToken, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const [customFte, setCustomFte] = useState(0);
  const [customFlat, setCustomFlat] = useState(0);
  const [customScale, setCustomScale] = useState(100);
  const [customBusy, setCustomBusy] = useState(false);
  /** Firma parametri usata nell’ultima simulazione custom riuscita. */
  const [appliedCustomSig, setAppliedCustomSig] = useState<string | null>(null);
  const prevScenarioRef = useRef<WorkforceCockpitScenario>(scenario);

  const customParamSig = useMemo(
    () => `${customFte}|${customFlat}|${customScale}`,
    [customFte, customFlat, customScale]
  );

  const loadPreset = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    await fetchCurrentUser(t).catch(() => undefined);
    setError(null);
    try {
      const r = await fetchWorkforceCockpit(t, scenario, 6);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    }
  }, [scenario]);

  const loadCustom = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    await fetchCurrentUser(t).catch(() => undefined);
    setError(null);
    setCustomBusy(true);
    try {
      const r = await fetchWorkforceCockpit(t, "custom", 6, {
        fteDelta: customFte,
        monthlyFlatDeltaEur: customFlat,
        seriesScalePercent: customScale
      });
      setData(r);
      setAppliedCustomSig(`${customFte}|${customFlat}|${customScale}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setCustomBusy(false);
    }
  }, [customFte, customFlat, customScale]);

  useEffect(() => {
    const prev = prevScenarioRef.current;
    if (scenario === "custom" && prev !== "custom") {
      setData(null);
      setNarrative(null);
      setAppliedCustomSig(null);
    }
    prevScenarioRef.current = scenario;
  }, [scenario]);

  useEffect(() => {
    if (scenario === "custom") {
      return;
    }
    void loadPreset();
  }, [scenario, loadPreset]);

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
          series: data.series,
          custom: data.custom ?? null
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
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(getSessionUser());

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Workforce planning"
      subtitle={
        <>
          Quante persone ci sono oggi e quanto costa la massa stipendi al mese, con una proiezione a sei mesi. Puoi
          confrontare scenari predefiniti o costruire un what-if con i tuoi numeri (variazioni di testa, importo fisso
          aggiuntivo, scala sui costi previsti). Per il dettaglio per reparto usa{" "}
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
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {(
          [
            ["base", "Scenario base", "A"],
            ["growth", "+2 FTE (stima)", "+"],
            ["freeze", "Costi flat", "═"],
            ["custom", "What-if libero", "?"]
          ] as const
        ).map(([key, label, badge]) => (
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
              {badge}
            </span>
            <span className="min-w-0 text-sm font-semibold text-[var(--prom-text)]">{label}</span>
          </button>
        ))}
      </div>

      {scenario === "custom" ? (
        <HebbAiGlassPanel className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Parametri what-if</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">
              Imposta le leve e avvia la simulazione: la massa stipendi attuale serve a stimare teste in più o in meno;
              l’importo fisso si somma ogni mese; la percentuale moltiplica l’intera curva del forecast (0–300%). I
              risultati compaiono nella dashboard dedicata sotto solo dopo l’esecuzione.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              <span className="font-semibold text-[var(--prom-text)]">Teste equivalenti (FTE)</span>
              <Input
                type="number"
                inputMode="numeric"
                value={Number.isNaN(customFte) ? "" : customFte}
                onChange={(e) => setCustomFte(Math.round(Number(e.target.value) || 0))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              <span className="font-semibold text-[var(--prom-text)]">Euro fissi al mese (±)</span>
              <Input
                type="number"
                inputMode="decimal"
                value={Number.isNaN(customFlat) ? "" : customFlat}
                onChange={(e) => setCustomFlat(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              <span className="font-semibold text-[var(--prom-text)]">Scala su forecast (%)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={300}
                value={Number.isNaN(customScale) ? "" : customScale}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCustomScale(Number.isFinite(n) ? Math.min(300, Math.max(0, n)) : 100);
                }}
              />
            </label>
          </div>
          <Button type="button" disabled={customBusy} onClick={() => void loadCustom()}>
            {customBusy ? "Calcolo in corso…" : "Esegui simulazione"}
          </Button>
        </HebbAiGlassPanel>
      ) : null}

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {scenario === "custom" && !data && !customBusy ? (
        <HebbAiGlassPanel className="border-dashed py-10 text-center">
          <p className="text-sm font-medium text-[var(--prom-text)]">In attesa di simulazione</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--prom-muted)]">
            La dashboard what-if (KPI, grafico a sei mesi e sintesi) si popola dopo «Esegui simulazione». Puoi cambiare i
            parametri e rilanciare quando vuoi.
          </p>
        </HebbAiGlassPanel>
      ) : null}

      {scenario === "custom" && customBusy && !data ? (
        <HebbAiGlassPanel className="py-12 text-center">
          <p className="text-sm text-[var(--prom-muted)]">Calcolo dello scenario in corso…</p>
        </HebbAiGlassPanel>
      ) : null}

      {data ? (
        <>
          {scenario === "custom" ? (
            <HebbAiGlassPanel className="space-y-6 ring-2 ring-[color-mix(in_srgb,var(--prom-gold)_42%,transparent)]">
              <div className="flex flex-col gap-2 border-b border-[var(--prom-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--prom-gold)]">Dashboard what-if</p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--prom-text)]">Risultato simulazione (parametri liberi)</h2>
                  <p className="mt-1 text-xs text-[var(--prom-muted)]">
                    FTE Δ {customFte} · flat €{customFlat}/mese · scala forecast {customScale}%
                  </p>
                </div>
              </div>
              {appliedCustomSig !== null && customParamSig !== appliedCustomSig ? (
                <p className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                  I parametri non coincidono più con questa simulazione. Esegui di nuovo per aggiornare la dashboard.
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3">
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Persone in organico (senza superuser)
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.headcount}</p>
                </HebbAiGlassTile>
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Stima massa retributiva mensile
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

              <div>
                <h3 className="text-sm font-semibold tracking-wide text-[var(--prom-text)]">Costo mensile previsto (6 mesi)</h3>
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
              </div>
            </HebbAiGlassPanel>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Persone in organico (senza superuser)
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.headcount}</p>
                </HebbAiGlassTile>
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Stima massa retributiva mensile
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
            </>
          )}

          <HebbAiGlassPanel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Sintesi in linguaggio naturale</h2>
              <div className="flex flex-wrap items-center gap-3">
                {llmAllowed ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                    <input
                      type="checkbox"
                      className="rounded border-[var(--prom-line-strong)]"
                      checked={narrativeLlm}
                      onChange={(e) => setNarrativeLlm(e.target.checked)}
                    />
                    Raffinamento con AI (solo aggregati)
                  </label>
                ) : null}
                <Button type="button" size="sm" variant="outline" disabled={narrativeBusy} onClick={() => void runNarrative()}>
                  {narrativeBusy ? "Generazione…" : "Genera sintesi"}
                </Button>
              </div>
            </div>
            {narrative ? (
              <div className="mt-6 space-y-3 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 text-sm text-[var(--prom-text)]">
                <p className="text-xs text-[var(--prom-muted)]">
                  Fonte: testo guidato dai dati in pagina{narrative.llmApplied ? ", con passaggio opzionale in AI" : ""}.
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
                Vengono usati solo numeri di riepilogo già mostrati qui sopra, senza elenco di persone.
              </p>
            )}
          </HebbAiGlassPanel>
        </>
      ) : scenario !== "custom" ? (
        <HebbAiGlassPanel className="py-12 text-center">
          <p className="text-sm text-[var(--prom-muted)]">Caricamento cockpit…</p>
        </HebbAiGlassPanel>
      ) : null}
    </HebbAiExperienceShell>
  );
}
