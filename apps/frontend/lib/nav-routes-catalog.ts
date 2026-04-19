import type { Route } from "next";

/** Percorsi etichettati per ricerca globale, scorciatoie menu mobile e picker impostazioni. Tenere allineato a `apps/backend/src/ai-hr/ai-hr-agent.ts` (NEXA_HR_PLATFORM_NAV). */
export const NEXA_NAV_ROUTE_CATALOG: { href: Route; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/attendance", label: "Presenze" },
  { href: "/workflow", label: "Workflow" },
  { href: "/manager-copilot" as Route, label: "Pannello manager" },
  { href: "/hr-center" as Route, label: "Centro HR" },
  { href: "/hr-center/analisi" as Route, label: "Centro HR — Analisi costi" },
  { href: "/hr-center/contratti" as Route, label: "Centro HR — Contratti LLM" },
  { href: "/hr-center/recap" as Route, label: "Centro HR — Recap dipendenti" },
  { href: "/expenses", label: "Spese" },
  { href: "/settings", label: "Impostazioni" },
  { href: "/org-chart", label: "Organigramma (persone)" },
  { href: "/organigramma", label: "Organigramma strutturale" },
  { href: "/payslips", label: "Cedolini" },
  { href: "/smartworking", label: "Smartworking" },
  { href: "/workflow/approvals", label: "Approvazioni team" },
  { href: "/reports", label: "Report HR" },
  { href: "/tools/cost-calculator" as Route, label: "Calcolatore costo azienda / netto" },
  { href: "/tools/third-party-licenses" as Route, label: "Utenze e licenze terze" },
  { href: "/recruiting" as Route, label: "Colloqui e selezione" },
  { href: "/recruiting/onboarding" as Route, label: "Onboarding assunzioni (candidati)" },
  { href: "/hr-recap" as Route, label: "Recap HR" },
  { href: "/contracts" as Route, label: "Contratti standard" },
  { href: "/payroll-hebb", label: "Payroll" },
  { href: "/ai-hub" as Route, label: "Assistente AI (chat)" },
  { href: "/corporate-policies" as Route, label: "Corporate Policies" },
  { href: "/admin", label: "Admin" },
  { href: "/admin/data-export" as Route, label: "Export Excel dipendenti" },
  { href: "/admin/data-import" as Route, label: "Import Excel dipendenti" },
  { href: "/admin/payslip-import" as Route, label: "Import cedolini PDF" },
  { href: "/insights", label: "Turnover e retention" },
  { href: "/scheduling", label: "Turni" },
  { href: "/work-calendar", label: "Calendario lavoro" },
  { href: "/compensation/bench", label: "Benchmark retribuzione" },
  { href: "/lifecycle/offboard", label: "Offboarding" },
  { href: "/forecast", label: "Forecast costi" },
  { href: "/workforce-planning" as Route, label: "Workforce planning" },
  { href: "/personnel-budget", label: "Budget personale" },
  { href: "/expenses/org" as Route, label: "Note spese (dipendenti)" }
];

export function navCatalogLabelForHref(href: string): string {
  const row = NEXA_NAV_ROUTE_CATALOG.find((r) => r.href === href);
  return row?.label ?? href;
}
