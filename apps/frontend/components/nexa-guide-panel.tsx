"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Compass, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postPlatformAgentChat, type PlatformAgentTurnDto } from "@/lib/api";
import { getToken, getSessionUser, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";

type Turn = PlatformAgentTurnDto;

const STARTERS = [
  "Come approvo le ferie del team?",
  "Dove vedo il budget personale?",
  "Cosa significa il turnover score?",
  "Come apro le quattro analisi HR?"
];

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

  const user = getSessionUser();
  const allowed = sessionCanUseNexaAiOpenAiLlm(user ?? undefined);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (allowed) {
          setOpen((v) => !v);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed]);

  const send = useCallback(async (): Promise<void> => {
    const token = getToken();
    const msg = input.trim();
    if (!token || !msg) {
      return;
    }
    const history = [...turns];
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: msg }]);
    setBusy(true);
    setError(null);
    try {
      const out = await postPlatformAgentChat(token, {
        message: msg,
        page: pathname,
        history
      });
      setTurns((prev) => [...prev, { role: "assistant", content: out.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nexa Guide non disponibile");
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }, [input, pathname, turns]);

  if (!allowed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex h-12 items-center gap-2 rounded-full border border-[var(--prom-line-strong)] bg-[var(--prom-surface)] px-4 text-sm font-medium text-[var(--prom-text)] shadow-[var(--card-shadow)] transition hover:opacity-90 md:bottom-8 md:left-8"
        aria-label="Apri Nexa Guide"
        title="Nexa Guide (⌘K) — come si fa su Nexa HR"
      >
        <Compass className="h-5 w-5 text-[#002D72] dark:text-sky-300" aria-hidden />
        <span className="hidden sm:inline">Nexa Guide</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-label="Nexa Guide"
        >
          <div
            className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col rounded-2xl border border-[var(--card-border)] shadow-2xl"
            style={{ background: "var(--card-bg)" }}
          >
            <header className="flex items-center justify-between border-b border-[var(--prom-line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[#002D72] dark:text-sky-300" aria-hidden />
                <div>
                  <h2 className="text-base font-semibold text-[var(--prom-text)]">Nexa Guide</h2>
                  <p className="text-xs text-[var(--prom-muted)]">Percorsi, permessi e how-to sulla piattaforma</p>
                </div>
              </div>
              <Button type="button" size="sm" onClick={() => setOpen(false)} aria-label="Chiudi">
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {turns.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--prom-muted)]">Suggerimenti rapidi:</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rounded-lg border border-[var(--prom-line)] px-2 py-1 text-left text-xs text-[var(--prom-text)] hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
                        onClick={() => setInput(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((t, i) => (
                  <p
                    key={i}
                    className={`text-sm leading-relaxed ${t.role === "user" ? "text-[var(--prom-text)]" : "text-[var(--prom-muted)]"}`}
                  >
                    <span className="font-semibold">{t.role === "user" ? "Tu" : "Guide"}:</span> {t.content}
                  </p>
                ))
              )}
              {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
              <div ref={endRef} />
            </div>

            <form
              className="border-t border-[var(--prom-line)] p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Es. Come approvo le ferie?"
                  maxLength={8000}
                  disabled={busy}
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={busy || !input.trim()}>
                  Invia
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-[var(--prom-muted)]">⌘K per aprire/chiudere · Nessun nominativo inviato al modello</p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
