/**
 * Testi guida per pagine HEBB AI for HR (popup aiuto in pagina).
 * Support assistente: `/hebb-ai-support` · Analytics: `/analytics` · Copilot: `/nexa-hr-copilot` · Mate: `/hr/cowork`.
 */

export const HEBB_AI_PAGE_KEYS = [
  "ai-hub",
  "hebb-ai-support",
  "payroll-hebb",
  "workforce-planning",
  "manager-copilot",
  "nexa-hr-copilot",
  "hr-cowork",
  "insights",
  "cost-calculator",
  "hr-center-analisi",
  "hr-center-budget-report",
  "hr-center-recap",
  "hiring-simulator"
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
    title: "AI Analytics (hub)",
    summary: "Percorso storico `/ai-hub`: reindirizza all’hub analisi su `/analytics` (permesso `nexa.reports_hr:read`).",
    howToUse: ["Apri Hub Analytics o Advanced analysis dalla mappa portale."],
    bestPractices: ["Non usare la chat assistente qui: è su Hebb AI Support."]
  },
  "hebb-ai-support": {
    title: "Hebb AI Support",
    summary:
      "Assistente HR, interrogazioni guidate, controlli e triage richieste — con pseudonimizzazione obbligatoria. Richiede `nexa.ai_assistant:read`.",
    howToUse: [
      "«Chiedi» per ferie, cedolini, policy e percorsi nell’app.",
      "«I tuoi numeri» per query NL approvate; «Controlli» e triage per classificare messaggi.",
      "Per brief operativo HRBP usa NEXA HR Copilot; per insight analitici usa AI Analytics."
    ],
    bestPractices: [
      "Non incollare codici fiscali, IBAN o dati sanitari se non necessari.",
      "Per operazioni ufficiali usa Workflow, Approvazioni o Hebb AI Mate (lifecycle)."
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
  "hr-cowork": {
    title: "Hebb AI Mate",
    summary:
      "Batch HR con linguaggio naturale e conferma obbligatoria (HITL). I nominativi compaiono solo in preview autorizzata; verso OpenAI transitano conteggi e aggregati.",
    howToUse: [
      "Nel pannello Vault documenti scegli la persona, scarica o proponi una modifica con approvazione HITL.",
      "Genera un piano dalla chat, rivedi ogni riga nella preview operazioni.",
      "Deseleziona le eccezioni, poi applica solo le righe confermate.",
      "Domini: documenti vault, accordi SW, richieste, contratti e altri tool Cowork."
    ],
    bestPractices: [
      "Richiede permessi lifecycle HR esteso (nexa.lifecycle:write per applicare).",
      "I piani scadono dopo 24 ore: rigenera se necessario."
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
  },
  "hiring-simulator": {
    title: "Simulatore assunzione",
    summary:
      "Consulente AI su criteri contrattuali, agevolazioni e benefit; il motore calcola costo azienda e netto in tempo reale.",
    howToUse: [
      "Compila i criteri contrattuali e avvia la fase consulenza per verificare agevolazioni e benefit.",
      "Salva scenari riutilizzabili e confronta l'impatto sul budget personale."
    ],
    bestPractices: [
      "I calcoli sono indicativi: valida sempre con payroll e consulenza del lavoro prima di formalizzare l'assunzione."
    ]
  }
};

export function getHebbAiPageHelp(key: HebbAiPageKey): HebbAiPageHelpContent {
  return HELP[key];
}
