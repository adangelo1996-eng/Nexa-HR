"use client";

import { useCallback, useState } from "react";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { postHrCenterAnalytics } from "@/lib/api";
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
    <div className="space-y-3 text-sm text-[var(--prom-text)]">
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

export default function HrCenterAnalyticsPage(): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, unknown> | null>(null);
  const [narrative, setNarrative] = useState<unknown>(null);
  const [llm, setLlm] = useState<{ active: boolean; refineApplied: boolean } | null>(null);

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await postHrCenterAnalytics(token);
      setFacts(r.facts);
      setNarrative(r.narrative);
      setLlm(r.llm);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore esecuzione analisi");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <GlassCard
        title="Analisi personale e costi"
        description="Aggregati per centro di costo (e perimetro team se sei responsabile). Dati inviati al modello in forma pseudonimizzata; output da validare in sede di budget."
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HebbAiPageHelpButton pageKey="hr-center-analisi" />
          <Button type="button" size="sm" disabled={loading} onClick={() => void run()}>
            {loading ? "Elaborazione…" : "Esegui analisi"}
          </Button>
        </div>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {llm ? (
          <p className="text-[10px] text-[var(--prom-muted)]">
            LLM: {llm.active ? "attivo" : "disattivo"}
            {llm.refineApplied ? " · sintesi generata" : " · solo aggregati locali"}
          </p>
        ) : null}
        {facts ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Dati aggregati
              </h4>
              <pre className="max-h-80 overflow-auto rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-3 text-[11px]">
                {JSON.stringify(facts, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Sintesi (modello)
              </h4>
              {narrative ? renderNarrative(narrative) : <p className="text-xs text-[var(--prom-muted)]">—</p>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--prom-muted)]">Premi «Esegui analisi» per calcolare aggregati e sintesi.</p>
        )}
      </GlassCard>
    </div>
  );
}
