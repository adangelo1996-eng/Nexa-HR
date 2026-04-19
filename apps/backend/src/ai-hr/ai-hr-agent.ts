/**
 * Agente conversazionale del Centro AI HR: identità, regole e mappa della piattaforma.
 * Allineare i percorsi a `apps/frontend/lib/nav-routes-catalog.ts` e al raggruppamento menu (sezioni collassabili)
 * in `apps/frontend/components/app-shell.tsx` quando cambia la navigazione.
 */

export const NEXA_HR_AGENT_ID = "nexa_hr_platform_agent";
export const NEXA_HR_AGENT_VERSION = 1;

/**
 * Mappa percorsi Nexa HR → descrizione e argomenti (per orientamento e prompt).
 * Ogni `path` è un percorso reale dell’app; l’agente non deve inventarne altri.
 */
export const NEXA_HR_PLATFORM_NAV: readonly { path: string; labelIt: string; topicsIt: string }[] = [
  { path: "/", labelIt: "Dashboard — riepilogo personale", topicsIt: "home, riepilogo, oggi, panoramica" },
  { path: "/welcome", labelIt: "Benvenuto", topicsIt: "onboarding, primo accesso, tour" },
  { path: "/attendance", labelIt: "Presenze e timbrature", topicsIt: "presenze, timbratura, entrata, uscita, ore" },
  { path: "/work-calendar", labelIt: "Calendario lavoro", topicsIt: "calendario, festività, pianificazione, giorni" },
  { path: "/workflow", labelIt: "Workflow — richieste ferie, permessi, malattia", topicsIt: "ferie, permessi, malattia, assenze, richieste" },
  { path: "/workflow/approvals", labelIt: "Approvazioni team", topicsIt: "approvare, team, delega, responsabile, in attesa" },
  { path: "/smartworking", labelIt: "Smart working", topicsIt: "smart working, agile, remoto, da casa" },
  { path: "/payslips", labelIt: "Cedolini", topicsIt: "stipendio, cedolino, netto, lordo, busta paga, trattenute" },
  { path: "/expenses", labelIt: "Le mie note spese", topicsIt: "spese, rimborsi, scontrini, chilometri, rimborso" },
  { path: "/expenses/scan", labelIt: "Scansione note spese", topicsIt: "ocr, scansione scontrino, spese" },
  { path: "/expenses/scan/review", labelIt: "Revisione scansione spese", topicsIt: "revisione ocr, spese" },
  { path: "/expenses/org", labelIt: "Note spese organizzazione", topicsIt: "spese dipendenti, controllo spese, hr spese" },
  { path: "/settings", labelIt: "Impostazioni profilo", topicsIt: "profilo, password, preferenze, account, dati" },
  { path: "/org-chart", labelIt: "Organigramma persone", topicsIt: "colleghi, chi è chi, contatti organizzazione" },
  { path: "/organigramma", labelIt: "Organigramma strutturale", topicsIt: "struttura, reparti, gerarchia" },
  { path: "/corporate-policies", labelIt: "Corporate Policies", topicsIt: "regolamento, policy, documenti, linee guida" },
  { path: "/reports", labelIt: "Report HR", topicsIt: "report, export, statistiche hr" },
  { path: "/insights", labelIt: "Turnover e retention", topicsIt: "turnover, retention, score, trend, rischi" },
  { path: "/workforce-planning", labelIt: "Workforce planning", topicsIt: "headcount, costi, scenari, forecast" },
  { path: "/manager-copilot", labelIt: "Pannello manager", topicsIt: "manager, approvazioni team, smart working team" },
  { path: "/hr-center", labelIt: "Centro HR", topicsIt: "analisi costi, contratti, recap dipendenti, llm" },
  { path: "/hr-center/analisi", labelIt: "Centro HR — analisi costi", topicsIt: "cdc, costi personale, aggregati, forecast" },
  { path: "/hr-center/contratti", labelIt: "Centro HR — contratti (LLM)", topicsIt: "bozza contratto, template, verifica hr" },
  { path: "/hr-center/recap", labelIt: "Centro HR — recap dipendente", topicsIt: "skills, contratto, formazione, suggerimenti" },
  { path: "/scheduling", labelIt: "Turni", topicsIt: "turni, pianificazione turni, shift" },
  { path: "/recruiting", labelIt: "Colloqui e selezione", topicsIt: "colloqui, recruiting, selezione, candidati" },
  { path: "/recruiting/candidates", labelIt: "Candidati", topicsIt: "candidati, cv, recruiting" },
  { path: "/recruiting/pipelines", labelIt: "Pipeline posizione", topicsIt: "pipeline, fasi colloquio, selezione" },
  {
    path: "/recruiting/onboarding",
    labelIt: "Onboarding candidati (post-colloquio)",
    topicsIt: "onboarding, assunzione, candidato, contratto, documenti"
  },
  {
    path: "/hr-recap",
    labelIt: "Recap operativo HR",
    topicsIt: "task, solleciti, organico, contratti da firmare, onboarding dipendenti, offboarding"
  },
  { path: "/contracts", labelIt: "Contratti standard", topicsIt: "contratti, clausole, template" },
  { path: "/lifecycle/offboard", labelIt: "Offboarding", topicsIt: "uscita, dimissioni, offboarding" },
  { path: "/personnel-budget", labelIt: "Budget personale", topicsIt: "budget, personale, costi fte" },
  {
    path: "/personnel-budget/analysis",
    labelIt: "Budget personale — analisi",
    topicsIt: "analisi budget, costi, fte, confronti"
  },
  {
    path: "/personnel-budget/forecast",
    labelIt: "Budget personale — forecast",
    topicsIt: "forecast budget, previsioni personale"
  },
  {
    path: "/personnel-budget/annual",
    labelIt: "Budget personale — annuale",
    topicsIt: "budget annuale, piano personale"
  },
  { path: "/forecast", labelIt: "Forecast costi", topicsIt: "previsioni, forecast, costi futuri" },
  { path: "/compensation/bench", labelIt: "Benchmark retribuzione", topicsIt: "benchmark, mercato, retribuzione" },
  { path: "/tools/cost-calculator", labelIt: "Calcolatore costo azienda / netto", topicsIt: "costo azienda, netto, simulazione stipendio" },
  { path: "/tools/third-party-licenses", labelIt: "Utenze e licenze terze", topicsIt: "licenze, software, terze parti" },
  { path: "/payroll-hebb", labelIt: "Payroll", topicsIt: "payroll, hebb, elaborazione paghe" },
  { path: "/admin", labelIt: "Area amministrazione", topicsIt: "admin, amministratore, configurazione" },
  { path: "/admin/roles", labelIt: "Admin — ruoli", topicsIt: "ruoli, permessi, rbac" },
  { path: "/admin/cost-centers", labelIt: "Admin — centri di costo", topicsIt: "centri di costo, team, organizzazione" },
  { path: "/admin/data-export", labelIt: "Export Excel dipendenti", topicsIt: "export, excel, dipendenti" },
  { path: "/admin/data-import", labelIt: "Import Excel dipendenti", topicsIt: "import, excel, anagrafica" },
  { path: "/admin/payslip-import", labelIt: "Import cedolini PDF", topicsIt: "import cedolini, pdf" },
  { path: "/ai-hub", labelIt: "Assistente AI (chat)", topicsIt: "ai, assistente, chat, intelligenza artificiale, aiuto" }
] as const;

/** Alias compatibile con il payload precedente `routeHints`. */
export const AI_HR_ROUTE_HINTS: { path: string; labelIt: string; topicsIt: string }[] = [...NEXA_HR_PLATFORM_NAV];

/**
 * Istruzioni di sistema per il modello: identità da “hub” della piattaforma e vincoli di sicurezza/qualità.
 * Resta lato server (non passa dal vault); i dati utente restano in envelope.facts pseudonimizzato.
 */
export function getNexaHrConversationalAgentSystemPrompt(): string {
  return [
    "IDENTITÀ",
    "Sei l’agente conversazionale ufficiale del Centro AI HR di Nexa HR: il punto centrale da cui l’utente orientarsi su tutta la piattaforma (tempi, compensi, policy, amministrazione, strumenti).",
    "Non sei un semplice chatbot generico: parli sempre nel contesto Nexa HR e delle funzioni realmente presenti nell’applicazione.",
    "",
    "OBIETTIVO",
    "Fornire la miglior risposta possibile in italiano: chiara, utile, ordinata (anche con elenchi), rispettosa.",
    "Coprire l’intento a 360°: se la domanda tocca più ambiti (es. ferie + cedolini + spese), collega i temi e indica i percorsi giusti nell’app, senza diluire la precisione.",
    "",
    "FONTI DI VERITÀ (obbligatorie)",
    "Usa solo informazioni coerenti con il JSON utente (envelope.facts): message (domanda), page (pagina corrente se nota), snapshot (conteggi operativi calcolati dal sistema), leaveBalance e policySnippets se presenti, platformCapabilities e routeHints (lista percorsi e argomenti).",
    "Non inventare numeri, date, importi, stati di richieste, nomi di colleghi, permessi dell’utente, né URL/percorsi assenti da platformCapabilities o routeHints.",
    "Se i dati nel JSON non bastano per una risposta sicura, dillo chiaramente e indica quali sezioni dell’app aprire per verificare, usando solo path dalla lista.",
    "",
    "COSA NON PUOI FARE",
    "Non eseguire azioni al posto dell’utente (nessuna approvazione, invio richiesta, modifica dati): per operazioni ufficiali indica sempre il modulo o la sezione corretta (es. Workflow per ferie/permessi).",
    "Non fornire pareri legali, medici o fiscali vincolanti; per decisioni sensibili suggerisci HR o i documenti in Corporate Policies.",
    "Non esporre dati di altre persone o ipotesi su colleghe/i non presenti nel JSON.",
    "",
    "URGENZE E PRIORITÀ",
    "Se snapshot segnala elementi in sospeso (richieste proprie, approvazioni team, notifiche, spese, cedolini nuovi, ferie basse), mettili in evidenza in modo calmo e pratico.",
    "Se l’utente chiede cosa è urgente o cosa fare oggi e lo snapshot è vuoto, comunque suggerisci controlli sensati (Workflow, notifiche, cedolini) senza allarmismo.",
    "",
    "STILE",
    "Linguaggio semplice, no gergo IT interno; spiega acronimi se necessario.",
    "Quando indichi un percorso, usa la forma: nome sezione — path esatto tra parentesi o apice, es. Workflow (/workflow), copiando il path dalla lista.",
    "",
    "CHIUSURA UTILE",
    "Chiudi spesso con un passo concreto prossimo (una o due azioni), adattato al ruolo implicito (es. se ci sono approvazioni team, ricorda Approvazioni team)."
  ].join("\n");
}

/*
 * Estensioni future (tool-calling): definire qui JSON schema / nomi tool che mappano a endpoint
 * backend già protetti (es. run_nl_query, list_notifications), invocarli dopo classificazione
 * intent, sempre con payload pseudonimizzato tramite AiPrivacyGateway.
 */
