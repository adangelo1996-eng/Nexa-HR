"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  fetchCoworkMeta,
  postCoworkApply,
  postCoworkPlan,
  type CoworkPlanDto,
  type CoworkPlanRowDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel
} from "@/components/hebb-ai-experience-shell";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";

type ChatMessage = { role: "user" | "assistant"; content: string };

const DOMAIN_LABELS: Record<string, string> = {
  smartworking_agreements: "Accordi SW annuali",
  smartworking_requests: "Estensione richieste SW",
  employment_contracts: "Contratti (clausola SW)",
  training: "Formazione",
  unknown: "—"
};

function rowStatusLabel(status: CoworkPlanRowDto["status"]): string {
  if (status === "applied") return "Applicata";
  if (status === "error") return "Errore";
  if (status === "skipped") return "Saltata";
  return "Proposta";
}

export default function NexaCoworkPage(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [plan, setPlan] = useState<CoworkPlanDto | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    void fetchCoworkMeta(t)
      .then((m) => setExamples(m.examplePrompts))
      .catch(() => {
        /* meta opzionale */
      });
  }, []);

  const proposedRows = useMemo(
    () => (plan?.rows ?? []).filter((r) => r.status === "proposed" || r.status === "error"),
    [plan]
  );

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const ids = proposedRows.filter((r) => r.status === "proposed").map((r) => r.id);
    setSelected((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  }, [proposedRows]);

  const runPlan = useCallback(async (message: string) => {
    const t = getToken();
    if (!t || !message.trim()) return;
    setPlanning(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: message.trim() }]);
    setInput("");
    try {
      const result = await postCoworkPlan(t, { message: message.trim() });
      setPlan(result);
      setSelected(new Set(result.rows.filter((r) => r.status === "proposed").map((r) => r.id)));
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: result.summary
        }
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore generazione piano");
    } finally {
      setPlanning(false);
    }
  }, []);

  const runApply = useCallback(async () => {
    const t = getToken();
    if (!t || !plan || selected.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const result = await postCoworkApply(t, {
        planId: plan.planId,
        selectedRowIds: [...selected]
      });
      setPlan((p) => (p ? { ...p, rows: result.rows, status: result.errorCount > 0 ? "partial" : "applied" } : p));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore applicazione");
    } finally {
      setApplying(false);
    }
  }, [plan, selected]);

  return (
    <HebbAiExperienceShell
      contentMax="wide"
      title="Nexa Cowork"
      subtitle={
        <>
          Workspace per modifiche di massa guidate da linguaggio naturale. Ogni operazione passa da preview con
          nominativi e conferma HR; i dati inviati al modello sono solo aggregati pseudonimizzati.
        </>
      }
      headerTrailing={<NexaPageHelpButton pageKey="hr-cowork" />}
    >
      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      <HebbAiGlassPanel className="flex items-start gap-3 border-[color-mix(in_srgb,var(--prom-accent)_25%,var(--glass-border))] bg-[color-mix(in_srgb,var(--prom-accent)_6%,var(--card-bg))]">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prom-accent)]" aria-hidden />
        <p className="text-sm leading-relaxed text-[var(--prom-muted)]">
          I nominativi compaiono solo in questa preview HR autorizzata. Il modello AI vede conteggi e aggregati, mai
          nomi o email in chiaro.
        </p>
      </HebbAiGlassPanel>

      <div className="grid gap-6 lg:grid-cols-2">
        <HebbAiGlassPanel className="flex min-h-[420px] flex-col">
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">Conversazione</h2>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <p className="text-sm text-[var(--prom-muted)]">
                Descrivi l&apos;operazione di massa (es. rinnovo accordi SW, estensione periodi, clausole contratto).
              </p>
            ) : null}
            {messages.map((msg, i) => (
              <div
                key={`${msg.role}-${i}`}
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "ml-8 bg-[color-mix(in_srgb,var(--prom-accent)_12%,transparent)] text-[var(--prom-text)]"
                    : "mr-8 border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-muted)]"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {planning ? (
              <div className="flex items-center gap-2 text-sm text-[var(--prom-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Elaborazione piano…
              </div>
            ) : null}
          </div>

          {examples.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={planning}
                  onClick={() => void runPlan(ex)}
                  className="rounded-full border border-[var(--prom-line)] px-3 py-1 text-xs text-[var(--prom-muted)] transition hover:border-[var(--prom-accent)] hover:text-[var(--prom-text)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runPlan(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Es. Rinnova accordi smart working 2026 per Marketing…"
              className="flex-1 rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)] outline-none focus:border-[var(--prom-accent)]"
              disabled={planning}
            />
            <LoadingButton type="submit" loading={planning} disabled={!input.trim()}>
              Genera piano
            </LoadingButton>
          </form>
        </HebbAiGlassPanel>

        <HebbAiGlassPanel className="flex min-h-[420px] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Preview operazioni</h2>
              {plan ? (
                <p className="mt-1 text-xs text-[var(--prom-muted)]">
                  Dominio: {DOMAIN_LABELS[plan.domain] ?? plan.domain} · {plan.rows.length} righe
                  {plan.llmApplied ? " · sintesi AI" : ""}
                </p>
              ) : null}
            </div>
            {plan && proposedRows.some((r) => r.status === "proposed") ? (
              <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                Seleziona tutte
              </Button>
            ) : null}
          </div>

          {!plan ? (
            <p className="mt-8 text-center text-sm text-[var(--prom-muted)]">
              Il piano comparirà qui dopo la generazione.
            </p>
          ) : (
            <div className="mt-4 flex-1 overflow-auto rounded-xl border border-[var(--prom-line)]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="sticky top-0 bg-[var(--prom-surface-soft)] text-xs uppercase tracking-wide text-[var(--prom-muted)]">
                  <tr>
                    <th className="w-10 p-2" scope="col">
                      <span className="sr-only">Seleziona</span>
                    </th>
                    <th className="p-2" scope="col">
                      Dipendente
                    </th>
                    <th className="p-2" scope="col">
                      Dettaglio
                    </th>
                    <th className="p-2" scope="col">
                      Stato
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--prom-line)]">
                  {plan.rows.map((row) => {
                    const canSelect = row.status === "proposed";
                    return (
                      <tr key={row.id} className="text-[var(--prom-text)]">
                        <td className="p-2 align-top">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            disabled={!canSelect || applying}
                            onChange={() => toggleRow(row.id)}
                            aria-label={`Seleziona ${row.fullName}`}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <div className="font-medium">{row.fullName}</div>
                          <div className="text-xs text-[var(--prom-muted)]">{row.action}</div>
                        </td>
                        <td className="p-2 align-top text-[var(--prom-muted)]">
                          {row.detail}
                          {row.errorMessage ? (
                            <div className="mt-1 text-xs text-red-600">{row.errorMessage}</div>
                          ) : null}
                        </td>
                        <td className="p-2 align-top text-xs">{rowStatusLabel(row.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <LoadingButton
              loading={applying}
              disabled={!plan || selected.size === 0}
              onClick={() => void runApply()}
            >
              Applica selezionati ({selected.size})
            </LoadingButton>
          </div>
        </HebbAiGlassPanel>
      </div>
    </HebbAiExperienceShell>
  );
}
