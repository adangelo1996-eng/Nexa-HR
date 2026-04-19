"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCurrentUser,
  fetchPayrollForecastBreakdown,
  fetchTurnoverRetention,
  postAnalyticsNarrative,
  postTurnoverRetentionRefresh,
  type PayrollForecastBreakdownDto,
  type TurnoverRetentionItem
} from "@/lib/api";
import { getSessionUser, getToken, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";

function ccLabelForRow(row: TurnoverRetentionItem, costCenters: Array<{ id: string; label: string }>): string {
  if (!row.costCenterId) {
    return "Senza centro di costo";
  }
  const hit = costCenters.find((c) => c.id === row.costCenterId);
  return hit?.label ?? row.costCenterId;
}

function buildTurnoverDeepPayload(
  items: TurnoverRetentionItem[],
  trend: Array<{ weekStart: string; avgScore: number; sampleSize: number }>,
  modelVersion: string,
  costCenters: Array<{ id: string; label: string }>
): Record<string, unknown> {
  const bands = { low: 0, mid: 0, high: 0 };
  for (const it of items) {
    const s = Number(it.score);
    if (!Number.isFinite(s)) continue;
    if (s < 34) bands.low += 1;
    else if (s < 67) bands.mid += 1;
    else bands.high += 1;
  }
  const byCc = new Map<string, { label: string; sum: number; n: number }>();
  for (const it of items) {
    const key = it.costCenterId ?? "__none__";
    const label = ccLabelForRow(it, costCenters);
    const cur = byCc.get(key) ?? { label, sum: 0, n: 0 };
    cur.sum += Number(it.score) || 0;
    cur.n += 1;
    byCc.set(key, cur);
  }
  const byCostCenter = [...byCc.entries()].map(([, v]) => ({
    label: v.label,
    count: v.n,
    avgScore: v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0
  }));
  return {
    modelVersion,
    trend,
    itemsCount: items.length,
    scoreBands: bands,
    byCostCenter
  };
}

export default function InsightsPage(): React.JSX.Element {
  const [items, setItems] = useState<TurnoverRetentionItem[]>([]);
  const [trend, setTrend] = useState<Array<{ weekStart: string; avgScore: number; sampleSize: number }>>([]);
  const [modelVersion, setModelVersion] = useState("");
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [costCenters, setCostCenters] = useState<Array<{ id: string; label: string }>>([]);
  const [costCenterId, setCostCenterId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeLlm, setNarrativeLlm] = useState(false);
  const [narrative, setNarrative] = useState<{
    title: string;
    bullets: string[];
    summary: string;
    llmApplied: boolean;
  } | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [deepLlm, setDeepLlm] = useState(true);
  const [deepAnalysis, setDeepAnalysis] = useState<{
    title: string;
    bullets: string[];
    summary: string;
    llmApplied: boolean;
  } | null>(null);
  const [turnoverPayload, setTurnoverPayload] = useState<{
    items: TurnoverRetentionItem[];
    trend: Array<{ weekStart: string; avgScore: number; sampleSize: number }>;
    modelVersion: string;
  } | null>(null);
  const [trendHover, setTrendHover] = useState<{
    weekStart: string;
    avgScore: number;
    sampleSize: number;
  } | null>(null);
  const [forecastCorr, setForecastCorr] = useState<PayrollForecastBreakdownDto | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchCurrentUser(t).catch(() => undefined);
      const res = await fetchTurnoverRetention(t, {
        costCenterId: costCenterId.trim() || undefined,
        trendWeeks: 10
      });
      setItems(res.items);
      setTrend(res.trend);
      setModelVersion(res.modelVersion);
      setCostCenters(res.costCenters ?? []);
      setLastRunAt(res.items[0]?.computedAt ?? null);
      setTurnoverPayload({
        items: res.items,
        trend: res.trend,
        modelVersion: res.modelVersion
      });
      try {
        const fc = await fetchPayrollForecastBreakdown(t, 3);
        setForecastCorr(fc);
      } catch {
        setForecastCorr(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setBusy(false);
    }
  }, [costCenterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, TurnoverRetentionItem[]>();
    const sorted = [...items].sort((a, b) => {
      const la = ccLabelForRow(a, costCenters);
      const lb = ccLabelForRow(b, costCenters);
      if (la !== lb) return la.localeCompare(lb, "it");
      return b.score - a.score;
    });
    for (const row of sorted) {
      const key = row.costCenterId ?? "__none__";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    const entries = [...map.entries()];
    entries.sort(([ka], [kb]) => {
      const la = ka === "__none__" ? "ZZZ" : ccLabelForRow({ costCenterId: ka } as TurnoverRetentionItem, costCenters);
      const lb = kb === "__none__" ? "ZZZ" : ccLabelForRow({ costCenterId: kb } as TurnoverRetentionItem, costCenters);
      return la.localeCompare(lb, "it");
    });
    return entries;
  }, [items, costCenters]);

  const runNarrative = async (): Promise<void> => {
    const t = getToken();
    if (!t || !turnoverPayload) {
      return;
    }
    const itemsAgg = turnoverPayload.items.map((r) => ({
      score: r.score,
      confidence: r.confidence
    }));
    setNarrativeBusy(true);
    setError(null);
    try {
      const r = await postAnalyticsNarrative(t, {
        topic: "turnover_retention",
        payload: {
          modelVersion: turnoverPayload.modelVersion,
          items: itemsAgg,
          trend: turnoverPayload.trend
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

  const runDeepAnalysis = async (): Promise<void> => {
    const t = getToken();
    if (!t || !turnoverPayload) {
      return;
    }
    const payload = buildTurnoverDeepPayload(turnoverPayload.items, turnoverPayload.trend, turnoverPayload.modelVersion, costCenters);
    setDeepBusy(true);
    setError(null);
    try {
      const r = await postAnalyticsNarrative(t, {
        topic: "turnover_insights_deep",
        payload,
        useLlm: deepLlm && sessionCanUseNexaAiOpenAiLlm(getSessionUser())
      });
      setDeepAnalysis({ title: r.title, bullets: r.bullets, summary: r.summary, llmApplied: r.llmApplied });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analisi non disponibile");
    } finally {
      setDeepBusy(false);
    }
  };

  const onRefreshSignals = async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      await postTurnoverRetentionRefresh(t);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh fallito");
    } finally {
      setRefreshing(false);
    }
  };

  const maxTrend = trend.reduce((m, p) => Math.max(m, p.avgScore), 0) || 1;

  return (
    <HebbAiExperienceShell
      contentMax="wide"
      title="Turnover e retention"
      subtitle={
        <>
          Indicatore sintetico di rischio turnover (versione {modelVersion || "—"}) calcolato su dati HR già presenti in
          Nexa (anzianità, ferie, tipo di contratto). È un supporto alla valutazione, non una diagnosi automatica. Il
          trend mostra la media settimanale degli score individuali (0–100).
          {lastRunAt ? (
            <span className="mt-2 block text-sm text-[var(--prom-muted)]">
              Ultimo aggiornamento: {new Date(lastRunAt).toLocaleString("it-IT")}
            </span>
          ) : (
            <span className="mt-2 block text-sm text-amber-800 dark:text-amber-200/90">
              Nessun dato ancora calcolato: premi &quot;Aggiorna segnali&quot;.
            </span>
          )}
        </>
      }
      headerTrailing={
        <div className="flex shrink-0 items-start gap-2">
          <HebbAiPageHelpButton pageKey="insights" />
          <Button type="button" disabled={refreshing} onClick={() => void onRefreshSignals()}>
            {refreshing ? "Aggiornamento…" : "Aggiorna segnali"}
          </Button>
        </div>
      }
    >
      <HebbAiGlassPanel>
        <h2 className="text-lg font-semibold text-[var(--prom-text)]">Come è calcolato lo score (0–100)</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--prom-muted)]">
          Il modello <strong>rule-v1</strong> parte da un valore base e aggiunge o toglie punti in base a segnali HR già
          noti: <strong>anzianità</strong> (tenure da data di assunzione), <strong>ore contrattuali settimanali</strong>,{" "}
          <strong>ferie residue</strong> e <strong>giorni di ferie contrattuali</strong>. Il risultato è limitato tra 0
          e 100: più alto indica più fattori di attenzione contemporanei, non una probabilità certa di turnover.
        </p>
        <p className="mt-2 text-sm text-[var(--prom-muted)]">
          La colonna «conf.» è una stima interna di completezza dati (non è affidabilità legale o statistica).
        </p>
      </HebbAiGlassPanel>

      <HebbAiGlassPanel className="py-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]" htmlFor="insights-cc">
            Centro di costo
          </label>
          <select
            id="insights-cc"
            className="rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)]"
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
          >
            <option value="">Tutti i centri di costo</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.label}
              </option>
            ))}
          </select>
          {busy ? <span className="text-xs text-[var(--prom-muted)]">Caricamento…</span> : null}
        </div>
      </HebbAiGlassPanel>

      {forecastCorr ? (
        <HebbAiGlassPanel>
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">Indicatori organico correlati</h2>
          <p className="mt-2 text-sm text-[var(--prom-muted)]">
            Stima forecast costi (report HR) sullo stesso perimetro aziendale: utile per incrociare rischio turnover con
            peso retributivo. Valori indicativi, non payroll consuntivo.
          </p>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <li className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2">
              <span className="text-xs font-semibold uppercase text-[var(--prom-muted)]">Dipendenti in anagrafica</span>
              <p className="mt-1 text-2xl font-semibold text-[var(--prom-text)]">{forecastCorr.employees.length}</p>
            </li>
            <li className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2">
              <span className="text-xs font-semibold uppercase text-[var(--prom-muted)]">Costo stimato primo mese</span>
              <p className="mt-1 text-2xl font-semibold text-[var(--prom-text)]">
                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                  forecastCorr.series[0]?.totalMonthlyEur ?? 0
                )}
              </p>
            </li>
            <li className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase text-[var(--prom-muted)]">Top 3 centri di costo per costo mensile stimato</span>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--prom-muted)]">
                {forecastCorr.byCostCenter.slice(0, 3).map((c) => (
                  <li key={c.costCenterId ?? "x"}>
                    <span className="text-[var(--prom-text)]">{c.label}</span> —{" "}
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                      c.monthlyTotalEur
                    )}{" "}
                    <span className="text-xs">({c.headcount} persone)</span>
                  </li>
                ))}
              </ol>
            </li>
          </ul>
          <p className="mt-3 text-xs text-[var(--prom-muted)]">
            Dettaglio completo:{" "}
            <a href="/forecast" className="font-medium text-[var(--prom-gold)] underline">
              Forecast costi
            </a>
            .
          </p>
        </HebbAiGlassPanel>
      ) : null}

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {turnoverPayload ? (
        <HebbAiGlassPanel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[var(--prom-text)]">Sintesi in linguaggio naturale</h2>
            <div className="flex flex-wrap items-center gap-3">
              {sessionCanUseNexaAiOpenAiLlm(getSessionUser()) ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                  <input type="checkbox" checked={narrativeLlm} onChange={(e) => setNarrativeLlm(e.target.checked)} />
                  Raffinamento con AI (solo su numeri aggregati)
                </label>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={narrativeBusy} onClick={() => void runNarrative()}>
                {narrativeBusy ? "Generazione…" : "Genera sintesi"}
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <LlmUsageStatusBanner
              idle={!narrative}
              llm={
                narrative
                  ? {
                      active: Boolean(sessionCanUseNexaAiOpenAiLlm(getSessionUser()) && narrativeLlm),
                      refineApplied: narrative.llmApplied
                    }
                  : null
              }
            />
          </div>
          {narrative ? (
            <div className="mt-6 space-y-3 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4">
              <p className="text-xs text-[var(--prom-muted)]">
                {narrative.llmApplied ? "Template + LLM" : "Solo template"} — audit registrato.
              </p>
              <p className="font-synapse text-base font-semibold text-[var(--prom-text)]">{narrative.title}</p>
              <ul className="list-inside list-disc text-sm text-[var(--prom-muted)]">
                {narrative.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-[var(--prom-muted)]">{narrative.summary}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--prom-muted)]">
              Inviamo solo score e trend aggregati, non nomi o ID dipendenti.
            </p>
          )}
        </HebbAiGlassPanel>
      ) : null}

      {turnoverPayload ? (
        <HebbAiGlassPanel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[var(--prom-text)]">Analisi attiva (aggregati per reparto)</h2>
            <div className="flex flex-wrap items-center gap-3">
              {sessionCanUseNexaAiOpenAiLlm(getSessionUser()) ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                  <input type="checkbox" checked={deepLlm} onChange={(e) => setDeepLlm(e.target.checked)} />
                  Usa LLM su solo aggregati (fasce score, medie per centro di costo)
                </label>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={deepBusy} onClick={() => void runDeepAnalysis()}>
                {deepBusy ? "Analisi…" : "Avvia analisi attiva"}
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <LlmUsageStatusBanner
              idle={!deepAnalysis}
              llm={
                deepAnalysis
                  ? {
                      active: Boolean(
                        sessionCanUseNexaAiOpenAiLlm(getSessionUser()) && deepLlm
                      ),
                      refineApplied: deepAnalysis.llmApplied
                    }
                  : null
              }
            />
          </div>
          {deepAnalysis ? (
            <div className="mt-6 space-y-3 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4">
              <p className="text-xs text-[var(--prom-muted)]">
                {deepAnalysis.llmApplied ? "Analisi LLM" : "Solo template"} — nessun nominativo inviato al modello.
              </p>
              <p className="font-synapse text-base font-semibold text-[var(--prom-text)]">{deepAnalysis.title}</p>
              <ul className="list-inside list-disc text-sm text-[var(--prom-muted)]">
                {deepAnalysis.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-[var(--prom-muted)]">{deepAnalysis.summary}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--prom-muted)]">
              Priorità operative e rischi plausibili da distribuzione score e medie per centro di costo (etichette
              reparto, senza elenco nominativi nel payload LLM).
            </p>
          )}
        </HebbAiGlassPanel>
      ) : null}

      {trend.length > 0 ? (
        <HebbAiGlassPanel className="relative">
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">Trend score (media settimanale)</h2>
          <p className="mt-2 text-xs text-[var(--prom-muted)]">
            Ogni barra è la <strong>media aritmetica degli score individuali (0–100)</strong> dei dipendenti inclusi in
            quella settimana (<strong>sampleSize</strong> = numero di profili nel campione). Passa il puntatore sulla
            barra per vedere i valori.
          </p>
          {trendHover ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-12 z-20 w-[min(92vw,320px)] -translate-x-1/2 rounded-xl border border-[var(--prom-line-strong)] bg-[var(--prom-surface)] px-3 py-2 text-xs text-[var(--prom-text)] shadow-lg"
            >
              <strong>Settimana {trendHover.weekStart}</strong>
              <br />
              Media score: <span className="tabular-nums font-semibold">{trendHover.avgScore}</span> su 100
              <br />
              Campione: <span className="tabular-nums">{trendHover.sampleSize}</span> profili
            </div>
          ) : null}
          <div className="mt-6 flex h-36 items-end gap-1.5 border-t border-[var(--prom-line)] pt-4">
            {trend.map((p) => (
              <div key={p.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <button
                  type="button"
                  className="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-[#002D72] to-[color-mix(in_srgb,var(--prom-gold)_50%,#002d72)] shadow-md outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)]"
                  style={{ height: `${Math.max(12, (p.avgScore / maxTrend) * 120)}px` }}
                  aria-label={`Settimana ${p.weekStart}, media score ${p.avgScore}, campione ${p.sampleSize}`}
                  onMouseEnter={() => setTrendHover(p)}
                  onMouseLeave={() => setTrendHover(null)}
                  onFocus={() => setTrendHover(p)}
                  onBlur={() => setTrendHover(null)}
                />
                <span className="max-w-full truncate text-[10px] font-medium text-[var(--prom-muted)]">
                  {p.weekStart.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </HebbAiGlassPanel>
      ) : null}

      <div className="space-y-8">
        {groupedItems.map(([ccKey, rows]) => (
          <section key={ccKey}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              {ccKey === "__none__" ? "Senza centro di costo" : ccLabelForRow({ costCenterId: ccKey } as TurnoverRetentionItem, costCenters)}
              <span className="ml-2 text-[var(--prom-text)]">({rows.length})</span>
            </h3>
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.userId}>
                  <HebbAiGlassTile>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <span className="font-semibold text-[var(--prom-text)]">{row.fullName}</span>
                        <span className="ml-2 text-xs text-[var(--prom-muted)]">
                          {row.costCenterId ? ccLabelForRow(row, costCenters) : "Senza centro di costo"}
                        </span>
                      </div>
                      <div className="text-right text-sm">
                        <span className="font-semibold tabular-nums text-[var(--prom-gold)]">{row.score}</span>
                        <span className="ml-2 text-xs text-[var(--prom-muted)]">conf. {Math.round(row.confidence * 100)}%</span>
                      </div>
                    </div>
                    <ul className="mt-3 list-inside list-disc text-xs leading-relaxed text-[var(--prom-muted)]">
                      {row.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </HebbAiGlassTile>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </HebbAiExperienceShell>
  );
}
