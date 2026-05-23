"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, Loader2, ShieldCheck, UserRound } from "lucide-react";
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

function rowStatusClass(status: CoworkPlanRowDto["status"]): string {
  if (status === "applied") {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  }
  if (status === "error") {
    return "border-red-500/35 bg-red-500/10 text-red-800 dark:text-red-200";
  }
  if (status === "skipped") {
    return "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-muted)]";
  }
  return "border-[color-mix(in_srgb,var(--prom-accent)_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-accent)_8%,transparent)] text-[var(--prom-text)]";
}

function PlanRowCard(props: {
  row: CoworkPlanRowDto;
  selected: boolean;
  applying: boolean;
  onToggle: (id: string) => void;
}): React.JSX.Element {
  const { row, selected, applying, onToggle } = props;
  const canSelect = row.status === "proposed";

  return (
    <article
      className={`rounded-xl border p-4 transition-[border-color,box-shadow] ${
        selected
          ? "border-[color-mix(in_srgb,var(--prom-accent)_45%,var(--prom-line))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--prom-accent)_25%,transparent)]"
          : "border-[var(--prom-line)]"
      } bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)]`}
    >
      <div className="flex gap-3">
        <div className="pt-0.5">
          <input
            type="checkbox"
            checked={selected}
            disabled={!canSelect || applying}
            onChange={() => onToggle(row.id)}
            aria-label={`Seleziona ${row.fullName}`}
            className="h-4 w-4 rounded border-[var(--prom-line)]"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold leading-snug text-[var(--prom-text)]">{row.fullName}</p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                {row.action}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rowStatusClass(row.status)}`}
            >
              {rowStatusLabel(row.status)}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--prom-muted)]">{row.detail}</p>
          {row.errorMessage ? (
            <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {row.errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
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

  const planStats = useMemo(() => {
    if (!plan) return null;
    const rows = plan.rows;
    return {
      total: rows.length,
      proposed: rows.filter((r) => r.status === "proposed").length,
      applied: rows.filter((r) => r.status === "applied").length,
      errors: rows.filter((r) => r.status === "error").length
    };
  }, [plan]);

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
      title="Hebb AI Mate"
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
        <HebbAiGlassPanel className="flex min-h-[440px] flex-col">
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">Conversazione</h2>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">Descrivi l&apos;operazione; il riepilogo compare a destra.</p>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-6 text-center text-sm text-[var(--prom-muted)]">
                Es. rinnovo accordi smart working, estensione periodi, clausole contratto…
              </p>
            ) : null}
            {messages.map((msg, i) => (
              <div
                key={`${msg.role}-${i}`}
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "ml-6 bg-[color-mix(in_srgb,var(--prom-accent)_12%,transparent)] text-[var(--prom-text)]"
                    : "mr-6 border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-muted)]"
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
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Esempi rapidi</p>
              <div className="flex flex-wrap gap-2">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    disabled={planning}
                    onClick={() => void runPlan(ex)}
                    className="rounded-full border border-[var(--prom-line)] px-3 py-1.5 text-xs text-[var(--prom-muted)] transition hover:border-[var(--prom-accent)] hover:text-[var(--prom-text)]"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <form
            className="mt-4 flex gap-2 border-t border-[var(--prom-line)] pt-4"
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

        <HebbAiGlassPanel className="flex min-h-[440px] flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Preview operazioni (HITL)</h2>
              <p className="mt-1 text-xs text-[var(--prom-muted)]">
                Seleziona le righe da applicare dopo aver verificato nominativi e dettaglio.
              </p>
            </div>
            {plan && proposedRows.some((r) => r.status === "proposed") ? (
              <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                Seleziona tutte
              </Button>
            ) : null}
          </div>

          {plan && planStats ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Righe</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.total}</p>
              </div>
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Proposte</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.proposed}</p>
              </div>
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Applicate</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.applied}</p>
              </div>
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Errori</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.errors}</p>
              </div>
            </div>
          ) : null}

          {plan ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--prom-muted)]">
              <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                Dominio: {DOMAIN_LABELS[plan.domain] ?? plan.domain}
              </span>
              {plan.llmApplied ? (
                <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">Sintesi AI</span>
              ) : null}
            </div>
          ) : null}

          {!plan ? (
            <div className="mt-8 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--prom-line)] px-6 py-10 text-center">
              <CircleDashed className="mb-3 h-10 w-10 text-[var(--prom-muted)] opacity-50" aria-hidden />
              <p className="text-sm text-[var(--prom-muted)]">Il piano comparirà qui dopo la generazione.</p>
            </div>
          ) : (
            <>
              <div className="mt-4 hidden flex-1 overflow-auto rounded-xl border border-[var(--prom-line)] md:block">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-[var(--prom-line)] bg-[var(--prom-surface-soft)] text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                    <tr>
                      <th className="w-10 p-3" scope="col">
                        <span className="sr-only">Seleziona</span>
                      </th>
                      <th className="p-3" scope="col">
                        Dipendente
                      </th>
                      <th className="p-3" scope="col">
                        Dettaglio
                      </th>
                      <th className="w-28 p-3" scope="col">
                        Stato
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--prom-line)]">
                    {plan.rows.map((row) => {
                      const canSelect = row.status === "proposed";
                      return (
                        <tr
                          key={row.id}
                          className={`text-[var(--prom-text)] ${selected.has(row.id) ? "bg-[color-mix(in_srgb,var(--prom-accent)_6%,transparent)]" : ""}`}
                        >
                          <td className="p-3 align-top">
                            <input
                              type="checkbox"
                              checked={selected.has(row.id)}
                              disabled={!canSelect || applying}
                              onChange={() => toggleRow(row.id)}
                              aria-label={`Seleziona ${row.fullName}`}
                            />
                          </td>
                          <td className="p-3 align-top">
                            <div className="flex items-start gap-2">
                              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
                              <div>
                                <div className="font-medium leading-snug">{row.fullName}</div>
                                <div className="mt-0.5 text-xs text-[var(--prom-muted)]">{row.action}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 align-top text-[var(--prom-muted)]">
                            <p className="leading-relaxed">{row.detail}</p>
                            {row.errorMessage ? (
                              <p className="mt-1.5 flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                {row.errorMessage}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-3 align-top">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rowStatusClass(row.status)}`}
                            >
                              {rowStatusLabel(row.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-1 flex-col gap-2 overflow-y-auto md:hidden">
                {plan.rows.map((row) => (
                  <PlanRowCard
                    key={row.id}
                    row={row}
                    selected={selected.has(row.id)}
                    applying={applying}
                    onToggle={toggleRow}
                  />
                ))}
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--prom-line)] pt-4">
            <p className="text-xs text-[var(--prom-muted)]">
              {plan ? (
                <>
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-text-bottom opacity-70" aria-hidden />
                  {selected.size} righe selezionate per l&apos;applicazione
                </>
              ) : (
                "Nessuna selezione"
              )}
            </p>
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
