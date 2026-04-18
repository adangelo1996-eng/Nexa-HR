"use client";

import { useState } from "react";
import Link from "next/link";
import { postPayrollWhatIf } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  hebbAiLinkClassName
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Input } from "@/components/ui/input";

export default function PayrollSimAssistedPage(): React.JSX.Element {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [grossOverride, setGrossOverride] = useState("");
  const [usePrev, setUsePrev] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof postPayrollWhatIf>> | null>(null);

  const linkCn = hebbAiLinkClassName();

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
    <HebbAiExperienceShell
      contentMax="standard"
      title="Simulatore cedolino assistito"
      subtitle={
        <>
          What-if sul motore payroll IT (stesso calcolo di{" "}
          <Link href="/payroll-hebb" className={linkCn}>
            Hebb — Payroll
          </Link>
          ), senza salvare il cedolino. Richiede permesso report HR. Nessun invio a modelli esterni: solo backend Nexa.
        </>
      }
      headerTrailing={<HebbAiPageHelpButton pageKey="payroll-sim-assisted" />}
    >
      <HebbAiGlassPanel>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              Periodo competenza (YYYY-MM)
            </label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-xl border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)]"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              Lordo mensile override (EUR, opzionale)
            </label>
            <Input
              value={grossOverride}
              onChange={(e) => setGrossOverride(e.target.value)}
              placeholder="Es. 4500"
              className="rounded-xl border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)]"
            />
          </div>
        </div>
        <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-[var(--prom-text)]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[var(--prom-line-strong)]"
            checked={usePrev}
            onChange={(e) => setUsePrev(e.target.checked)}
          />
          Usa variabili mese precedente (come in Hebb)
        </label>
        <Button type="button" className="mt-6 h-11 rounded-xl font-semibold" disabled={busy} onClick={() => void run()}>
          {busy ? "Calcolo…" : "Calcola simulazione"}
        </Button>
      </HebbAiGlassPanel>

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {result ? (
        <HebbAiGlassPanel>
          <p className="font-synapse text-lg font-semibold text-[var(--prom-text)]">
            Netto stimato:{" "}
            {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(result.netSalary)}
          </p>
          <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] p-3 text-xs text-[var(--prom-muted)]">
            {(result.lines ?? []).map((line) => (
              <li
                key={`${line.code}-${line.description}`}
                className="flex justify-between gap-2 border-b border-[var(--prom-line)] py-2 last:border-0"
              >
                <span>
                  <span className="font-mono text-[var(--prom-text)]">{line.code}</span> {line.description}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--prom-text)]">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(line.amount)}
                </span>
              </li>
            ))}
          </ul>
        </HebbAiGlassPanel>
      ) : null}
    </HebbAiExperienceShell>
  );
}
