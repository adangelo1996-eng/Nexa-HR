"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { postHebbSimulateIt, type HebbSimulatePayrollResult } from "@/lib/api";
import { getToken, getSessionUser, type SessionUser } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function PayrollHebbPage(): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [prevMonthVars, setPrevMonthVars] = useState(false);
  const [result, setResult] = useState<HebbSimulatePayrollResult | null>(null);
  const [showJson, setShowJson] = useState(false);
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
            {loading ? "Calcolo…" : "Simula il mio cedolino"}
          </Button>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">Calcolo in corso…</p>
            <progress className="h-2 w-full accent-slate-700 dark:accent-slate-300" />
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {result != null ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Lordo imponibile (mese)
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatEuro(result.grossAdjusted)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Netto stimato (mese)
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatEuro(result.netSalary)}
                </p>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">Righe di calcolo</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-600 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 font-medium">Codice</th>
                      <th className="px-3 py-2 font-medium">Voce</th>
                      <th className="px-3 py-2 text-right font-medium">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map((line, idx) => (
                      <tr
                        key={`${idx}-${line.code}`}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {line.code}
                        </td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{line.description}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            line.amount < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-50"
                          }`}
                        >
                          {formatEuro(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
              onClick={() => setShowJson((v) => !v)}
            >
              {showJson ? "Nascondi" : "Mostra"} dettaglio JSON
            </button>
            {showJson ? (
              <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 text-xs dark:bg-slate-950">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
