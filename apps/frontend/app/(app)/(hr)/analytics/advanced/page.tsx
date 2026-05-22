"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import { HUB_ACCENT_MAP, HUB_ICON_MAP } from "@/lib/advanced-analytics-profiles";
import {
  fetchAdvancedAnalyticsHubCatalog,
  postAdvancedAnalysisInsight,
  type AnalyticsHubCardDto,
  type StructuredAnalyticsInsightDto
} from "@/lib/api";
import { getToken, getSessionUser, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";

function InsightPreviewBlock(props: { insight: StructuredAnalyticsInsightDto }): React.JSX.Element {
  const { insight } = props;
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-[var(--prom-text)]">{insight.title}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            insight.llmApplied
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-[var(--prom-line)] text-[var(--prom-muted)]"
          }`}
        >
          {insight.llmApplied ? "Insight AI" : "Template locale"}
        </span>
      </div>
      <p className="leading-relaxed text-[var(--prom-text)]">{insight.situazione}</p>
      {insight.azioni7giorni.length > 0 ? (
        <ul className="list-inside list-disc space-y-1 text-[var(--prom-muted)]">
          {insight.azioni7giorni.slice(0, 3).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AnalysisCard(props: {
  card: AnalyticsHubCardDto;
  result?: StructuredAnalyticsInsightDto;
  busy: boolean;
  onPreview: (card: AnalyticsHubCardDto) => void;
}): React.JSX.Element {
  const { card, result, busy } = props;
  const CardIcon = card.iconKey ? HUB_ICON_MAP[card.iconKey] : Sparkles;
  const accent = card.accentKey ? HUB_ACCENT_MAP[card.accentKey] : "text-[#002D72] dark:text-sky-300";
  return (
    <article
      className="flex flex-col rounded-2xl border border-[var(--card-border)] p-5 shadow-[var(--card-shadow)]"
      style={{ background: "var(--card-bg)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {CardIcon ? <CardIcon className={`mt-0.5 h-6 w-6 shrink-0 ${accent}`} aria-hidden /> : null}
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">{card.titleIt}</h2>
        </div>
        {card.llmCapable ? <Sparkles className={`h-5 w-5 shrink-0 opacity-70 ${accent}`} aria-hidden /> : null}
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--prom-muted)]">{card.blurbIt}</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href={card.href as Route}
          scroll={false}
          className="inline-flex items-center gap-1 rounded-lg bg-[#002D72] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:bg-sky-800"
        >
          Apri analisi
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
        {card.llmCapable ? (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => props.onPreview(card)}>
            {busy ? "In corso…" : "Anteprima AI"}
          </Button>
        ) : null}
      </div>
      {result ? <InsightPreviewBlock insight={result} /> : null}
    </article>
  );
}

export default function AdvancedAnalyticsHubPage(): React.JSX.Element {
  const [cards, setCards] = useState<AnalyticsHubCardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [useLlm, setUseLlm] = useState(true);
  const [results, setResults] = useState<Record<string, StructuredAnalyticsInsightDto>>({});
  const sessionUser = getSessionUser();
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(sessionUser ?? undefined);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetchAdvancedAnalyticsHubCatalog(token);
      setCards(res.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento hub");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAnalysis = useCallback(
    async (card: AnalyticsHubCardDto): Promise<void> => {
      const token = getToken();
      if (!token) return;
      setBusyId(card.id);
      setError(null);
      try {
        const out = await postAdvancedAnalysisInsight(token, card.id, {
          useLlm: useLlm && card.llmCapable && llmAllowed
        });
        setResults((prev) => ({ ...prev, [card.id]: out }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Esecuzione analisi non riuscita");
      } finally {
        setBusyId(null);
      }
    },
    [useLlm, llmAllowed]
  );

  return (
    <NexaHrAppPage
      eyebrow="Analytics & Intelligence"
      title="Advanced analysis"
      subtitle="Otto analisi HR distinte su dati aggregati: ogni pagina ha prompt AI, KPI hero e chip insight dedicati."
    >
      <div className="mb-6">
        <Link
          href={"/analytics" as Route}
          className="text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
        >
          ← Hub analisi (4 core)
        </Link>
      </div>

      <LlmUsageStatusBanner
        className="mb-6"
        idle={Object.keys(results).length === 0}
        llm={{
          active: sessionUser?.nexaAiOpenAiEnabled === true,
          refineApplied: Object.values(results).some((r) => r.llmApplied)
        }}
      />

      {llmAllowed ? (
        <label className="mb-6 flex cursor-pointer items-center gap-2 text-sm text-[var(--prom-muted)]">
          <input
            type="checkbox"
            checked={useLlm}
            onChange={(e) => setUseLlm(e.target.checked)}
            className="rounded border-[var(--prom-line)]"
          />
          Narrativa AI (dati pseudonimizzati via privacy gateway)
        </label>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento analisi…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {cards.map((card) => (
            <AnalysisCard
              key={card.id}
              card={card}
              result={results[card.id]}
              busy={busyId === card.id}
              onPreview={(c) => void runAnalysis(c)}
            />
          ))}
        </div>
      )}
    </NexaHrAppPage>
  );
}
