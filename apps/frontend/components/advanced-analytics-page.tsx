"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import {
  AnalyticsFiltersBar,
  analyticsFiltersQuery,
  type AnalyticsFiltersState
} from "@/components/analytics-filters-bar";
import { KpiTrendChartGrid } from "@/components/kpi-trend-chart";
import {
  fetchAdvancedAnalysisFilterOptions,
  fetchAdvancedAnalysisKpiHistory,
  fetchAdvancedAnalysisKpis,
  postAdvancedAnalysisChat,
  postAdvancedAnalysisInsight,
  type AnalyticsKpiDto,
  type KpiHistorySeriesDto,
  type StructuredAnalyticsInsightDto
} from "@/lib/api";
import { getToken, getSessionUser, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { buildHebbPageContext } from "@/lib/hebb-page-context";
import { getAnalyticsAnalysisTheme } from "@/lib/analytics-analysis-theme";
import {
  getAdvancedAnalysisPageProfile,
  normalizeAdvancedAnalysisId,
  type AdvancedAnalysisPageProfile,
  type InsightChipConfig
} from "@/lib/advanced-analysis-page-config";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type AdvancedAnalyticsPageConfig = {
  analysisId: string;
  title: string;
  subtitle: string;
  eyebrow?: string;
  hubVariant?: "core" | "advanced";
  children?: React.ReactNode;
};

function StructuredInsightBlock(props: {
  insight: StructuredAnalyticsInsightDto;
  borderClass: string;
  sectionLabels: AdvancedAnalysisPageProfile["sectionLabels"];
}): React.JSX.Element {
  const { insight, sectionLabels } = props;
  return (
    <section
      className={`space-y-4 rounded-2xl border bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-5 ${props.borderClass}`}
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
      <InsightList title={sectionLabels.correlazioni} items={insight.correlazioni} />
      <InsightList title={sectionLabels.rischi} items={insight.rischi} />
      <InsightList title={sectionLabels.azioni7giorni} items={insight.azioni7giorni} />
      <InsightList title={sectionLabels.raccomandazioniHr} items={insight.raccomandazioniHr ?? []} />
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

function HeroKpiBanner(props: {
  kpi: AnalyticsKpiDto | null;
  fallbackLabel: string;
  themeAccent: string;
  themeAccentSoft: string;
  themeKpiBorder: string;
  icon: AdvancedAnalysisPageProfile["icon"];
}): React.JSX.Element {
  const Icon = props.icon;
  return (
    <section
      className={`mb-8 rounded-2xl border p-6 ${props.themeKpiBorder}`}
      style={{ background: props.themeAccentSoft }}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: props.themeAccent, color: "#fff" }}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
            KPI principale · mese corrente
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: props.themeAccent }}>
            {props.kpi?.value ?? "—"}
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--prom-text)]">
            {props.kpi?.labelIt ?? props.fallbackLabel}
          </p>
          {props.kpi?.hintIt ? (
            <p className="mt-2 text-xs leading-relaxed text-[var(--prom-muted)]">{props.kpi.hintIt}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const DEFAULT_FILTERS: AnalyticsFiltersState = {
  costCenterId: "",
  teamId: "",
  periodPreset: "6m"
};

export function AdvancedAnalyticsPage(props: AdvancedAnalyticsPageConfig): React.JSX.Element {
  const { title, subtitle, eyebrow = "Analytics & Intelligence", hubVariant = "advanced", children } = props;
  const analysisId = normalizeAdvancedAnalysisId(props.analysisId);
  const profile = getAdvancedAnalysisPageProfile(analysisId);
  const theme = getAnalyticsAnalysisTheme(analysisId);
  const [filters, setFilters] = useState<AnalyticsFiltersState>(DEFAULT_FILTERS);
  const [filterOptions, setFilterOptions] = useState<Awaited<ReturnType<typeof fetchAdvancedAnalysisFilterOptions>> | null>(
    null
  );
  const [kpis, setKpis] = useState<AnalyticsKpiDto[]>([]);
  const [history, setHistory] = useState<KpiHistorySeriesDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useLlm, setUseLlm] = useState(true);
  const [insightBusy, setInsightBusy] = useState(false);
  const [activeInsightFocus, setActiveInsightFocus] = useState<string | null>(null);
  const [insight, setInsight] = useState<StructuredAnalyticsInsightDto | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const pathname = usePathname();
  const sessionUser = getSessionUser();
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(sessionUser ?? undefined);

  const filterQuery = useMemo(() => analyticsFiltersQuery(filters), [filters]);

  const hebbPageContext = useMemo(
    () =>
      buildHebbPageContext({
        pathname: pathname ?? `/analytics/${analysisId}`,
        sessionUser,
        costCenterScope: filterQuery.costCenter,
        teamScope: filterQuery.team,
        periodScope: filterQuery.period
      }),
    [pathname, analysisId, sessionUser, filterQuery.costCenter, filterQuery.team, filterQuery.period]
  );

  const heroKpi = useMemo(
    () => kpis.find((k) => k.id === profile.heroKpiId) ?? kpis[0] ?? null,
    [kpis, profile.heroKpiId]
  );

  const secondaryKpis = useMemo(
    () => kpis.filter((k) => k.id !== heroKpi?.id),
    [kpis, heroKpi?.id]
  );

  const loadFilterOptions = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    try {
      const opts = await fetchAdvancedAnalysisFilterOptions(token, analysisId);
      setFilterOptions(opts);
    } catch {
      setFilterOptions({ costCenters: [], teams: [] });
    }
  }, [analysisId]);

  const loadData = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setError(null);
    setLoading(true);
    const query = filterQuery;
    try {
      const [kpiRes, histRes] = await Promise.all([
        fetchAdvancedAnalysisKpis(token, analysisId, {
          costCenter: query.costCenter,
          team: query.team,
          period: query.period
        }),
        fetchAdvancedAnalysisKpiHistory(token, analysisId, {
          from: query.from,
          to: query.to,
          costCenter: query.costCenter,
          team: query.team
        })
      ]);
      setKpis(kpiRes.kpis);
      setHistory(histRes.series);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento KPI");
    } finally {
      setLoading(false);
    }
  }, [analysisId, filterQuery]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns]);

  const generateInsight = useCallback(
    async (focusId?: string): Promise<void> => {
      const token = getToken();
      if (!token) return;
      const focus = focusId?.trim() || undefined;
      setActiveInsightFocus(focus ?? null);
      setInsightBusy(true);
      setError(null);
      try {
        const out = await postAdvancedAnalysisInsight(token, analysisId, {
          useLlm: useLlm && llmAllowed,
          pageContext: hebbPageContext,
          insightFocus: focus
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

  const sendChat = useCallback(
    async (messageOverride?: string, focusId?: string): Promise<void> => {
      const token = getToken();
      const msg = (messageOverride ?? chatInput).trim();
      if (!token || !msg) return;
      const focus = focusId?.trim() || undefined;
      const nextHistory = [...chatTurns, { role: "user" as const, content: msg }];
      if (!messageOverride) {
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
          insightFocus: focus
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

  const onInsightChip = useCallback(
    (chip: InsightChipConfig, mode: "insight" | "chat"): void => {
      if (mode === "insight") {
        void generateInsight(chip.id);
        return;
      }
      void sendChat(chip.userMessageIt, chip.id);
    },
    [generateInsight, sendChat]
  );

  const hubHref = hubVariant === "core" ? ("/analytics" as Route) : ("/analytics/advanced" as Route);
  const hubLabel = hubVariant === "core" ? "Hub analisi core" : "Analisi avanzate";

  const layoutClass =
    theme.layout === "split"
      ? "lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-6"
      : theme.layout === "stacked"
        ? "space-y-6"
        : theme.layout === "compact"
          ? "space-y-4"
          : "space-y-6";

  const PageIcon = profile.icon;

  return (
    <NexaHrAppPage eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={hubHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {hubLabel}
        </Link>
        {hubVariant === "advanced" ? (
          <>
            <span className="text-[var(--prom-muted)]">·</span>
            <Link
              href={"/analytics" as Route}
              className="text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
            >
              Hub analisi core
            </Link>
          </>
        ) : (
          <>
            <span className="text-[var(--prom-muted)]">·</span>
            <Link
              href={"/analytics/advanced" as Route}
              className="text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
            >
              Analisi avanzate
            </Link>
          </>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]"
          style={{ borderColor: theme.accent, color: theme.accent }}
        >
          <PageIcon className="h-3.5 w-3.5" aria-hidden />
          {analysisId.replace(/_/g, " ")}
        </span>
      </div>

      <AnalyticsFiltersBar
        options={filterOptions}
        value={filters}
        onChange={setFilters}
        onApply={() => void loadData()}
        loading={loading}
      />

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

      {loading ? (
        <p className="mb-6 text-sm text-[var(--prom-muted)]">Caricamento indicatori…</p>
      ) : (
        <HeroKpiBanner
          kpi={heroKpi}
          fallbackLabel={profile.heroKpiFallbackLabel}
          themeAccent={theme.accent}
          themeAccentSoft={theme.accentSoft}
          themeKpiBorder={theme.kpiBorder}
          icon={profile.icon}
        />
      )}

      <div className={layoutClass}>
        <div>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">Altri KPI · mese corrente</h2>
            {loading ? (
              <p className="text-sm text-[var(--prom-muted)]">Caricamento indicatori…</p>
            ) : secondaryKpis.length === 0 ? (
              <p className="text-sm text-[var(--prom-muted)]">Nessun indicatore secondario per i filtri selezionati.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {secondaryKpis.map((k) => (
                  <div
                    key={k.id}
                    className={`rounded-xl border p-4 ${theme.kpiBorder}`}
                    style={{ background: theme.accentSoft }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
                      {k.labelIt}
                    </p>
                    <p className="mt-1 text-xl font-semibold" style={{ color: theme.accent }}>
                      {k.value}
                    </p>
                    {k.hintIt ? <p className="mt-1 text-xs text-[var(--prom-muted)]">{k.hintIt}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: theme.accent }} aria-hidden />
              <h2 className="text-sm font-semibold text-[var(--prom-text)]">Trend mensile</h2>
            </div>
            {loading ? (
              <p className="text-sm text-[var(--prom-muted)]">Caricamento serie storiche…</p>
            ) : (
              <KpiTrendChartGrid series={history} accent={theme.accent} />
            )}
          </section>

          {children}
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={insightBusy || loading}
                onClick={() => void generateInsight()}
                style={{ backgroundColor: theme.accent }}
                className="text-white hover:opacity-90"
              >
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                {insightBusy && !activeInsightFocus ? "Generazione…" : "Genera insight AI"}
              </Button>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
                Domande guidate
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.insightChips.map((chip) => (
                  <div key={chip.id} className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={insightBusy || loading}
                      onClick={() => onInsightChip(chip, "insight")}
                      className="rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-90 disabled:opacity-50"
                      style={{
                        borderColor: theme.accent,
                        color: theme.accent,
                        background:
                          activeInsightFocus === chip.id
                            ? theme.accentSoft
                            : "color-mix(in srgb, var(--prom-surface) 95%, transparent)"
                      }}
                      title="Genera insight strutturato su questo focus"
                    >
                      {insightBusy && activeInsightFocus === chip.id ? "…" : chip.labelIt}
                    </button>
                    <button
                      type="button"
                      disabled={chatBusy || loading}
                      onClick={() => onInsightChip(chip, "chat")}
                      className="rounded-full border border-[var(--prom-line)] px-2 py-1 text-[10px] text-[var(--prom-muted)] transition hover:border-[var(--prom-text)] hover:text-[var(--prom-text)] disabled:opacity-50"
                      title="Chiedi all'analista"
                    >
                      Chat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {insight ? (
            <StructuredInsightBlock
              insight={insight}
              borderClass={theme.insightBorder}
              sectionLabels={profile.sectionLabels}
            />
          ) : null}

          <section
            className={`rounded-2xl border p-4 ${theme.chatBorder}`}
            style={{ background: "var(--card-bg)" }}
          >
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" style={{ color: theme.accent }} aria-hidden />
              <h2 className="text-base font-semibold text-[var(--prom-text)]">Chiedi all&apos;analista</h2>
            </div>
            <p className="mb-3 text-xs text-[var(--prom-muted)]">
              Domande sul dataset di questa analisi con filtri attivi (centro di costo, team, periodo). Risposte su
              aggregati pseudonimizzati.
            </p>
            <div className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] p-3">
              {chatTurns.length === 0 ? (
                <p className="text-xs text-[var(--prom-muted)]">{profile.chatPlaceholder}</p>
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
                placeholder={profile.chatPlaceholder}
                maxLength={2000}
                disabled={chatBusy}
              />
              <Button type="submit" size="sm" disabled={chatBusy || !chatInput.trim()}>
                Invia
              </Button>
            </form>
          </section>
        </div>
      </div>
    </NexaHrAppPage>
  );
}
