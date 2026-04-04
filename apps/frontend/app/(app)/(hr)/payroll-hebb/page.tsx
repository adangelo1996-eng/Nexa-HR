"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { postHebbSimulateIt } from "@/lib/api";
import { getToken, getSessionUser, type SessionUser } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

export default function PayrollHebbPage(): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [prevMonthVars, setPrevMonthVars] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUser(getSessionUser());
    setToken(getToken());
  }, []);

  async function onSimulate(): Promise<void> {
    const t = getToken();
    if (!t) {
      setError("Sessione non valida");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await postHebbSimulateIt(t, {
        period,
        usePreviousMonthVariables: prevMonthVars
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore simulazione");
    } finally {
      setLoading(false);
    }
  }

  if (!user || !token) {
    return (
      <div className="space-y-4">
        <p className="text-slate-700 dark:text-slate-300">Caricamento…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Hebb — motore payroll</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Calcolo cedolino Italia con il motore interno Nexa (nessun modello LLM esterno). I valori sono
          simulazioni da validare con il consulente del lavoro.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Addizionali comunali (colonna Aliquota vigente % 2025/2026) per i comuni della provincia di Como sono
          lette da{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">addizionali_como_2025.md</code> nel
          repository; il motore usa il file generato da{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">scripts/gen-como-rates.mjs</code>.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/payroll-calc" className="synapse-nav-link">
          Calcolo singolo
        </Link>
        <Link href="/payroll-batch" className="synapse-nav-link">
          Elaborazione batch
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">Simulazione rapida (anagrafica)</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            Periodo (YYYY-MM)
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
            Usa variabili del mese precedente
          </label>
          <Button type="button" disabled={loading} onClick={() => void onSimulate()}>
            {loading ? "Calcolo…" : "Simula il mio cedolino IT"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {result != null ? (
          <pre className="mt-4 max-h-96 overflow-auto rounded bg-slate-50 p-3 text-xs dark:bg-slate-950">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
