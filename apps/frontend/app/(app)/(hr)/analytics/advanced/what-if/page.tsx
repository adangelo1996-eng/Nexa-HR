"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";
import { fetchWorkforceCockpit, type WorkforceCockpitScenario } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { NexaMonthlyCostChart } from "@/components/nexa-charts";

export default function AdvancedWhatIfPage(): React.JSX.Element {
  const [base, setBase] = useState<Awaited<ReturnType<typeof fetchWorkforceCockpit>> | null>(null);
  const [growth, setGrowth] = useState<Awaited<ReturnType<typeof fetchWorkforceCockpit>> | null>(null);
  const [freeze, setFreeze] = useState<Awaited<ReturnType<typeof fetchWorkforceCockpit>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [b, g, f] = await Promise.all([
        fetchWorkforceCockpit(token, "base" as WorkforceCockpitScenario, 6),
        fetchWorkforceCockpit(token, "growth" as WorkforceCockpitScenario, 6),
        fetchWorkforceCockpit(token, "freeze" as WorkforceCockpitScenario, 6)
      ]);
      setBase(b);
      setGrowth(g);
      setFreeze(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento scenari");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chartSeries =
    base?.series.map((row, i) => ({
      month: row.month,
      costEur: row.costEur,
      compareEur: growth?.series[i]?.costEur
    })) ?? [];

  return (
    <AdvancedAnalyticsPage
      analysisId="what_if"
      title="Scenario what-if organico"
      subtitle="Confronto scenari workforce base, crescita (+2 FTE stimati) e freeze costi. Dati collegati al workforce planning."
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Confronto scenari (6 mesi)</h2>
          <Link
            href={"/workforce-planning" as Route}
            className="text-sm font-medium text-[#002D72] hover:underline dark:text-sky-300"
          >
            Apri workforce planning →
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento serie costi…</p>
        ) : chartSeries.length > 0 ? (
          <div className="rounded-xl border border-[var(--card-border)] p-4" style={{ background: "var(--card-bg)" }}>
            <NexaMonthlyCostChart
              series={chartSeries}
              compareLabel="Scenario crescita"
              title="Base vs crescita (6 mesi)"
            />
            {freeze?.series.length ? (
              <p className="mt-2 text-xs text-[var(--prom-muted)]">
                Freeze ultimo mese:{" "}
                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                  freeze.series[freeze.series.length - 1]!.costEur
                )}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-[var(--prom-muted)]">
              Base: headcount {base?.summary.headcount ?? "—"}, massa mensile indicativa{" "}
              {base?.summary.monthlyPayrollMassEur != null
                ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                    base.summary.monthlyPayrollMassEur
                  )
                : "—"}
              .
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna serie disponibile per il confronto scenari.</p>
        )}
      </section>
    </AdvancedAnalyticsPage>
  );
}
