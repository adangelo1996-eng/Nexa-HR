/** Etichette e stili badge condivisi tra pagina dipendente e vista organico HR. */

export const EXPENSE_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti gli stati" },
  { value: "submitted", label: "In attesa responsabile" },
  { value: "pending_hr", label: "In attesa HR" },
  { value: "approved", label: "Approvata" },
  { value: "paid", label: "Pagata" },
  { value: "rejected", label: "Rifiutata" },
  { value: "draft", label: "Bozza" }
];

export function expenseStatusLabelIt(status: string): string {
  const f = EXPENSE_STATUS_FILTER_OPTIONS.find((x) => x.value === status);
  return f?.label ?? status;
}

/** Classi Tailwind per badge stato (tema chiaro/scuro; compatibile con --prom-* dove usato). */
export function expenseStatusBadgeClassName(status: string): string {
  if (status === "approved") {
    return "bg-emerald-100/90 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200";
  }
  if (status === "paid") {
    return "bg-sky-100/90 text-sky-900 dark:bg-sky-900/45 dark:text-sky-100";
  }
  if (status === "rejected") {
    return "bg-rose-100/90 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200";
  }
  if (status === "submitted") {
    return "bg-amber-100/90 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100";
  }
  if (status === "pending_hr") {
    return "bg-violet-100/90 text-violet-900 dark:bg-violet-900/45 dark:text-violet-100";
  }
  if (status === "draft") {
    return "bg-slate-200/90 text-slate-800 dark:bg-slate-700/80 dark:text-slate-100";
  }
  return "bg-slate-200/80 text-slate-800 dark:bg-slate-600/60 dark:text-slate-100";
}
