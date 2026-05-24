"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  confirmOnboardingBuddy,
  fetchOnboardingBuddyAssignment,
  fetchOnboardingBuddySuggestions,
  type BuddyAssignmentDto,
  type BuddySuggestionDto
} from "@/lib/api";

type Props = {
  token: string;
  userId: string;
  employeeName?: string;
  compact?: boolean;
  onConfirmed?: (buddyFullName: string) => void;
};

export function HrOnboardingBuddyPanel({
  token,
  userId,
  employeeName,
  compact = false,
  onConfirmed
}: Props): React.JSX.Element {
  const [suggestions, setSuggestions] = useState<BuddySuggestionDto[]>([]);
  const [assignment, setAssignment] = useState<BuddyAssignmentDto | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<{ active: boolean; refineApplied: boolean } | null>(null);
  const [keyContact, setKeyContact] = useState(true);

  const loadAssignment = useCallback(async (): Promise<void> => {
    try {
      const res = await fetchOnboardingBuddyAssignment(token, userId);
      setAssignment(res);
      setKeyContact(res.keyContact !== false);
    } catch {
      setAssignment(null);
    }
  }, [token, userId]);

  useEffect(() => {
    void loadAssignment();
  }, [loadAssignment]);

  async function loadSuggestions(): Promise<void> {
    setLoadingSuggestions(true);
    setError(null);
    try {
      const res = await fetchOnboardingBuddySuggestions(token, userId);
      setSuggestions(res.items);
      setLlmStatus(res.llm ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggerimenti buddy non disponibili");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function applySuggestion(s: BuddySuggestionDto): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const result = await confirmOnboardingBuddy(token, userId, {
        buddyUserId: s.userId,
        matchScore: s.score,
        matchReason: s.ruleReason || s.reason,
        aiRationale: s.aiRationale ?? undefined,
        keyContact
      });
      await loadAssignment();
      setSuggestions([]);
      onConfirmed?.(result.buddyFullName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conferma buddy non riuscita");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--card-border)] bg-slate-50/50 p-3 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-synapse-text dark:text-white">
              Buddy onboarding {llmStatus?.refineApplied ? "(AI + regole)" : "(regole)"}
            </p>
            {!compact && employeeName ? (
              <p className="text-xs text-synapse-muted">Per {employeeName}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loadingSuggestions}
            onClick={() => void loadSuggestions()}
          >
            {loadingSuggestions ? "Analisi…" : "Suggerisci buddy"}
          </Button>
        </div>

        {llmStatus && !loadingSuggestions ? (
          <p className="mt-2 text-[11px] text-synapse-muted">
            {llmStatus.refineApplied
              ? "Match arricchito con LLM su dati pseudonimizzati."
              : llmStatus.active
                ? "LLM non ha risposto: mostrati solo punteggi rule-based."
                : "LLM disattivato: punteggi rule-based."}
          </p>
        ) : null}

        {assignment?.buddyFullName && assignment.active ? (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              Buddy attivo: {assignment.buddyFullName}
            </p>
            {assignment.matchReason ? (
              <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/90">
                Regole: {assignment.matchReason}
              </p>
            ) : null}
            {assignment.aiRationale ? (
              <p className="mt-1 text-xs italic text-emerald-900/80 dark:text-emerald-100/90">
                AI: {assignment.aiRationale}
              </p>
            ) : null}
            {assignment.keyContact ? (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-emerald-700/80 dark:text-emerald-200/80">
                Referente attivo
                {assignment.expiresAt
                  ? ` fino al ${new Date(assignment.expiresAt).toLocaleDateString("it-IT")}`
                  : " (senza scadenza)"}
              </p>
            ) : null}
          </div>
        ) : assignment?.buddyFullName ? (
          <p className="mt-2 text-xs text-synapse-muted">Assegnazione non più attiva.</p>
        ) : null}

        {suggestions.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li
                key={s.userId}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--card-border)] px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{s.fullName}</span>
                    <span className="ml-2 text-xs text-synapse-muted">Score {s.score}</span>
                    {s.ruleScore !== s.score ? (
                      <span className="ml-1 text-[10px] text-synapse-muted">(regole {s.ruleScore})</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-synapse-muted">{s.ruleReason || s.reason}</p>
                  {s.aiRationale ? (
                    <p className="mt-1 text-xs italic text-[#002D72]/90 dark:text-sky-200/90">{s.aiRationale}</p>
                  ) : null}
                </div>
                <Button type="button" size="sm" disabled={saving} onClick={() => void applySuggestion(s)}>
                  Conferma
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!compact ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={keyContact} onChange={(e) => setKeyContact(e.target.checked)} />
          <span>Mantieni come referente chiave oltre l&apos;onboarding (visibile in Il mio team e Percorso)</span>
        </label>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
