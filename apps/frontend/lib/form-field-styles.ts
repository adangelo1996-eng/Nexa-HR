/**
 * Campi “carta” chiara con testo sempre scuro, anche in html.dark (il body usa --prom-text bianco).
 * tailwind.config content deve includere ./lib/** così queste classi finiscono nel CSS.
 */
export const inputRequiredClass =
  "rounded-lg border-2 border-amber-600/85 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 caret-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 dark:border-amber-500/75 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-500 dark:caret-slate-900 dark:focus:border-amber-500 dark:focus:ring-amber-500/30";

export const inputOptionalClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 caret-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400/80 dark:border-slate-600 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-500 dark:caret-slate-900 dark:focus:ring-slate-500/50";

export const selectRequiredClass = inputRequiredClass;
export const selectOptionalClass = inputOptionalClass;
