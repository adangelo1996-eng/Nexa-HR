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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Turnover e retention</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--prom-muted)]">
            Score rule-based (modello {modelVersion || "—"}) da tenure, ferie e contratto. I dati sono snapshot per
            azienda: aggiorna il job dopo cambi anagrafici. Trend su medie settimanali degli snapshot salvati.
          </p>
          {lastRunAt ? (
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Ultimo run: {new Date(lastRunAt).toLocaleString("it-IT")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-800">Nessuno snapshot: usa &quot;Aggiorna segnali&quot;.</p>
          )}
        </div>
        <Button type="button" disabled={refreshing} onClick={() => void onRefreshSignals()}>
          {refreshing ? "Aggiornamento…" : "Aggiorna segnali"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-[var(--prom-muted)]">Centro di costo</label>
        <select
          className="rounded-md border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
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

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      ) : null}

      {turnoverPayload ? (
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Narrativa aggregata (senza nominativi)</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
                <input type="checkbox" checked={narrativeLlm} onChange={(e) => setNarrativeLlm(e.target.checked)} />
                Raffinamento LLM
              </label>
              <Button type="button" size="sm" variant="outline" disabled={narrativeBusy} onClick={() => void runNarrative()}>
                {narrativeBusy ? "Generazione…" : "Genera sintesi turnover"}
              </Button>
            </div>
          </div>
          {narrative ? (
            <div className="mt-3 space-y-2 text-sm text-[var(--prom-text)]">
              <p className="text-xs text-[var(--prom-muted)]">
                {narrative.llmApplied ? "Template + LLM" : "Solo template"} — audit registrato.
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
              Inviamo solo score e trend aggregati, non nomi o ID dipendenti.
            </p>
          )}
        </div>
      ) : null}

      {trend.length > 0 ? (
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Trend score (media settimanale)</h2>
          <div className="mt-3 flex h-28 items-end gap-1">
            {trend.map((p) => (
              <div key={p.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[#002D72]/85"
                  style={{ height: `${Math.max(6, (p.avgScore / maxTrend) * 100)}%` }}
                  title={`${p.weekStart}: ${p.avgScore} (n=${p.sampleSize})`}
                />
                <span className="max-w-full truncate text-[10px] text-[var(--prom-muted)]">
                  {p.weekStart.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((row) => (
          <li key={row.userId} className="rounded-lg border border-[var(--prom-line)] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium text-[var(--prom-text)]">{row.fullName}</span>
                {row.costCenterId ? (
                  <span className="ml-2 text-xs text-[var(--prom-muted)]">CC {row.costCenterId}</span>
                ) : null}
              </div>
              <div className="text-right text-sm">
                <span className="tabular-nums font-semibold text-[var(--prom-gold)]">{row.score}</span>
                <span className="ml-2 text-xs text-[var(--prom-muted)]">
                  conf. {Math.round(row.confidence * 100)}%
                </span>
              </div>
            </div>
            <ul className="mt-2 list-inside list-disc text-xs text-[var(--prom-muted)]">
              {row.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
