"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchTurnoverRetention,
  postAnalyticsNarrative,
  postTurnoverRetentionRefresh,
  type TurnoverRetentionItem
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";

export default function InsightsPage(): React.JSX.Element {
  const [items, setItems] = useState<TurnoverRetentionItem[]>([]);
  const [trend, setTrend] = useState<Array<{ weekStart: string; avgScore: number; sampleSize: number }>>([]);
  const [modelVersion, setModelVersion] = useState("");
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [costCenterOptions, setCostCenterOptions] = useState<string[]>([]);
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
  const [turnoverPayload, setTurnoverPayload] = useState<{
    items: TurnoverRetentionItem[];
    trend: Array<{ weekStart: string; avgScore: number; sampleSize: number }>;
    modelVersion: string;
  } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetchTurnoverRetention(t, {
        costCenterId: costCenterId.trim() || undefined,
        trendWeeks: 10
      });
      setItems(res.items);
      setTrend(res.trend);
      setModelVersion(res.modelVersion);
      setCostCenterOptions(res.costCenterOptions ?? []);
      setLastRunAt(res.items[0]?.computedAt ?? null);
      setTurnoverPayload({
        items: res.items,
        trend: res.trend,
        modelVersion: res.modelVersion
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setBusy(false);
    }
  }, [costCenterId]);

  useEffect(() => {
    void load();
  }, [load]);

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
          Score rule-based (modello <span className="font-semibold text-[var(--prom-text)]">{modelVersion || "—"}</span>)
          da tenure, ferie e contratto. Snapshot per azienda: aggiorna dopo cambi anagrafici. Trend su medie settimanali
          salvate.
          {lastRunAt ? (
            <span className="mt-2 block text-sm text-[var(--prom-muted)]">
              Ultimo run: {new Date(lastRunAt).toLocaleString("it-IT")}
            </span>
          ) : (
            <span className="mt-2 block text-sm text-amber-800 dark:text-amber-200/90">
              Nessuno snapshot: usa &quot;Aggiorna segnali&quot;.
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
            <option value="">Tutti</option>
            {costCenterOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          {busy ? <span className="text-xs text-[var(--prom-muted)]">Caricamento…</span> : null}
        </div>
      </HebbAiGlassPanel>

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {turnoverPayload ? (
        <HebbAiGlassPanel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[var(--prom-text)]">Narrativa aggregata (senza nominativi)</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                <input type="checkbox" checked={narrativeLlm} onChange={(e) => setNarrativeLlm(e.target.checked)} />
                Raffinamento LLM
              </label>
              <Button type="button" size="sm" variant="outline" disabled={narrativeBusy} onClick={() => void runNarrative()}>
                {narrativeBusy ? "Generazione…" : "Genera sintesi turnover"}
              </Button>
            </div>
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

      {trend.length > 0 ? (
        <HebbAiGlassPanel>
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">Trend score (media settimanale)</h2>
          <div className="mt-6 flex h-36 items-end gap-1.5 border-t border-[var(--prom-line)] pt-4">
            {trend.map((p) => (
              <div key={p.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-[#002D72] to-[color-mix(in_srgb,var(--prom-gold)_50%,#002d72)] shadow-md"
                  style={{ height: `${Math.max(12, (p.avgScore / maxTrend) * 120)}px` }}
                  title={`${p.weekStart}: ${p.avgScore} (n=${p.sampleSize})`}
                />
                <span className="max-w-full truncate text-[10px] font-medium text-[var(--prom-muted)]">
                  {p.weekStart.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </HebbAiGlassPanel>
      ) : null}

      <ul className="space-y-3">
        {items.map((row) => (
          <li key={row.userId}>
            <HebbAiGlassTile>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-semibold text-[var(--prom-text)]">{row.fullName}</span>
                  {row.costCenterId ? (
                    <span className="ml-2 text-xs text-[var(--prom-muted)]">CC {row.costCenterId}</span>
                  ) : null}
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
    </HebbAiExperienceShell>
  );
}
