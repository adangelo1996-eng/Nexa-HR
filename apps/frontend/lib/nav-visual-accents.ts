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
