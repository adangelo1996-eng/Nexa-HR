/**
 * Colori distinti solo per etichette di categoria (menu + mappa portale).
 * Allineati concettualmente dove titolo menu ≈ categoria portale.
 */
export function portalCategoryAccentClass(category: string): string {
  const map: Record<string, string> = {
    Quotidiano: "text-cyan-600 dark:text-cyan-300",
    Oggi: "text-cyan-600 dark:text-cyan-300",
    Io: "text-emerald-600 dark:text-emerald-300",
    Documenti: "text-amber-600 dark:text-amber-300",
    Persone: "text-emerald-600 dark:text-emerald-300",
    Operazioni: "text-cyan-600 dark:text-cyan-300",
    Analytics: "text-violet-600 dark:text-violet-300",
    Amministrazione: "text-orange-600 dark:text-orange-300",
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

/** Titolo colonna (mappa + menu): vetro colorato categoria, ben visibile in chiaro/scuro. */
export function portalCategoryGlassColumnHeaderClass(category: string, density: "compact" | "default" = "default"): string {
  const sizing =
    density === "compact"
      ? "w-full px-2 py-2 text-left text-[9px] font-semibold uppercase leading-tight tracking-[0.12em]"
      : "w-full px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em]";
  const tints: Record<string, string> = {
    Quotidiano: `border-cyan-500/70 bg-gradient-to-br from-cyan-400/55 via-cyan-600/35 to-cyan-950/50 text-cyan-950 dark:border-cyan-400/55 dark:from-cyan-400/40 dark:via-cyan-600/25 dark:to-cyan-950/45 dark:text-cyan-50`,
    Oggi: `border-cyan-500/70 bg-gradient-to-br from-cyan-400/55 via-cyan-600/35 to-cyan-950/50 text-cyan-950 dark:border-cyan-400/55 dark:from-cyan-400/40 dark:via-cyan-600/25 dark:to-cyan-950/45 dark:text-cyan-50`,
    Io: `border-emerald-500/70 bg-gradient-to-br from-emerald-400/50 via-emerald-600/30 to-emerald-950/50 text-emerald-950 dark:border-emerald-400/55 dark:from-emerald-400/38 dark:via-emerald-600/22 dark:to-emerald-950/45 dark:text-emerald-50`,
    Documenti: `border-amber-500/70 bg-gradient-to-br from-amber-400/50 via-amber-500/30 to-amber-950/50 text-amber-950 dark:border-amber-400/55 dark:from-amber-400/38 dark:via-amber-500/22 dark:to-amber-950/45 dark:text-amber-50`,
    Persone: `border-emerald-500/70 bg-gradient-to-br from-emerald-400/50 via-emerald-600/30 to-emerald-950/50 text-emerald-950 dark:border-emerald-400/55 dark:from-emerald-400/38 dark:via-emerald-600/22 dark:to-emerald-950/45 dark:text-emerald-50`,
    Operazioni: `border-cyan-500/70 bg-gradient-to-br from-cyan-400/55 via-cyan-600/35 to-cyan-950/50 text-cyan-950 dark:border-cyan-400/55 dark:from-cyan-400/40 dark:via-cyan-600/25 dark:to-cyan-950/45 dark:text-cyan-50`,
    Analytics: `border-violet-500/70 bg-gradient-to-br from-violet-400/50 via-violet-600/35 to-violet-950/55 text-violet-950 dark:border-violet-400/55 dark:from-violet-400/40 dark:via-violet-600/28 dark:to-violet-950/50 dark:text-violet-50`,
    Amministrazione: `border-orange-500/70 bg-gradient-to-br from-orange-400/48 via-orange-600/28 to-orange-950/50 text-orange-950 dark:border-orange-400/55 dark:from-orange-400/36 dark:via-orange-600/22 dark:to-orange-950/45 dark:text-orange-50`,
    "Persone e organizzazione": `border-emerald-500/70 bg-gradient-to-br from-emerald-400/50 via-emerald-600/30 to-emerald-950/50 text-emerald-950 dark:border-emerald-400/55 dark:from-emerald-400/38 dark:via-emerald-600/22 dark:to-emerald-950/45 dark:text-emerald-50`,
    "HEBB AI for HR": `border-violet-500/70 bg-gradient-to-br from-violet-400/50 via-violet-600/35 to-violet-950/55 text-violet-950 dark:border-violet-400/55 dark:from-violet-400/40 dark:via-violet-600/28 dark:to-violet-950/50 dark:text-violet-50`,
    "Selezione e documenti": `border-amber-500/70 bg-gradient-to-br from-amber-400/50 via-amber-500/30 to-amber-950/50 text-amber-950 dark:border-amber-400/55 dark:from-amber-400/38 dark:via-amber-500/22 dark:to-amber-950/45 dark:text-amber-50`,
    "Analisi e pianificazione": `border-sky-500/70 bg-gradient-to-br from-sky-400/50 via-sky-600/30 to-sky-950/50 text-sky-950 dark:border-sky-400/55 dark:from-sky-400/38 dark:via-sky-600/22 dark:to-sky-950/45 dark:text-sky-50`,
    "Amministrazione e dati": `border-orange-500/70 bg-gradient-to-br from-orange-400/48 via-orange-600/28 to-orange-950/50 text-orange-950 dark:border-orange-400/55 dark:from-orange-400/36 dark:via-orange-600/22 dark:to-orange-950/45 dark:text-orange-50`,
    "Ogni giorno": `border-cyan-500/70 bg-gradient-to-br from-cyan-400/55 via-cyan-600/35 to-cyan-950/50 text-cyan-950 dark:border-cyan-400/55 dark:from-cyan-400/40 dark:via-cyan-600/25 dark:to-cyan-950/45 dark:text-cyan-50`,
    "Assumere e far entrare": `border-amber-500/70 bg-gradient-to-br from-amber-400/50 via-amber-500/30 to-amber-950/50 text-amber-950 dark:border-amber-400/55 dark:from-amber-400/38 dark:via-amber-500/22 dark:to-amber-950/45 dark:text-amber-50`,
    "Sviluppare e pianificare": `border-indigo-500/70 bg-gradient-to-br from-indigo-400/50 via-indigo-600/32 to-indigo-950/50 text-indigo-950 dark:border-indigo-400/55 dark:from-indigo-400/38 dark:via-indigo-600/24 dark:to-indigo-950/45 dark:text-indigo-50`,
    "Analisi e budget": `border-sky-500/70 bg-gradient-to-br from-sky-400/50 via-sky-600/30 to-sky-950/50 text-sky-950 dark:border-sky-400/55 dark:from-sky-400/38 dark:via-sky-600/22 dark:to-sky-950/45 dark:text-sky-50`
  };
  const tint = tints[category] ?? `border-slate-400/60 bg-gradient-to-br from-slate-200/50 to-slate-800/40 text-slate-900 dark:border-white/25 dark:from-white/14 dark:to-slate-900/45 dark:text-sky-50`;
  return `rounded-xl border-2 ${sizing} ${tint} ${GLASS_RING}`;
}

/** Sottogruppo (stessa famiglia cromatica della categoria, tono più soft). */
export function portalSubgroupGlassClass(portalCategory: string, density: "compact" | "default" = "default"): string {
  const sizing =
    density === "compact"
      ? "mb-1.5 mt-2 px-2 py-1.5 text-left text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] first:mt-0"
      : "mb-2 mt-3 px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.11em] first:mt-0";
  const tints: Record<string, string> = {
    Quotidiano: `border-l-4 border-cyan-500 bg-cyan-500/12 text-cyan-900 dark:border-cyan-400 dark:bg-cyan-400/15 dark:text-cyan-100`,
    "Persone e organizzazione": `border-l-4 border-emerald-500 bg-emerald-500/12 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-400/15 dark:text-emerald-100`,
    "HEBB AI for HR": `border-l-4 border-violet-500 bg-violet-500/12 text-violet-900 dark:border-violet-400 dark:bg-violet-400/15 dark:text-violet-100`,
    "Selezione e documenti": `border-l-4 border-amber-500 bg-amber-500/12 text-amber-950 dark:border-amber-400 dark:bg-amber-400/15 dark:text-amber-100`,
    "Analisi e pianificazione": `border-l-4 border-sky-500 bg-sky-500/12 text-sky-900 dark:border-sky-400 dark:bg-sky-400/15 dark:text-sky-100`,
    "Amministrazione e dati": `border-l-4 border-orange-500 bg-orange-500/12 text-orange-950 dark:border-orange-400 dark:bg-orange-400/15 dark:text-orange-100`
  };
  const tint = tints[portalCategory] ?? `border-l-4 border-slate-400 bg-slate-500/10 text-slate-800 dark:border-slate-500 dark:bg-white/10 dark:text-slate-100`;
  return `rounded-lg border border-white/10 ${sizing} ${tint} backdrop-blur-md`;
}

/** Bordo superiore sulle card mappa portale (stessa famiglia cromatica della categoria). */
export function portalCategoryTileTopAccentClass(category: string): string {
  const map: Record<string, string> = {
    Quotidiano: "border-t-2 border-t-cyan-400/85",
    Oggi: "border-t-2 border-t-cyan-400/85",
    Io: "border-t-2 border-t-emerald-400/85",
    Documenti: "border-t-2 border-t-amber-400/85",
    Persone: "border-t-2 border-t-emerald-400/85",
    Operazioni: "border-t-2 border-t-cyan-400/85",
    Analytics: "border-t-2 border-t-violet-400/85",
    Amministrazione: "border-t-2 border-t-orange-400/85",
    "Persone e organizzazione": "border-t-2 border-t-emerald-400/85",
    "HEBB AI for HR": "border-t-2 border-t-violet-400/85",
    "Selezione e documenti": "border-t-2 border-t-amber-400/85",
    "Analisi e pianificazione": "border-t-2 border-t-sky-400/85",
    "Amministrazione e dati": "border-t-2 border-t-orange-400/85",
    "Ogni giorno": "border-t-2 border-t-cyan-400/85",
    "Assumere e far entrare": "border-t-2 border-t-amber-400/85",
    "Sviluppare e pianificare": "border-t-2 border-t-indigo-400/85",
    "Analisi e budget": "border-t-2 border-t-sky-400/85"
  };
  return map[category] ?? "border-t-2 border-t-white/25";
}

/** Link pagina sotto una categoria (bordo sinistro nella tinta della categoria). */
export function portalLeafLinkClass(category: string): string {
  const map: Record<string, string> = {
    Quotidiano:
      "border-l-2 border-cyan-500/70 text-cyan-950 hover:bg-cyan-500/15 dark:border-cyan-400/60 dark:text-cyan-50/95 dark:hover:bg-cyan-400/10",
    "Persone e organizzazione":
      "border-l-2 border-emerald-500/70 text-emerald-950 hover:bg-emerald-500/15 dark:border-emerald-400/60 dark:text-emerald-50/95 dark:hover:bg-emerald-400/10",
    "HEBB AI for HR":
      "border-l-2 border-violet-500/70 text-violet-950 hover:bg-violet-500/15 dark:border-violet-400/60 dark:text-violet-50/95 dark:hover:bg-violet-400/10",
    "Selezione e documenti":
      "border-l-2 border-amber-500/70 text-amber-950 hover:bg-amber-500/15 dark:border-amber-400/60 dark:text-amber-50/95 dark:hover:bg-amber-400/10",
    "Analisi e pianificazione":
      "border-l-2 border-sky-500/70 text-sky-950 hover:bg-sky-500/15 dark:border-sky-400/60 dark:text-sky-50/95 dark:hover:bg-sky-400/10",
    "Amministrazione e dati":
      "border-l-2 border-orange-500/70 text-orange-950 hover:bg-orange-500/15 dark:border-orange-400/60 dark:text-orange-50/95 dark:hover:bg-orange-400/10"
  };
  return map[category] ?? "border-l-2 border-slate-400 text-slate-800 hover:bg-slate-500/10 dark:text-slate-100";
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

/** Categoria cromatica per sezione menu / mappa (id lineare HR o titolo). */
export function portalAccentCategoryForNavSection(sectionId: string, title: string): string {
  const byId: Record<string, string> = {
    daily: "Ogni giorno",
    people: "Persone e organizzazione",
    hire: "Selezione e documenti",
    grow: "Sviluppare e pianificare",
    insight: "Analisi e pianificazione",
    admin: "Amministrazione e dati",
    home: "Oggi",
    io: "Io",
    documenti: "Documenti",
    "emp-home": "Oggi",
    "emp-io": "Io",
    "emp-docs": "Documenti",
    presence: "Quotidiano",
    pay: "Selezione e documenti",
    "hebb-ai-hr": "HEBB AI for HR",
    "hr-sintesi": "Analisi e pianificazione",
    "hr-selezione": "Selezione e documenti",
    "hr-documenti": "Selezione e documenti",
    "hr-analisi": "Analisi e pianificazione",
    "hr-admin": "Amministrazione e dati"
  };
  return byId[sectionId] ?? title;
}

/** Contenitore sezione mappa portale: tinta morbida, leggibile su dark. */
export function portalMapSectionSurfaceClass(category: string): string {
  const map: Record<string, string> = {
    Quotidiano:
      "border-cyan-500/20 bg-[color-mix(in_srgb,cyan-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(34,211,238,0.12)]",
    "Ogni giorno":
      "border-cyan-500/20 bg-[color-mix(in_srgb,cyan-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(34,211,238,0.12)]",
    Oggi: "border-cyan-500/20 bg-[color-mix(in_srgb,cyan-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(34,211,238,0.12)]",
    Io: "border-emerald-500/20 bg-[color-mix(in_srgb,emerald-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(52,211,153,0.12)]",
    Documenti:
      "border-amber-500/20 bg-[color-mix(in_srgb,amber-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(251,191,36,0.12)]",
    "Persone e organizzazione":
      "border-emerald-500/20 bg-[color-mix(in_srgb,emerald-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(52,211,153,0.12)]",
    "Selezione e documenti":
      "border-amber-500/20 bg-[color-mix(in_srgb,amber-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(251,191,36,0.12)]",
    "Assumere e far entrare":
      "border-amber-500/20 bg-[color-mix(in_srgb,amber-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(251,191,36,0.12)]",
    "Sviluppare e pianificare":
      "border-indigo-500/20 bg-[color-mix(in_srgb,indigo-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(129,140,248,0.12)]",
    "HEBB AI for HR":
      "border-violet-500/20 bg-[color-mix(in_srgb,violet-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(167,139,250,0.12)]",
    "Analisi e pianificazione":
      "border-sky-500/20 bg-[color-mix(in_srgb,sky-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(56,189,248,0.12)]",
    "Analisi e budget":
      "border-sky-500/20 bg-[color-mix(in_srgb,sky-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(56,189,248,0.12)]",
    "Amministrazione e dati":
      "border-orange-500/20 bg-[color-mix(in_srgb,orange-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(251,146,60,0.12)]",
    Amministrazione:
      "border-orange-500/20 bg-[color-mix(in_srgb,orange-500_10%,var(--prom-surface-soft))] shadow-[inset_0_1px_0_0_rgba(251,146,60,0.12)]"
  };
  return (
    map[category] ??
    "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)]"
  );
}

export function navSectionTitleAccentClass(sectionId: string): string {
  const map: Record<string, string> = {
    presence: "text-cyan-600 dark:text-cyan-300",
    daily: "text-cyan-600 dark:text-cyan-300",
    people: "text-emerald-600 dark:text-emerald-300",
    hire: "text-amber-600 dark:text-amber-300",
    grow: "text-indigo-600 dark:text-indigo-300",
    insight: "text-sky-600 dark:text-sky-300",
    admin: "text-orange-600 dark:text-orange-300",
    home: "text-cyan-600 dark:text-cyan-300",
    io: "text-emerald-600 dark:text-emerald-300",
    documenti: "text-amber-600 dark:text-amber-300",
    "emp-home": "text-cyan-600 dark:text-cyan-300",
    "emp-io": "text-emerald-600 dark:text-emerald-300",
    "emp-docs": "text-amber-600 dark:text-amber-300",
    pay: "text-amber-600 dark:text-amber-300",
    profile: "text-slate-600 dark:text-slate-300",
    "hebb-ai-hr": "text-violet-600 dark:text-violet-300",
    "hr-sintesi": "text-rose-600 dark:text-rose-300",
    "hr-selezione": "text-orange-600 dark:text-orange-300",
    "hr-documenti": "text-lime-600 dark:text-lime-300",
    "hr-analisi": "text-sky-600 dark:text-sky-300",
    "hr-admin": "text-stone-600 dark:text-stone-300"
  };
  return map[sectionId] ?? "text-[var(--prom-text)]";
}
