"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import {
  fetchAdvancedAnalysisFilterOptions,
  fetchAdvancedAnalysisKpis,
  postAdvancedAnalysisChat,
  postAdvancedAnalysisInsight,
  type AnalyticsFilterOptionsDto,
  type AnalyticsKpiDto,
  type StructuredAnalyticsInsightDto
} from "@/lib/api";
import { getToken, getSessionUser, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { buildHebbPageContext } from "@/lib/hebb-page-context";
import { resolveAdvancedVisual, type AdvancedAnalysisVisualProfile } from "@/lib/advanced-analytics-profiles";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type AdvancedAnalyticsPageConfig = {
  analysisId: string;
  title: string;
  subtitle: string;
  eyebrow?: string;
  children?: React.ReactNode;
};

function StructuredInsightBlock(props: {
  insight: StructuredAnalyticsInsightDto;
  profile: AdvancedAnalysisVisualProfile;
}): React.JSX.Element {
  const { insight, profile } = props;
  const labels = profile.sectionLabels;
  return (
    <section
      className={`mt-6 space-y-4 rounded-2xl border p-5 ${profile.accentBorderClass} ${profile.accentBgClass}`}
    >
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
      <InsightList title={labels.correlazioni} items={insight.correlazioni} />
      <InsightList title={labels.rischi} items={insight.rischi} />
      <InsightList title={labels.azioni7giorni} items={insight.azioni7giorni} />
      <InsightList title={labels.raccomandazioniHr} items={insight.raccomandazioniHr ?? []} />
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
  const { analysisId, title, subtitle, eyebrow = "Analytics & Intelligence", children } = props;
  const visual = useMemo(() => resolveAdvancedVisual(analysisId), [analysisId]);
  const PageIcon = visual.icon;

  const [kpis, setKpis] = useState<AnalyticsKpiDto[]>([]);
  const [filterOptions, setFilterOptions] = useState<AnalyticsFilterOptionsDto | null>(null);
  const [costCenterScope, setCostCenterScope] = useState("");
  const [teamScope, setTeamScope] = useState("");
  const [periodScope, setPeriodScope] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useLlm, setUseLlm] = useState(true);
  const [insightBusy, setInsightBusy] = useState(false);
  const [chipBusyId, setChipBusyId] = useState<string | null>(null);
  const [insight, setInsight] = useState<StructuredAnalyticsInsightDto | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const pathname = usePathname();
  const sessionUser = getSessionUser();
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(sessionUser ?? undefined);

  const hebbPageContext = useMemo(
    () =>
      buildHebbPageContext({
        pathname: pathname ?? `/analytics/advanced/${analysisId}`,
        sessionUser,
        costCenterScope: costCenterScope || undefined,
        teamScope: teamScope || undefined,
        periodScope: periodScope || undefined
      }),
    [pathname, analysisId, sessionUser, costCenterScope, teamScope, periodScope]
  );

  const kpiQuery = useMemo(
    () => ({
      costCenter: costCenterScope || undefined,
      team: teamScope || undefined,
      period: periodScope || undefined
    }),
    [costCenterScope, teamScope, periodScope]
  );

  const loadFilters = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    try {
      const opts = await fetchAdvancedAnalysisFilterOptions(token, analysisId);
      setFilterOptions(opts);
    } catch {
      setFilterOptions(null);
    }
  }, [analysisId]);

  const loadKpis = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetchAdvancedAnalysisKpis(token, analysisId, kpiQuery);
      setKpis(res.kpis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento KPI");
    } finally {
      setLoading(false);
    }
  }, [analysisId, kpiQuery]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns]);

  const heroKpi = kpis.find((k) => k.id === visual.heroKpiId) ?? kpis[0];
  const secondaryKpis = visual.secondaryKpiIds
    .map((id) => kpis.find((k) => k.id === id))
    .filter((k): k is AnalyticsKpiDto => Boolean(k));

  const generateInsight = useCallback(
    async (insightFocus?: string): Promise<void> => {
      const token = getToken();
      if (!token) return;
      setInsightBusy(true);
      setError(null);
      try {
        const out = await postAdvancedAnalysisInsight(token, analysisId, {
          useLlm: useLlm && llmAllowed,
          pageContext: hebbPageContext,
          insightFocus
        });
        setInsight(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generazione insight non riuscita");
      } finally {
        setInsightBusy(false);
      }
    },
    [analysisId, useLlm, llmAllowed, hebbPageContext]
  );

  const runInsightChip = useCallback(
    async (chipId: string, userMessageIt: string, insightFocus: string): Promise<void> => {
      const token = getToken();
      if (!token) return;
      setChipBusyId(chipId);
      setError(null);
      try {
        const out = await postAdvancedAnalysisInsight(token, analysisId, {
          useLlm: useLlm && llmAllowed,
          pageContext: hebbPageContext,
          insightFocus
        });
        setInsight(out);
        setChatTurns((prev) => [
          ...prev,
          { role: "user", content: userMessageIt },
          {
            role: "assistant",
            content: out.situazione.slice(0, 600) + (out.situazione.length > 600 ? "…" : "")
          }
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chip insight non riuscito");
      } finally {
        setChipBusyId(null);
      }
    },
    [analysisId, useLlm, llmAllowed, hebbPageContext]
  );

  const sendChat = useCallback(
    async (opts?: { messageOverride?: string; deepen?: boolean; insightFocus?: string }): Promise<void> => {
      const token = getToken();
      const msg = (opts?.messageOverride ?? chatInput).trim();
      if (!token || !msg) return;
      const nextHistory = [...chatTurns, { role: "user" as const, content: msg }];
      if (!opts?.messageOverride) {
        setChatInput("");
      }
      setChatTurns(nextHistory);
      setChatBusy(true);
      setError(null);
      try {
        const out = await postAdvancedAnalysisChat(token, analysisId, {
          message: msg,
          history: nextHistory.slice(0, -1),
          pageContext: hebbPageContext,
          deepen: opts?.deepen,
          insightFocus: opts?.insightFocus
        });
        setChatTurns((prev) => [...prev, { role: "assistant", content: out.reply }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chat analista non disponibile");
        setChatTurns((prev) => prev.slice(0, -1));
      } finally {
        setChatBusy(false);
      }
    },
    [analysisId, chatInput, chatTurns, hebbPageContext]
  );

  const deepenAnalystReply = useCallback((): void => {
    if (chatBusy || chatTurns.length === 0) return;
    const last = chatTurns[chatTurns.length - 1];
    if (last?.role !== "assistant") return;
    void sendChat({ messageOverride: "Approfondisci", deepen: true });
  }, [chatBusy, chatTurns, sendChat]);

  return (
    <NexaHrAppPage eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={"/analytics/advanced" as Route}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Advanced analysis
        </Link>
        <span className="text-[var(--prom-muted)]">·</span>
        <Link
          href={"/analytics" as Route}
          className="text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
        >
          Hub analisi
        </Link>
      </div>

      <div
        className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 ${visual.accentBorderClass} ${visual.accentBgClass}`}
      >
        <PageIcon className={`mt-0.5 h-8 w-8 shrink-0 ${visual.accentClass}`} aria-hidden />
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider ${visual.accentClass}`}>
            Analisi {visual.id.replace(/_/g, " ")}
          </p>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">
            Filtri CC, team e periodo applicati ai payload insight/chat (solo aggregati pseudonimizzati).
          </p>
        </div>
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

      <section className="mb-6 rounded-xl border border-[var(--card-border)] p-4" style={{ background: "var(--card-bg)" }}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">Filtri analisi</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-[var(--prom-muted)]">
            Centro di costo
            <select
              value={costCenterScope}
              onChange={(e) => setCostCenterScope(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
            >
              <option value="">Tutti i CC</option>
              {(filterOptions?.costCenters ?? []).map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--prom-muted)]">
            Team
            <select
              value={teamScope}
              onChange={(e) => setTeamScope(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
            >
              <option value="">Tutti i team</option>
              {(filterOptions?.teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--prom-muted)]">
            Periodo (YYYY-MM)
            <Input
              value={periodScope}
              onChange={(e) => setPeriodScope(e.target.value)}
              placeholder={new Date().toISOString().slice(0, 7)}
              className="mt-1"
              maxLength={7}
            />
          </label>
        </div>
      </section>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">Indicatori chiave</h2>
        {loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento indicatori…</p>
        ) : (
          <>
            {heroKpi ? (
              <div
                className={`mb-4 rounded-2xl border p-5 ${visual.accentBorderClass}`}
                style={{ background: "var(--card-bg)" }}
              >
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${visual.accentClass}`}>
                  Hero · {heroKpi.labelIt}
                </p>
                <p className={`mt-2 text-3xl font-bold ${visual.accentClass}`}>{heroKpi.value}</p>
                {heroKpi.hintIt ? <p className="mt-1 text-xs text-[var(--prom-muted)]">{heroKpi.hintIt}</p> : null}
              </div>
            ) : null}
            {secondaryKpis.length > 0 ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                {secondaryKpis.map((k) => (
                  <div
                    key={k.id}
                    className={`rounded-xl border p-3 ${visual.accentBorderClass}`}
                    style={{ background: "var(--card-bg)" }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
                      {k.labelIt}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--prom-text)]">{k.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
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
          </>
        )}
      </section>

      {children}

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--prom-text)]">Insight rapidi</h2>
        <p className="mb-3 text-xs text-[var(--prom-muted)]">
          Chip con prompt mirati e filtri pagina (CC, team, periodo) nel payload verso il modello.
        </p>
        <div className="flex flex-wrap gap-2">
          {visual.insightChips.map((chip) => (
            <LoadingButton
              key={chip.id}
              type="button"
              size="sm"
              variant="secondary"
              loading={chipBusyId === chip.id}
              disabled={insightBusy || loading || chipBusyId != null}
              className={`rounded-full ${visual.accentBorderClass}`}
              onClick={() => void runInsightChip(chip.id, chip.userMessageIt, chip.insightFocus)}
            >
              {chip.labelIt}
            </LoadingButton>
          ))}
        </div>
      </section>

      <div className="mb-8 flex flex-wrap gap-2">
        <LoadingButton
          type="button"
          size="sm"
          loading={insightBusy}
          disabled={loading}
          onClick={() => void generateInsight()}
        >
          <Sparkles className={`mr-1.5 h-4 w-4 ${visual.accentClass}`} aria-hidden />
          Genera insight AI
        </LoadingButton>
      </div>

      {insight ? <StructuredInsightBlock insight={insight} profile={visual} /> : null}

      <section className="mt-8 rounded-2xl border border-[var(--card-border)] p-4" style={{ background: "var(--card-bg)" }}>
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className={`h-5 w-5 ${visual.accentClass}`} aria-hidden />
          <h2 className="text-base font-semibold text-[var(--prom-text)]">Chiedi all&apos;analista</h2>
        </div>
        <p className="mb-3 text-xs text-[var(--prom-muted)]">
          Domande sul dataset di questa analisi con filtri attivi. Risposte su aggregati pseudonimizzati.
        </p>
        <div className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] p-3">
          {chatTurns.length === 0 ? (
            <p className="text-xs text-[var(--prom-muted)]">{visual.chatPlaceholder}</p>
          ) : (
            chatTurns.map((t, i) => (
              <div key={i}>
                <p
                  className={`text-sm ${t.role === "user" ? "text-[var(--prom-text)]" : "text-[var(--prom-muted)]"}`}
                >
                  <span className="font-medium">{t.role === "user" ? "Tu" : "Analista"}:</span> {t.content}
                </p>
                {t.role === "assistant" && i === chatTurns.length - 1 && !chatBusy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 gap-1.5 rounded-full border border-[var(--prom-line)] px-3 text-xs"
                    onClick={() => deepenAnalystReply()}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Approfondisci
                  </Button>
                ) : null}
              </div>
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
            placeholder={visual.chatPlaceholder}
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
