"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  CalendarClock,
  FileSignature,
  FileText,
  Loader2,
  Mail,
  Send,
  Sparkles,
  UserRound,
  UserSearch
} from "lucide-react";
import {
  fetchAiAssistantScopeOptions,
  fetchHebbMateCapabilities,
  fetchRecruitCandidates,
  fetchRecruitPositions,
  postHebbMateChat,
  type AiAssistantScopeOptionsDto,
  type HebbMateActionDto,
  type HebbMateCapabilityCardDto,
  type HebbMateCapabilityId,
  type HebbMateChatResponseDto
} from "@/lib/api";
import { getSessionUser, getToken } from "@/lib/auth-session";
import { AssistantMarkdownLite } from "@/components/assistant-markdown-lite";
import { HebbAiGlassPanel, HebbAiGlassTile } from "@/components/hebb-ai-experience-shell";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";

type ChatTurn = { role: "user" | "assistant"; text: string; response?: HebbMateChatResponseDto };

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
  costCenterId?: string;
  teamId?: string;
  onOpenCoworkTab?: () => void;
};

export function HebbMateWorkspace({
  costCenterId = "",
  teamId = "",
  onOpenCoworkTab
}: HebbMateWorkspaceProps): React.JSX.Element {
  const me = getSessionUser();
  const [capabilities, setCapabilities] = useState<HebbMateCapabilityCardDto[]>([]);
  const [scopeOptions, setScopeOptions] = useState<AiAssistantScopeOptionsDto | null>(null);
  const [scopeMode, setScopeMode] = useState<"self" | "user" | "team" | "cost_center">("self");
  const [scopeUserId, setScopeUserId] = useState("");
  const [scopeTeamId, setScopeTeamId] = useState(teamId);
  const [scopeCostCenterId, setScopeCostCenterId] = useState(costCenterId);
  const [activeCapability, setActiveCapability] = useState<HebbMateCapabilityId | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [candidates, setCandidates] = useState<Array<{ id: string; label: string }>>([]);
  const [positions, setPositions] = useState<Array<{ id: string; label: string }>>([]);
  const [input, setInput] = useState("");
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const [lastResponse, setLastResponse] = useState<HebbMateChatResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(false);

  useEffect(() => {
    setScopeTeamId(teamId);
    setScopeCostCenterId(costCenterId);
  }, [teamId, costCenterId]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void fetchHebbMateCapabilities(token)
      .then((r) => setCapabilities(r.capabilities))
      .catch(() => setCapabilities([]));
    void fetchAiAssistantScopeOptions(token)
      .then(setScopeOptions)
      .catch(() => setScopeOptions(null));
    void fetchRecruitCandidates(token)
      .then((items) =>
        setCandidates(items.slice(0, 40).map((c) => ({
          id: c.id,
          label: `${c.first_name} ${c.last_name}`.trim() || c.email || c.id
        })))
      )
      .catch(() => setCandidates([]));
    void fetchRecruitPositions(token)
      .then((items) => setPositions(items.map((p) => ({ id: p.id, label: p.title }))))
      .catch(() => setPositions([]));
  }, []);

  useEffect(() => {
    if (me && !scopeUserId) setScopeUserId(me.id);
  }, [me, scopeUserId]);

  const scopePayload = useMemo(() => {
    if (scopeMode === "user" && scopeUserId.trim()) {
      return { mode: "user" as const, userId: scopeUserId.trim() };
    }
    if (scopeMode === "team" && scopeTeamId.trim()) {
      return { mode: "team" as const, teamId: scopeTeamId.trim() };
    }
    if (scopeMode === "cost_center" && scopeCostCenterId.trim()) {
      return { mode: "cost_center" as const, costCenterId: scopeCostCenterId.trim() };
    }
    return { mode: "self" as const };
  }, [scopeMode, scopeUserId, scopeTeamId, scopeCostCenterId]);

  const send = useCallback(
    async (messageOverride?: string, capabilityOverride?: HebbMateCapabilityId | null) => {
      const token = getToken();
      const msg = (messageOverride ?? input).trim();
      const cap = capabilityOverride ?? activeCapability ?? undefined;
      if (!token || !msg || busy) return;

      setInput("");
      setThread((prev) => [...prev, { role: "user", text: msg }]);
      setBusy(true);
      setError(null);
      try {
        const response = await postHebbMateChat(token, {
          message: msg,
          capability: cap,
          scope: scopePayload,
          dryRun,
          candidateId: cap === "cv_screening" ? candidateId.trim() || undefined : undefined,
          positionId: cap === "cv_screening" ? positionId.trim() || undefined : undefined
        });
        setLastResponse(response);
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
    [activeCapability, busy, candidateId, dryRun, input, onOpenCoworkTab, positionId, scopePayload]
  );

  const onCardClick = useCallback(
    (card: HebbMateCapabilityCardDto) => {
      setActiveCapability(card.id);
      const starter = card.examplePrompts[0];
      if (starter) void send(starter, card.id);
    },
    [send]
  );

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

  return (
    <div className="space-y-6">
      <HebbAiGlassPanel className="border-[color-mix(in_srgb,var(--prom-accent)_22%,var(--glass-border))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,#002D72_12%,transparent)]">
              <Bot className="h-5 w-5 text-[#002D72] dark:text-sky-300" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Agente Mate</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--prom-muted)]">
                Workspace HR nativo: contratti, documenti, screening CV, email, report, competenze e automazioni —
                con scope persona, team o centro di costo.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((card) => {
            const Icon = CAPABILITY_ICONS[card.icon] ?? Sparkles;
            const active = activeCapability === card.id;
            return (
              <button
                key={card.id}
                type="button"
                disabled={busy}
                onClick={() => onCardClick(card)}
                className={`rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-fuchsia-500/60 bg-[color-mix(in_srgb,fuchsia_8%,transparent)] shadow-sm"
                    : "border-[var(--prom-line)] bg-[var(--prom-surface-soft)] hover:border-[var(--prom-accent)]"
                }`}
              >
                <Icon className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-300" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-[var(--prom-text)]">{card.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">{card.description}</p>
              </button>
            );
          })}
        </div>
      </HebbAiGlassPanel>

      <HebbAiGlassPanel>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Perimetro HR</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 text-[var(--prom-muted)]">Ambito</span>
            <select
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as typeof scopeMode)}
              className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm"
            >
              {(scopeOptions?.modesAllowed ?? ["self"]).map((m) => (
                <option key={m} value={m}>
                  {m === "self"
                    ? "Me stesso"
                    : m === "user"
                      ? "Persona"
                      : m === "team"
                        ? "Team"
                        : "Centro di costo"}
                </option>
              ))}
            </select>
          </label>
          {scopeMode === "user" ? (
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 flex items-center gap-1 text-[var(--prom-muted)]">
                <UserRound className="h-3.5 w-3.5" aria-hidden /> Persona
              </span>
              <select
                value={scopeUserId}
                onChange={(e) => setScopeUserId(e.target.value)}
                className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm"
              >
                {(scopeOptions?.managedUsers ?? [{ userId: me?.id ?? "", label: me?.fullName ?? "Tu" }]).map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {scopeMode === "team" ? (
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 text-[var(--prom-muted)]">Team</span>
              <select
                value={scopeTeamId}
                onChange={(e) => setScopeTeamId(e.target.value)}
                className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm"
              >
                <option value="">Seleziona team</option>
                {(scopeOptions?.teams ?? []).map((t) => (
                  <option key={t.teamId} value={t.teamId}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {scopeMode === "cost_center" ? (
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 text-[var(--prom-muted)]">Centro di costo</span>
              <select
                value={scopeCostCenterId}
                onChange={(e) => setScopeCostCenterId(e.target.value)}
                className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm"
              >
                <option value="">Seleziona CDC</option>
                {(scopeOptions?.costCenters ?? []).map((c) => (
                  <option key={c.costCenterId} value={c.costCenterId}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--prom-line)]"
            />
            <span className="pb-2 text-[var(--prom-muted)]">Anteprima contratti (dry-run)</span>
          </label>
        </div>

        {activeCapability === "cv_screening" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 text-[var(--prom-muted)]">Candidato</span>
              <select
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm"
              >
                <option value="">Seleziona candidato</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 text-[var(--prom-muted)]">Posizione (opz.)</span>
              <select
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
                className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm"
              >
                <option value="">Auto / prima posizione</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </HebbAiGlassPanel>

      <div className="grid gap-6 lg:grid-cols-5">
        <HebbAiGlassPanel className="flex min-h-[380px] flex-col lg:col-span-3">
          <h3 className="text-base font-semibold text-[var(--prom-text)]">Chat agente</h3>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {thread.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-8 text-center text-sm text-[var(--prom-muted)]">
                Seleziona una capability o descrivi l&apos;operazione HR.
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
                {turn.role === "assistant" ? (
                  <AssistantMarkdownLite text={turn.text} />
                ) : (
                  turn.text
                )}
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-[var(--prom-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Elaborazione…
              </div>
            ) : null}
          </div>
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
              placeholder="Es. Genera report team Marketing con ferie e competenze…"
              className="flex-1 rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
              disabled={busy}
            />
            <LoadingButton type="submit" loading={busy} disabled={!input.trim()} className="gap-1.5">
              <Send className="h-4 w-4" aria-hidden />
              Invia
            </LoadingButton>
          </form>
        </HebbAiGlassPanel>

        <HebbAiGlassPanel className="flex flex-col lg:col-span-2">
          <h3 className="text-base font-semibold text-[var(--prom-text)]">Output azionabile</h3>
          {!lastResponse ? (
            <p className="mt-4 text-sm text-[var(--prom-muted)]">
              Qui compaiono anteprime documenti, report, punteggi CV e proposte automazione.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <HebbAiGlassTile>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  {lastResponse.capability}
                </p>
                <p className="mt-2 text-sm text-[var(--prom-text)]">{lastResponse.reply}</p>
              </HebbAiGlassTile>
              {lastResponse.actions && lastResponse.actions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {lastResponse.actions.map(renderAction)}
                </div>
              ) : null}
              {lastResponse.result ? (
                <pre className="max-h-64 overflow-auto rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] p-3 text-[11px] leading-relaxed text-[var(--prom-muted)]">
                  {JSON.stringify(lastResponse.result, null, 2)}
                </pre>
              ) : null}
            </div>
          )}
        </HebbAiGlassPanel>
      </div>
    </div>
  );
}
