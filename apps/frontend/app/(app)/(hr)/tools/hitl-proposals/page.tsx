"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHitlProposals, postHitlProposal, postHitlProposalDecision } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Code worker HITL</h1>
        <p className="mt-1 text-sm text-[var(--prom-muted)]">
          Coda proposte strutturate: approvazione umana prima di azioni operative. Nessuna modifica automatica a
          cedolini o contratti.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-[var(--prom-line)] p-4">
        <label className="text-xs font-medium text-[var(--prom-muted)]">Tipo proposta</label>
        <Input value={kind} onChange={(e) => setKind(e.target.value)} />
        <label className="text-xs font-medium text-[var(--prom-muted)]">Motivazione</label>
        <Input value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Testo per revisore HR" />
        <Button type="button" variant="outline" onClick={() => void create()}>
          Crea bozza
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      ) : null}

      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id} className="rounded-lg border border-[var(--prom-line)] p-4">
            <p className="font-mono text-xs text-[var(--prom-text)]">{p.id}</p>
            <p className="text-sm font-medium text-[var(--prom-text)]">
              {p.kind} — <span className="text-[var(--prom-muted)]">{p.status}</span>
            </p>
            <p className="mt-1 text-sm text-[var(--prom-muted)]">{p.rationale}</p>
            {p.status === "proposed" ? (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" onClick={() => void decide(p.id, true)}>
                  Approva
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void decide(p.id, false)}>
                  Rifiuta
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
