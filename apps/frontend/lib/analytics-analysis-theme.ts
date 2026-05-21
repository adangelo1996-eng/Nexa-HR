export type AnalyticsAnalysisTheme = {
  accent: string;
  accentSoft: string;
  kpiBorder: string;
  insightBorder: string;
  chatBorder: string;
  layout: "classic" | "split" | "stacked" | "compact";
};

const THEMES: Record<string, AnalyticsAnalysisTheme> = {
  economico: {
    accent: "#002D72",
    accentSoft: "color-mix(in srgb, #002D72 12%, transparent)",
    kpiBorder: "border-[#002D72]/25",
    insightBorder: "border-[#002D72]/30",
    chatBorder: "border-slate-400/30",
    layout: "classic"
  },
  retention: {
    accent: "#be123c",
    accentSoft: "color-mix(in srgb, #be123c 10%, transparent)",
    kpiBorder: "border-rose-500/25",
    insightBorder: "border-rose-500/30",
    chatBorder: "border-rose-400/25",
    layout: "split"
  },
  competenze: {
    accent: "#0f766e",
    accentSoft: "color-mix(in srgb, #0f766e 10%, transparent)",
    kpiBorder: "border-teal-600/25",
    insightBorder: "border-teal-600/30",
    chatBorder: "border-teal-500/25",
    layout: "stacked"
  },
  operativo: {
    accent: "#b45309",
    accentSoft: "color-mix(in srgb, #b45309 10%, transparent)",
    kpiBorder: "border-amber-600/25",
    insightBorder: "border-amber-600/30",
    chatBorder: "border-amber-500/25",
    layout: "compact"
  },
  produttivita: {
    accent: "#1d4ed8",
    accentSoft: "color-mix(in srgb, #1d4ed8 10%, transparent)",
    kpiBorder: "border-blue-600/25",
    insightBorder: "border-blue-600/30",
    chatBorder: "border-blue-500/25",
    layout: "split"
  },
  equita: {
    accent: "#7c3aed",
    accentSoft: "color-mix(in srgb, #7c3aed 10%, transparent)",
    kpiBorder: "border-violet-600/25",
    insightBorder: "border-violet-600/30",
    chatBorder: "border-violet-500/25",
    layout: "classic"
  },
  carico_manager: {
    accent: "#c2410c",
    accentSoft: "color-mix(in srgb, #c2410c 10%, transparent)",
    kpiBorder: "border-orange-600/25",
    insightBorder: "border-orange-600/30",
    chatBorder: "border-orange-500/25",
    layout: "stacked"
  },
  what_if: {
    accent: "#0369a1",
    accentSoft: "color-mix(in srgb, #0369a1 10%, transparent)",
    kpiBorder: "border-sky-700/25",
    insightBorder: "border-sky-700/30",
    chatBorder: "border-sky-600/25",
    layout: "compact"
  }
};

export function getAnalyticsAnalysisTheme(analysisId: string): AnalyticsAnalysisTheme {
  return THEMES[analysisId] ?? THEMES.economico!;
}
