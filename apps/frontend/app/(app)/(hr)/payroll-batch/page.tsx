"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPayslipDrafts,
  fetchUsers,
  postPayrollBatchGenerate,
  publishPayrollPeriod,
  type PayrollBatchRowResult,
  type Payslip
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

const ANIM_MS = 420;

export default function PayrollBatchPage(): React.JSX.Element {
  const defaultPeriod = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [period, setPeriod] = useState(defaultPeriod);
  const [prevMonthVars, setPrevMonthVars] = useState(true);
  const [batchResults, setBatchResults] = useState<PayrollBatchRowResult[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [drafts, setDrafts] = useState<Payslip[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const loadDrafts = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoadingDrafts(true);
    try {
      const [list, people] = await Promise.all([fetchPayslipDrafts(token, period), fetchUsers(token)]);
      setDrafts(list);
      const map: Record<string, string> = {};
      for (const u of people) {
        map[u.id] = u.fullName;
      }
      setUserNames(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento bozze");
    } finally {
      setLoadingDrafts(false);
    }
  }, [period]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    if (!batchResults?.length) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setVisibleCount(i);
      if (i >= batchResults.length) {
        window.clearInterval(id);
      }
    }, ANIM_MS);
    return () => window.clearInterval(id);
  }, [batchResults]);

  async function onBatch(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoadingBatch(true);
    setError(null);
    setPublishMsg(null);
    setBatchResults(null);
    try {
      const { results } = await postPayrollBatchGenerate(token, {
        period,
        usePreviousMonthVariables: prevMonthVars
      });
      setBatchResults(results);
      await loadDrafts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore batch");
    } finally {
      setLoadingBatch(false);
    }
  }

  async function onPublish(): Promise<void> {
    if (!window.confirm(`Pubblicare tutte le bozze del periodo ${period} ai dipendenti?`)) {
      return;
    }
    const token = getToken();
    if (!token) {
      return;
    }
    setPublishing(true);
    setPublishMsg(null);
    setError(null);
    try {
      const { updated } = await publishPayrollPeriod(token, period);
      setPublishMsg(`Pubblicati ${updated} cedolini.`);
      setBatchResults(null);
      await loadDrafts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore pubblicazione");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Elaborazione batch</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Genera cedolini in bozza per tutti i dipendenti IT dell&apos;azienda, poi pubblicali quando sei
          pronto. I dipendenti vedono i cedolini solo dopo la pubblicazione.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/payroll-calc" className="synapse-nav-link">
            Calcolo singolo
          </Link>
          <Link href="/payroll-hebb" className="synapse-nav-link">
            Hebb (motore)
          </Link>
        </div>
      </header>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Parametri</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            Periodo competenza (YYYY-MM)
            <input
              className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prevMonthVars}
              onChange={(e) => setPrevMonthVars(e.target.checked)}
            />
            Variabili da mese precedente
          </label>
          <Button type="button" disabled={loadingBatch} onClick={() => void onBatch()}>
            {loadingBatch ? "Elaborazione…" : "Elabora con Hebb (batch)"}
          </Button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {publishMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{publishMsg}</p> : null}
        {loadingBatch ? (
          <div className="space-y-2 pt-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Elaborazione batch in corso sul server: attendere il completamento (può richiedere alcuni minuti per
              molti dipendenti).
            </p>
            <progress className="h-2 w-full accent-slate-700 dark:accent-slate-300" />
          </div>
        ) : null}
      </section>

      {batchResults && batchResults.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Esito elaborazione</h2>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Avanzamento visualizzazione</span>
              <span>
                {visibleCount} / {batchResults.length}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 ease-out dark:bg-emerald-500"
                style={{
                  width: `${Math.min(100, (visibleCount / Math.max(batchResults.length, 1)) * 100)}%`
                }}
              />
            </div>
          </div>
          <ul className="space-y-2">
            {batchResults.slice(0, visibleCount).map((r) => (
              <li
                key={r.userId}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <span>{userNames[r.userId] ?? r.userId}</span>
                <span className={r.ok ? "text-emerald-600" : "text-red-600"}>
                  {r.ok ? "✓ Bozza creata" : `✗ ${r.error ?? "Errore"}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Bozze da pubblicare</h2>
          <Button type="button" variant="secondary" size="sm" disabled={loadingDrafts} onClick={() => void loadDrafts()}>
            Aggiorna elenco
          </Button>
        </div>
        {loadingDrafts ? <p className="text-sm text-slate-500">Caricamento…</p> : null}
        {!loadingDrafts && drafts.length === 0 ? (
          <p className="text-sm text-slate-500">Nessuna bozza per questo periodo.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-auto text-sm">
            {drafts.map((d) => (
              <li key={d.id} className="flex justify-between rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                <span>{userNames[d.userId] ?? d.userId}</span>
                <span className="text-slate-500">{d.period}</span>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" disabled={publishing || drafts.length === 0} onClick={() => void onPublish()}>
          {publishing ? "Pubblicazione…" : "Pubblica su Nexa"}
        </Button>
      </section>
    </div>
  );
}
