/**
 * Testi guida per pagine HEBB AI for HR (popup aiuto in pagina).
 * La voce di menu «HEBB AI for HR» elenca le route che chiamano l’LLM (ai-hub, brief HRBP, manager, analytics)
 * quando l’LLM è attivo su backend e i permessi di navigazione coincidono.
 */

export const HEBB_AI_PAGE_KEYS = [
  "ai-hub",
  "payroll-hebb",
  "workforce-planning",
  "manager-copilot",
  "nexa-hr-copilot",
  "insights",
  "cost-calculator",
  "hr-center-analisi",
  "hr-center-budget-report",
  "hr-center-recap"
] as const;

export type HebbAiPageKey = (typeof HEBB_AI_PAGE_KEYS)[number];

export type HebbAiPageHelpContent = {
  title: string;
  summary: string;
  howToUse: string[];
  bestPractices?: string[];
};

const HELP: Record<HebbAiPageKey, HebbAiPageHelpContent> = {
  "ai-hub": {
    title: "HEBB AI for HR",
    summary:
      "Assistente e analisi per area Nexa (economico, retention, competenze, operativo, budget, turnover): chat, insight strutturati e controlli con pseudonimizzazione obbligatoria prima del modello.",
    howToUse: [
      "Inizia da «Chiedi» per domande in linguaggio naturale su ferie, cedolini, policy e percorsi nell’app.",
      "Usa i chip «Analisi per area Nexa» per insight su aggregati (permesso report HR); apri la pagina analisi dedicata per il dettaglio.",
      "Se hai permessi estesi, scegli l’ambito strutturato senza nominativi nel messaggio: nomi, cognomi ed email sono bloccati dalla policy di pseudonimizzazione."
    ],
    bestPractices: [
      "Non incollare codici fiscali, IBAN o dati sanitari se non necessari.",
      "Per operazioni ufficiali (approvazioni, invii) usa sempre i moduli dedicati (Workflow, Approvazioni)."
    ]
  },
  "payroll-hebb": {
    title: "Payroll",
    summary:
      "Area operativa per simulazione motore Hebb, generazione cedolini in bozza ed elaborazioni batch prima della pubblicazione ai dipendenti.",
    howToUse: [
      "Seleziona competenza e dipendente coerenti con le regole di sblocco (es. dal 5° giorno dopo fine mese).",
      "Per simulazioni usa le variabili del mese precedente salvo diversa impostazione nel batch.",
      "Rivedi sempre le bozze e convalida con il consulente del lavoro prima di pubblicare."
    ],
    bestPractices: [
      "Documenta override e periodi fuori standard.",
      "Dopo import o modifiche massive, ricalcola una bozza su campione prima del batch completo."
    ]
  },
  "workforce-planning": {
    title: "Workforce planning",
    summary:
      "Vista sintetica su organico e costo stipendi mensile, con proiezione a sei mesi. Puoi confrontare scenari rapidi o impostare un what-if con teste in più/meno, un importo fisso mensile e una scala percentuale sul forecast.",
    howToUse: [
      "Inizia da «Scenario base» per vedere i numeri attuali, poi prova «+2 FTE» o «Costi flat» per confronti immediati.",
      "Scegli «What-if libero» e modifica FTE, euro fissi al mese e percentuale sulla curva: il grafico si aggiorna mentre imposti i valori.",
      "Usa «Genera sintesi» per un testo di commento sui soli aggregati visibili; il raffinamento con AI compare solo se l’ambiente lo consente."
    ],
    bestPractices: [
      "Serve il permesso report HR: in caso di 403 contatta l’amministratore.",
      "Prima di riunioni di budget, verifica che anagrafica e RAL siano aggiornate."
    ]
  },
  "manager-copilot": {
    title: "HEBB AI for HR — Manager",
    summary:
      "Vista operativa per responsabili: approvazioni in sospeso nel proprio ambito, team diretto, remote working in attesa e (se permesso) indicatori turnover aggregati.",
    howToUse: [
      "Controlla i riquadri numerici e usa i link per approvare in Workflow o Remote working.",
      "Per approfondire il turnover del team apri Analisi — Retention (`/analytics/retention`) e genera insight su aggregati."
    ],
    bestPractices: [
      "Intervalli regolari (es. inizio settimana) riducono accumulo di richieste.",
      "Non condividere screenshot con dati individuali fuori dai canali aziendali."
    ]
  },
  "nexa-hr-copilot": {
    title: "HEBB AI for HR — Brief HRBP",
    summary:
      "Brief giornaliero con pannelli operativi e follow-up conversazionale su headcount, gap, retention, recruiting, approvazioni e budget — sempre con payload pseudonimizzato verso il modello.",
    howToUse: [
      "All’apertura viene generato un brief con azioni prioritarie ed evidenze numeriche.",
      "Usa la chat in basso per follow-up; non digitare nominativi (policy pseudonimizzazione).",
      "Ogni azione con link «Apri» porta al modulo operativo Nexa."
    ],
    bestPractices: [
      "Per decisioni ufficiali usa Workflow, Budget e Recruiting, non solo il brief AI.",
      "Incrocia sempre i segnali con dati verificati in app."
    ]
  },
  insights: {
    title: "Retention e flight risk",
    summary:
      "Analisi avanzata su `/analytics/retention`: KPI aggregati, insight strutturato (situazione, rischi, azioni 7 giorni) e chat analista su dati pseudonimizzati. Il vecchio percorso `/insights` reindirizza qui.",
    howToUse: [
      "Consulta i KPI in alto, poi «Genera insight AI» per la sintesi strutturata.",
      "Usa «Chiedi all'analista» per domande sul dataset di retention (senza nominativi nel modello).",
      "Per il dettaglio operativo con elenco score individuali, usa i report HR autorizzati o il pannello manager."
    ],
    bestPractices: [
      "Incrocia sempre i punteggi con colloqui e contesto: sono indicatori di attenzione.",
      "Richiede permesso report HR."
    ]
  },
  "cost-calculator": {
    title: "Calcolatore costo azienda / netto",
    summary:
      "Simulatore lato browser con logica dominio Italia: passa da RAL a costo azienda o da netto target a struttura retributiva indicativa.",
    howToUse: [
      "Scegli modalità RAL o netto mensile target, imposta ore settimanali e mensilità (12–14).",
      "Compila agevolazioni applicabili per vedere l’effetto sulle aliquote indicative."
    ],
    bestPractices: [
      "È uno strumento orientativo, non sostituisce consulenza fiscale o contrattuale.",
      "Esporta o annota gli input se devi confrontare più scenari."
    ]
  },
  "hr-center-analisi": {
    title: "Centro HR — Analisi costi",
    summary:
      "Aggregati per centro di costo e sintesi assistita su costi del personale. I dati sensibili passano dal gateway di pseudonimizzazione; l’output va validato in sede di budget.",
    howToUse: [
      "Premi «Esegui analisi» per ricalcolare aggregati e (se LLM attivo) generare la sintesi.",
      "Se sei responsabile di team senza permessi HR completi, il perimetro è limitato al tuo team e ai report diretti."
    ],
    bestPractices: [
      "Non usare cifre del modello come fonte contabile senza controllo.",
      "Per dettaglio nominale usa sempre moduli HR ufficiali."
    ]
  },
  "hr-center-budget-report": {
    title: "Centro HR — Report budget personale (LLM)",
    summary:
      "Analisi strutturale su aggregati budget personale (Actual / Budget / Forecast o confronto tra periodi), con esportazione Excel/PDF/PowerPoint. Richiede permessi budget come la sezione operativa.",
    howToUse: [
      "Scegli la modalità e il periodo, poi «Genera report LLM».",
      "Usa le esportazioni per allegare tabelle al consiglio o alla direzione; il testo del modello va sempre incrociato con i sistemi ufficiali."
    ],
    bestPractices: [
      "Le correlazioni proposte sono ipotesi da validare: non sostituiscono consulenza medica, legale o sindacale."
    ]
  },
  "hr-center-recap": {
    title: "Centro HR — Recap AI dipendenti",
    summary:
      "Suggerimenti su contratto, skills dichiarate e percorsi collegati per il perimetro selezionato (centri di costo, team, persone). Azioni rapide aprono moduli esistenti.",
    howToUse: [
      "Seleziona centri di costo, team e/o dipendenti, oppure lascia tutto vuoto per analizzare te stesso.",
      "Usa i link «Azioni suggerite» per approfondire in app."
    ],
    bestPractices: [
      "Tratta i suggerimenti come promemoria operativi, non come valutazioni legali."
    ]
  }
};

export function getHebbAiPageHelp(key: HebbAiPageKey): HebbAiPageHelpContent {
  return HELP[key];
}
