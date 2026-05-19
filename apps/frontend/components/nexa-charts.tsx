"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { NexaChartCard } from "@/components/nexa-chart-card";
import {
  NEXA_CHART,
  NEXA_CHART_AXIS,
  NEXA_CHART_TOOLTIP_STYLE,
  parseChartNumeric,
  seriesColor
} from "@/lib/nexa-chart-theme";
import type { AnalyticsKpiDto } from "@/lib/api";

export type ChartDatum = { name: string; value: number; fill?: string };

function ChartEmpty(): React.JSX.Element {
  return (
    <p className="flex h-full items-center justify-center text-xs text-[var(--prom-muted)]">
      Dati insufficienti per il grafico.
    </p>
  );
}

export function NexaKpiBarChart(props: { kpis: AnalyticsKpiDto[]; className?: string }): React.JSX.Element | null {
  const data = useMemo(() => {
    return props.kpis
      .map((k) => {
        const value = parseChartNumeric(k.value);
        if (value == null) {
          return null;
        }
        return {
          name: k.labelIt.length > 22 ? `${k.labelIt.slice(0, 20)}…` : k.labelIt,
          fullLabel: k.labelIt,
          value,
          display: k.value
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [props.kpis]);

  if (!data.length) {
    return null;
  }

  return (
    <NexaChartCard
      className={props.className}
      title="KPI a confronto"
      description="Valori numerici estratti dagli indicatori sopra (stessa unità per riga)."
      height={Math.min(320, 56 + data.length * 36)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} horizontal={false} />
          <XAxis type="number" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tick={NEXA_CHART_AXIS.tick}
            axisLine={{ stroke: NEXA_CHART_AXIS.stroke }}
          />
          <Tooltip
            {...NEXA_CHART_TOOLTIP_STYLE}
            formatter={(_v, _n, item) => {
              const p = item?.payload as { display?: string; fullLabel?: string } | undefined;
              return [p?.display ?? String(_v), p?.fullLabel ?? ""];
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
            {data.map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </NexaChartCard>
  );
}

export type BudgetCategoryRow = {
  label: string;
  actual: number;
  budget: number;
  forecast: number;
};

export function NexaBudgetCategoryChart(props: {
  rows: BudgetCategoryRow[];
  className?: string;
}): React.JSX.Element | null {
  if (!props.rows.length) {
    return null;
  }

  return (
    <NexaChartCard
      className={props.className}
      title="Actual vs budget vs forecast"
      description="Confronto per categoria sul periodo selezionato."
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={props.rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} />
          <XAxis dataKey="label" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
          <YAxis
            tick={NEXA_CHART_AXIS.tick}
            axisLine={{ stroke: NEXA_CHART_AXIS.stroke }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))
            }
          />
          <Tooltip
            {...NEXA_CHART_TOOLTIP_STYLE}
            formatter={(v) =>
              new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                Number(v)
              )
            }
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: NEXA_CHART_AXIS.tick.fontFamily }} />
          <Bar dataKey="actual" name="Actual" fill={NEXA_CHART.actual} radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="budget" name="Budget" fill={NEXA_CHART.budget} radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="forecast" name="Forecast" fill={NEXA_CHART.forecast} radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </NexaChartCard>
  );
}

export type MonthlyCostPoint = { month: string; costEur: number; compareEur?: number };

export function NexaMonthlyCostChart(props: {
  series: MonthlyCostPoint[];
  compareLabel?: string;
  title?: string;
  description?: string;
  className?: string;
  height?: number;
}): React.JSX.Element | null {
  const data = props.series;
  if (!data.length) {
    return null;
  }

  const hasCompare = data.some((d) => d.compareEur != null);

  return (
    <NexaChartCard
      className={props.className}
      title={props.title ?? "Costo mensile previsto"}
      description={props.description ?? "Proiezione massa stipendi sui prossimi mesi."}
      height={props.height ?? 260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} />
          <XAxis dataKey="month" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
          <YAxis
            tick={NEXA_CHART_AXIS.tick}
            axisLine={{ stroke: NEXA_CHART_AXIS.stroke }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))
            }
          />
          <Tooltip
            {...NEXA_CHART_TOOLTIP_STYLE}
            formatter={(v) =>
              new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                Number(v)
              )
            }
          />
          {hasCompare ? (
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: NEXA_CHART_AXIS.tick.fontFamily }} />
          ) : null}
          <Bar dataKey="costEur" name="Scenario attivo" fill={NEXA_CHART.brand} radius={[6, 6, 0, 0]} maxBarSize={40} />
          {hasCompare ? (
            <Line
              type="monotone"
              dataKey="compareEur"
              name={props.compareLabel ?? "Confronto"}
              stroke={NEXA_CHART.forecast}
              strokeWidth={2}
              dot={{ r: 3, fill: NEXA_CHART.forecast }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </NexaChartCard>
  );
}

export function NexaSimpleBarChart(props: {
  title: string;
  description?: string;
  data: ChartDatum[];
  className?: string;
  height?: number;
  valueFormatter?: (n: number) => string;
}): React.JSX.Element | null {
  if (!props.data.length) {
    return null;
  }

  return (
    <NexaChartCard
      className={props.className}
      title={props.title}
      description={props.description}
      height={props.height ?? 220}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={props.data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} />
          <XAxis dataKey="name" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
          <YAxis tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} allowDecimals={false} />
          <Tooltip
            {...NEXA_CHART_TOOLTIP_STYLE}
            formatter={(v) =>
              props.valueFormatter ? props.valueFormatter(Number(v)) : String(v)
            }
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
            {props.data.map((d, i) => (
              <Cell key={d.name} fill={d.fill ?? seriesColor(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </NexaChartCard>
  );
}

export function NexaRecruitingFunnelChart(props: {
  stages: Array<{ name: string; count: number }>;
  className?: string;
}): React.JSX.Element | null {
  const data = props.stages.filter((s) => s.count >= 0);
  if (!data.length) {
    return null;
  }

  return (
    <NexaChartCard
      className={props.className}
      title="Funnel pipeline"
      description="Candidati per fase — utile per colli di bottiglia nel processo."
      height={240}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} />
          <XAxis dataKey="name" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
          <YAxis tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} allowDecimals={false} />
          <Tooltip {...NEXA_CHART_TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Candidati" fill={NEXA_CHART.brand} radius={[6, 6, 0, 0]} maxBarSize={56}>
            {data.map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </NexaChartCard>
  );
}

export function NexaCompensationRangeChart(props: {
  low: number;
  median: number;
  high: number;
  className?: string;
}): React.JSX.Element {
  const data = [
    { name: "Min", value: props.low, fill: NEXA_CHART.budget },
    { name: "Mediana", value: props.median, fill: NEXA_CHART.brand },
    { name: "Max", value: props.high, fill: NEXA_CHART.brandLight }
  ];

  const fmt = (n: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  return (
    <NexaChartCard
      className={props.className}
      title="Fascia RAL stimata"
      description="Confronto minimo, mediana e massimo del benchmark."
      height={200}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} />
          <XAxis dataKey="name" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
          <YAxis
            tick={NEXA_CHART_AXIS.tick}
            axisLine={{ stroke: NEXA_CHART_AXIS.stroke }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))
            }
          />
          <Tooltip {...NEXA_CHART_TOOLTIP_STYLE} formatter={(v) => fmt(Number(v))} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </NexaChartCard>
  );
}

export function NexaLeaveBalancePie(props: {
  residual: number;
  used: number;
  allocated: number;
  monthLeave: number;
  monthRol: number;
  className?: string;
}): React.JSX.Element {
  const balanceData = useMemo(() => {
    const residual = Math.max(0, props.residual);
    const used = Math.max(0, props.used);
    if (residual + used <= 0) {
      return [];
    }
    return [
      { name: "Residue", value: residual, fill: NEXA_CHART.positive },
      { name: "Usate", value: used, fill: NEXA_CHART.brandLight }
    ];
  }, [props.residual, props.used]);

  const monthData: ChartDatum[] = [
    { name: "Ferie mese", value: props.monthLeave, fill: NEXA_CHART.positive },
    { name: "ROL mese", value: props.monthRol, fill: NEXA_CHART.warning }
  ];

  return (
    <div className={`grid gap-4 lg:grid-cols-2 ${props.className ?? ""}`}>
      <NexaChartCard
        title="Saldo ferie annuali"
        description={
          props.allocated > 0
            ? `${props.used} usate su ${props.allocated} assegnate · ${props.residual} residue`
            : "Saldo ferie dal profilo HR."
        }
        height={220}
      >
        {balanceData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={balanceData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                {balanceData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip {...NEXA_CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: NEXA_CHART_AXIS.tick.fontFamily }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty />
        )}
      </NexaChartCard>
      <NexaSimpleBarChart
        title="Assenze nel mese"
        description="Giorni ferie e ROL nel periodo visualizzato (approvati o in attesa)."
        data={monthData}
        height={220}
        valueFormatter={(n) => `${n} gg`}
      />
    </div>
  );
}

export function NexaFlightRiskBar(props: {
  rows: Array<{ name: string; score: number }>;
  className?: string;
}): React.JSX.Element | null {
  const data = props.rows.filter((r) => Number.isFinite(r.score));
  if (!data.length) {
    return null;
  }
  return (
    <NexaSimpleBarChart
      className={props.className}
      title="Flight risk · report diretti"
      description="Punteggio turnover per persona (0–100)."
      data={data.map((r, i) => ({
        name: r.name.length > 14 ? `${r.name.slice(0, 12)}…` : r.name,
        value: r.score,
        fill: r.score >= 67 ? NEXA_CHART.negative : r.score >= 34 ? NEXA_CHART.warning : NEXA_CHART.positive
      }))}
      height={Math.min(300, 80 + data.length * 28)}
      valueFormatter={(n) => String(Math.round(n))}
    />
  );
}
