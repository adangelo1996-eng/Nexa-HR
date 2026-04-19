"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmployeeLink } from "@/components/nexa-entity-links";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import {
  fetchCurrentUser,
  fetchPayrollForecastBreakdown,
  type PayrollForecastBreakdownDto
} from "@/lib/api";
import { getToken, type SessionUser } from "@/lib/auth-session";

type Tab = "totals" | "cc" | "team" | "employees" | "rank_ral" | "rank_cost";

function fmtEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default function ForecastPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>("totals");
  const [data, setData] = useState<PayrollForecastBreakdownDto | null>(null);
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    setLoading(true);
    setErr(null);
    try {
      const me = await fetchCurrentUser(t);
      setViewer(me);
      const r = await fetchPayrollForecastBreakdown(t, 6);
      setData(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore caricamento");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTotal = useMemo(() => Math.max(1, ...(data?.series.map((s) => s.totalMonthlyEur) ?? [1])), [data]);

  const downloadCsv = (): void => {
    if (!data) return;
    const rows: string[][] = [
      ["userId", "fullName", "monthlyBaseEur", "ralAnnualEstimateEur", "monthlyTotalEstimateEur", "costCenterId", "teamId"]
    ];
    for (const e of data.employees) {
      rows.push([
        e.userId,
        `"${e.fullName.replace(/"/g, '""')}"`,
        String(e.monthlyBaseEur),
        String(e.ralAnnualEstimateEur),
        String(e.monthlyTotalEstimateEur),
        e.costCenterId ?? "",
        e.teamId ?? ""
      ]);
    }
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexa-forecast-dipendenti.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "totals", label: "Totali mensili" },
    { id: "cc", label: "Per centro di costo" },
    { id: "team", label: "Per team" },
    { id: "employees", label: "Per dipendente" },
    { id: "rank_ral", label: "Rank RAL" },
    { id: "rank_cost", label: "Rank costo mensile" }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Forecast costi</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--prom-muted)]">
            Stima su massa retributiva mensile e oneri azienda indicativi (fattore {(data?.employerFactor ?? 0.32) * 100}
            % sulla massa RAL). Crescita mese su mese +2% come scenario semplificato; verificare sempre su payroll
            ufficiale.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading || !data} onClick={() => void load()}>
          Aggiorna
        </Button>
      </div>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {loading && !data ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      {data ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-[var(--prom-line)] pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={
                  "rounded-full px-3 py-1.5 text-xs font-medium transition " +
                  (tab === t.id
                    ? "bg-[#002D72] text-white shadow-sm"
                    : "border border-[var(--prom-line)] text-[var(--prom-muted)] hover:border-[var(--prom-gold)] hover:text-[var(--prom-text)]")
                }
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "totals" ? (
            <GlassCard title="Serie mensile" description="RAL totale, oneri stimati e costo complessivo.">
              <div className="mt-4 flex h-48 items-end gap-2">
                {data.series.map((s) => (
                  <div key={s.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[#002D72] to-[#1a4d8c]"
                      style={{ height: `${(s.totalMonthlyEur / maxTotal) * 160}px` }}
                      title={`${s.month}: ${fmtEur(s.totalMonthlyEur)}`}
                    />
                    <span className="text-[10px] text-[var(--prom-muted)]">{s.month}</span>
                  </div>
                ))}
              </div>
              <ul className="mt-4 space-y-1 text-xs text-[var(--prom-muted)]">
                {data.series.map((s) => (
                  <li key={`d-${s.month}`}>
                    <strong className="text-[var(--prom-text)]">{s.month}</strong>: RAL {fmtEur(s.ralMassMonthlyEur)} ·
                    oneri stim. {fmtEur(s.estimatedEmployerMonthlyEur)} · totale {fmtEur(s.totalMonthlyEur)}
                  </li>
                ))}
              </ul>
            </GlassCard>
          ) : null}

          {tab === "cc" ? (
            <GlassCard title="Per centro di costo" description="Massa RAL mensile e costo stimato per sede.">
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--prom-line)] text-xs uppercase text-[var(--prom-muted)]">
                      <th className="py-2 pr-3">Centro</th>
                      <th className="py-2 pr-3">HC</th>
                      <th className="py-2 pr-3">RAL / mese</th>
                      <th className="py-2">Totale / mese</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCostCenter.map((r) => (
                      <tr key={r.costCenterId ?? "none"} className="border-b border-[var(--prom-line)]/60">
                        <td className="py-2 pr-3 text-[var(--prom-text)]">{r.label}</td>
                        <td className="py-2 pr-3">{r.headcount}</td>
                        <td className="py-2 pr-3">{fmtEur(r.monthlyRalMassEur)}</td>
                        <td className="py-2 font-medium text-[var(--prom-text)]">{fmtEur(r.monthlyTotalEur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ) : null}

          {tab === "team" ? (
            <GlassCard title="Per team" description="Solo dipendenti con team assegnato.">
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--prom-line)] text-xs uppercase text-[var(--prom-muted)]">
                      <th className="py-2 pr-3">Team</th>
                      <th className="py-2 pr-3">HC</th>
                      <th className="py-2 pr-3">RAL / mese</th>
                      <th className="py-2">Totale / mese</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTeam.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-sm text-[var(--prom-muted)]">
                          Nessun team con dipendenti associati.
                        </td>
                      </tr>
                    ) : (
                      data.byTeam.map((r) => (
                        <tr key={r.teamId} className="border-b border-[var(--prom-line)]/60">
                          <td className="py-2 pr-3 text-[var(--prom-text)]">{r.teamName}</td>
                          <td className="py-2 pr-3">{r.headcount}</td>
                          <td className="py-2 pr-3">{fmtEur(r.monthlyRalMassEur)}</td>
                          <td className="py-2 font-medium">{fmtEur(r.monthlyTotalEur)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ) : null}

          {tab === "employees" || tab === "rank_ral" || tab === "rank_cost" ? (
            <GlassCard
              title={tab === "employees" ? "Dettaglio dipendenti" : tab === "rank_ral" ? "Rank RAL annua (stima)" : "Rank costo mensile stimato"}
              description={
                tab === "rank_ral"
                  ? "Ordinamento per RAL annua stimata (mensile × mensilità)."
                  : tab === "rank_cost"
                    ? "Ordinamento per costo azienda mensile stimato."
                    : "Valori da anagrafica; i link alla scheda rispettano i permessi."
              }
            >
              <div className="mb-3">
                <Button type="button" size="sm" variant="outline" onClick={downloadCsv}>
                  Esporta CSV dipendenti
                </Button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--prom-line)] text-xs uppercase text-[var(--prom-muted)]">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Dipendente</th>
                      <th className="py-2 pr-3">Base mens.</th>
                      <th className="py-2 pr-3">RAL stima</th>
                      <th className="py-2">Costo / mese</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "rank_ral"
                      ? [...data.employees].sort((a, b) => b.ralAnnualEstimateEur - a.ralAnnualEstimateEur)
                      : tab === "rank_cost"
                        ? [...data.employees].sort((a, b) => b.monthlyTotalEstimateEur - a.monthlyTotalEstimateEur)
                        : data.employees
                    ).map((e, idx) => (
                      <tr key={e.userId} className="border-b border-[var(--prom-line)]/60">
                        <td className="py-2 pr-3 text-[var(--prom-muted)]">{idx + 1}</td>
                        <td className="py-2 pr-3">
                          <EmployeeLink userId={e.userId} label={e.fullName} viewer={viewer} />
                        </td>
                        <td className="py-2 pr-3">{fmtEur(e.monthlyBaseEur)}</td>
                        <td className="py-2 pr-3">{fmtEur(e.ralAnnualEstimateEur)}</td>
                        <td className="py-2 font-medium text-[var(--prom-text)]">{fmtEur(e.monthlyTotalEstimateEur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
