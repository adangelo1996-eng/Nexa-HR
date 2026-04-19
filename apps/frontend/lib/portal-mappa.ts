import type { Route } from "next";
import type { SessionUser } from "@/lib/auth-session";
import { filterPortalHref } from "@/lib/nexa-route-access";

export type PortalTile = {
  href: Route;
  title: string;
  blurb: string;
  category: string;
};

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
    category: "Quotidiano"
  },
  {
    href: "/attendance",
    title: "Presenze",
    blurb: "Entrate, uscite e stato timbratura in tempo reale.",
    category: "Quotidiano"
  },
  {
    href: "/work-calendar",
    title: "Calendario lavoro",
    blurb: "Vista team o HR su assenze, ferie e calendario condiviso.",
    category: "Quotidiano"
  },
  {
    href: "/workflow",
    title: "Workflow",
    blurb: "Richieste ferie, permessi e smart working con stato approvazione.",
    category: "Quotidiano"
  },
  {
    href: "/expenses",
    title: "Note spese",
    blurb: "Invio e stato delle note spese del dipendente.",
    category: "Quotidiano"
  },
  {
    href: "/payslips",
    title: "Cedolini",
    blurb: "Consultazione documenti retributivi pubblicati.",
    category: "Quotidiano"
  },
  {
    href: "/settings",
    title: "Impostazioni",
    blurb: "Profilo, preferenze e collegamenti utili al portale.",
    category: "Quotidiano"
  },
  {
    href: "/org-chart",
    title: "Organigramma (persone)",
    blurb: "Chi è chi: collegamenti tra persone e ruoli.",
    category: "Persone e organizzazione"
  },
  {
    href: "/organigramma",
    title: "Organigramma strutturale",
    blurb: "Struttura reparti e centri di costo.",
    category: "Persone e organizzazione"
  },
  {
    href: "/workforce-planning" as Route,
    title: "Workforce planning",
    blurb: "Quadro organico e leve di pianificazione sul personale.",
    category: "Persone e organizzazione"
  },
  {
    href: "/scheduling",
    title: "Turni",
    blurb: "Pianificazione turni e coperture operative.",
    category: "Persone e organizzazione"
  },
  {
    href: "/smartworking",
    title: "Remote working",
    blurb: "Richieste e linee guida sul lavoro da remoto.",
    category: "Persone e organizzazione"
  },
  {
    href: "/manager-copilot" as Route,
    title: "Pannello manager",
    blurb: "Vista dedicata a responsabili: team, approvazioni e priorità.",
    category: "Persone e organizzazione"
  },
  {
    href: "/workflow/approvals",
    title: "Approvazioni team",
    blurb: "Coda richieste del team da validare o respingere.",
    category: "Persone e organizzazione"
  },
  {
    href: "/reports",
    title: "Report HR",
    blurb: "Reportistica HR e scaricamenti aggregati.",
    category: "Persone e organizzazione"
  },
  {
    href: "/hr-center" as Route,
    title: "Centro HR",
    blurb: "Hub analisi, recap e report budget con perimetro privacy e LLM.",
    category: "HEBB AI for HR"
  },
  {
    href: "/hr-center/analisi" as Route,
    title: "Centro HR — Analisi costi",
    blurb: "Costo personale per centro di costo con sintesi LLM o offline.",
    category: "HEBB AI for HR"
  },
  {
    href: "/hr-center/recap" as Route,
    title: "Centro HR — Recap AI dipendenti",
    blurb: "Sintesi operative su perimetro selezionato (centri di costo, team, persone).",
    category: "HEBB AI for HR"
  },
  {
    href: "/hr-center/budget-report" as Route,
    title: "Centro HR — Report budget personale (LLM)",
    blurb: "Analisi strutturale Actual / Budget / Forecast o confronto tra periodi, con esportazione.",
    category: "HEBB AI for HR"
  },
  {
    href: "/ai-hub" as Route,
    title: "Assistente personale",
    blurb: "Conversazione con modello linguistico su policy, ferie e dati consentiti dal tuo ruolo.",
    category: "HEBB AI for HR"
  },
  {
    href: "/insights",
    title: "Turnover e retention",
    blurb: "Dinamiche di ingresso e uscita con lettura qualitativa.",
    category: "HEBB AI for HR"
  },
  {
    href: "/recruiting" as Route,
    title: "Colloqui e selezione",
    blurb: "Pipeline candidati e colloqui.",
    category: "Selezione e documenti"
  },
  {
    href: "/recruiting/onboarding" as Route,
    title: "Onboarding candidati",
    blurb: "Percorsi post-offerta e stato assunzioni.",
    category: "Selezione e documenti"
  },
  {
    href: "/contracts" as Route,
    title: "Contratti standard",
    blurb: "Redazione contratti da template con campi anagrafici e versioni.",
    category: "Selezione e documenti"
  },
  {
    href: "/corporate-policies" as Route,
    title: "Corporate Policies",
    blurb: "Policy aziendali consultabili e aggiornamenti.",
    category: "Selezione e documenti"
  },
  {
    href: "/tools/cost-calculator" as Route,
    title: "Calcolatore costo / netto",
    blurb: "Simulazioni indicative su costo azienda e netto.",
    category: "Analisi e pianificazione"
  },
  {
    href: "/forecast",
    title: "Forecast costi",
    blurb: "Proiezioni su costi del personale.",
    category: "Analisi e pianificazione"
  },
  {
    href: "/compensation/bench",
    title: "Benchmark retribuzione",
    blurb: "Confronti retributivi di mercato (dove configurato).",
    category: "Analisi e pianificazione"
  },
  {
    href: "/personnel-budget",
    title: "Budget personale",
    blurb: "Budget mensile per centro di costo e consuntivo.",
    category: "Analisi e pianificazione"
  },
  {
    href: "/hr-recap" as Route,
    title: "Recap operativo HR",
    blurb: "Sintesi operative HR e indicatori chiave.",
    category: "Analisi e pianificazione"
  },
  {
    href: "/expenses/org" as Route,
    title: "Note spese (organico)",
    blurb: "Approvazione spese dei dipendenti nel perimetro HR.",
    category: "Amministrazione e dati"
  },
  {
    href: "/payroll-hebb",
    title: "Payroll",
    blurb: "Area payroll e cedolini (permessi ristretti).",
    category: "Amministrazione e dati"
  },
  {
    href: "/admin" as Route,
    title: "Console utenti",
    blurb: "Gestione account, ruoli e permessi Nexa.",
    category: "Amministrazione e dati"
  },
  {
    href: "/admin/data-export" as Route,
    title: "Export Excel dipendenti",
    blurb: "Esportazione massiva anagrafica per elaborazioni esterne.",
    category: "Amministrazione e dati"
  },
  {
    href: "/admin/cost-centers" as Route,
    title: "Centri di costo",
    blurb: "Anagrafica centri di costo e collegamenti organizzativi.",
    category: "Amministrazione e dati"
  }
];

export function groupPortalTiles(
  user: SessionUser | null,
  hideSensitiveHr: boolean
): Map<string, PortalTile[]> {
  const map = new Map<string, PortalTile[]>();
  for (const t of PORTAL_TILES) {
    if (!filterPortalHref(t.href, user, hideSensitiveHr)) {
      continue;
    }
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  return map;
}

/** Rami per mappa ad albero: la Dashboard resta solo al centro (href `/` escluso dalle foglie). */
export function buildPortalMindMapBranches(grouped: Map<string, PortalTile[]>): { category: string; tiles: PortalTile[] }[] {
  return PORTAL_CATEGORY_ORDER.map((cat) => ({
    category: cat,
    tiles: (grouped.get(cat) ?? []).filter((t) => t.href !== "/")
  })).filter((b) => b.tiles.length > 0);
}
