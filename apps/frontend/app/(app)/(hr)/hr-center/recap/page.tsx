"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { postHrCenterRecap } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function renderNarrative(n: unknown): React.JSX.Element {
  const o = n as { envelope?: { title?: string; bullets?: string[]; summary?: string } };
  const e = o?.envelope;
  if (!e) {
    return (
      <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950/80 p-3 text-[11px] text-slate-100">
        {JSON.stringify(n, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      {e.title ? <h3 className="font-semibold text-[var(--prom-text)]">{e.title}</h3> : null}
      {e.bullets?.length ? (
        <ul className="list-inside list-disc space-y-1 text-[var(--prom-muted)]">
          {e.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {e.summary ? <p className="leading-relaxed text-[var(--prom-muted)]">{e.summary}</p> : null}
    </div>
  );
}

export default function HrCenterRecapPage(): React.JSX.Element {
  const [targetUserId, setTargetUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, unknown> | null>(null);
  const [narrative, setNarrative] = useState<unknown>(null);

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await postHrCenterRecap(token, targetUserId.trim() || undefined);
      setFacts(r.facts);
      setNarrative(r.narrative);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore recap");
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  const actions = (facts?.suggestedActions as { id?: string; label?: string; href?: string }[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <GlassCard
        title="Recap AI per dipendente"
        description="Suggerimenti su contratto, skills e percorsi utili. Lascia vuoto l’ID per analizzare te stesso; come responsabile puoi indicare l’ID utente di un membro del team."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs">
            <span className="text-[var(--prom-muted)]">ID utente (opzionale)</span>
            <input
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="es. u-abc123"
              className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <HebbAiPageHelpButton pageKey="hr-center-recap" />
            <Button type="button" size="sm" disabled={loading} onClick={() => void run()}>
              {loading ? "Elaborazione…" : "Genera recap"}
            </Button>
          </div>
        </div>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {facts ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--prom-muted)]">Contesto</h4>
              <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--prom-line)] p-3 text-[11px]">
                {JSON.stringify(facts, null, 2)}
              </pre>
              {actions.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Azioni suggerite</p>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) =>
                      a.href ? (
                        <Link
                          key={a.id ?? a.href}
                          href={a.href as Route}
                          className="rounded-full border border-[var(--prom-line-strong)] px-3 py-1 text-xs text-[var(--prom-text)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)]"
                        >
                          {a.label ?? a.href}
                        </Link>
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--prom-muted)]">Sintesi</h4>
              {narrative ? renderNarrative(narrative) : <p className="text-xs text-[var(--prom-muted)]">—</p>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--prom-muted)]">Genera il recap per visualizzare suggerimenti.</p>
        )}
      </GlassCard>
    </div>
  );
}
