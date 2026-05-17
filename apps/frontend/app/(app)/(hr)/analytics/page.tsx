"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import {
  fetchAnalyticsHubCatalog,
  postAdvancedAnalysisInsight,
  type AnalyticsHubCardDto,
  type StructuredAnalyticsInsightDto
} from "@/lib/api";
import { getToken, sessionCanUseNexaAiOpenAiLlm, getSessionUser } from "@/lib/auth-session";

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

export default function AnalyticsHubPage(): React.JSX.Element {
  const [cards, setCards] = useState<AnalyticsHubCardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [useLlm, setUseLlm] = useState(true);
  const [results, setResults] = useState<Record<string, StructuredAnalyticsInsightDto>>({});
  const sessionUser = getSessionUser();
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(sessionUser ?? undefined);
  const llmBanner = {
    active: sessionUser?.nexaAiOpenAiEnabled === true,
    refineApplied: Object.values(results).some((r) => r.llmApplied)
  };

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetchAnalyticsHubCatalog(token);
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
      if (!token) {
        return;
      }
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
      title="Hub Analytics"
      subtitle="Quattro analisi strategiche su dati aggregati e pseudonimizzati. Ogni esecuzione passa da AiPrivacyGateway prima del modello linguistico."
    >
      <LlmUsageStatusBanner
        className="mb-6"
        idle={Object.keys(results).length === 0}
        llm={llmBanner}
      />
      {llmAllowed ? (
        <label className="mb-6 flex cursor-pointer items-center gap-2 text-sm text-[var(--prom-muted)]">
          <input
            type="checkbox"
            checked={useLlm}
            onChange={(e) => setUseLlm(e.target.checked)}
            className="rounded border-[var(--prom-line)]"
          />
          Usa OpenAI per la narrativa (dati sempre pseudonimizzati)
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
          {cards.map((card) => {
            const result = results[card.id];
            const busy = busyId === card.id;
            return (
              <article
                key={card.id}
                className="flex flex-col rounded-2xl border border-[var(--card-border)] p-5 shadow-[var(--card-shadow)]"
                style={{ background: "var(--card-bg)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
                      {card.id.toUpperCase()}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--prom-text)]">{card.titleIt}</h2>
                  </div>
                  {card.llmCapable ? (
                    <Sparkles className="h-5 w-5 shrink-0 text-[#002D72] opacity-70 dark:text-sky-300" aria-hidden />
                  ) : null}
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--prom-muted)]">{card.blurbIt}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void runAnalysis(card)}
                  >
                    {busy ? "Analisi in corso…" : "Anteprima insight AI"}
                  </Button>
                  <Link
                    href={card.href as Route}
                    scroll={false}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--prom-line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--prom-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
                  >
                    Apri analisi completa
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
                {result ? <InsightPreviewBlock insight={result} /> : null}
              </article>
            );
          })}
        </div>
      )}
    </NexaHrAppPage>
  );
}
