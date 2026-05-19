"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Briefcase,
  CalendarCheck,
  Loader2,
  MessageSquare,
  Sparkles,
  TrendingDown,
  Users
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchHrCopilotBrief,
  postHrCopilotChat,
  type HrCopilotChatTurnDto,
  type HrCopilotPanelDto,
  type HrCopilotStructuredDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { HebbAiErrorBanner, hebbAiLinkClassName } from "@/components/hebb-ai-experience-shell";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { LlmUsageStatusBanner, type LlmUsageBannerModel } from "@/components/llm-usage-status-banner";
import { AssistantMarkdownLite } from "@/components/assistant-markdown-lite";

const PANEL_META: Record<
  HrCopilotPanelDto["id"],
  { icon: typeof CalendarCheck; accent: string; gridClass: string }
> = {
  today: {
    icon: CalendarCheck,
    accent: "from-[#002D72]/90 to-[#1a4a8a]/40",
    gridClass: "md:col-span-2 md:row-span-1"
  },
  people_risk: {
    icon: Users,
    accent: "from-[#5c2d2d]/80 to-[#002D72]/30",
    gridClass: "md:col-span-1"
  },
  hiring: {
    icon: Briefcase,
    accent: "from-[#1e3a2f]/80 to-[#002D72]/25",
    gridClass: "md:col-span-1"
  },
  budget_alert: {
    icon: TrendingDown,
    accent: "from-[#3d3520]/80 to-[#002D72]/30",
    gridClass: "md:col-span-2"
  }
};

const PRIORITY_STYLES = {
  high: "bg-[color-mix(in_srgb,#ff6b6b_22%,transparent)] text-[#ffb4b4] border-[color-mix(in_srgb,#ff6b6b_35%,transparent)]",
  medium: "bg-[color-mix(in_srgb,#fbbf24_18%,transparent)] text-[#fde68a] border-[color-mix(in_srgb,#fbbf24_30%,transparent)]",
  low: "bg-[color-mix(in_srgb,var(--prom-muted)_15%,transparent)] text-[var(--prom-muted)] border-[var(--glass-border)]"
};

function priorityLabel(p: HrCopilotPanelDto["priority"]): string {
  if (p === "high") return "Alta";
  if (p === "low") return "Bassa";
  return "Media";
}

function CopilotPanelCard(props: { panel: HrCopilotPanelDto }): React.JSX.Element {
  const { panel } = props;
  const meta = PANEL_META[panel.id];
  const Icon = meta.icon;
  const linkCn = hebbAiLinkClassName();

  return (
    <motion.article
      layout
      className={`group relative overflow-hidden rounded-[1.75rem] border border-[color-mix(in_srgb,var(--glass-border)_80%,#002D72_20%)] bg-[color-mix(in_srgb,#0a0f18_88%,transparent)] p-5 shadow-[0_24px_80px_-40px_rgba(0,45,114,0.55)] backdrop-blur-xl md:p-6 ${meta.gridClass}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.accent} opacity-[0.35] transition-opacity group-hover:opacity-50`}
        aria-hidden
      />
      <div className="relative z-10 flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_70%,transparent)]">
              <Icon className="h-5 w-5 text-[var(--prom-text)]" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--prom-text)]">{panel.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">{panel.summary}</p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLES[panel.priority]}`}
          >
            {priorityLabel(panel.priority)}
          </span>
        </div>

        <ul className="mt-auto space-y-3">
          {panel.actions.map((action, i) => (
            <li
              key={`${panel.id}-${i}`}
              className="rounded-2xl border border-[color-mix(in_srgb,var(--glass-border)_70%,transparent)] bg-[color-mix(in_srgb,#060a12_55%,transparent)] p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[var(--prom-text)]">{action.label}</p>
                {action.href ? (
                  <Link
                    href={action.href as Route}
                    scroll={false}
                    className={`inline-flex shrink-0 items-center gap-0.5 text-xs ${linkCn}`}
                  >
                    Apri
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--prom-muted)]">{action.rationale}</p>
              <p className="mt-2 font-mono text-[11px] tabular-nums text-[color-mix(in_srgb,#7dd3fc_85%,var(--prom-muted))]">
                {action.evidence}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}

export default function NexaHrCopilotPage(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [structured, setStructured] = useState<HrCopilotStructuredDto | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTurns, setChatTurns] = useState<HrCopilotChatTurnDto[]>([]);
  const [llmStatus, setLlmStatus] = useState<LlmUsageBannerModel | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadBrief = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      setError("Sessione non valida.");
      setLoading(false);
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      const r = await fetchHrCopilotBrief(token);
      setStructured(r.structured);
      setScopeLabel(r.signals.scope === "manager" ? "Team diretto" : "Organizzazione");
      setLlmStatus({ active: r.llm.configured, refineApplied: r.llm.refineApplied });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento Copilot");
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrief();
  }, [loadBrief]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [chatTurns, reduceMotion]);

  const orderedPanels = useMemo(() => {
    if (!structured) {
      return [];
    }
    const order: HrCopilotPanelDto["id"][] = ["today", "people_risk", "hiring", "budget_alert"];
    const byId = new Map(structured.panels.map((p) => [p.id, p]));
    return order.map((id) => byId.get(id)).filter((p): p is HrCopilotPanelDto => p != null);
  }, [structured]);

  const submitChat = async (): Promise<void> => {
    const msg = chatInput.trim();
    if (!msg || chatBusy) {
      return;
    }
    const token = getToken();
    if (!token) {
      return;
    }
    setChatBusy(true);
    setAiLoading(true);
    setChatInput("");
    const nextHistory = [...chatTurns, { role: "user" as const, content: msg }];
    setChatTurns(nextHistory);
    try {
      const r = await postHrCopilotChat(token, { message: msg, history: chatTurns });
      if (r.structured) {
        setStructured(r.structured);
      }
      setLlmStatus({ active: r.llm.configured, refineApplied: r.llm.refineApplied });
      setChatTurns([...nextHistory, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setChatTurns([
        ...nextHistory,
        {
          role: "assistant",
          content: e instanceof Error ? e.message : "Non sono riuscito a rispondere. Riprova tra poco."
        }
      ]);
    } finally {
      setChatBusy(false);
      setAiLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden pb-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_520px_at_15%_-5%,rgba(0,45,114,0.32),transparent_55%),radial-gradient(700px_420px_at_95%_10%,rgba(30,58,95,0.28),transparent_50%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-8 md:px-8 md:pt-10">
        <div className="absolute right-4 top-6 z-20 md:right-8">
          <NexaPageHelpButton pageKey="nexa-hr-copilot" />
        </div>

        <header className="max-w-3xl">
          <p className="font-synapse text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,#7dd3fc_70%,var(--prom-muted))]">
            NEXA · HR Intelligence
          </p>
          <h1 className="mt-3 font-synapse text-balance text-3xl font-semibold tracking-tight text-[var(--prom-text)] md:text-5xl">
            NEXA HR Copilot
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-[var(--prom-muted)]">
            Assistente orientato al task per HR e manager: azioni prioritarie con evidenze numeriche su segnali
            pseudonimizzati — headcount, gap, retention, recruiting, approvazioni e budget.
          </p>
          {scopeLabel ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_60%,transparent)] px-3 py-1 text-xs text-[var(--prom-muted)]">
              <Sparkles className="h-3.5 w-3.5 text-[#7dd3fc]" aria-hidden />
              Ambito: {scopeLabel}
            </p>
          ) : null}
        </header>

        <div className="mt-6">
          <LlmUsageStatusBanner idle={!llmStatus} llm={llmStatus} />
        </div>

        {error ? (
          <div className="mt-6">
            <HebbAiErrorBanner>{error}</HebbAiErrorBanner>
          </div>
        ) : null}

        {loading && !structured ? (
          <div className="mt-16 flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#7dd3fc]" aria-hidden />
            <p className="text-sm text-[var(--prom-muted)]">Preparazione brief HR…</p>
          </div>
        ) : null}

        {structured ? (
          <>
            <section className="mt-8 rounded-[1.5rem] border border-[var(--glass-border)] bg-[color-mix(in_srgb,#0c121c_75%,transparent)] p-5 backdrop-blur-md md:p-6">
              <p className="text-sm leading-relaxed text-[var(--prom-text)] md:text-base">{structured.intro}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={aiLoading} onClick={() => void loadBrief()}>
                  Rigenera brief
                </Button>
              </div>
            </section>

            <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5" aria-label="Pannelli operativi HR">
              {orderedPanels.map((panel) => (
                <CopilotPanelCard key={panel.id} panel={panel} />
              ))}
            </section>

            {chatTurns.length > 0 ? (
              <section className="mt-10 space-y-4" aria-label="Conversazione follow-up">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  Follow-up con HRBP AI
                </h2>
                <div className="space-y-3 rounded-[1.5rem] border border-[var(--glass-border)] bg-[color-mix(in_srgb,#0a0f18_80%,transparent)] p-4 md:p-5">
                  {chatTurns.map((t, i) => (
                    <div
                      key={i}
                      className={
                        t.role === "user"
                          ? "ml-auto max-w-[92%] rounded-2xl bg-[color-mix(in_srgb,#002D72_45%,transparent)] px-4 py-3 text-sm text-[var(--prom-text)]"
                          : "max-w-[95%] text-sm text-[var(--prom-muted)]"
                      }
                    >
                      {t.role === "assistant" ? <AssistantMarkdownLite text={t.content} /> : t.content}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Chat dock */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[color-mix(in_srgb,var(--glass-border)_80%,#002D72_25%)] bg-[color-mix(in_srgb,#060a12_92%,transparent)] px-4 py-4 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 md:flex-row md:items-end">
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Chiedi un follow-up al Copilot (es. «Cosa prioritizzo questa settimana sul budget?»)"
            rows={2}
            className="min-h-[3rem] resize-none rounded-2xl border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_50%,transparent)] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitChat();
              }
            }}
            disabled={chatBusy || loading}
          />
          <Button
            type="button"
            className="shrink-0 rounded-2xl bg-[#002D72] px-6 hover:bg-[color-mix(in_srgb,#002D72_85%,#fff_15%)]"
            disabled={chatBusy || loading || !chatInput.trim()}
            onClick={() => void submitChat()}
          >
            {chatBusy ? "Invio…" : "Chiedi"}
          </Button>
        </div>
      </div>

      {/* Loading overlay */}
      {aiLoading ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,#020408_72%,transparent)] backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Generazione AI in corso"
        >
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,#0a0f18_95%,transparent)] px-10 py-8 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-[#7dd3fc]" aria-hidden />
            <p className="font-synapse text-lg font-medium text-[var(--prom-text)]">Generazione AI…</p>
            <p className="max-w-xs text-center text-xs text-[var(--prom-muted)]">
              Elaborazione segnali pseudonimizzati — nessun nominativo inviato al modello.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
