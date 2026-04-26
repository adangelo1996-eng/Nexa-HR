"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AiNarrativeDisplay } from "@/components/ai-narrative-display";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { fetchHrCenterMeta, postHrCenterRecap } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function toggleInSet(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export default function HrCenterRecapPage(): React.JSX.Element {
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchHrCenterMeta>> | null>(null);
  const [selCc, setSelCc] = useState<Set<string>>(() => new Set());
  const [selTeam, setSelTeam] = useState<Set<string>>(() => new Set());
  const [selEmp, setSelEmp] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, unknown> | null>(null);
  const [narrative, setNarrative] = useState<unknown>(null);
  const [llm, setLlm] = useState<{ active: boolean; refineApplied: boolean; refineFailure?: string } | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    void fetchHrCenterMeta(t)
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const hasSelection = useMemo(
    () => selCc.size > 0 || selTeam.size > 0 || selEmp.size > 0,
    [selCc, selTeam, selEmp]
  );

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await postHrCenterRecap(token, {
        costCenterIds: selCc.size ? [...selCc] : undefined,
        teamIds: selTeam.size ? [...selTeam] : undefined,
        userIds: selEmp.size ? [...selEmp] : undefined
      });
      setFacts(r.facts);
      setNarrative(r.narrative);
      setLlm(r.llm);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore recap");
    } finally {
      setLoading(false);
    }
  }, [selCc, selEmp, selTeam]);

  const actions = (facts?.suggestedActions as { id?: string; label?: string; href?: string }[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <GlassCard
        title="Recap AI dipendenti"
        description="Filtra per uno o più centri di costo, team e/o dipendenti nel perimetro autorizzato. Senza selezione viene usato il tuo profilo. Non serve inserire ID utente."
      >
        <LlmUsageStatusBanner idle={!llm} llm={llm} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] p-3">
            <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Centri di costo</p>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {(meta?.costCenterOptions ?? []).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-[var(--prom-text)]">
                  <input
                    type="checkbox"
                    checked={selCc.has(c.id)}
                    onChange={() => setSelCc((s) => toggleInSet(s, c.id))}
                  />
                  <span className="leading-snug">{c.label}</span>
                </label>
              ))}
              {!meta?.costCenterOptions?.length ? (
                <span className="text-[var(--prom-muted)]">Nessun centro di costo nel perimetro.</span>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] p-3">
            <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Team</p>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {(meta?.teamOptions ?? []).map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 text-[var(--prom-text)]">
                  <input
                    type="checkbox"
                    checked={selTeam.has(t.id)}
                    onChange={() => setSelTeam((s) => toggleInSet(s, t.id))}
                  />
                  <span className="leading-snug">{t.label}</span>
                </label>
              ))}
              {!meta?.teamOptions?.length ? (
                <span className="text-[var(--prom-muted)]">Nessun team nel perimetro.</span>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] p-3">
            <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Dipendenti</p>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {(meta?.employeeOptions ?? []).map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 text-[var(--prom-text)]">
                  <input
                    type="checkbox"
                    checked={selEmp.has(u.id)}
                    onChange={() => setSelEmp((s) => toggleInSet(s, u.id))}
                  />
                  <span className="leading-snug">{u.label}</span>
                </label>
              ))}
              {!meta?.employeeOptions?.length ? (
                <span className="text-[var(--prom-muted)]">Nessun dipendente nel perimetro.</span>
              ) : null}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--prom-muted)]">
          {hasSelection
            ? "I filtri si combinano: ad esempio centro di costo e team restringono il perimetro; se selezioni anche singole persone, devono rientrare in quel perimetro."
            : "Nessun filtro: viene analizzato il tuo profilo."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <HebbAiPageHelpButton pageKey="hr-center-recap" />
          <Button type="button" size="sm" disabled={loading} onClick={() => void run()}>
            {loading ? "Elaborazione…" : "Genera recap"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => {
              setSelCc(new Set());
              setSelTeam(new Set());
              setSelEmp(new Set());
            }}
          >
            Azzera filtri
          </Button>
        </div>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {facts ? (
          <div className="space-y-4">
            {actions.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Azioni suggerite</p>
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
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--prom-muted)]">Sintesi</h4>
              {narrative ? <AiNarrativeDisplay narrative={narrative} /> : <p className="text-xs text-[var(--prom-muted)]">—</p>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--prom-muted)]">Imposta i filtri (opzionale) e genera il recap.</p>
        )}
      </GlassCard>
    </div>
  );
}
