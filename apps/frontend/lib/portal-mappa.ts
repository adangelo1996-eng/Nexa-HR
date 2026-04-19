import type { Route } from "next";
import {
  sessionCanAccessHrRecapDashboard,
  sessionCanAccessManagerPanel,
  sessionCanAccessPayrollArea,
  sessionCanNexaAdmin,
  sessionCanSeeApprovalsAndHrExtras,
  sessionCanUseNexaAiOpenAiLlm,
  sessionCanViewOrgExpenseClaims,
  type SessionUser
} from "@/lib/auth-session";

export type PortalTile = {
  href: Route;
  title: string;
  blurb: string;
  category: string;
  visible: (u: SessionUser | null, hideSensitiveHr: boolean) => boolean;
};

function hrExtras(u: SessionUser | null): boolean {
  return sessionCanSeeApprovalsAndHrExtras(u ?? undefined);
}

function hrTools(u: SessionUser | null, hide: boolean): boolean {
  return !hide && sessionCanNexaAdmin(u ?? undefined);
}

export const PORTAL_CATEGORY_ORDER = [
  "Quotidiano",
  "Persone e organizzazione",
  "HEBB AI for HR",
  "Selezione e documenti",
  "Analisi e pianificazione",
  "Amministrazione e dati"
] as const;

export const PORTAL_TILES: PortalTile[] = [
  {
    href: "/",
    title: "Dashboard",
    blurb: "Timbrature, ferie, notifiche e riepilogo giornata: il punto di partenza operativo.",
    category: "Quotidiano",
    visible: (u) => Boolean(u)
  },
  {
    href: "/attendance",
    title: "Presenze",
    blurb: "Entrate, uscite e stato timbratura in tempo reale.",
    category: "Quotidiano",
    visible: (u) => Boolean(u)
  },
  {
    href: "/work-calendar",
    title: "Calendario lavoro",
    blurb: "Vista team o HR su assenze, ferie e calendario condiviso.",
    category: "Quotidiano",
    visible: (u) => Boolean(u)
  },
  {
    href: "/workflow",
    title: "Workflow",
    blurb: "Richieste ferie, permessi e smart working con stato approvazione.",
    category: "Quotidiano",
    visible: (u) => Boolean(u)
  },
  {
    href: "/expenses",
    title: "Note spese",
    blurb: "Invio e stato delle note spese del dipendente.",
    category: "Quotidiano",
    visible: (u) => Boolean(u)
  },
  {
    href: "/payslips",
    title: "Cedolini",
    blurb: "Consultazione documenti retributivi pubblicati.",
    category: "Quotidiano",
    visible: (u) => Boolean(u)
  },
  {
    href: "/settings",
    title: "Impostazioni",
    blurb: "Profilo, preferenze e collegamenti utili al portale.",
    category: "Quotidiano",
    visible: (u) => Boolean(u)
  },
  {
    href: "/org-chart",
    title: "Organigramma (persone)",
    blurb: "Chi è chi: collegamenti tra persone e ruoli.",
    category: "Persone e organizzazione",
    visible: (u) => Boolean(u)
  },
  {
    href: "/organigramma",
    title: "Organigramma strutturale",
    blurb: "Struttura reparti e centri di costo.",
    category: "Persone e organizzazione",
    visible: (u) => hrExtras(u)
  },
  {
    href: "/workforce-planning" as Route,
    title: "Workforce planning",
    blurb: "Quadro organico e leve di pianificazione sul personale.",
    category: "Persone e organizzazione",
    visible: (u) => hrExtras(u)
  },
  {
    href: "/scheduling",
    title: "Turni",
    blurb: "Pianificazione turni e coperture operative.",
    category: "Persone e organizzazione",
    visible: (u) => Boolean(u)
  },
  {
    href: "/smartworking",
    title: "Remote working",
    blurb: "Richieste e linee guida sul lavoro da remoto.",
    category: "Persone e organizzazione",
    visible: (u) => Boolean(u)
  },
  {
    href: "/manager-copilot" as Route,
    title: "Pannello manager",
    blurb: "Vista dedicata a responsabili: team, approvazioni e priorità.",
    category: "Persone e organizzazione",
    visible: (u, hide) => !hide && sessionCanAccessManagerPanel(u ?? undefined)
  },
  {
    href: "/workflow/approvals",
    title: "Approvazioni team",
    blurb: "Coda richieste del team da validare o respingere.",
    category: "Persone e organizzazione",
    visible: (u) => hrExtras(u)
  },
  {
    href: "/reports",
    title: "Report HR",
    blurb: "Reportistica HR e scaricamenti aggregati.",
    category: "Persone e organizzazione",
    visible: (u) => hrExtras(u)
  },
  {
    href: "/hr-center" as Route,
    title: "Centro HR",
    blurb: "Hub analisi, contratti assistiti e recap con perimetro privacy.",
    category: "HEBB AI for HR",
    visible: (u, hide) => !hide && sessionCanUseNexaAiOpenAiLlm(u ?? undefined)
  },
  {
    href: "/hr-center/analisi" as Route,
    title: "Centro HR — Analisi costi",
    blurb: "Costo personale per centro di costo con sintesi LLM o offline.",
    category: "HEBB AI for HR",
    visible: (u, hide) => !hide && sessionCanUseNexaAiOpenAiLlm(u ?? undefined)
  },
  {
    href: "/ai-hub" as Route,
    title: "Assistente AI",
    blurb: "Chat contestuale su policy, ferie e dati consentiti dal tuo ruolo.",
    category: "HEBB AI for HR",
    visible: (u, hide) => !hide && sessionCanUseNexaAiOpenAiLlm(u ?? undefined)
  },
  {
    href: "/insights",
    title: "Turnover e retention",
    blurb: "Dinamiche di ingresso e uscita con lettura qualitativa.",
    category: "HEBB AI for HR",
    visible: (u, hide) => hrTools(u, hide)
  },
  {
    href: "/recruiting" as Route,
    title: "Colloqui e selezione",
    blurb: "Pipeline candidati e colloqui.",
    category: "Selezione e documenti",
    visible: (u, hide) => hrTools(u, hide)
  },
  {
    href: "/recruiting/onboarding" as Route,
    title: "Onboarding candidati",
    blurb: "Percorsi post-offerta e stato assunzioni.",
    category: "Selezione e documenti",
    visible: (u, hide) => !hide && sessionCanAccessHrRecapDashboard(u ?? undefined)
  },
  {
    href: "/contracts" as Route,
    title: "Contratti standard",
    blurb: "Redazione contratti da template con campi anagrafici e versioni.",
    category: "Selezione e documenti",
    visible: (u, hide) => hrTools(u, hide)
  },
  {
    href: "/corporate-policies" as Route,
    title: "Corporate Policies",
    blurb: "Policy aziendali consultabili e aggiornamenti.",
    category: "Selezione e documenti",
    visible: (u, hide) => (hrTools(u, hide) || (!hide && sessionCanNexaAdmin(u ?? undefined))) && Boolean(u)
  },
  {
    href: "/tools/cost-calculator" as Route,
    title: "Calcolatore costo / netto",
    blurb: "Simulazioni indicative su costo azienda e netto.",
    category: "Analisi e pianificazione",
    visible: (u, hide) => hrTools(u, hide)
  },
  {
    href: "/forecast",
    title: "Forecast costi",
    blurb: "Proiezioni su costi del personale.",
    category: "Analisi e pianificazione",
    visible: (u, hide) => hrTools(u, hide)
  },
  {
    href: "/compensation/bench",
    title: "Benchmark retribuzione",
    blurb: "Confronti retributivi di mercato (dove configurato).",
    category: "Analisi e pianificazione",
    visible: (u, hide) => hrTools(u, hide)
  },
  {
    href: "/personnel-budget",
    title: "Budget personale",
    blurb: "Budget mensile per centro di costo e consuntivo.",
    category: "Analisi e pianificazione",
    visible: (u, hide) => !hide && sessionCanNexaAdmin(u ?? undefined)
  },
  {
    href: "/hr-recap" as Route,
    title: "Recap operativo HR",
    blurb: "Sintesi operative HR e indicatori chiave.",
    category: "Analisi e pianificazione",
    visible: (u, hide) => !hide && sessionCanAccessHrRecapDashboard(u ?? undefined)
  },
  {
    href: "/expenses/org" as Route,
    title: "Note spese (organico)",
    blurb: "Approvazione spese dei dipendenti nel perimetro HR.",
    category: "Amministrazione e dati",
    visible: (u, hide) => !hide && sessionCanViewOrgExpenseClaims(u ?? undefined)
  },
  {
    href: "/payroll-hebb",
    title: "Payroll",
    blurb: "Area payroll e cedolini (permessi ristretti).",
    category: "Amministrazione e dati",
    visible: (u, hide) => !hide && sessionCanAccessPayrollArea(u ?? undefined)
  },
  {
    href: "/admin" as Route,
    title: "Console utenti",
    blurb: "Gestione account, ruoli e permessi Nexa.",
    category: "Amministrazione e dati",
    visible: (u, hide) => !hide && sessionCanNexaAdmin(u ?? undefined)
  },
  {
    href: "/admin/data-export" as Route,
    title: "Export Excel dipendenti",
    blurb: "Esportazione massiva anagrafica per elaborazioni esterne.",
    category: "Amministrazione e dati",
    visible: (u, hide) => !hide && sessionCanNexaAdmin(u ?? undefined)
  },
  {
    href: "/admin/cost-centers" as Route,
    title: "Centri di costo",
    blurb: "Anagrafica centri di costo e collegamenti organizzativi.",
    category: "Amministrazione e dati",
    visible: (u, hide) => !hide && sessionCanNexaAdmin(u ?? undefined)
  }
];

export function groupPortalTiles(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): Map<string, PortalTile[]> {
  const map = new Map<string, PortalTile[]>();
  for (const t of PORTAL_TILES) {
    if (!t.visible(user, hideSensitiveHr)) continue;
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  return map;
}
