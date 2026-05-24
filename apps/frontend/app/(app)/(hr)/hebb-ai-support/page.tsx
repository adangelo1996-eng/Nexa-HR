"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, MessageCircle, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser, postAiAssistant } from "@/lib/api";
import { getSessionUser, getToken } from "@/lib/auth-session";
import { buildHebbPageContext } from "@/lib/hebb-page-context";
import { AssistantMarkdownLite } from "@/components/assistant-markdown-lite";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";

type ChatTurn = { role: "user" | "assistant"; text: string };

const STARTERS = [
  "Quanto mi resta di ferie quest'anno?",
  "Come richiedo un permesso?",
  "Dove trovo i miei cedolini?",
  "Come funziona la timbratura?",
  "Quali documenti posso consultare sul mio profilo?"
];

function friendlyError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/403|Permessi insufficienti|Forbidden/i.test(m)) {
    return "Non hai i permessi per questa azione. Riprova o contatta HR.";
  }
  if (/401|Token|autenticazione/i.test(m)) {
    return "Sessione scaduta: effettua di nuovo l'accesso.";
  }
  return m || "Qualcosa non è andato a buon fine. Riprova tra poco.";
}

export default function HebbAiSupportPage(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sessionUser = getSessionUser();
  const displayName = sessionUser?.fullName?.split(" ")[0] ?? "te";

  const hebbPageContext = useMemo(
    () =>
      buildHebbPageContext({
        pathname: pathname ?? "/hebb-ai-support",
        sessionUser: getSessionUser()
      }),
    [pathname]
  );

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    void fetchCurrentUser(token).catch(() => {
      /* mantieni sessione locale */
    });
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, busy]);

  const send = useCallback(
    async (messageOverride?: string): Promise<void> => {
      const token = getToken();
      const msg = (messageOverride ?? input).trim();
      if (!token || !msg || busy) {
        return;
      }
      setInput("");
      setThread((prev) => [...prev, { role: "user", text: msg }]);
      setBusy(true);
      setError(null);
      try {
        const r = await postAiAssistant(token, {
          message: msg,
          page: hebbPageContext.currentPath,
          pageContext: hebbPageContext
        });
        setThread((prev) => [...prev, { role: "assistant", text: r.reply }]);
      } catch (e) {
        setError(friendlyError(e));
        setThread((prev) => prev.slice(0, -1));
        setInput(msg);
      } finally {
        setBusy(false);
        window.setTimeout(() => inputRef.current?.focus(), 80);
      }
    },
    [busy, hebbPageContext, input]
  );

  return (
    <div className="mx-auto flex min-h-[min(72vh,820px)] max-w-2xl flex-col">
      <header className="shrink-0 border-b border-[var(--prom-line)] pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,#002D72_10%,transparent)]"
              aria-hidden
            >
              <MessageCircle className="h-5 w-5 text-[#002D72] dark:text-sky-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--prom-text)]">Hebb AI Support</h1>
              <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">
                Risposte su ferie, presenze, documenti e il tuo profilo in Nexa HR — solo per{" "}
                <span className="font-medium text-[var(--prom-text)]">{displayName}</span>.
              </p>
            </div>
          </div>
          <HebbAiPageHelpButton pageKey="hebb-ai-support" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-5">
        {thread.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-[var(--prom-muted)]">
              Chiedi in linguaggio naturale: l&apos;assistente usa solo i dati del tuo profilo e li tratta in modo
              sicuro prima di ogni eventuale elaborazione AI.
            </p>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                Suggerimenti
              </p>
              <div className="flex flex-col gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] px-4 py-3 text-left text-sm text-[var(--prom-text)] transition hover:border-[#002D72]/30 hover:bg-[color-mix(in_srgb,#002D72_6%,transparent)]"
                    onClick={() => void send(s)}
                    disabled={busy}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {thread.map((turn, i) => (
              <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 ${
                    turn.role === "user"
                      ? "bg-[color-mix(in_srgb,#002D72_88%,transparent)] text-white dark:bg-sky-900/80"
                      : "border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_65%,transparent)]"
                  }`}
                >
                  {turn.role === "assistant" ? (
                    <AssistantMarkdownLite text={turn.text} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
                  )}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-[var(--prom-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Hebb AI sta rispondendo…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {error ? (
        <p
          className="mb-3 shrink-0 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <footer className="shrink-0 border-t border-[var(--prom-line)] pt-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Es.: quanti giorni di ferie mi restano?"
            className="h-11 flex-1 rounded-xl border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)]"
            disabled={busy}
            aria-label="Messaggio per Hebb AI Support"
          />
          <Button type="submit" className="h-11 shrink-0 rounded-xl px-5 font-semibold" disabled={busy || !input.trim()}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Invio…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" aria-hidden />
                Invia
              </>
            )}
          </Button>
        </form>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-relaxed text-[var(--prom-muted)]">
          <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          Ambito limitato al tuo profilo. Per guide su come usare Nexa HR apri Nexa Guide (⌘K).
        </p>
      </footer>
    </div>
  );
}
