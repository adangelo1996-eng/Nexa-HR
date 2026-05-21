"use client";

import { Button } from "@/components/ui/button";
import type { AnalyticsFilterOptionsDto } from "@/lib/api";

export type AnalyticsPeriodPreset = "6m" | "12m";

export type AnalyticsFiltersState = {
  costCenterId: string;
  teamId: string;
  periodPreset: AnalyticsPeriodPreset;
};

function monthRange(preset: AnalyticsPeriodPreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 7);
  const months = preset === "12m" ? 11 : 5;
  let m = now.getMonth() + 1 - months;
  let y = now.getFullYear();
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  const from = `${y}-${String(m).padStart(2, "0")}`;
  return { from, to };
}

export function analyticsFiltersQuery(state: AnalyticsFiltersState): {
  costCenter?: string;
  team?: string;
  from: string;
  to: string;
  period: string;
} {
  const { from, to } = monthRange(state.periodPreset);
  return {
    costCenter: state.costCenterId || undefined,
    team: state.teamId || undefined,
    from,
    to,
    period: to
  };
}

export function AnalyticsFiltersBar(props: {
  options: AnalyticsFilterOptionsDto | null;
  value: AnalyticsFiltersState;
  onChange: (next: AnalyticsFiltersState) => void;
  onApply: () => void;
  loading?: boolean;
}): React.JSX.Element {
  const teamsForCc = props.options?.teams.filter(
    (t) => !props.value.costCenterId || t.costCenterId === props.value.costCenterId
  );

  return (
    <section className="mb-6 rounded-2xl border border-[var(--card-border)] p-4" style={{ background: "var(--card-bg)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--prom-text)]">Filtri analisi</h2>
        <p className="text-xs text-[var(--prom-muted)]">Centro di costo, team e finestra temporale per KPI e trend mensili.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
          Centro di costo
          <select
            className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
            value={props.value.costCenterId}
            onChange={(e) =>
              props.onChange({
                ...props.value,
                costCenterId: e.target.value,
                teamId: ""
              })
            }
          >
            <option value="">Tutti i centri</option>
            {(props.options?.costCenters ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
          Team
          <select
            className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
            value={props.value.teamId}
            onChange={(e) => props.onChange({ ...props.value, teamId: e.target.value })}
            disabled={!teamsForCc?.length}
          >
            <option value="">Tutti i team</option>
            {(teamsForCc ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
          Periodo
          <select
            className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
            value={props.value.periodPreset}
            onChange={(e) =>
              props.onChange({
                ...props.value,
                periodPreset: e.target.value === "12m" ? "12m" : "6m"
              })
            }
          >
            <option value="6m">Ultimi 6 mesi</option>
            <option value="12m">Ultimi 12 mesi</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button type="button" size="sm" className="w-full md:w-auto" disabled={props.loading} onClick={props.onApply}>
            {props.loading ? "Aggiornamento…" : "Applica filtri"}
          </Button>
        </div>
      </div>
    </section>
  );
}
