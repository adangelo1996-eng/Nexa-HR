"use client";

import { useState } from "react";
import { postHebbHrChat } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function HebbHrChat(props: { token: string }): React.JSX.Element {
  const { token } = props;
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed || busy) {
      return;
    }
    setError(null);
    setBusy(true);
    setInput("");
    const thread = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(thread);
    try {
      const res = await postHebbHrChat(token, thread);
      setMessages([...thread, { role: "assistant", content: res.message }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio messaggio");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Simulazione e spiegazioni a scopo informativo: non sostituiscono consulenza del lavoro o software paghe
        certificato. I calcoli numerici usano il motore interno quando Hebb invoca lo strumento di simulazione.
      </p>
      <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Chiedi ad esempio: «Simula il cedolino per aprile 2026 per l&apos;utente selezionato» oppure «Quali sono
            gli scaglioni IRPEF 2025-2026?»
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={`${i}-${m.role}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-8 bg-synapse-gold/20 text-slate-900 dark:text-slate-100"
                : "mr-8 bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100"
            }`}
          >
            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              {m.role === "user" ? "Tu" : "Hebb HR"}
            </span>
            <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Scrivi la domanda…"
          className="min-h-[72px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <Button
          type="button"
          className="shrink-0 self-end sm:self-stretch"
          disabled={busy || !input.trim()}
          onClick={() => void send()}
        >
          {busy ? "Invio…" : "Invia"}
        </Button>
      </div>
    </div>
  );
}
