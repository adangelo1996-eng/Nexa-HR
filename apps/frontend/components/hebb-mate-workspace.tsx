"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  CalendarClock,
  FileSignature,
  FileText,
  Loader2,
  Mail,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserSearch
} from "lucide-react";
import {
  fetchHebbMateAutomations,
  fetchHebbMateCapabilities,
  fetchHebbMateHistory,
  postHebbMateApply,
  postHebbMateCancel,
  postHebbMateChat,
  postHebbMateUndo,
  type HebbMateActionDto,
  type HebbMateAutomationDto,
  type HebbMateCapabilityCardDto,
  type HebbMateChatResponseDto,
  type HebbMateCapabilityId,
  type HebbMateHistoryEntryDto
} from "@/lib/api";
import { getSessionUser, getToken } from "@/lib/auth-session";
import { AssistantMarkdownLite } from "@/components/assistant-markdown-lite";
import { HebbAiGlassPanel, HebbAiGlassTile } from "@/components/hebb-ai-experience-shell";
import { HebbMatePreviewPanel } from "@/components/hebb-mate-preview-panel";
import { GlassConfirmDialog } from "@/components/glass-confirm-dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";

type ChatTurn = { role: "user" | "assistant"; text: string; response?: HebbMateChatResponseDto };

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Giornaliera",
  weekly: "Settimanale",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale",
  on_demand: "Su richiesta"
};

const WORK_AREA_LABELS: Record<string, string> = {
  attendance: "Presenze / timbrature",
  lifecycle: "Lifecycle",
  training: "Formazione",
  time_off: "Assenze e ferie",
  documents: "Documenti",
  onboarding: "Onboarding",
  payroll: "Payroll",
  analytics: "Analytics HR",
  smartworking_agreements: "Smart working",
  generic: "Generale",
  all: "Tutta l'app"
};

const SCOPE_LABELS: Record<string, string> = {
  self: "Personale",
  employees: "Dipendenti selezionati",
  company: "Tutta l'azienda"
};

const CAPABILITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "file-signature": FileSignature,
  "file-text": FileText,
  "user-search": UserSearch,
  mail: Mail,
  "bar-chart": BarChart3,
  sparkles: Sparkles,
  "calendar-clock": CalendarClock
};

export type HebbMateWorkspaceProps = {
  onOpenCoworkTab?: () => void;
};

export function HebbMateWorkspace({ onOpenCoworkTab }: HebbMateWorkspaceProps): React.JSX.Element {
  const me = getSessionUser();
  const isSuperuser = me?.role === "superuser";

  const [capabilities, setCapabilities] = useState<HebbMateCapabilityCardDto[]>([]);
  const [input, setInput] = useState("");
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const [preview, setPreview] = useState<HebbMateChatResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HebbMateHistoryEntryDto[]>([]);
  const [automations, setAutomations] = useState<HebbMateAutomationDto[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [undoTarget, setUndoTarget] = useState<HebbMateHistoryEntryDto | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void fetchHebbMateCapabilities(token)
      .then((r) => setCapabilities(r.capabilities))
      .catch(() => setCapabilities([]));
    void loadHistory();
    void loadAutomations();
  }, []);

  const loadHistory = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetchHebbMateHistory(token);
      setHistory(res.entries);
    } catch {
      setHistory([]);
    }
  }, []);

  const loadAutomations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetchHebbMateAutomations(token);
      setAutomations(res.automations);
    } catch {
      setAutomations([]);
    }
  }, []);

  const send = useCallback(
    async (messageOverride?: string, capabilityOverride?: HebbMateCapabilityId) => {
      const token = getToken();
      const msg = (messageOverride ?? input).trim();
      if (!token || !msg || busy) return;

      setInput("");
      setThread((prev) => [...prev, { role: "user", text: msg }]);
      setBusy(true);
      setError(null);
      setPreview(null);
      try {
        const response = await postHebbMateChat(token, {
          message: msg,
          capability: capabilityOverride
        });
        setPreview(response);
        setThread((prev) => [...prev, { role: "assistant", text: response.reply, response }]);
        if (response.capability === "cowork_batch" && onOpenCoworkTab) {
          onOpenCoworkTab();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore Mate");
        setThread((prev) => prev.slice(0, -1));
        setInput(msg);
      } finally {
        setBusy(false);
      }
    },
    [busy, input, onOpenCoworkTab]
  );

  const onCardClick = useCallback(
    (card: HebbMateCapabilityCardDto) => {
      const starter = card.examplePrompts[0];
      if (starter) {
        void send(starter, card.id);
      }
    },
    [send]
  );

  const onStarterClick = useCallback(
    (prompt: string) => {
      void send(prompt);
    },
    [send]
  );

  const confirmApply = useCallback(async () => {
    const token = getToken();
    const proposalId = preview?.hitl?.proposalId;
    if (!token || !proposalId || !preview?.hitl?.requiresConfirm) return;

    setApplying(true);
    setError(null);
    try {
      const applied = await postHebbMateApply(token, proposalId);
      setPreview((p) =>
        p
          ? {
              ...p,
              reply: applied.reply,
              result: applied.result,
              hitl: p.hitl ? { ...p.hitl, requiresConfirm: false } : undefined
            }
          : p
      );
      setThread((prev) => [...prev, { role: "assistant", text: applied.reply }]);
      await loadHistory();
      await loadAutomations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conferma non riuscita");
    } finally {
      setApplying(false);
    }
  }, [loadAutomations, loadHistory, preview]);

  const cancelPreview = useCallback(async () => {
    const token = getToken();
    const proposalId = preview?.hitl?.proposalId;
    if (token && proposalId) {
      try {
        await postHebbMateCancel(token, proposalId);
      } catch {
        /* best effort */
      }
    }
    setPreview(null);
  }, [preview]);

  const runUndo = useCallback(async () => {
    const token = getToken();
    if (!token || !undoTarget) return;
    setHistoryBusy(true);
    setError(null);
    try {
      await postHebbMateUndo(token, undoTarget.logId);
      setUndoTarget(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annullamento non riuscito");
    } finally {
      setHistoryBusy(false);
    }
  }, [loadHistory, undoTarget]);

  const renderAction = (action: HebbMateActionDto, idx: number) => (
    <Button
      key={`${action.type}-${idx}`}
      type="button"
      variant="outline"
      size="sm"
      className="text-xs"
      onClick={() => {
        if (action.type === "open_cowork") onOpenCoworkTab?.();
      }}
    >
      {action.label}
    </Button>
  );

  const automationStarters =
    capabilities.find((c) => c.id === "automation_proposals")?.examplePrompts ?? [];
  const otherStarters = capabilities
    .filter((c) => c.id !== "automation_proposals")
    .flatMap((c) => c.examplePrompts.slice(0, 1));
  const allStarters = [...automationStarters.slice(0, 4), ...otherStarters];

  return (
    <div className="flex flex-col gap-6">
      <HebbAiGlassPanel className="border-[color-mix(in_srgb,var(--prom-accent)_22%,var(--glass-border))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,#002D72_12%,transparent)]">
              <Bot className="h-5 w-5 text-[#002D72] dark:text-sky-300" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Agente Mate</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--prom-muted)]">
                Contratti, documenti, screening CV, email, report, competenze e automazioni. Cita i nominativi nel
                messaggio per definire il perimetro HR.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((card) => {
            const Icon = CAPABILITY_ICONS[card.icon] ?? Sparkles;
            return (
              <button
                key={card.id}
                type="button"
                disabled={busy}
                onClick={() => onCardClick(card)}
                className="rounded-2xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] p-4 text-left transition hover:border-[var(--prom-accent)]"
              >
                <Icon className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-300" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-[var(--prom-text)]">{card.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">{card.description}</p>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-fuchsia-600 dark:text-fuchsia-300">
                  Suggerimento
                </p>
              </button>
            );
          })}
        </div>
      </HebbAiGlassPanel>

      <HebbAiGlassPanel className="flex items-start gap-3 border-[color-mix(in_srgb,var(--prom-accent)_25%,var(--glass-border))] bg-[color-mix(in_srgb,var(--prom-accent)_6%,var(--card-bg))]">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prom-accent)]" aria-hidden />
        <p className="text-sm leading-relaxed text-[var(--prom-muted)]">
          Puoi citare i nominativi nella richiesta: verso il modello vengono tradotti in pseudonimi stabili. I nomi
          compaiono solo nella preview HR autorizzata sotto la chat.
        </p>
      </HebbAiGlassPanel>

      <HebbAiGlassPanel className="flex min-h-[360px] w-full flex-col">
        <h3 className="text-base font-semibold text-[var(--prom-text)]">Chat agente</h3>
        <p className="mt-1 text-xs text-[var(--prom-muted)]">
          Descrivi l&apos;operazione citando una o più persone; la preview HITL compare sotto.
        </p>
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {thread.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-8 text-center text-sm text-[var(--prom-muted)]">
              Usa un suggerimento dalla griglia o descrivi l&apos;operazione HR.
            </p>
          ) : null}
          {thread.map((turn, i) => (
            <div
              key={`${turn.role}-${i}`}
              className={`rounded-2xl px-4 py-3 text-sm ${
                turn.role === "user"
                  ? "ml-8 bg-[color-mix(in_srgb,fuchsia_10%,transparent)] text-[var(--prom-text)]"
                  : "mr-4 border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] text-[var(--prom-muted)]"
              }`}
            >
              {turn.role === "assistant" ? <AssistantMarkdownLite text={turn.text} /> : turn.text}
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-[var(--prom-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Elaborazione…
            </div>
          ) : null}
        </div>

        {allStarters.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              Esempi rapidi{automationStarters.length > 0 ? " · automazioni HR in evidenza" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {allStarters.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={busy}
                  onClick={() => onStarterClick(ex)}
                  className="rounded-full border border-[var(--prom-line)] px-3 py-1.5 text-xs text-[var(--prom-muted)] transition hover:border-[var(--prom-accent)] hover:text-[var(--prom-text)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        <form
          className="mt-4 flex gap-2 border-t border-[var(--prom-line)] pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Es. Genera report per Marco Rossi e Laura Bianchi…"
            className="flex-1 rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
            disabled={busy}
          />
          <LoadingButton type="submit" loading={busy} disabled={!input.trim()} className="gap-1.5">
            <Send className="h-4 w-4" aria-hidden />
            Invia
          </LoadingButton>
        </form>
      </HebbAiGlassPanel>

      <HebbAiGlassPanel className="flex min-h-[280px] w-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--prom-text)]">Preview operazioni (HITL)</h3>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Anteprima dei risultati prima di confermare operazioni con effetti sul sistema.
            </p>
          </div>
          {preview?.scope ? (
            <div className="flex flex-wrap gap-2 text-xs text-[var(--prom-muted)]">
              <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                {preview.scope.subjectCount} {preview.scope.subjectCount === 1 ? "persona" : "persone"}
              </span>
              {preview.scope.resolvedNames.length > 0 ? (
                <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                  {preview.scope.resolvedNames.join(", ")}
                </span>
              ) : preview.scope.scopeKind === "company" ? (
                <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                  {SCOPE_LABELS.company}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {!preview ? (
          <p className="mt-8 flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--prom-line)] px-6 py-10 text-center text-sm text-[var(--prom-muted)]">
            I risultati e le anteprime compariranno qui dopo l&apos;invio del messaggio.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <HebbAiGlassTile>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                {preview.capability}
              </p>
              <p className="mt-2 text-sm text-[var(--prom-text)]">{preview.reply}</p>
            </HebbAiGlassTile>
            {preview.actions && preview.actions.length > 0 ? (
              <div className="flex flex-wrap gap-2">{preview.actions.map(renderAction)}</div>
            ) : null}
            {preview.result || preview.hitl?.preview ? (
              <HebbMatePreviewPanel
                capability={preview.capability}
                payload={preview.hitl?.preview ?? preview.result}
              />
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--prom-line)] pt-4">
              {preview.hitl?.requiresConfirm ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={applying} onClick={() => void cancelPreview()}>
                    Annulla
                  </Button>
                  <LoadingButton loading={applying} onClick={() => void confirmApply()}>
                    Conferma e applica
                  </LoadingButton>
                </>
              ) : null}
            </div>
          </div>
        )}
      </HebbAiGlassPanel>

      <HebbAiGlassPanel className="flex w-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--prom-text)]">Automazioni attive</h3>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Automazioni HR in corso: frequenza, area di lavoro e azioni programmate.
            </p>
          </div>
          <CalendarClock className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-300" aria-hidden />
        </div>
        {automations.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--prom-line)] px-6 py-10 text-center text-sm text-[var(--prom-muted)]">
            Nessuna automazione attiva. Chiedi a Mate di pianificare un&apos;automazione (es. timbrature giornaliere).
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--prom-line)]">
            {automations.map((auto) => (
              <li key={auto.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--prom-text)]">{auto.title}</p>
                    <p className="mt-1 text-sm text-[var(--prom-muted)]">{auto.description}</p>
                  </div>
                  <span className="rounded-full border border-[var(--prom-line)] px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {auto.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--prom-muted)]">
                  <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                    {FREQUENCY_LABELS[auto.frequency] ?? auto.frequency}
                    {auto.scheduleHint ? ` · ${auto.scheduleHint}` : ""}
                  </span>
                  <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                    Area: {WORK_AREA_LABELS[auto.workArea] ?? auto.workArea}
                  </span>
                  <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                    {SCOPE_LABELS[auto.scopeKind] ?? auto.scopeKind} ({auto.subjectCount})
                  </span>
                </div>
                {auto.actions.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-[var(--prom-muted)]">
                    {auto.actions.map((action, idx) => (
                      <li key={`${auto.id}-action-${idx}`}>
                        • {action.label}
                        {action.toolId ? ` (${action.toolId})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </HebbAiGlassPanel>

      {history.length > 0 ? (
        <HebbAiGlassPanel className="flex w-full flex-col">
          <h3 className="text-base font-semibold text-[var(--prom-text)]">Operazioni recenti</h3>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            {isSuperuser
              ? "Le operazioni Mate applicate possono essere annullate dal superuser."
              : "Storico operazioni Mate confermate."}
          </p>
          <ul className="mt-4 divide-y divide-[var(--prom-line)]">
            {history.slice(0, 12).map((entry) => (
              <li key={entry.logId} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--prom-text)]">{entry.subjectFullName}</p>
                  <p className="mt-1 text-sm text-[var(--prom-muted)]">{entry.detail}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--prom-muted)]">
                    {entry.capability} · {new Date(entry.appliedAt).toLocaleString("it-IT")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-[var(--prom-line)] px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {entry.undoStatus}
                  </span>
                  {isSuperuser && entry.undoStatus === "available" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={historyBusy}
                      onClick={() => setUndoTarget(entry)}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Annulla
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </HebbAiGlassPanel>
      ) : null}

      <GlassConfirmDialog
        open={undoTarget !== null}
        title="Annullare l'operazione Mate?"
        message={
          undoTarget
            ? `L'operazione su ${undoTarget.subjectFullName} verrà annullata dove possibile. Solo il superuser può eseguire l'undo.`
            : ""
        }
        confirmLabel="Annulla operazione"
        cancelLabel="Chiudi"
        variant="danger"
        busy={historyBusy}
        onCancel={() => {
          if (!historyBusy) setUndoTarget(null);
        }}
        onConfirm={() => void runUndo()}
      />
    </div>
  );
}
