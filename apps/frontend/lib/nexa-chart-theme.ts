/** Synapse brand-aligned chart tokens (dark-theme friendly). */
export const NEXA_CHART_SERIES = ["#002D72", "#1a4d8c", "#3b6cb5", "#5b9bd5", "#7eb8e8", "#94a3b8"] as const;

export const NEXA_CHART = {
  brand: "#002D72",
  brandMid: "#1a4d8c",
  brandLight: "#3b6cb5",
  accent: "#5b9bd5",
  actual: "#002D72",
  budget: "#64748b",
  forecast: "#d97706",
  positive: "#059669",
  negative: "#e11d48",
  warning: "#f59e0b",
  grid: "color-mix(in srgb, var(--prom-line) 85%, transparent)",
  cursor: "var(--prom-muted)"
} as const;

export const NEXA_CHART_TICK = {
  fill: "var(--prom-muted)",
  fontSize: 11,
  fontFamily: "var(--font-synapse-body), Montserrat, system-ui, sans-serif"
} as const;

export const NEXA_CHART_AXIS = {
  stroke: "var(--prom-line)",
  tick: NEXA_CHART_TICK
} as const;

export const NEXA_CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "color-mix(in srgb, var(--prom-surface) 96%, transparent)",
    border: "1px solid var(--prom-line)",
    borderRadius: "10px",
    fontFamily: "var(--font-synapse-body), Montserrat, system-ui, sans-serif",
    fontSize: "12px",
    color: "var(--prom-text)"
  },
  labelStyle: { color: "var(--prom-muted)", fontWeight: 600 },
  itemStyle: { color: "var(--prom-text)" }
} as const;

/** Extract first numeric value from KPI display strings (%, €, testo). */
export function parseChartNumeric(value: string): number | null {
  const normalized = value.replace(/\s/g, " ").trim();
  if (!normalized || normalized === "—" || normalized === "-") {
    return null;
  }
  const match = normalized.match(/-?\d[\d.,]*/);
  if (!match) {
    return null;
  }
  const n = Number.parseFloat(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function seriesColor(index: number): string {
  return NEXA_CHART_SERIES[index % NEXA_CHART_SERIES.length] ?? NEXA_CHART.brand;
}
