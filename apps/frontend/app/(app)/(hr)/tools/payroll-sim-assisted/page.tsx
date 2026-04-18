"use client";

import { useState } from "react";
import Link from "next/link";
import { postPayrollWhatIf } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PayrollSimAssistedPage(): React.JSX.Element {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [grossOverride, setGrossOverride] = useState("");
  const [usePrev, setUsePrev] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof postPayrollWhatIf>> | null>(null);

  const run = async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const go = grossOverride.trim() === "" ? undefined : Number(grossOverride.replace(",", "."));
      const r = await postPayrollWhatIf(t, {
        period: period.trim() || undefined,
        grossMonthlySalaryOverride: go != null && !Number.isNaN(go) ? go : undefined,
        usePreviousMonthVariables: usePrev
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore simulazione");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Simulatore cedolino assistito</h1>
        <p className="mt-1 text-sm text-[var(--prom-muted)]">
          What-if sul motore payroll IT (stesso calcolo di{" "}
          <Link href="/payroll-hebb" className="font-medium text-[#002D72] underline">
            Hebb — Payroll
          </Link>
          ), senza salvare il cedolino. Richiede permesso report HR. Nessun invio a modelli esterni: solo backend Nexa.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-4">
        <label className="block text-xs font-medium text-[var(--prom-muted)]">Periodo competenza (YYYY-MM)</label>
        <Input value={period} onChange={(e) => setPeriod(e.target.value)} className="max-w-xs" />
        <label className="block text-xs font-medium text-[var(--prom-muted)]">
          Lordo mensile override (opzionale, EUR)
        </label>
        <Input
          value={grossOverride}
          onChange={(e) => setGrossOverride(e.target.value)}
          placeholder="Es. 4500"
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--prom-text)]">
          <input type="checkbox" checked={usePrev} onChange={(e) => setUsePrev(e.target.checked)} />
          Usa variabili mese precedente (come in Hebb)
        </label>
        <Button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? "Calcolo…" : "Calcola simulazione"}
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      ) : null}

      {result ? (
        <div className="space-y-2 rounded-xl border border-[var(--prom-line)] p-4">
          <p className="text-sm font-semibold text-[var(--prom-text)]">
            Netto stimato:{" "}
            {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(result.netSalary)}
          </p>
          <ul className="max-h-64 overflow-y-auto text-xs text-[var(--prom-muted)]">
            {(result.lines ?? []).map((line) => (
              <li key={`${line.code}-${line.description}`} className="flex justify-between gap-2 border-b border-[var(--prom-line)] py-1">
                <span>
                  <span className="font-mono text-[var(--prom-text)]">{line.code}</span> {line.description}
                </span>
                <span className="shrink-0 tabular-nums">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(line.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
