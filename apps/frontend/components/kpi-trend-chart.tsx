"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { NexaChartCard } from "@/components/nexa-chart-card";
import { NEXA_CHART, NEXA_CHART_AXIS, NEXA_CHART_TOOLTIP_STYLE, seriesColor } from "@/lib/nexa-chart-theme";
import type { KpiHistorySeriesDto } from "@/lib/api";

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const month = Number(m);
  const labels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  return `${labels[month - 1] ?? m} ${y?.slice(2) ?? ""}`.trim();
}

export function KpiTrendChart(props: {
  series: KpiHistorySeriesDto;
  accent?: string;
  className?: string;
  compact?: boolean;
}): React.JSX.Element | null {
  const data = useMemo(() => {
    return props.series.points
      .filter((p) => p.value != null && Number.isFinite(p.value))
      .map((p) => ({
        name: formatMonthLabel(p.yearMonth),
        value: p.value as number,
        display: p.valueText || String(p.value)
      }));
  }, [props.series.points]);

  if (!data.length) {
    return null;
  }

  const color = props.accent ?? seriesColor(0);
  const height = props.compact ? 180 : 220;

  return (
    <NexaChartCard
      className={props.className}
      title={props.series.labelIt}
      description="Trend mensile (snapshot KPI)"
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        {props.series.chartType === "bar" ? (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} />
            <XAxis dataKey="name" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
            <YAxis tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
            <Tooltip
              {...NEXA_CHART_TOOLTIP_STYLE}
              formatter={(_v, _n, item) => {
                const p = item?.payload as { display?: string } | undefined;
                return [p?.display ?? String(_v), props.series.labelIt];
              }}
            />
            <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={40} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={NEXA_CHART.grid} />
            <XAxis dataKey="name" tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
            <YAxis tick={NEXA_CHART_AXIS.tick} axisLine={{ stroke: NEXA_CHART_AXIS.stroke }} />
            <Tooltip
              {...NEXA_CHART_TOOLTIP_STYLE}
              formatter={(_v, _n, item) => {
                const p = item?.payload as { display?: string } | undefined;
                return [p?.display ?? String(_v), props.series.labelIt];
              }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </NexaChartCard>
  );
}

export function KpiTrendChartGrid(props: {
  series: KpiHistorySeriesDto[];
  accent?: string;
  className?: string;
  maxCharts?: number;
}): React.JSX.Element | null {
  const charts = props.series.slice(0, props.maxCharts ?? 4);
  const visible = charts.filter((s) => s.points.some((p) => p.value != null));
  if (!visible.length) {
    return (
      <p className="text-sm text-[var(--prom-muted)]">
        Nessuna serie storica disponibile per il periodo selezionato. I valori verranno registrati al primo accesso mensile.
      </p>
    );
  }
  return (
    <div className={`grid gap-4 md:grid-cols-2 ${props.className ?? ""}`}>
      {visible.map((s) => (
        <KpiTrendChart key={s.kpiKey} series={s} accent={props.accent} />
      ))}
    </div>
  );
}
