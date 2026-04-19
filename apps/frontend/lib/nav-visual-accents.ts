/**
 * Colori distinti solo per etichette di categoria (menu + mappa portale).
 * Allineati concettualmente dove titolo menu ≈ categoria portale.
 */
export function portalCategoryAccentClass(category: string): string {
  const map: Record<string, string> = {
    Quotidiano: "text-cyan-600 dark:text-cyan-300",
    "Persone e organizzazione": "text-emerald-600 dark:text-emerald-300",
    "HEBB AI for HR": "text-violet-600 dark:text-violet-300",
    "Selezione e documenti": "text-amber-600 dark:text-amber-300",
    "Analisi e pianificazione": "text-sky-600 dark:text-sky-300",
    "Amministrazione e dati": "text-orange-600 dark:text-orange-300"
  };
  return map[category] ?? "text-slate-600 dark:text-sky-200/90";
}

const GLASS_RING =
  "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.55)] ring-1 ring-white/15 backdrop-blur-xl backdrop-saturate-150";

/** Titolo colonna (mappa 6 colonne + menu): rettangolo glass a tutta larghezza. */
export function portalCategoryGlassColumnHeaderClass(category: string, density: "compact" | "default" = "default"): string {
  const sizing =
    density === "compact"
      ? "w-full px-2 py-2 text-left text-[9px] font-semibold uppercase leading-tight tracking-[0.12em]"
      : "w-full px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em]";
  const tints: Record<string, string> = {
    Quotidiano: `border-cyan-400/45 bg-gradient-to-br from-cyan-400/32 via-cyan-500/12 to-cyan-950/35 text-cyan-50`,
    "Persone e organizzazione": `border-emerald-400/45 bg-gradient-to-br from-emerald-400/28 via-emerald-500/12 to-emerald-950/35 text-emerald-50`,
    "HEBB AI for HR": `border-violet-400/45 bg-gradient-to-br from-violet-400/32 via-violet-600/14 to-violet-950/38 text-violet-50`,
    "Selezione e documenti": `border-amber-400/45 bg-gradient-to-br from-amber-400/28 via-amber-500/12 to-amber-950/35 text-amber-50`,
    "Analisi e pianificazione": `border-sky-400/45 bg-gradient-to-br from-sky-400/28 via-sky-500/12 to-sky-950/35 text-sky-50`,
    "Amministrazione e dati": `border-orange-400/45 bg-gradient-to-br from-orange-400/26 via-orange-500/12 to-orange-950/35 text-orange-50`
  };
  const tint = tints[category] ?? `border-white/25 bg-gradient-to-br from-white/14 to-slate-900/45 text-sky-50`;
  return `rounded-xl border ${sizing} ${tint} ${GLASS_RING}`;
}

export function portalCategoryGlassPillClass(category: string, variant: "category" | "leaf"): string {
  const size = variant === "category" ? "min-w-[10rem] max-w-[14rem] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em]" : "max-w-[11rem] px-3 py-2 text-[11px] font-medium leading-snug";
  const tints: Record<string, string> = {
    Quotidiano: `border-cyan-400/40 bg-gradient-to-br from-cyan-400/30 via-cyan-500/10 to-cyan-950/30 text-cyan-50`,
    "Persone e organizzazione": `border-emerald-400/40 bg-gradient-to-br from-emerald-400/28 via-emerald-500/10 to-emerald-950/30 text-emerald-50`,
    "HEBB AI for HR": `border-violet-400/45 bg-gradient-to-br from-violet-400/30 via-violet-600/12 to-violet-950/35 text-violet-50`,
    "Selezione e documenti": `border-amber-400/45 bg-gradient-to-br from-amber-400/28 via-amber-500/12 to-amber-950/30 text-amber-50`,
    "Analisi e pianificazione": `border-sky-400/45 bg-gradient-to-br from-sky-400/28 via-sky-500/10 to-sky-950/30 text-sky-50`,
    "Amministrazione e dati": `border-orange-400/45 bg-gradient-to-br from-orange-400/26 via-orange-500/10 to-orange-950/30 text-orange-50`
  };
  const tint = tints[category] ?? `border-white/25 bg-gradient-to-br from-white/15 to-slate-900/40 text-sky-50`;
  return `rounded-2xl border ${size} ${tint} ${GLASS_RING}`;
}

/** Nodo centrale Dashboard (vetro neutro / brand). */
export function portalCentralDashboardGlassClass(): string {
  return `rounded-3xl border border-sky-300/45 bg-gradient-to-br from-white/[0.22] via-[#002D72]/35 to-sky-950/40 px-10 py-4 text-base font-semibold tracking-tight text-white ${GLASS_RING} shadow-[0_24px_60px_-24px_rgba(0,45,114,0.7)]`;
}

export function portalCategoryLineColor(category: string): string {
  const map: Record<string, string> = {
    Quotidiano: "rgba(34,211,238,0.55)",
    "Persone e organizzazione": "rgba(52,211,153,0.5)",
    "HEBB AI for HR": "rgba(167,139,250,0.55)",
    "Selezione e documenti": "rgba(251,191,36,0.5)",
    "Analisi e pianificazione": "rgba(56,189,248,0.5)",
    "Amministrazione e dati": "rgba(251,146,60,0.5)"
  };
  return map[category] ?? "rgba(148,163,184,0.45)";
}

export function navSectionTitleAccentClass(sectionId: string): string {
  const map: Record<string, string> = {
    presence: "text-cyan-600 dark:text-cyan-300",
    people: "text-emerald-600 dark:text-emerald-300",
    pay: "text-amber-600 dark:text-amber-300",
    profile: "text-slate-600 dark:text-slate-300",
    "hebb-ai-hr": "text-violet-600 dark:text-violet-300",
    "hr-sintesi": "text-rose-600 dark:text-rose-300",
    "hr-selezione": "text-orange-600 dark:text-orange-300",
    "hr-documenti": "text-lime-600 dark:text-lime-300",
    "hr-analisi": "text-sky-600 dark:text-sky-300",
    "hr-admin": "text-stone-600 dark:text-stone-300"
  };
  return map[sectionId] ?? "text-slate-600 dark:text-slate-300";
}
