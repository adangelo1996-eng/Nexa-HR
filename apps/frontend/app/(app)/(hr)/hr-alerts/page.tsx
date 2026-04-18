"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHrAlerts, postHrAlertAck, postHrAlertsEvaluate } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";

export default function HrAlertsPage(): React.JSX.Element {
  const [items, setItems] = useState<
    Array<{
      id: string;
      severity: string;
      title: string;
      body: string;
      status: string;
      createdAt: string;
      ruleKey: string;
    }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      const res = await fetchHrAlerts(t, "open");
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluate = async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postHrAlertsEvaluate(t);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Valutazione fallita");
    } finally {
      setBusy(false);
    }
  };

  const ack = async (id: string): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      await postHrAlertAck(t, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ack fallito");
    }
  };

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Alert HR"
      subtitle="Regole collegate a metriche HR (turnover e altro). Valuta per creare alert deduplicati e notifiche in-app per gli admin."
      headerTrailing={
        <div className="flex shrink-0 items-center gap-2">
          <HebbAiPageHelpButton pageKey="hr-alerts" />
          <Button type="button" disabled={busy} onClick={() => void evaluate()}>
            {busy ? "Valutazione…" : "Esegui regole"}
          </Button>
        </div>
      }
    >
      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      <ul className="space-y-4">
        {items.map((a) => (
          <li key={a.id}>
            <HebbAiGlassTile>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--prom-gold)]">{a.severity}</p>
                  <p className="mt-1 font-semibold text-[var(--prom-text)]">{a.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--prom-muted)]">{a.body}</p>
                  <p className="mt-2 font-mono text-[11px] text-[var(--prom-muted)]">
                    {a.ruleKey} · {new Date(a.createdAt).toLocaleString("it-IT")}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => void ack(a.id)}>
                  Segna letto
                </Button>
              </div>
            </HebbAiGlassTile>
          </li>
        ))}
      </ul>

      {items.length === 0 && !error ? (
        <HebbAiGlassPanel className="py-12 text-center text-sm text-[var(--prom-muted)]">Nessun alert aperto.</HebbAiGlassPanel>
      ) : null}
    </HebbAiExperienceShell>
  );
}
