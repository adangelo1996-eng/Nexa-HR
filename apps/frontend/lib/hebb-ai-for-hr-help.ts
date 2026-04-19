/**
 * Testi guida per pagine con esperienza «Centro AI HR» (popup aiuto in pagina).
 * La voce di menu «HEBB AI for HR» elenca le route che chiamano l’LLM (Centro AI, workforce planning, turnover)
 * quando l’LLM è attivo su backend e i permessi di navigazione coincidono.
 */

export const HEBB_AI_PAGE_KEYS = [
  "ai-hub",
  "payroll-hebb",
  "workforce-planning",
  "manager-copilot",
  "insights",
  "cost-calculator",
  "hr-center-analisi",
  "hr-center-contratti",
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
    title: "Assistente AI (chat)",
    summary:
      "Chat conversazionale su Nexa HR: orientamento sulla piattaforma, numeri aggregati in sicurezza, controlli e triage delle richieste, con dati sensibili gestiti secondo le policy aziendali.",
    howToUse: [
      "Inizia da «Chiedi» per domande in linguaggio naturale su ferie, cedolini, policy e percorsi nell’app.",
      "Se hai permessi estesi, scegli l’ambito dati indicato (es. organizzazione) senza inserire nominativi nel testo: il sistema applica i filtri e l’anonimizzazione.",
      "Usa i suggerimenti rapidi e la sezione «Capire una richiesta» per classificare messaggi e capire dove agire."
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
    title: "Pannello manager",
    summary:
      "Vista operativa per responsabili: approvazioni in sospeso nel proprio ambito, team diretto, smart working in attesa e (se permesso) indicatori turnover aggregati.",
    howToUse: [
      "Controlla i riquadri numerici e usa i link per approvare in Workflow o Smart working.",
      "Per approfondire il turnover del team apri Turnover e retention e aggiorna gli snapshot se necessario."
    ],
    bestPractices: [
      "Intervalli regolari (es. inizio settimana) riducono accumulo di richieste.",
      "Non condividere screenshot con dati individuali fuori dai canali aziendali."
    ]
  },
  insights: {
    title: "Turnover e retention",
    summary:
      "Elenco ordinato per rischio sintetico (non è una diagnosi medica o legale), con trend nel tempo. Il filtro centri di costo mostra il nome del reparto come in anagrafica aziendale.",
    howToUse: [
      "Dopo cambi importanti in anagrafica premi «Aggiorna segnali» per allineare i punteggi.",
      "Filtra per centro di costo per limitare la vista al tuo perimetro.",
      "«Genera sintesi» produce un commento su medie e trend; il passaggio in AI è opzionale e solo se abilitato in ambiente."
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
  "hr-center-contratti": {
    title: "Centro HR — Contratti (LLM)",
    summary:
      "Bozza strutturata partendo dai template «Contratti standard» presenti in anagrafica. Anteprima HTML stampabile; testo da verificare con HR e legal.",
    howToUse: [
      "Genera la bozza e leggi la checklist nella sintesi.",
      "Usa «Apri anteprima stampa» per salvare PDF dal browser se necessario."
    ],
    bestPractices: [
      "Watermark e disclaimer sono obbligatori: nessun documento vincolante senza revisione umana."
    ]
  },
  "hr-center-recap": {
    title: "Centro HR — Recap dipendente",
    summary:
      "Suggerimenti su contratto, skills dichiarate e percorsi collegati. Azioni rapide aprono moduli esistenti; nessuna scrittura automatica su dati sensibili.",
    howToUse: [
      "Lascia vuoto l’ID utente per te stesso, oppure incolla l’ID di un membro del team se sei responsabile.",
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
