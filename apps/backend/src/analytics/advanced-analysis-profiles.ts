/** Profili distinti per le 8 analisi avanzate: prompt LLM, chip insight, metadati hub. */

export type AdvancedAnalysisId =
  | "economico"
  | "retention"
  | "competenze"
  | "operativo"
  | "produttivita"
  | "equita"
  | "carico_manager"
  | "what_if";

export type InsightFocusId = "quarter_compare" | "top_risks" | "actions_this_week" | string;

export type AdvancedAnalysisProfile = {
  id: AdvancedAnalysisId;
  iconKey: string;
  accentKey: string;
  heroKpiId: string;
  secondaryKpiIds: string[];
  llmPromptHint: string;
  chatPersona: string;
  sectionLabels: {
    correlazioni: string;
    rischi: string;
    azioni7giorni: string;
    raccomandazioniHr: string;
  };
  insightChips: Array<{
    id: InsightFocusId;
    labelIt: string;
    userMessageIt: string;
  }>;
};

const CHIP_QUARTER = {
  id: "quarter_compare" as const,
  labelIt: "Confronta con trimestre precedente",
  userMessageIt:
    "Confronta i KPI correnti con il trimestre precedente sui soli aggregati disponibili. Evidenzia delta percentuali e centri di costo più impattati."
};

const CHIP_RISKS = {
  id: "top_risks" as const,
  labelIt: "Top 3 rischi",
  userMessageIt:
    "Elenca i 3 rischi operativi più rilevanti per questo perimetro, ordinati per impatto, citando numeri da facts."
};

const CHIP_ACTIONS = {
  id: "actions_this_week" as const,
  labelIt: "Azioni questa settimana",
  userMessageIt:
    "Proponi azioni concrete per HR e manager entro 7 giorni, massimo 5 passi prioritizzati sui dati aggregati."
};

export const ADVANCED_ANALYSIS_PROFILES: Record<AdvancedAnalysisId, AdvancedAnalysisProfile> = {
  economico: {
    id: "economico",
    iconKey: "wallet",
    accentKey: "emerald",
    heroKpiId: "variance",
    secondaryKpiIds: ["actual", "forecast", "cc"],
    llmPromptHint:
      "Ruolo CFO/HR controller: enfatizza leve budget (actual vs budget vs forecast), driver di varianza per categoria e centro di costo, impatto su massa retributiva e FTE. " +
      "Correlazioni tra varianze oltre soglia e trend forecast. Raccomandazioni per governance budget e checkpoint con controller.",
    chatPersona: "consulente economico del personale orientato al CFO",
    sectionLabels: {
      correlazioni: "Driver di varianza",
      rischi: "Esposizioni economiche",
      azioni7giorni: "Leve CFO — prossimi 7 giorni",
      raccomandazioniHr: "Governance budget HR"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "variance_drivers",
        labelIt: "Driver varianza CC",
        userMessageIt:
          "Quali centri di costo e categorie spiegano la varianza budget/actual del periodo? Ordina per impatto EUR."
      }
    ]
  },
  retention: {
    id: "retention",
    iconKey: "heart-pulse",
    accentKey: "rose",
    heroKpiId: "high",
    secondaryKpiIds: ["mid", "trend", "sample"],
    llmPromptHint:
      "Focus retention e flight risk: distribuzione score, trend settimanale, cluster per centro di costo. " +
      "Azioni7giorni = playbook colloqui mirati (stay interview, ascolto, piani sviluppo) senza nominativi. " +
      "Correlazioni tra score alto e tenure/assenze se presenti in facts.",
    chatPersona: "HRBP specialista in retention e people analytics",
    sectionLabels: {
      correlazioni: "Segnali e cluster",
      rischi: "Flight risk prioritario",
      azioni7giorni: "Playbook colloqui (7 giorni)",
      raccomandazioniHr: "Retention governance"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "stay_interviews",
        labelIt: "Playbook colloqui",
        userMessageIt:
          "Prepara un playbook di colloqui retention per i cluster a score medio-alto: domande, owner HRBP, frequenza suggerita."
      }
    ]
  },
  competenze: {
    id: "competenze",
    iconKey: "puzzle",
    accentKey: "violet",
    heroKpiId: "gaps",
    secondaryKpiIds: ["roles", "top", "rows"],
    llmPromptHint:
      "Focus gap competenze vs fabbisogno ruolo: priorità hiring vs formazione, gap massimi per ruolo/skill, headcount coinvolto. " +
      "Matrice raccomandazioni: upskilling interno vs recruiting esterno.",
    chatPersona: "consulente talent management e L&D",
    sectionLabels: {
      correlazioni: "Gap e copertura ruoli",
      rischi: "Rischi skill coverage",
      azioni7giorni: "Piano hiring / formazione",
      raccomandazioniHr: "Governance competenze"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "hire_vs_train",
        labelIt: "Hiring vs formazione",
        userMessageIt:
          "Per i gap più ampi, distingui dove conviene hiring esterno vs piano formazione interno, con priorità per ruolo."
      }
    ]
  },
  operativo: {
    id: "operativo",
    iconKey: "clipboard-list",
    accentKey: "sky",
    heroKpiId: "pending",
    secondaryKpiIds: ["onb", "off", "exp"],
    llmPromptHint:
      "Briefing operativo HR giornaliero: code approvazioni, onboarding/offboarding, backlog spese, alert aperti, cicli processo. " +
      "Azioni7giorni = smaltimento backlog e SLA interni. Correlazioni tra volumi approvazioni e lifecycle.",
    chatPersona: "HR operations manager",
    sectionLabels: {
      correlazioni: "Backlog e flussi",
      rischi: "Colli operativi",
      azioni7giorni: "Briefing HRBP — 7 giorni",
      raccomandazioniHr: "Runbook operativo HR"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "approval_backlog",
        labelIt: "Priorità backlog",
        userMessageIt:
          "Quali tipi di approvazione e volumi richiedono intervento immediato? Suggerisci ordine di smaltimento."
      }
    ]
  },
  produttivita: {
    id: "produttivita",
    iconKey: "activity",
    accentKey: "amber",
    heroKpiId: "abs",
    secondaryKpiIds: ["ot", "avgMin", "sw"],
    llmPromptHint:
      "Produttività e assenteismo: ore medie, straordinari, giorni assenza e smartworking su aggregati. " +
      "Correlazioni con flight risk count se in facts. Segnali anomalia presenze, non diagnosi mediche.",
    chatPersona: "analista workforce productivity",
    sectionLabels: {
      correlazioni: "Presenze e ore",
      rischi: "Anomalie produttività",
      azioni7giorni: "Interventi manager — 7 giorni",
      raccomandazioniHr: "Policy presenze e benessere"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "absence_hotspots",
        labelIt: "Hotspot assenze",
        userMessageIt:
          "Individua pattern di assenze e straordinari anomali sui centri di costo disponibili in facts."
      }
    ]
  },
  equita: {
    id: "equita",
    iconKey: "scale",
    accentKey: "indigo",
    heroKpiId: "spread",
    secondaryKpiIds: ["median", "topRole", "roles"],
    llmPromptHint:
      "Equità retributiva interna: spread per ruolo, mediana globale, rapporto max/min. " +
      "Segnali disparità da validare con policy e CCNL — nessuna indicazione legale vincolante. " +
      "Raccomandazioni per audit retributivo e allineamento bande.",
    chatPersona: "compensation analyst interno",
    sectionLabels: {
      correlazioni: "Spread e bande ruolo",
      rischi: "Segnali disparità",
      azioni7giorni: "Audit equità — 7 giorni",
      raccomandazioniHr: "Governance retribuzione"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "role_spread",
        labelIt: "Ruoli fuori banda",
        userMessageIt:
          "Quali ruoli mostrano spread retributivo più elevato rispetto alla mediana? Suggerisci verifiche policy."
      }
    ]
  },
  carico_manager: {
    id: "carico_manager",
    iconKey: "users",
    accentKey: "orange",
    heroKpiId: "pend",
    secondaryKpiIds: ["top", "median", "reports"],
    llmPromptHint:
      "Carico manager: report diretti, approvazioni in coda, cluster a load score elevato, SLA approvazioni e cicli processo. " +
      "Azioni7giorni = delega, riduzione span of control, escalation backlog approvazioni.",
    chatPersona: "consulente organizzazione e people manager effectiveness",
    sectionLabels: {
      correlazioni: "Span e code approvazioni",
      rischi: "Bottleneck manager",
      azioni7giorni: "SLA approvazioni — 7 giorni",
      raccomandazioniHr: "Redesign carico manager"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "approval_sla",
        labelIt: "SLA approvazioni",
        userMessageIt:
          "Quali cluster manager superano soglie di carico e approvazioni pendenti? Proponi SLA e azioni di delega."
      }
    ]
  },
  what_if: {
    id: "what_if",
    iconKey: "git-branch",
    accentKey: "teal",
    heroKpiId: "growth",
    secondaryKpiIds: ["hc", "mass", "freeze"],
    llmPromptHint:
      "Scenario what-if organico: confronto base vs crescita vs freeze su headcount e costo ultimo mese. " +
      "Delta percentuali tra scenari, implicazioni budget e link al workforce planning. Non inventare assunzioni non in facts.",
    chatPersona: "workforce planning analyst",
    sectionLabels: {
      correlazioni: "Delta scenari",
      rischi: "Impatto budget scenari",
      azioni7giorni: "Decisioni scenario — 7 giorni",
      raccomandazioniHr: "Allineamento workforce planning"
    },
    insightChips: [
      CHIP_QUARTER,
      CHIP_RISKS,
      CHIP_ACTIONS,
      {
        id: "scenario_delta",
        labelIt: "Delta scenari",
        userMessageIt:
          "Confronta scenari base, crescita e freeze: headcount, costo ultimo mese e delta percentuale vs base."
      }
    ]
  }
};

export type AnalyticsScopeFilters = {
  costCenterScope?: string;
  teamScope?: string;
  periodScope?: string;
  insightFocus?: InsightFocusId;
};

export function resolveAdvancedProfile(analysisId: string): AdvancedAnalysisProfile | null {
  const key = analysisId.trim().toLowerCase().replace(/-/g, "_") as AdvancedAnalysisId;
  return ADVANCED_ANALYSIS_PROFILES[key] ?? null;
}

export function insightFocusPromptHint(focus?: string): string | undefined {
  switch (focus) {
    case "quarter_compare":
      return "InsightFocus: confronto trimestre corrente vs trimestre precedente sui KPI in facts; quantifica delta % dove possibile.";
    case "top_risks":
      return "InsightFocus: esattamente 3 rischi operativi prioritari, ordinati per impatto, ciascuno con dato numerico di supporto.";
    case "actions_this_week":
      return "InsightFocus: azioni7giorni devono essere passi concreti per questa settimana, non generici.";
    case "variance_drivers":
      return "InsightFocus: driver varianza budget per centro di costo e categoria.";
    case "stay_interviews":
      return "InsightFocus: playbook colloqui retention strutturato (domande, frequenza, owner HRBP).";
    case "hire_vs_train":
      return "InsightFocus: matrice hiring vs formazione per gap prioritari.";
    case "approval_backlog":
      return "InsightFocus: priorità smaltimento backlog approvazioni per tipo.";
    case "absence_hotspots":
      return "InsightFocus: hotspot assenze/straordinari su aggregati.";
    case "role_spread":
      return "InsightFocus: ruoli con spread retributivo anomalo vs mediana.";
    case "approval_sla":
      return "InsightFocus: SLA approvazioni e delega per cluster manager sovraccarichi.";
    case "scenario_delta":
      return "InsightFocus: delta quantitativo tra scenari workforce.";
    default:
      return focus ? `InsightFocus: ${focus}` : undefined;
  }
}
