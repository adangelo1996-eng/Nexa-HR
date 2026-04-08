"use client";

import { useMemo, useState } from "react";
import { calculateItalyCompanyCost, type CostCalculatorInputMode } from "@payday/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function CostCalculatorPage(): React.JSX.Element {
  const [mode, setMode] = useState<CostCalculatorInputMode>("ral");
  const [weeklyHours, setWeeklyHours] = useState(40);
  const [fullTimeHours, setFullTimeHours] = useState(40);
  const [payMonthsPerYear, setPayMonthsPerYear] = useState<12 | 13 | 14>(13);
  const [ral, setRal] = useState(35_000);
  const [targetNet, setTargetNet] = useState(2_000);

  const [agevFemale, setAgevFemale] = useState(false);
  const [agevUnder36, setAgevUnder36] = useState(false);
  const [agevSouth, setAgevSouth] = useState(false);
  const [agevNaspi, setAgevNaspi] = useState(false);
  const [agevProtected, setAgevProtected] = useState(false);
  const [agevOtherNotes, setAgevOtherNotes] = useState("");

  const result = useMemo(() => {
    return calculateItalyCompanyCost({
      mode,
      weeklyContractHours: weeklyHours,
      weeklyFullTimeHours: fullTimeHours,
      payMonthsPerYear,
      annualGrossSalaryEuros: mode === "ral" ? ral : undefined,
      targetNetMonthlyEuros: mode === "net" ? targetNet : undefined,
      agevolazioni: {
        female: agevFemale,
        under36: agevUnder36,
        southZes: agevSouth,
        naspi: agevNaspi,
        protectedCategories: agevProtected,
        otherNotes: agevOtherNotes.trim() || undefined
      }
    });
  }, [
    mode,
    weeklyHours,
    fullTimeHours,
    payMonthsPerYear,
    ral,
    targetNet,
    agevFemale,
    agevUnder36,
    agevSouth,
    agevNaspi,
    agevProtected,
    agevOtherNotes
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">
          Calcolatore costo azienda / netto
        </h1>
        <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">
          Tool dinamico con stima indicativa: variando ore, RAL o netto target, i valori si ricalcolano in tempo reale.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>Inserisci le informazioni di base e le agevolazioni.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#c8c8c8]">Modalità</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as CostCalculatorInputMode)}
                  className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#141414]/90 dark:text-white"
                >
                  <option value="ral">Inserisco RAL</option>
                  <option value="net">Inserisco netto mensile target</option>
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#c8c8c8]">Mensilità</span>
                <select
                  value={payMonthsPerYear}
                  onChange={(e) => setPayMonthsPerYear(Number(e.target.value) as 12 | 13 | 14)}
                  className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#141414]/90 dark:text-white"
                >
                  <option value={12}>12</option>
                  <option value={13}>13</option>
                  <option value={14}>14</option>
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#c8c8c8]">Ore contratto / settimana</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={0.5}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#c8c8c8]">Ore full-time / settimana</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={0.5}
                  value={fullTimeHours}
                  onChange={(e) => setFullTimeHours(Number(e.target.value))}
                />
              </label>

              {mode === "ral" ? (
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#c8c8c8]">RAL (EUR)</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={100}
                    value={ral}
                    onChange={(e) => setRal(Number(e.target.value))}
                  />
                </label>
              ) : (
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#c8c8c8]">Netto mensile target (EUR)</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={10}
                    value={targetNet}
                    onChange={(e) => setTargetNet(Number(e.target.value))}
                  />
                </label>
              )}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-sm font-medium text-synapse-text dark:text-white">Agevolazioni</p>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-synapse-text dark:text-white">
                  <input type="checkbox" checked={agevFemale} onChange={(e) => setAgevFemale(e.target.checked)} />
                  Donna
                </label>
                <label className="flex items-center gap-2 text-sm text-synapse-text dark:text-white">
                  <input type="checkbox" checked={agevUnder36} onChange={(e) => setAgevUnder36(e.target.checked)} />
                  Under 36
                </label>
                <label className="flex items-center gap-2 text-sm text-synapse-text dark:text-white">
                  <input type="checkbox" checked={agevSouth} onChange={(e) => setAgevSouth(e.target.checked)} />
                  Assunzione Mezzogiorno/ZES (se applicabile)
                </label>
                <label className="flex items-center gap-2 text-sm text-synapse-text dark:text-white">
                  <input type="checkbox" checked={agevNaspi} onChange={(e) => setAgevNaspi(e.target.checked)} />
                  Percettore NASpI
                </label>
                <label className="flex items-center gap-2 text-sm text-synapse-text dark:text-white">
                  <input
                    type="checkbox"
                    checked={agevProtected}
                    onChange={(e) => setAgevProtected(e.target.checked)}
                  />
                  Categorie protette (L.68/99)
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#c8c8c8]">Altro (note)</span>
                <Input value={agevOtherNotes} onChange={(e) => setAgevOtherNotes(e.target.value)} />
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risultati (mese)</CardTitle>
              <CardDescription>Stima indicativa con breakdown espandibile.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                  <p className="text-xs text-synapse-muted dark:text-[#c8c8c8]">Netto stimato</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatEuro(result.monthly.netEuros)}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                  <p className="text-xs text-synapse-muted dark:text-[#c8c8c8]">Lordo (mese)</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-synapse-text dark:text-white">
                    {formatEuro(result.monthly.grossEuros)}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                  <p className="text-xs text-synapse-muted dark:text-[#c8c8c8]">Costo azienda</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-synapse-text dark:text-white">
                    {formatEuro(result.monthly.companyCostEuros)}
                  </p>
                </div>
              </div>

              <details className="mt-4 rounded-lg border border-[var(--card-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] p-3">
                <summary className="cursor-pointer text-sm font-medium text-synapse-text dark:text-white">
                  Dettaglio costo azienda
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  {result.breakdownCompanyCost.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span className="text-synapse-muted dark:text-[#c8c8c8]">{row.label}</span>
                      <span className="tabular-nums text-synapse-text dark:text-white">{formatEuro(row.euros)}</span>
                    </div>
                  ))}
                </div>
              </details>

              <details className="mt-3 rounded-lg border border-[var(--card-border)] p-3">
                <summary className="cursor-pointer text-sm font-medium text-synapse-text dark:text-white">
                  Dettaglio netto (stima)
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-synapse-muted dark:text-[#c8c8c8]">Contributi lavoratore (INPS)</span>
                    <span className="tabular-nums text-synapse-text dark:text-white">
                      {formatEuro(result.monthly.employeeInpsEuros)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-synapse-muted dark:text-[#c8c8c8]">IRPEF stimata</span>
                    <span className="tabular-nums text-synapse-text dark:text-white">
                      {formatEuro(result.monthly.estimatedIrpefEuros)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-synapse-muted dark:text-[#c8c8c8]">Addizionali (stima)</span>
                    <span className="tabular-nums text-synapse-text dark:text-white">
                      {formatEuro(result.monthly.estimatedAddizionaliEuros)}
                    </span>
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assunzioni usate</CardTitle>
              <CardDescription>Valori centralizzati e versionabili (MVP).</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-synapse-muted dark:text-[#c8c8c8]">
                <li>INPS lavoratore: {result.assumptions.employeeInpsPercent.toFixed(2)}%</li>
                <li>INPS datore: {result.assumptions.employerInpsPercent.toFixed(2)}%</li>
                <li>INAIL: {result.assumptions.inailPercent.toFixed(2)}%</li>
                <li>TFR: lordo / {result.assumptions.tfrDivisor.toFixed(1)}</li>
              </ul>
              {result.warnings.length > 0 ? (
                <div className="mt-3 space-y-1 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-xs text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                  {result.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

