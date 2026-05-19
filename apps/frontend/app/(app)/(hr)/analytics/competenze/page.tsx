"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";
import { RoleCoverageGapsPanel } from "@/components/role-coverage-gaps-panel";
import { fetchSkillsGap } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

type GapRow = Awaited<ReturnType<typeof fetchSkillsGap>>["items"][number];

export default function AnalyticsCompetenzePage(): React.JSX.Element {
  const [items, setItems] = useState<GapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetchSkillsGap(token);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento gap competenze");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topGaps = useMemo(
    () =>
      [...items]
        .filter((r) => r.gap > 0)
        .sort((a, b) => b.gap - a.gap || a.roleName.localeCompare(b.roleName, "it"))
        .slice(0, 24),
    [items]
  );

  return (
    <AdvancedAnalyticsPage
      analysisId="competenze"
      title="Competenze e copertura ruoli"
      subtitle="Gap competenze vs fabbisogno per ruolo. Matrice raccomandazioni hiring vs formazione con insight AI su aggregati."
      pageHelpKey="analytics-competenze"
    >
      <RoleCoverageGapsPanel />
      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">Gap per ruolo</h2>
        {loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento report gap…</p>
        ) : topGaps.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">
            Nessun gap rilevato sui requisiti competenze configurati. Verifica ruoli e mappature in anagrafica.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]" style={{ background: "var(--card-bg)" }}>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--prom-line)] text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
                <tr>
                  <th className="px-4 py-3">Ruolo</th>
                  <th className="px-4 py-3">Competenza</th>
                  <th className="px-4 py-3">Livello richiesto</th>
                  <th className="px-4 py-3">Media ruolo</th>
                  <th className="px-4 py-3">Gap</th>
                  <th className="px-4 py-3">Headcount</th>
                </tr>
              </thead>
              <tbody>
                {topGaps.map((row) => (
                  <tr key={`${row.roleId}-${row.skillId}`} className="border-b border-[var(--prom-line)] last:border-0">
                    <td className="px-4 py-2.5 text-[var(--prom-text)]">{row.roleName}</td>
                    <td className="px-4 py-2.5 text-[var(--prom-muted)]">
                      {row.skillName}
                      <span className="ml-1 text-[10px] text-[var(--prom-muted)]">({row.skillCode})</span>
                    </td>
                    <td className="px-4 py-2.5">{row.minLevel}</td>
                    <td className="px-4 py-2.5">{row.avgUserLevel}</td>
                    <td className="px-4 py-2.5 font-medium text-[var(--prom-text)]">{row.gap}</td>
                    <td className="px-4 py-2.5">{row.headcountInRole}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdvancedAnalyticsPage>
  );
}
