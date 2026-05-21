import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ClipboardList,
  GitBranch,
  HeartPulse,
  Puzzle,
  Scale,
  Users,
  Wallet
} from "lucide-react";

export type AdvancedAnalysisId =
  | "economico"
  | "retention"
  | "competenze"
  | "operativo"
  | "produttivita"
  | "equita"
  | "carico_manager"
  | "what_if";

export type InsightChipConfig = {
  id: string;
  labelIt: string;
  userMessageIt: string;
};

export type AdvancedAnalysisPageProfile = {
  id: AdvancedAnalysisId;
  icon: LucideIcon;
  heroKpiId: string;
  heroKpiFallbackLabel: string;
  sectionLabels: {
    correlazioni: string;
    rischi: string;
    azioni7giorni: string;
    raccomandazioniHr: string;
  };
  insightChips: InsightChipConfig[];
  chatPlaceholder: string;
};

const CHIP_QUARTER: InsightChipConfig = {
  id: "quarter_compare",
  labelIt: "Confronta trimestre",
  userMessageIt:
    "Confronta i KPI correnti con il trimestre precedente sui soli aggregati disponibili. Evidenzia delta percentuali e centri di costo più impattati."
};

const CHIP_RISKS: InsightChipConfig = {
  id: "top_risks",
  labelIt: "Top 3 rischi",
  userMessageIt:
    "Elenca i 3 rischi operativi più rilevanti per questo perimetro, ordinati per impatto, citando numeri da facts."
};

const CHIP_ACTIONS: InsightChipConfig = {
  id: "actions_this_week",
  labelIt: "Azioni questa settimana",
  userMessageIt:
    "Proponi azioni concrete per HR e manager entro 7 giorni, massimo 5 passi prioritizzati sui dati aggregati."
};

export const ADVANCED_ANALYSIS_PAGE_PROFILES: Record<AdvancedAnalysisId, AdvancedAnalysisPageProfile> = {
  economico: {
    id: "economico",
    icon: Wallet,
    heroKpiId: "variance",
    heroKpiFallbackLabel: "Varianza budget",
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
    ],
    chatPlaceholder: "Es. «Quali CC spiegano la varianza oltre soglia?»"
  },
  retention: {
    id: "retention",
    icon: HeartPulse,
    heroKpiId: "high",
    heroKpiFallbackLabel: "Profili alto rischio",
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
    ],
    chatPlaceholder: "Es. «Quali cluster hanno priorità stay interview?»"
  },
  competenze: {
    id: "competenze",
    icon: Puzzle,
    heroKpiId: "gaps",
    heroKpiFallbackLabel: "Gap competenze",
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
    ],
    chatPlaceholder: "Es. «Quali ruoli richiedono hiring urgente?»"
  },
  operativo: {
    id: "operativo",
    icon: ClipboardList,
    heroKpiId: "pending",
    heroKpiFallbackLabel: "Approvazioni in coda",
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
    ],
    chatPlaceholder: "Es. «Come smaltire il backlog approvazioni?»"
  },
  produttivita: {
    id: "produttivita",
    icon: Activity,
    heroKpiId: "abs",
    heroKpiFallbackLabel: "Giorni assenza mese",
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
    ],
    chatPlaceholder: "Es. «Dove sono gli hotspot assenze/straordinari?»"
  },
  equita: {
    id: "equita",
    icon: Scale,
    heroKpiId: "spread",
    heroKpiFallbackLabel: "Spread retributivo",
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
    ],
    chatPlaceholder: "Es. «Quali ruoli sono fuori banda retributiva?»"
  },
  carico_manager: {
    id: "carico_manager",
    icon: Users,
    heroKpiId: "pend",
    heroKpiFallbackLabel: "Approvazioni pendenti",
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
    ],
    chatPlaceholder: "Es. «Quali cluster manager sono sovraccarichi?»"
  },
  what_if: {
    id: "what_if",
    icon: GitBranch,
    heroKpiId: "growth",
    heroKpiFallbackLabel: "Scenario crescita",
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
    ],
    chatPlaceholder: "Es. «Confronta scenari base vs crescita vs freeze»"
  }
};

const ANALYSIS_ID_ALIASES: Record<string, AdvancedAnalysisId> = {
  "carico-manager": "carico_manager",
  "equita-retributiva": "equita",
  whatif: "what_if",
  "what-if": "what_if",
  budget: "economico",
  turnover: "retention"
};

export function normalizeAdvancedAnalysisId(raw: string): AdvancedAnalysisId {
  const key = raw.trim().toLowerCase().replace(/-/g, "_");
  if (key in ADVANCED_ANALYSIS_PAGE_PROFILES) {
    return key as AdvancedAnalysisId;
  }
  const alias = ANALYSIS_ID_ALIASES[raw.trim().toLowerCase()] ?? ANALYSIS_ID_ALIASES[key.replace(/_/g, "-")];
  return alias ?? "economico";
}

export function getAdvancedAnalysisPageProfile(analysisId: string): AdvancedAnalysisPageProfile {
  const id = normalizeAdvancedAnalysisId(analysisId);
  return ADVANCED_ANALYSIS_PAGE_PROFILES[id];
}
