import type { Route } from "next";

/** Percorsi etichettati per ricerca globale, scorciatoie menu mobile e picker impostazioni. Tenere allineato a `apps/backend/src/ai-hr/ai-hr-agent.ts` (NEXA_HR_PLATFORM_NAV). */
export const NEXA_NAV_ROUTE_CATALOG: { href: Route; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/mappa-portale" as Route, label: "Mappa portale" },
  { href: "/hub/home" as Route, label: "Hub — Home" },
  { href: "/hub/io" as Route, label: "Hub — Io" },
  { href: "/hub/documenti" as Route, label: "Hub — Documenti" },
  { href: "/hub/persone" as Route, label: "Hub — Persone" },
  { href: "/hub/operazioni" as Route, label: "Hub — Operazioni" },
  { href: "/hub/analisi" as Route, label: "Hub — Analisi HR" },
  { href: "/hub/amministrazione" as Route, label: "Hub — Amministrazione" },
  { href: "/analytics" as Route, label: "Hub Analytics" },
  { href: "/hr/dashboard" as Route, label: "Dashboard HR" },
  { href: "/analytics/economico" as Route, label: "Analisi — Controllo economico" },
  { href: "/analytics/retention" as Route, label: "Analisi — Retention" },
  { href: "/analytics/competenze" as Route, label: "Analisi — Competenze" },
  { href: "/analytics/operativo" as Route, label: "Analisi — Sintesi operativa" },
  { href: "/il-mio-team" as Route, label: "Il mio team" },
  { href: "/percorso" as Route, label: "Il mio percorso" },
  { href: "/percorso/formazione" as Route, label: "Formazione" },
  { href: "/hr/formazione" as Route, label: "Formazione HR" },
  { href: "/hub/persone" as Route, label: "Hub Persone" },
  { href: "/hub/io" as Route, label: "Hub Io" },
  { href: "/attendance", label: "Presenze" },
  { href: "/workflow", label: "Workflow (tue richieste)" },
  { href: "/manager-copilot" as Route, label: "Pannello manager" },
  { href: "/hr-center/analisi" as Route, label: "Analisi costi HR" },
  { href: "/hr-center/recap" as Route, label: "Recap AI dipendenti" },
  { href: "/hr-center/budget-report" as Route, label: "Report budget personale (LLM)" },
  { href: "/expenses", label: "Spese" },
  { href: "/settings", label: "Impostazioni" },
  { href: "/org-chart", label: "Organigramma (persone)" },
  { href: "/organigramma", label: "Organigramma strutturale" },
  { href: "/payslips", label: "Cedolini" },
  { href: "/smartworking", label: "Remote working" },
  { href: "/workflow/approvals", label: "Approvazioni team (manager/HR)" },
  { href: "/reports", label: "Report presenze" },
  { href: "/tools/cost-calculator" as Route, label: "Calcolatore costo azienda / netto" },
  { href: "/tools/third-party-licenses" as Route, label: "Utenze e licenze terze" },
  { href: "/recruiting" as Route, label: "Colloqui e selezione" },
  { href: "/recruiting/onboarding" as Route, label: "Onboarding assunzioni (candidati)" },
  { href: "/hr-recap" as Route, label: "Recap operativo HR" },
  { href: "/contracts" as Route, label: "Contratti standard" },
  { href: "/payroll-hebb", label: "Payroll" },
  { href: "/ai-hub" as Route, label: "Assistente personale" },
  { href: "/corporate-policies" as Route, label: "Corporate Policies" },
  { href: "/admin", label: "Admin" },
  { href: "/admin/data-export" as Route, label: "Export Excel dipendenti" },
  { href: "/admin/data-import" as Route, label: "Import Excel dipendenti" },
  { href: "/admin/payslip-import" as Route, label: "Import cedolini PDF" },
  { href: "/scheduling", label: "Turni" },
  { href: "/work-calendar", label: "Calendario lavoro" },
  { href: "/sale-riunioni" as Route, label: "Sale riunioni" },
  { href: "/compensation/bench", label: "Benchmark retribuzione" },
  { href: "/lifecycle/offboard", label: "Offboarding" },
  { href: "/forecast", label: "Forecast costi" },
  { href: "/workforce-planning" as Route, label: "Workforce planning" },
  { href: "/personnel-budget", label: "Budget personale" },
  { href: "/personnel-budget/analysis" as Route, label: "Budget personale — Analisi" },
  { href: "/personnel-budget/forecast" as Route, label: "Budget personale — Forecast" },
  { href: "/personnel-budget/annual" as Route, label: "Budget personale — Annuale" },
  { href: "/expenses/org" as Route, label: "Note spese (dipendenti)" },
  { href: "/welcome" as Route, label: "Benvenuto" },
  { href: "/expenses/scan" as Route, label: "Scansione note spese" },
  { href: "/expenses/scan/review" as Route, label: "Revisione scansione spese" },
  { href: "/recruiting/candidates" as Route, label: "Candidati" },
  { href: "/recruiting/pipelines" as Route, label: "Pipeline posizione" },
  { href: "/admin/roles" as Route, label: "Admin — Ruoli" },
  { href: "/admin/cost-centers" as Route, label: "Admin — Centri di costo" }
];

export function navCatalogLabelForHref(href: string): string {
  const row = NEXA_NAV_ROUTE_CATALOG.find((r) => r.href === href);
  return row?.label ?? href;
}

function humanizePathTail(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return "Pagina";
  try {
    const decoded = decodeURIComponent(last);
    if (/^[0-9a-f-]{36}$/i.test(decoded)) return "Dettaglio";
    return decoded
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Pagina";
  }
}

/** Titolo pagina dal catalogo nav (match più specifico per prefisso), altrimenti etichetta derivata dall’URL. */
export function navCatalogBestLabelForPathname(pathname: string): string {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const candidates = NEXA_NAV_ROUTE_CATALOG.filter(
    (r) => normalized === r.href || (r.href !== "/" && normalized.startsWith(`${r.href}/`))
  );
  if (candidates.length === 0) {
    return humanizePathTail(normalized);
  }
  candidates.sort((a, b) => b.href.length - a.href.length);
  return candidates[0]!.label;
}
