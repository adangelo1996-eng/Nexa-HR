/** Guida contestuale breve per pagine Nexa HR (assistente inline, non LLM). */

export const NEXA_PAGE_HELP_KEYS = [
  "dashboard",
  "attendance",
  "workflow",
  "expenses",
  "payslips",
  "recruiting",
  "recruiting-integrations",
  "recruiting-onboarding",
  "contracts",
  "scheduling",
  "smartworking",
  "work-calendar",
  "organigramma",
  "org-chart",
  "workforce-planning",
  "manager-copilot",
  "nexa-hr-copilot",
  "hr-formazione",
  "formazione",
  "personnel-budget",
  "analytics-retention",
  "analytics-competenze",
  "compensation-bench",
  "personnel-budget-analysis",
  "hr-center-recap",
  "mappa-portale"
] as const;

export type NexaPageHelpKey = (typeof NEXA_PAGE_HELP_KEYS)[number];

export type NexaPageHelpContent = {
  title: string;
  summary: string;
  howToUse: string[];
  bestPractices?: string[];
};

const HELP: Record<NexaPageHelpKey, NexaPageHelpContent> = {
  dashboard: {
    title: "Dashboard",
    summary: "Riepilogo della giornata: timbratura, ferie residue, notifiche e accessi rapidi.",
    howToUse: [
      "Controlla lo stato presenza prima di iniziare.",
      "Apri le notifiche per approvazioni o scadenze formazione.",
      "Usa le scorciatoie verso Workflow o Presenze."
    ]
  },
  attendance: {
    title: "Presenze",
    summary: "Registra ingressi/uscite e consulta lo storico del mese.",
    howToUse: [
      "Avvia e termina la timbratura dal pulsante principale.",
      "Filtra per periodo se devi verificare un giorno specifico.",
      "Per correzioni usa Workflow → richiesta rettifica."
    ]
  },
  workflow: {
    title: "Workflow — tue richieste",
    summary: "Invia e monitora ferie, permessi, malattia, remoto e trasferte.",
    howToUse: [
      "Crea una nuova richiesta indicando date e motivazione chiara.",
      "Le richieste in attesa possono essere annullate finché non sono approvate.",
      "Lo storico mostra l’esito e il responsabile che ha deciso."
    ]
  },
  expenses: {
    title: "Note spese",
    summary: "Carica ricevute e invia note spese per rimborso.",
    howToUse: [
      "Compila importo, data e categoria prima dell’invio.",
      "Allega la ricevuta in formato leggibile.",
      "Segui lo stato in Workflow se collegato ad approvazione."
    ]
  },
  payslips: {
    title: "Cedolini",
    summary: "I tuoi cedolini: apri il periodo e usa «Analizza» per punti chiave sulle voci del mese.",
    howToUse: [
      "Seleziona il mese e apri il dettaglio.",
      "Leggi la sezione «Perché queste trattenute» per capire IRPEF, INPS e altre voci.",
      "Segnala anomalie a HR tramite i canali ufficiali."
    ]
  },
  recruiting: {
    title: "Colloqui e selezione",
    summary: "Pipeline candidati per posizione: fasi, colloqui e avanzamento.",
    howToUse: [
      "Apri una posizione per vedere i candidati per colonna.",
      "Sposta il candidato solo quando il colloquio è completato.",
      "Usa le note per conmotioni al team HR."
    ]
  },
  "recruiting-integrations": {
    title: "Integrazioni recruiting",
    summary: "Collega LinkedIn a Nexa via webhook (Zapier/Make): le candidature entrano nella pipeline della posizione.",
    howToUse: [
      "Configura LINKEDIN_WEBHOOK_SECRET sul backend Render prima di attivare lo Zap.",
      "Copia l’URL webhook e imposta la firma HMAC nell’header indicato.",
      "Usa il test ingest per verificare jobId e permessi prima della produzione."
    ],
    bestPractices: [
      "Limita lo Zap a una posizione Nexa per jobId per evitare candidati sulla pipeline sbagliata.",
      "In assenza di integrazione, usa l’import manuale dalla pagina candidati."
    ]
  },
  "recruiting-onboarding": {
    title: "Onboarding candidati",
    summary: "Dopo l’offerta: wizard assunzione fino allo stato «onboarded».",
    howToUse: [
      "Avvia il wizard da un candidato in colonna onboarding.",
      "Completa tutti i passi prima di chiudere l’onboarding.",
      "I candidati già onboarded non compaiono più in lista attiva."
    ]
  },
  contracts: {
    title: "Contratti standard",
    summary: "Scegli un preset o crea un nuovo contratto da template.",
    howToUse: [
      "Parti da un preset (indeterminato, determinato, part-time…).",
      "Compila i campi obbligatori e apri l’editor per i blocchi testuali.",
      "Esporta in PDF solo dopo revisione legale."
    ]
  },
  scheduling: {
    title: "Turni",
    summary: "Pianifica turni e usa preset salvati per dipendente o gruppo.",
    howToUse: [
      "Crea un preset con orario tipo e impostalo come default.",
      "Assegna il turno sul calendario settimanale.",
      "I turni compaiono anche nel Calendario lavoro."
    ]
  },
  smartworking: {
    title: "Remote working",
    summary: "Richiedi periodi di lavoro da remoto (anche multi-giorno).",
    howToUse: [
      "Indica data inizio e fine del periodo.",
      "Descrivi dove lavori e come raggiungerti in emergenza.",
      "Il manager vede il riepilogo chiaro in approvazione."
    ]
  },
  "work-calendar": {
    title: "Calendario lavoro",
    summary: "Assenze, ferie e turni in vista mensile (anche eventi multi-giorno).",
    howToUse: [
      "Passa tra vista personale e team se hai permessi.",
      "I turni da Turni sono mostrati sul calendario.",
      "Clicca un giorno per dettaglio o nuova richiesta."
    ]
  },
  organigramma: {
    title: "Organigramma strutturale",
    summary: "Reparti e centri di costo; clic su una persona apre il pannello laterale.",
    howToUse: [
      "Espandi i nodi per navigare la struttura.",
      "Clicca un dipendente per scheda rapida senza uscire dalla pagina.",
      "Usa la ricerca se disponibile per trovare un nominativo."
    ]
  },
  "org-chart": {
    title: "Organigramma Visivo",
    summary: "Relazioni gerarchiche in vista ad albero.",
    howToUse: [
      "Zoom e pan per grandi organizzazioni.",
      "Clicca un nodo per aprire la scheda persona.",
      "Stampa o esporta se serve per riunioni."
    ]
  },
  "workforce-planning": {
    title: "Workforce planning",
    summary: "Scenari salvati su database, assunzioni (RAL, livello, assunzione) e «Genera analisi».",
    howToUse: [
      "Parti dallo scenario base, poi duplica per varianti.",
      "Salva lo scenario con nome e note sulle assunzioni.",
      "Esporta in PDF landscape per il comitato direttivo."
    ]
  },
  "manager-copilot": {
    title: "Pannello manager",
    summary: "Report diretti, approvazioni in sospeso e indicatori chiave.",
    howToUse: [
      "Controlla le approvazioni in cima alla pagina.",
      "Apri la scheda di un report per RAL e dati economici (se autorizzato).",
      "Collega a Retention per approfondire il team."
    ]
  },
  "nexa-hr-copilot": {
    title: "NEXA HR Copilot",
    summary:
      "Assistente task-oriented per HR e manager: brief giornaliero con pannelli Cosa fare oggi, Rischi persone, Assunzioni e Budget alert. I segnali inviati al modello sono pseudonimizzati.",
    howToUse: [
      "All’apertura viene generato un brief con azioni prioritarie ed evidenze numeriche.",
      "Usa la barra in basso per follow-up (es. priorità settimana, budget, retention).",
      "Ogni azione con link «Apri» porta al modulo operativo Nexa (approvazioni, recruiting, analytics)."
    ],
    bestPractices: [
      "Non digitare nominativi nel follow-up: usa ruoli o «il team».",
      "Per decisioni ufficiali usa sempre i moduli dedicati (Workflow, Budget, Recruiting)."
    ]
  },
  "hr-formazione": {
    title: "Formazione HR",
    summary: "Catalogo, assegnazioni e monitoraggio per dipendente con promemoria gentile.",
    howToUse: [
      "Seleziona un corso dal catalogo (contenuto reale con moduli).",
      "Assegna a tutti o a dipendenti selezionati con data obbligo.",
      "Monitora completamenti dalla panoramica."
    ]
  },
  formazione: {
    title: "I tuoi corsi",
    summary: "Completa i percorsi assegnati da HR entro la scadenza indicata.",
    howToUse: [
      "Clicca «Apri corso» per avviare il player con moduli e passi.",
      "Segui l'avanzamento e completa l'ultimo modulo per chiudere il corso.",
      "I corsi in ritardo sono evidenziati in rosso."
    ]
  },
  "personnel-budget": {
    title: "Budget personale",
    summary: "Budget mensile per CDC con righe pianificate extra incluse nei totali.",
    howToUse: [
      "Espandi un centro di costo per editare le celle budget.",
      "Definisci assunzioni/uscite per mese nelle assunzioni.",
      "Apri Analisi per confronto actual/budget/forecast."
    ]
  },
  "analytics-competenze": {
    title: "Competenze e coperture",
    summary: "Copertura ruoli (headcount, RAL) e gap competenze (livello richiesto vs media).",
    howToUse: [
      "Leggi i KPI, poi gestisci i gap di copertura con «Aggiungi gap».",
      "Matrice e Dettaglio per priorità skill; collegamenti budget in fondo pagina."
    ]
  },
  "analytics-retention": {
    title: "Retention e flight risk",
    summary: "Score 0–100 da segnali aggregati (assenze, tenure, pattern). Non è una decisione automatica.",
    howToUse: [
      "Leggi la legenda sul calcolo rule-v1 prima di agire.",
      "Filtra per centro di costo e genera insight solo su aggregati.",
      "Usa la chat analista per domande su trend, non su singoli nominativi nel modello."
    ],
    bestPractices: [
      "Score alto = priorità di colloquio, non esito disciplinare.",
      "Aggiorna i segnali con «Refresh» dopo cambi organico rilevanti."
    ]
  },
  "compensation-bench": {
    title: "Benchmark retribuzione",
    summary: "Configura ruolo e area, poi calcola fascia min/mediana/max RAL.",
    howToUse: [
      "Apri «Configura», poi «Calcola benchmark RAL».",
      "Compila località e opzionalmente CCNL di riferimento.",
      "Confronta l’esito con policy interne prima di offerte."
    ]
  },
  "personnel-budget-analysis": {
    title: "Analysis budget",
    summary: "Confronto actual / budget / forecast con soglie di varianza e note per categoria.",
    howToUse: [
      "Imposta soglie % e assolute per evidenziare scostamenti.",
      "Salva note per dipendente e categoria.",
      "Usa la vista YTD dal centro HR per periodi lunghi."
    ]
  },
  "hr-center-recap": {
    title: "Recap AI dipendenti",
    summary: "Elenco filtrabile con sintesi AI e link alla scheda dipendente.",
    howToUse: [
      "Applica filtri su centro di costo o team.",
      "Seleziona una riga per aprire la pagina personale.",
      "Genera il recap solo sul perimetro autorizzato."
    ]
  },
  "mappa-portale": {
    title: "Mappa del portale",
    summary: "Panoramica per sezione: trovi subito la funzione giusta.",
    howToUse: [
      "Apri la sezione che ti interessa.",
      "Scegli la tessera della funzione.",
      "Il menu laterale usa le stesse sezioni."
    ]
  }
};

export function getNexaPageHelp(key: NexaPageHelpKey): NexaPageHelpContent {
  return HELP[key];
}
