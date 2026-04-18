"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHitlProposals, postHitlProposal, postHitlProposalDecision } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Input } from "@/components/ui/input";

export default function HitlProposalsPage(): React.JSX.Element {
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchHitlProposals>>["items"]>([]);
  const [kind, setKind] = useState("reminder.leave_balance");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      const res = await fetchHitlProposals(t);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      await postHitlProposal(t, {
        kind,
        payload: { example: true },
        rationale: rationale.trim() || "Proposta di test (basso rischio)."
      });
      setRationale("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creazione fallita");
    }
  };

  const decide = async (id: string, approve: boolean): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      await postHitlProposalDecision(t, id, approve);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decisione fallita");
    }
  };

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Code worker HITL"
      subtitle="Coda di proposte strutturate con approvazione umana prima di azioni operative. Nessuna modifica automatica a cedolini o contratti da questa vista."
      headerTrailing={<HebbAiPageHelpButton pageKey="hitl-proposals" />}
    >
      <HebbAiGlassPanel>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Tipo proposta</label>
            <Input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded-xl border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] font-mono text-sm"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Motivazione</label>
            <Input
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Testo per revisore HR"
              className="rounded-xl border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)]"
            />
          </div>
        </div>
        <Button type="button" variant="outline" className="mt-6 rounded-xl" onClick={() => void create()}>
          Crea bozza
        </Button>
      </HebbAiGlassPanel>

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      <ul className="space-y-4">
        {items.map((p) => (
          <li key={p.id}>
            <HebbAiGlassTile>
              <p className="font-mono text-[11px] text-[var(--prom-muted)]">{p.id}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--prom-text)]">
                {p.kind}{" "}
                <span className="rounded-full bg-[color-mix(in_srgb,var(--prom-gold)_15%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--prom-gold-soft)]">
                  {p.status}
                </span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--prom-muted)]">{p.rationale}</p>
              {p.status === "proposed" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="rounded-full" onClick={() => void decide(p.id, true)}>
                    Approva
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => void decide(p.id, false)}>
                    Rifiuta
                  </Button>
                </div>
              ) : null}
            </HebbAiGlassTile>
          </li>
        ))}
      </ul>
    </HebbAiExperienceShell>
  );
}
