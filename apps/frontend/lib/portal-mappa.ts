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
    title: "Dashboard operativa",
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
    href: "/sale-riunioni" as Route,
    title: "Sale riunioni",
    blurb: "Prenota sale meeting: disponibilità in tempo reale per la tua azienda.",
    category: "Quotidiano"
  },
  {
    href: "/workflow",
    title: "Workflow",
    blurb: "Le tue richieste (ferie, permessi, remoto, spese in workflow): invio, stato, storico personale.",
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
    href: "/org-chart",
    title: "Organigramma Visivo",
    blurb: "Vista grafica delle relazioni tra persone e ruoli.",
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
    blurb: "Coda per manager/HR: approva o respingi le richieste dei collaboratori (non sostituisce il tuo workflow personale).",
    category: "Persone e organizzazione"
  },
  {
    href: "/reports",
    title: "Report presenze",
    blurb: "Estrazione presenze e timbrature: predefinito mese in corso, periodo a scelta.",
    category: "Persone e organizzazione"
  },
  {
    href: "/analytics" as Route,
    title: "Hub Analytics",
    blurb: "Quattro analisi strategiche su aggregati pseudonimizzati con narrativa AI.",
    category: "HEBB AI for HR"
  },
  {
    href: "/hr/dashboard" as Route,
    title: "Dashboard HR",
    blurb: "Organico, task prioritari e accesso alle quattro analisi strategiche.",
    category: "HEBB AI for HR"
  },
  {
    href: "/analytics/economico" as Route,
    title: "Controllo economico workforce",
    blurb: "Budget vs actual vs forecast per centro di costo con insight AI.",
    category: "HEBB AI for HR"
  },
  {
    href: "/analytics/retention" as Route,
    title: "Retention e flight risk",
    blurb: "Turnover e tenure su aggregati per fascia e centro di costo.",
    category: "HEBB AI for HR"
  },
  {
    href: "/analytics/competenze" as Route,
    title: "Competenze e copertura ruoli",
    blurb: "Gap competenze vs fabbisogno con matrice hiring vs formazione.",
    category: "HEBB AI for HR"
  },
  {
    href: "/analytics/operativo" as Route,
    title: "Sintesi operativa HR",
    blurb: "Briefing giornaliero: approvazioni, lifecycle e backlog.",
    category: "HEBB AI for HR"
  },
  {
    href: "/il-mio-team" as Route,
    title: "Il mio team",
    blurb: "Manager diretto e colleghi del tuo perimetro: non l'intera azienda.",
    category: "Persone e organizzazione"
  },
  {
    href: "/percorso" as Route,
    title: "Il mio percorso",
    blurb: "Checklist onboarding, policy e uscita in base al tuo stato lavorativo.",
    category: "Quotidiano"
  },
  {
    href: "/percorso/formazione" as Route,
    title: "Formazione",
    blurb: "Corsi obbligatori e facoltativi assegnati da HR, con moduli e scadenze.",
    category: "Quotidiano"
  },
  {
    href: "/hr/formazione" as Route,
    title: "Formazione HR",
    blurb: "Catalogo corsi, assegnazioni dipendenti e panoramica aziendale.",
    category: "Persone e organizzazione"
  },
  {
    href: "/hr-center/analisi" as Route,
    title: "Analisi costi HR",
    blurb: "Costo personale per centro di costo con sintesi LLM o offline.",
    category: "HEBB AI for HR"
  },
  {
    href: "/hr-center/recap" as Route,
    title: "Recap AI dipendenti",
    blurb: "Sintesi operative su perimetro selezionato (centri di costo, team, persone).",
    category: "HEBB AI for HR"
  },
  {
    href: "/hr-center/budget-report" as Route,
    title: "Report budget personale (LLM)",
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
    href: "/tools/third-party-licenses" as Route,
    title: "Utenze e licenze terze",
    blurb: "Registro utenze e licenze software di terze parti.",
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
