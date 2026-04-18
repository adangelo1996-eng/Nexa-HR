"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHrAlerts, postHrAlertAck, postHrAlertsEvaluate } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

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
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Alert HR</h1>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">
            Regole collegate a metriche turnover (blocco 2). Valuta per creare alert deduplicati e notifiche in-app per
            admin HR.
          </p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void evaluate()}>
          {busy ? "Valutazione…" : "Esegui regole"}
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      ) : null}

      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="rounded-lg border border-[var(--prom-line)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase text-[var(--prom-muted)]">{a.severity}</p>
                <p className="font-medium text-[var(--prom-text)]">{a.title}</p>
                <p className="mt-1 text-sm text-[var(--prom-muted)]">{a.body}</p>
                <p className="mt-1 text-xs text-[var(--prom-muted)]">
                  {a.ruleKey} · {new Date(a.createdAt).toLocaleString("it-IT")}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void ack(a.id)}>
                Segna letto
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && !error ? (
        <p className="text-sm text-[var(--prom-muted)]">Nessun alert aperto.</p>
      ) : null}
    </div>
  );
}
