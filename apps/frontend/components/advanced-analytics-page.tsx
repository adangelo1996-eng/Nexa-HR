"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import type { NexaPageHelpKey } from "@/lib/nexa-page-help";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import { NexaKpiBarChart } from "@/components/nexa-charts";
import {
  fetchAdvancedAnalysisKpis,
  postAdvancedAnalysisChat,
  postAdvancedAnalysisInsight,
  type AnalyticsKpiDto,
  type StructuredAnalyticsInsightDto
} from "@/lib/api";
import { getToken, getSessionUser, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type AdvancedAnalyticsPageConfig = {
  analysisId: string;
  title: string;
  subtitle: string;
  eyebrow?: string;
  pageHelpKey?: NexaPageHelpKey;
  children?: React.ReactNode;
};

function StructuredInsightBlock(props: { insight: StructuredAnalyticsInsightDto }): React.JSX.Element {
  const { insight } = props;
  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-[var(--prom-text)]">{insight.title}</h2>
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
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--prom-muted)]">Situazione</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--prom-text)]">{insight.situazione}</p>
      </div>
      <InsightList title="Correlazioni" items={insight.correlazioni} />
      <InsightList title="Rischi" items={insight.rischi} />
      <InsightList title="Azioni 7 giorni" items={insight.azioni7giorni} />
    </section>
  );
}

function InsightList(props: { title: string; items: string[] }): React.JSX.Element | null {
  if (!props.items.length) {
    return null;
  }
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--prom-muted)]">{props.title}</h3>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--prom-text)]">
        {props.items.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdvancedAnalyticsPage(props: AdvancedAnalyticsPageConfig): React.JSX.Element {
  const { analysisId, title, subtitle, eyebrow = "Analytics & Intelligence", pageHelpKey, children } = props;
  const [kpis, setKpis] = useState<AnalyticsKpiDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useLlm, setUseLlm] = useState(true);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insight, setInsight] = useState<StructuredAnalyticsInsightDto | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const sessionUser = getSessionUser();
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(sessionUser ?? undefined);

  const loadKpis = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetchAdvancedAnalysisKpis(token, analysisId);
      setKpis(res.kpis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento KPI");
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns]);

  const generateInsight = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setInsightBusy(true);
    setError(null);
    try {
      const out = await postAdvancedAnalysisInsight(token, analysisId, {
        useLlm: useLlm && llmAllowed
      });
      setInsight(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generazione insight non riuscita");
    } finally {
      setInsightBusy(false);
    }
  }, [analysisId, useLlm, llmAllowed]);

  const sendChat = useCallback(async (): Promise<void> => {
    const token = getToken();
    const msg = chatInput.trim();
    if (!token || !msg) {
      return;
    }
    const nextHistory = [...chatTurns, { role: "user" as const, content: msg }];
    setChatInput("");
    setChatTurns(nextHistory);
    setChatBusy(true);
    setError(null);
    try {
      const out = await postAdvancedAnalysisChat(token, analysisId, {
        message: msg,
        history: nextHistory.slice(0, -1)
      });
      setChatTurns((prev) => [...prev, { role: "assistant", content: out.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat analista non disponibile");
      setChatTurns((prev) => prev.slice(0, -1));
    } finally {
      setChatBusy(false);
    }
  }, [analysisId, chatInput, chatTurns]);

  return (
    <NexaHrAppPage
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      headerTrailing={pageHelpKey ? <NexaPageHelpButton pageKey={pageHelpKey} /> : undefined}
    >
      <div className="mb-6">
        <Link
          href={"/analytics" as Route}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Torna all&apos;hub Analytics
        </Link>
      </div>

      <LlmUsageStatusBanner
        className="mb-6"
        idle={!insight}
        llm={{
          active: sessionUser?.nexaAiOpenAiEnabled === true,
          refineApplied: insight?.llmApplied === true
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
          Usa OpenAI per insight e chat (dati sempre pseudonimizzati)
        </label>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">KPI</h2>
        {loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento indicatori…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <div
                key={k.id}
                className="rounded-xl border border-[var(--card-border)] p-4"
                style={{ background: "var(--card-bg)" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
                  {k.labelIt}
                </p>
                <p className="mt-1 text-xl font-semibold text-[var(--prom-text)]">{k.value}</p>
                {k.hintIt ? <p className="mt-1 text-xs text-[var(--prom-muted)]">{k.hintIt}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {!loading && kpis.length > 0 ? <NexaKpiBarChart kpis={kpis} className="mb-8" /> : null}

      {children}

      <div className="mb-8 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={insightBusy || loading} onClick={() => void generateInsight()}>
          <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
          {insightBusy ? "Generazione…" : "Genera insight AI"}
        </Button>
      </div>

      {insight ? <StructuredInsightBlock insight={insight} /> : null}

      <section className="mt-8 rounded-2xl border border-[var(--card-border)] p-4" style={{ background: "var(--card-bg)" }}>
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#002D72] dark:text-sky-300" aria-hidden />
          <h2 className="text-base font-semibold text-[var(--prom-text)]">Chiedi all&apos;analista</h2>
        </div>
        <p className="mb-3 text-xs text-[var(--prom-muted)]">
          Domande sul dataset di questa analisi. Risposte su aggregati pseudonimizzati, senza nominativi nel modello.
        </p>
        <div className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] p-3">
          {chatTurns.length === 0 ? (
            <p className="text-xs text-[var(--prom-muted)]">Es. «Quali cluster hanno priorità questa settimana?»</p>
          ) : (
            chatTurns.map((t, i) => (
              <p
                key={i}
                className={`text-sm ${t.role === "user" ? "text-[var(--prom-text)]" : "text-[var(--prom-muted)]"}`}
              >
                <span className="font-medium">{t.role === "user" ? "Tu" : "Analista"}:</span> {t.content}
              </p>
            ))
          )}
          <div ref={chatEndRef} />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendChat();
          }}
        >
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Scrivi una domanda…"
            maxLength={2000}
            disabled={chatBusy}
          />
          <Button type="submit" size="sm" disabled={chatBusy || !chatInput.trim()}>
            Invia
          </Button>
        </form>
      </section>
    </NexaHrAppPage>
  );
}
