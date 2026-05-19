/** Classi condivise per tabelle budget personale (tema scuro Apple-friendly). */

export const PB_TABLE =
  "min-w-full w-full border-separate border-spacing-0 text-sm personnel-budget-table";

export const PB_TABLE_WRAP =
  "overflow-auto max-h-[min(72vh,900px)] rounded-lg border border-[color-mix(in_srgb,var(--prom-line)_65%,transparent)] bg-[color-mix(in_srgb,#0a0f18_92%,var(--prom-surface-soft))] shadow-inner";

export const PB_TH =
  "sticky top-0 z-20 whitespace-nowrap border-b border-r border-[color-mix(in_srgb,var(--prom-line)_80%,#3a4a66)] bg-[color-mix(in_srgb,#121a28_96%,var(--prom-surface-soft))] px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--prom-text)_88%,#c8d4e8)] backdrop-blur-md";

export const PB_TH_GROUP_ACT =
  "bg-[color-mix(in_srgb,#1a2d4a_55%,#121a28)] border-b-2 border-[color-mix(in_srgb,#4a7ab8_45%,transparent)]";

export const PB_TH_GROUP_BDG =
  "bg-[color-mix(in_srgb,#2a2418_55%,#121a28)] border-b-2 border-[color-mix(in_srgb,var(--prom-gold)_35%,transparent)]";

export const PB_TH_GROUP_FCST =
  "bg-[color-mix(in_srgb,#1a2f28_55%,#121a28)] border-b-2 border-[color-mix(in_srgb,#3d9a6a_35%,transparent)]";

export const PB_TD =
  "border-b border-r border-[color-mix(in_srgb,var(--prom-line)_55%,#2a3548)] px-2 py-1.5 text-sm text-[var(--prom-text)]";

export const PB_TD_ZEBRA =
  "even:bg-[color-mix(in_srgb,#ffffff_3%,transparent)] odd:bg-[color-mix(in_srgb,#000000_12%,transparent)]";

export const PB_ROW_NEW =
  "ring-2 ring-inset ring-amber-400/70 bg-[color-mix(in_srgb,amber-500_14%,transparent)]";

export const PB_CELL_NOTE =
  "relative after:absolute after:right-0.5 after:top-0.5 after:h-1.5 after:w-1.5 after:rounded-full after:bg-amber-400 after:content-['']";

export const MONTH_LABELS = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic"
] as const;

export type PbMetricKey = "ral" | "overtime" | "travel" | "inps" | "inail" | "tfr" | "total";

export const PB_METRICS: Array<{ key: PbMetricKey; label: string; compactOnly?: boolean }> = [
  { key: "ral", label: "RAL" },
  { key: "overtime", label: "Straord." },
  { key: "travel", label: "Trasferte" },
  { key: "inps", label: "INPS" },
  { key: "inail", label: "INAIL" },
  { key: "tfr", label: "TFR" },
  { key: "total", label: "Tot. az.", compactOnly: true }
];
