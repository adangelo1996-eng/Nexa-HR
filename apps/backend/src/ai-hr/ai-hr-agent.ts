/**
 * Agente conversazionale HEBB AI for HR: identità, regole e mappa della piattaforma.
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
  { path: "/sale-riunioni", labelIt: "Sale riunioni", topicsIt: "prenotazione sale, meeting room, videoconferenza, sala riunioni" },
  { path: "/workflow", labelIt: "Workflow — richieste ferie, permessi, malattia", topicsIt: "ferie, permessi, malattia, assenze, richieste" },
  { path: "/workflow/approvals", labelIt: "Approvazioni team", topicsIt: "approvare, team, delega, responsabile, in attesa" },
  { path: "/smartworking", labelIt: "Remote working", topicsIt: "remote working, agile, remoto, da casa, work from home" },
  { path: "/payslips", labelIt: "Cedolini", topicsIt: "stipendio, cedolino, netto, lordo, busta paga, trattenute" },
  { path: "/expenses", labelIt: "Le mie note spese", topicsIt: "spese, rimborsi, scontrini, chilometri, rimborso" },
  { path: "/expenses/scan", labelIt: "Scansione note spese", topicsIt: "ocr, scansione scontrino, spese" },
  { path: "/expenses/scan/review", labelIt: "Revisione scansione spese", topicsIt: "revisione ocr, spese" },
  { path: "/expenses/org", labelIt: "Note spese organizzazione", topicsIt: "spese dipendenti, controllo spese, hr spese" },
  { path: "/settings", labelIt: "Impostazioni profilo", topicsIt: "profilo, password, preferenze, account, dati" },
  { path: "/org-chart", labelIt: "Organigramma persone", topicsIt: "colleghi, chi è chi, contatti organizzazione" },
  { path: "/organigramma", labelIt: "Organigramma strutturale", topicsIt: "struttura, reparti, gerarchia" },
  { path: "/corporate-policies", labelIt: "Corporate Policies", topicsIt: "regolamento, policy, documenti, linee guida" },
  { path: "/reports", labelIt: "Report presenze", topicsIt: "report presenze, timbrature, export" },
  { path: "/analytics", labelIt: "Hub Analytics HR", topicsIt: "analisi, analytics, intelligence, report hr" },
  {
    path: "/analytics/advanced/economico",
    labelIt: "Analisi — controllo economico workforce",
    topicsIt: "budget, actual, forecast, varianza, centro di costo, controller"
  },
  {
    path: "/analytics/advanced/retention",
    labelIt: "Analisi — retention e flight risk",
    topicsIt: "turnover score, retention, flight risk, assenze, tenure"
  },
  {
    path: "/analytics/competenze",
    labelIt: "Analisi — gap competenze",
    topicsIt: "competenze, skills, gap, ruoli, hiring, formazione"
  },
  {
    path: "/analytics/operativo",
    labelIt: "Analisi — sintesi operativa HR",
    topicsIt: "approvazioni, onboarding, offboarding, briefing hr, attività"
  },
  { path: "/hr/dashboard", labelIt: "Dashboard HR", topicsIt: "dashboard hr, approvazioni, alert, analisi" },
  { path: "/hr-recap", labelIt: "Attività HR", topicsIt: "recap, task hr, solleciti, organico" },
  { path: "/workforce-planning", labelIt: "Workforce planning", topicsIt: "headcount, costi, scenari, forecast" },
  {
    path: "/manager-copilot",
    labelIt: "HEBB AI for HR — Manager",
    topicsIt: "manager, approvazioni team, remote working team"
  },
  { path: "/hr-center/analisi", labelIt: "Analisi costi HR", topicsIt: "cdc, costi personale, aggregati, forecast" },
  { path: "/hr-center/recap", labelIt: "Recap AI dipendenti", topicsIt: "skills, contratto, formazione, filtri team/cdc" },
  {
    path: "/hr-center/budget-report",
    labelIt: "Report budget personale (LLM)",
    topicsIt: "actual, budget, forecast, confronto periodi, export excel pdf ppt"
  },
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
    path: "/percorso/formazione",
    labelIt: "Formazione dipendente",
    topicsIt: "corsi, formazione obbligatoria, scadenze, completamento"
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
  {
    path: "/ai-hub",
    labelIt: "HEBB AI for HR",
    topicsIt: "hebb, ai, assistente, chat, analisi economico retention competenze operativo budget turnover"
  },
  {
    path: "/nexa-hr-copilot",
    labelIt: "HEBB AI for HR — Brief HRBP",
    topicsIt: "copilot hr, brief, headcount, gap, retention, budget, recruiting"
  }
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
    "Sei l’agente conversazionale ufficiale HEBB AI for HR su Nexa HR: il punto centrale da cui l’utente orientarsi su tutta la piattaforma (tempi, compensi, policy, amministrazione, strumenti, analisi HR).",
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
    "CALCOLI E METRICHE (quando l'utente chiede «come si calcola», «cosa significa», «perché questo numero»)",
    "Spiega la logica rule-based o di aggregazione usata in Nexa HR (turnover score, varianza budget, straordinari, % formazione, regole prenotazione sale) usando envelope.knowledgeExcerpt e i fatti noti.",
    "Non inventare formule diverse da quelle documentate; se mancano dati numerici nel JSON, descrivi il meccanismo e indica dove verificare i valori in app (path dalla lista).",
    "Per turnover: ricorda scala 0–100, modello rule-v1, fasce indicative (<34 / 34–66 / ≥67) e che non è decisione automatica su persone.",
    "Per budget: distingui varianza forecast−budget (analisi) da actual vs budget mese (se presente in snapshot/facts).",
    "",
    "CONSIGLIO HR SPECIFICO (obbligatorio)",
    "Ogni risposta deve essere ancorata alla domanda dell'utente: ruolo implicito (dipendente, manager, HR), pagina corrente (envelope.page) e permessi (permissionsSummary).",
    "Evita frasi generiche («contatta HR», «verifica in app») senza legarle al caso: indica quale modulo, quale controllo e quale prossima azione concreta.",
    "Esempi: approvazioni in sospeso → Approvazioni team con priorità per tipo; turnover alto → retention + colloquio strutturato; formazione in ritardo → sollecito corsi obbligatori; straordinario → presenze + eventuale turni.",
    "Non sostituire HR/legal/payroll per decisioni vincolanti; per policy contrattuali rimanda a Corporate Policies o HR umano.",
    "",
    "STILE",
    "Linguaggio semplice, no gergo IT interno; spiega acronimi se necessario.",
    "Quando indichi un percorso, usa la forma: nome sezione — path esatto tra parentesi, es. Workflow (/workflow), copiando il path dalla lista.",
    "Per Nexa Guide strutturato: 2–4 sezioni con title utili, ad es. «Cosa fare», «Dove andare», «Come funziona il calcolo» (solo se pertinente), «Consiglio per te», «Passi successivi».",
    "Ogni sezione: 2–6 bullets; almeno un bullet con action {label, href} quando esiste un path utile in platformCapabilities/routeHints.",
    "Per domande su metriche: includi una sezione «Come funziona il calcolo» con formula ad alto livello e una «Consiglio per te» con azioni HR contestuali.",
    "",
    "CHIUSURA UTILE",
    "Chiudi con uno o due passi concreti prossimi (azione in app), adattati a page, permessi e urgenze da snapshot — non chiusure vuote."
  ].join("\n");
}

/*
 * Estensioni future (tool-calling): definire qui JSON schema / nomi tool che mappano a endpoint
 * backend già protetti (es. run_nl_query, list_notifications), invocarli dopo classificazione
 * intent, sempre con payload pseudonimizzato tramite AiPrivacyGateway.
 */
