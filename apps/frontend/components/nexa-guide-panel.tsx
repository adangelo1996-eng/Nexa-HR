"use client";

import type { Route } from "next";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Compass, Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  postPlatformAgentChat,
  type PlatformAgentStructuredDto,
  type PlatformAgentTurnDto
} from "@/lib/api";
import { parseGuideMarkdownFallback } from "@/lib/nexa-guide-content";
import { getToken, getSessionUser, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { buildHebbPageContext } from "@/lib/hebb-page-context";

type Turn = PlatformAgentTurnDto;

const STARTERS = [
  "Come approvo le ferie del team?",
  "Dove vedo il budget personale?",
  "Come si calcola il turnover score?",
  "Come funziona la varianza budget?",
  "Come prenoto una sala riunioni?",
  "Come apro le quattro analisi HR?"
];

function GuideStructuredMessage(props: {
  structured: PlatformAgentStructuredDto;
  intro?: string;
  onNavigate?: () => void;
}): React.JSX.Element {
  const { structured, intro, onNavigate } = props;
  return (
    <div className="space-y-4">
      {intro ? <p className="text-sm leading-relaxed text-[var(--prom-text)]">{intro}</p> : null}
      {structured.sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            {section.title}
          </h3>
          <ul className="space-y-2">
            {section.bullets.map((bullet, i) => (
              <li
                key={`${section.title}-${i}`}
                className="flex flex-col gap-2 rounded-xl border border-[var(--prom-line)]/80 bg-[color-mix(in_srgb,var(--prom-surface-soft)_55%,transparent)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm leading-snug text-[var(--prom-text)]">{bullet.text}</span>
                {bullet.action ? (
                  <Link
                    href={bullet.action.href as Route}
                    onClick={() => onNavigate?.()}
                    className="inline-flex shrink-0 items-center gap-1 self-start rounded-full border border-[#002D72]/25 bg-[color-mix(in_srgb,#002D72_8%,transparent)] px-3 py-1 text-xs font-medium text-[#002D72] transition hover:bg-[color-mix(in_srgb,#002D72_14%,transparent)] dark:border-sky-400/30 dark:text-sky-200 dark:hover:bg-sky-950/40"
                  >
                    {bullet.action.label}
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function GuidePlainMessage(props: {
  content: string;
  onNavigate?: () => void;
}): React.JSX.Element {
  const structured = parseGuideMarkdownFallback(props.content);
  if (structured) {
    const intro = props.content.trim().startsWith("{") ? undefined : props.content.split("\n")[0];
    return <GuideStructuredMessage structured={structured} intro={intro} onNavigate={props.onNavigate} />;
  }
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--prom-text)]">{props.content}</p>
  );
}

/**
 * Nexa Guide — agente piattaforma accessibile da ogni pagina (floating).
 * Usa POST /ai/hr/platform-agent/chat con pseudonimizzazione lato server.
 */
export function NexaGuidePanel(): React.JSX.Element | null {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const user = getSessionUser();
  const allowed = sessionCanUseNexaAiOpenAiLlm(user ?? undefined);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [turns, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && open) {
        close();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (allowed) {
          setOpen((v) => !v);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed, close, open]);

  const send = useCallback(
    async (opts?: { messageOverride?: string; deepen?: boolean }): Promise<void> => {
      const token = getToken();
      const msg = (opts?.messageOverride ?? input).trim();
      if (!token || !msg || busy) {
        return;
      }
      const history = turns.map(({ role, content, structured }) => ({ role, content, structured }));
      if (!opts?.messageOverride) {
        setInput("");
      }
      setTurns((prev) => [...prev, { role: "user", content: msg }]);
      setBusy(true);
      setError(null);
      try {
        const pageContext = buildHebbPageContext({
          pathname: pathname ?? "/",
          sessionUser: getSessionUser()
        });
        const out = await postPlatformAgentChat(token, {
          message: msg,
          page: pageContext.currentPath,
          pageContext,
          history,
          deepen: opts?.deepen
        });
        const structured = out.structured ?? parseGuideMarkdownFallback(out.reply);
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: out.reply,
            structured
          }
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nexa Guide non disponibile");
        setTurns((prev) => prev.slice(0, -1));
      } finally {
        setBusy(false);
      }
    },
    [busy, input, pathname, turns]
  );

  const deepenLastReply = useCallback((): void => {
    if (busy || turns.length === 0) {
      return;
    }
    const last = turns[turns.length - 1];
    if (last?.role !== "assistant") {
      return;
    }
    void send({ messageOverride: "Approfondisci", deepen: true });
  }, [busy, send, turns]);

  if (!allowed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-[120] flex h-12 items-center gap-2 rounded-full border border-[var(--prom-line-strong)] bg-[var(--prom-surface)]/95 px-4 text-sm font-medium text-[var(--prom-text)] shadow-[var(--card-shadow)] backdrop-blur-md transition hover:opacity-90 md:bottom-8 md:left-8"
        aria-label="Apri Nexa Guide"
        title="Nexa Guide (⌘K) — come si fa su Nexa HR"
      >
        <Compass className="h-5 w-5 text-[#002D72] dark:text-sky-300" aria-hidden />
        <span className="hidden sm:inline">Nexa Guide</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[260] flex items-end justify-center p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Nexa Guide"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-md"
            aria-label="Chiudi Nexa Guide"
            onClick={close}
          />
          <div
            className="relative flex max-h-[min(92dvh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--card-border)] shadow-2xl sm:rounded-3xl"
            style={{ background: "var(--card-bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--prom-line)] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,#002D72_10%,transparent)]"
                  aria-hidden
                >
                  <MessageCircle className="h-5 w-5 text-[#002D72] dark:text-sky-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--prom-text)]">Nexa Guide</h2>
                  <p className="text-xs text-[var(--prom-muted)]">Percorsi e how-to sulla piattaforma</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 rounded-full p-0"
                onClick={close}
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {turns.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--prom-muted)]">
                    Chiedi come fare su Nexa HR: approvazioni, budget, analytics e altro.
                  </p>
                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                      Suggerimenti
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {STARTERS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] px-4 py-2.5 text-left text-sm text-[var(--prom-text)] transition hover:border-[#002D72]/30 hover:bg-[color-mix(in_srgb,#002D72_6%,transparent)]"
                          onClick={() => setInput(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {turns.map((t, i) => (
                    <div
                      key={i}
                      className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 ${
                          t.role === "user"
                            ? "bg-[color-mix(in_srgb,#002D72_88%,transparent)] text-white dark:bg-sky-900/80"
                            : "border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_65%,transparent)]"
                        }`}
                      >
                        <p
                          className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
                            t.role === "user" ? "text-white/70" : "text-[var(--prom-muted)]"
                          }`}
                        >
                          {t.role === "user" ? "Tu" : "Guide"}
                        </p>
                        {t.role === "assistant" && t.structured ? (
                          <GuideStructuredMessage structured={t.structured} onNavigate={close} />
                        ) : t.role === "assistant" ? (
                          <GuidePlainMessage content={t.content} onNavigate={close} />
                        ) : (
                          <p className="text-sm leading-relaxed">{t.content}</p>
                        )}
                        {t.role === "assistant" && i === turns.length - 1 && !busy ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-3 h-8 gap-1.5 rounded-full border border-[var(--prom-line)] px-3 text-xs text-[#002D72] hover:bg-[color-mix(in_srgb,#002D72_8%,transparent)] dark:text-sky-200"
                            onClick={() => deepenLastReply()}
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            Approfondisci
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {busy ? (
                    <div className="flex items-center gap-2 text-sm text-[var(--prom-muted)]">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Nexa Guide sta rispondendo…
                    </div>
                  ) : null}
                </div>
              )}
              {error ? (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                  {error}
                </p>
              ) : null}
              <div ref={endRef} />
            </div>

            <form
              className="shrink-0 border-t border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--card-bg)_92%,transparent)] px-4 py-4 backdrop-blur-sm"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Es. Come approvo le ferie?"
                  maxLength={8000}
                  disabled={busy}
                  className="h-11 flex-1 rounded-xl border-[var(--prom-line)] bg-[var(--prom-surface)]"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-11 w-11 shrink-0 rounded-xl p-0"
                  disabled={busy || !input.trim()}
                  aria-label="Invia messaggio"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </div>
              <p className="mt-2 text-center text-[10px] text-[var(--prom-muted)] sm:text-left">
                ⌘K apri/chiudi · Nessun nominativo inviato al modello
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
