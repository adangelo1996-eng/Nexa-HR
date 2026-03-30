"use client";

import { useCallback, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/auth-session";
import { fetchLeaveBalance, fetchUserCalendar } from "@/lib/api";

export function SelfServiceChat(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<{ q: string; a: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async (): Promise<void> => {
    const q = input.trim();
    if (!q || busy) {
      return;
    }
    setInput("");
    setBusy(true);
    const token = getToken();
    let answer = "Non ho capito. Prova: «ferie rimaste?» o «prossimo turno?»";
    try {
      const low = q.toLowerCase();
      if (/ferie|ferie rimast|vacanz|residu/.test(low)) {
        if (token) {
          const y = new Date().getFullYear();
          const b = await fetchLeaveBalance(token, y);
          answer = `Ferie residue: ${b?.residualDays ?? 0} giorni (${y}).`;
        } else {
          answer = "Accedi per vedere il saldo ferie.";
        }
      } else if (/prossim|turno|calendario|quando lavor/.test(low)) {
        if (token) {
          const from = new Date().toISOString().slice(0, 10);
          const to = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
          const ev = await fetchUserCalendar(token, from, to);
          const shift = ev.find((e) => e.kind === "shift");
          answer = shift
            ? `Prossimo turno: ${shift.title} — ${shift.start.slice(0, 16)}`
            : "Nessun turno in calendario nel periodo.";
        } else {
          answer = "Accedi per il calendario.";
        }
      }
    } catch {
      answer = "Errore nel recupero dati. Riprova.";
    }
    setLines((prev) => [...prev, { q, a: answer }]);
    setBusy(false);
  }, [input, busy]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--prom-line-strong)] bg-[var(--prom-surface)] text-[var(--prom-text)] shadow-[var(--card-shadow)] transition-[transform,opacity] hover:opacity-90 md:bottom-8 md:left-8"
        aria-label="Assistenza rapida"
        title="Assistenza rapida"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw,380px)] flex-col border-r border-[var(--prom-line)] bg-[var(--prom-surface)] shadow-[var(--card-shadow)] transition-transform duration-200 md:max-w-md ${
          open ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-[var(--prom-line)] px-4 py-3">
          <span className="text-sm font-medium text-[var(--prom-text)]">Assistenza</span>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setOpen(false)} aria-label="Chiudi">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-3 overflow-auto px-4 py-3 text-sm">
          {lines.length === 0 ? (
            <p className="text-[var(--prom-muted)]">Chiedi ferie residue o prossimo turno.</p>
          ) : (
            lines.map((row, i) => (
              <div key={i} className="space-y-1">
                <p className="text-[var(--prom-muted)]">{row.q}</p>
                <p className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2 text-[var(--prom-text)]">
                  {row.a}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2 border-t border-[var(--prom-line)] p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void ask()}
            placeholder="Scrivi…"
            className="min-w-0 flex-1 rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-3 py-2 text-sm text-[var(--prom-text)] outline-none"
          />
          <Button type="button" size="sm" onClick={() => void ask()} disabled={busy} className="shrink-0" aria-label="Invia">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden"
          aria-label="Chiudi overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
