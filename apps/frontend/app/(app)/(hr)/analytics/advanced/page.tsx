"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import {
  fetchAdvancedAnalyticsHubCatalog,
  fetchAnalyticsHubCatalog,
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
  return (
    <article
      className="flex flex-col rounded-2xl border border-[var(--card-border)] p-5 shadow-[var(--card-shadow)]"
      style={{ background: "var(--card-bg)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--prom-text)]">{card.titleIt}</h2>
        {card.llmCapable ? (
          <Sparkles className="h-5 w-5 shrink-0 text-[#002D72] opacity-70 dark:text-sky-300" aria-hidden />
        ) : null}
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
  const [advancedCards, setAdvancedCards] = useState<AnalyticsHubCardDto[]>([]);
  const [coreCards, setCoreCards] = useState<AnalyticsHubCardDto[]>([]);
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
      const [advanced, core] = await Promise.all([
        fetchAdvancedAnalyticsHubCatalog(token),
        fetchAnalyticsHubCatalog(token)
      ]);
      setAdvancedCards(advanced.cards);
      setCoreCards(core.cards);
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
      title="Analisi avanzate"
      subtitle="Quattro analisi specialistiche oltre al core HR. Le analisi economico, retention, competenze e operativo restano nell'hub principale — nessuna duplicazione."
    >
      <div className="mb-6">
        <Link
          href={"/analytics" as Route}
          className="text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
        >
          ← Hub analisi core (4 analisi)
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
        <>
          <section className="mb-10">
            <h2 className="mb-1 text-base font-semibold text-[var(--prom-text)]">Perimetro avanzato</h2>
            <p className="mb-4 text-sm text-[var(--prom-muted)]">
              Analisi aggiuntive non presenti nell'hub core: approfondimenti su produttività, equità, carico manager e scenari.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {advancedCards.map((card) => (
                <AnalysisCard
                  key={card.id}
                  card={card}
                  result={results[card.id]}
                  busy={busyId === card.id}
                  onPreview={(c) => void runAnalysis(c)}
                />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-[var(--prom-line)] p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--prom-text)]">Vedi anche analisi core</h2>
                <p className="mt-1 text-sm text-[var(--prom-muted)]">
                  Economico, retention, competenze e operativo condividono le stesse pagine approfondite dell'hub principale.
                </p>
              </div>
              <Link
                href={"/analytics" as Route}
                className="inline-flex items-center gap-1 text-sm font-medium text-[#002D72] hover:underline dark:text-sky-300"
              >
                Apri hub core
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {coreCards.map((card) => (
                <Link
                  key={card.id}
                  href={card.href as Route}
                  className="rounded-xl border border-[var(--card-border)] p-4 transition hover:border-[#002D72]/35"
                  style={{ background: "var(--card-bg)" }}
                >
                  <p className="text-sm font-semibold text-[var(--prom-text)]">{card.titleIt}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">{card.blurbIt}</p>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </NexaHrAppPage>
  );
}
