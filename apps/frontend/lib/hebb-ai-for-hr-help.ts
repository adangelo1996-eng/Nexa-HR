/**
 * Testi guida per pagine con esperienza «Centro AI HR» (popup aiuto in pagina).
 * La voce di menu «HEBB AI for HR» elenca solo il Centro AI quando l’LLM è attivo su backend.
 */

export const HEBB_AI_PAGE_KEYS = [
  "ai-hub",
  "payroll-hebb",
  "workforce-planning",
  "manager-copilot",
  "insights",
  "payroll-sim-assisted",
  "cost-calculator",
  "skills-gap",
  "hr-alerts",
  "process-bottlenecks",
  "hitl-proposals"
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
    title: "Centro AI HR",
    summary:
      "Hub conversazionale e strumenti intelligenti su Nexa HR: orientamento sulla piattaforma, numeri aggregati in sicurezza, controlli e triage delle richieste, con dati sensibili gestiti secondo le policy aziendali.",
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
    title: "Hebb — Payroll",
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
  "payroll-sim-assisted": {
    title: "Simulatore cedolino assistito",
    summary:
      "What-if sul motore payroll italiano Nexa (stesso nucleo di Hebb — Payroll) senza persistere il cedolino; elaborazione solo backend, senza invio a modelli esterni.",
    howToUse: [
      "Imposta periodo (YYYY-MM), opzionale lordo mensile override e flag variabili mese precedente.",
      "Esegui «Calcola simulazione» e confronta righe e netto con ipotesi alternative."
    ],
    bestPractices: [
      "Usa valori di prova realistici rispetto al CCNL e alle mensilità dell’azienda.",
      "Per decisioni vincolanti resta il perimetro Hebb — Payroll e il consulente."
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
  "skills-gap": {
    title: "Skills gap (ruoli)",
    summary:
      "Report v1 che confronta fabbisogno competenze per ruolo con livelli medi dichiarati sui dipendenti, collegato a recruiting e catalogo skills.",
    howToUse: [
      "Popola prima taxonomia `hr_skills`, mapping utenti e requisiti ruolo (via amministrazione/SQL).",
      "Opzionalmente filtra per `roleId` per focalizzare un ruolo.",
      "Usa i gap prioritari per piani formazione o hiring."
    ],
    bestPractices: [
      "Mantieni livelli e requisiti aggiornati dopo cambi organizzativi.",
      "Richiede permesso report HR."
    ]
  },
  "hr-alerts": {
    title: "Alert HR",
    summary:
      "Elenco alert generati da regole su metriche HR (es. turnover); deduplicazione su chiavi e notifiche in-app opzionali.",
    howToUse: [
      "Esegui «Esegui regole» per valutare le condizioni e creare/aggiornare alert aperti.",
      "Gestisci acknowledge sugli elementi che hai preso in carico.",
      "Monitora gravità (info, warning, critical) per priorità di intervento."
    ],
    bestPractices: [
      "Definisci con HR quali soglie sono accettabili prima di allargare le notifiche.",
      "Richiede permesso report HR."
    ]
  },
  "process-bottlenecks": {
    title: "Ottimizzazione processi",
    summary:
      "Metriche di ciclo su ferie, spese e onboarding più catalogo eventi verso suite esterne (definizioni e aggregati, senza push automatico).",
    howToUse: [
      "Leggi le note versione v0 sulle metriche disponibili.",
      "Incrocia tempi medi con volumi di richieste per individuare colli di bottiglia.",
      "Usa il catalogo eventi per allineare integrazioni future."
    ],
    bestPractices: [
      "Confronta periodi omogenei (stesso calendario lavoro).",
      "Richiede permesso report HR per i dati aggregati."
    ]
  },
  "hitl-proposals": {
    title: "Code worker HITL",
    summary:
      "Coda di proposte strutturate (Human-in-the-Loop): un revisore umano approva o rifiuta prima di azioni operative a basso rischio.",
    howToUse: [
      "Crea bozze con tipo (`kind`) e motivazione chiara per il revisore.",
      "Esamina lo stato (proposed / approved / rejected) e documenta le decisioni."
    ],
    bestPractices: [
      "Limita i tipi di proposta a workflow già definiti e a basso impatto.",
      "Nessuna modifica automatica a cedolini o contratti da questa coda senza processo esterno."
    ]
  }
};

export function getHebbAiPageHelp(key: HebbAiPageKey): HebbAiPageHelpContent {
  return HELP[key];
}
