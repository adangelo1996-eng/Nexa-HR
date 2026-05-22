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

export type AdvancedAnalysisVisualId =
  | "economico"
  | "retention"
  | "competenze"
  | "operativo"
  | "produttivita"
  | "equita"
  | "carico_manager"
  | "what_if";

export type InsightChip = {
  id: string;
  labelIt: string;
  userMessageIt: string;
  insightFocus: string;
};

export type AdvancedAnalysisVisualProfile = {
  id: AdvancedAnalysisVisualId;
  icon: LucideIcon;
  accentClass: string;
  accentBgClass: string;
  accentBorderClass: string;
  heroKpiId: string;
  secondaryKpiIds: string[];
  chatPlaceholder: string;
  sectionLabels: {
    correlazioni: string;
    rischi: string;
    azioni7giorni: string;
    raccomandazioniHr: string;
  };
  insightChips: InsightChip[];
};

const CHIP_QUARTER: InsightChip = {
  id: "quarter",
  labelIt: "Confronta con trimestre precedente",
  userMessageIt:
    "Confronta i KPI correnti con il trimestre precedente sui soli aggregati disponibili. Evidenzia delta percentuali e centri di costo più impattati.",
  insightFocus: "quarter_compare"
};

const CHIP_RISKS: InsightChip = {
  id: "risks",
  labelIt: "Top 3 rischi",
  userMessageIt:
    "Elenca i 3 rischi operativi più rilevanti per questo perimetro, ordinati per impatto, citando numeri da facts.",
  insightFocus: "top_risks"
};

const CHIP_ACTIONS: InsightChip = {
  id: "actions",
  labelIt: "Azioni questa settimana",
  userMessageIt:
    "Proponi azioni concrete per HR e manager entro 7 giorni, massimo 5 passi prioritizzati sui dati aggregati.",
  insightFocus: "actions_this_week"
};

export const ADVANCED_ANALYSIS_VISUALS: Record<AdvancedAnalysisVisualId, AdvancedAnalysisVisualProfile> = {
  economico: {
    id: "economico",
    icon: Wallet,
    accentClass: "text-emerald-700 dark:text-emerald-300",
    accentBgClass: "bg-emerald-500/10",
    accentBorderClass: "border-emerald-500/30",
    heroKpiId: "variance",
    secondaryKpiIds: ["actual", "forecast", "cc"],
    chatPlaceholder: "Es. «Quali CC spiegano la varianza budget?»",
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
        id: "variance",
        labelIt: "Driver varianza CC",
        userMessageIt: "Quali centri di costo spiegano la varianza budget/actual del periodo?",
        insightFocus: "variance_drivers"
      }
    ]
  },
  retention: {
    id: "retention",
    icon: HeartPulse,
    accentClass: "text-rose-700 dark:text-rose-300",
    accentBgClass: "bg-rose-500/10",
    accentBorderClass: "border-rose-500/30",
    heroKpiId: "high",
    secondaryKpiIds: ["mid", "trend", "sample"],
    chatPlaceholder: "Es. «Quali cluster meritano stay interview?»",
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
        id: "playbook",
        labelIt: "Playbook colloqui",
        userMessageIt: "Prepara un playbook colloqui retention per cluster a score medio-alto.",
        insightFocus: "stay_interviews"
      }
    ]
  },
  competenze: {
    id: "competenze",
    icon: Puzzle,
    accentClass: "text-violet-700 dark:text-violet-300",
    accentBgClass: "bg-violet-500/10",
    accentBorderClass: "border-violet-500/30",
    heroKpiId: "gaps",
    secondaryKpiIds: ["roles", "top", "rows"],
    chatPlaceholder: "Es. «Dove conviene hiring vs formazione?»",
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
        id: "hire",
        labelIt: "Hiring vs formazione",
        userMessageIt: "Per i gap più ampi, distingui hiring esterno vs piano formazione interno.",
        insightFocus: "hire_vs_train"
      }
    ]
  },
  operativo: {
    id: "operativo",
    icon: ClipboardList,
    accentClass: "text-sky-700 dark:text-sky-300",
    accentBgClass: "bg-sky-500/10",
    accentBorderClass: "border-sky-500/30",
    heroKpiId: "pending",
    secondaryKpiIds: ["onb", "off", "exp"],
    chatPlaceholder: "Es. «Quale backlog smaltire per primo?»",
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
        id: "backlog",
        labelIt: "Priorità backlog",
        userMessageIt: "Quali tipi di approvazione richiedono intervento immediato?",
        insightFocus: "approval_backlog"
      }
    ]
  },
  produttivita: {
    id: "produttivita",
    icon: Activity,
    accentClass: "text-amber-700 dark:text-amber-300",
    accentBgClass: "bg-amber-500/10",
    accentBorderClass: "border-amber-500/30",
    heroKpiId: "abs",
    secondaryKpiIds: ["ot", "avgMin", "sw"],
    chatPlaceholder: "Es. «Dove ci sono hotspot assenze?»",
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
        id: "absence",
        labelIt: "Hotspot assenze",
        userMessageIt: "Individua pattern di assenze e straordinari anomali sui centri di costo.",
        insightFocus: "absence_hotspots"
      }
    ]
  },
  equita: {
    id: "equita",
    icon: Scale,
    accentClass: "text-indigo-700 dark:text-indigo-300",
    accentBgClass: "bg-indigo-500/10",
    accentBorderClass: "border-indigo-500/30",
    heroKpiId: "spread",
    secondaryKpiIds: ["median", "topRole", "roles"],
    chatPlaceholder: "Es. «Quali ruoli sono fuori banda?»",
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
        id: "spread",
        labelIt: "Ruoli fuori banda",
        userMessageIt: "Quali ruoli mostrano spread retributivo più elevato rispetto alla mediana?",
        insightFocus: "role_spread"
      }
    ]
  },
  carico_manager: {
    id: "carico_manager",
    icon: Users,
    accentClass: "text-orange-700 dark:text-orange-300",
    accentBgClass: "bg-orange-500/10",
    accentBorderClass: "border-orange-500/30",
    heroKpiId: "pend",
    secondaryKpiIds: ["top", "median", "reports"],
    chatPlaceholder: "Es. «Quali manager superano SLA approvazioni?»",
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
        id: "sla",
        labelIt: "SLA approvazioni",
        userMessageIt: "Quali cluster manager superano soglie di carico? Proponi SLA e delega.",
        insightFocus: "approval_sla"
      }
    ]
  },
  what_if: {
    id: "what_if",
    icon: GitBranch,
    accentClass: "text-teal-700 dark:text-teal-300",
    accentBgClass: "bg-teal-500/10",
    accentBorderClass: "border-teal-500/30",
    heroKpiId: "growth",
    secondaryKpiIds: ["hc", "mass", "freeze"],
    chatPlaceholder: "Es. «Quanto costa lo scenario crescita vs base?»",
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
        id: "delta",
        labelIt: "Delta scenari",
        userMessageIt: "Confronta scenari base, crescita e freeze su headcount e costo ultimo mese.",
        insightFocus: "scenario_delta"
      }
    ]
  }
};

export function resolveAdvancedVisual(analysisId: string): AdvancedAnalysisVisualProfile {
  const key = analysisId.trim().toLowerCase().replace(/-/g, "_") as AdvancedAnalysisVisualId;
  return ADVANCED_ANALYSIS_VISUALS[key] ?? ADVANCED_ANALYSIS_VISUALS.operativo;
}

export const HUB_ICON_MAP: Record<string, LucideIcon> = {
  wallet: Wallet,
  "heart-pulse": HeartPulse,
  puzzle: Puzzle,
  "clipboard-list": ClipboardList,
  activity: Activity,
  scale: Scale,
  users: Users,
  "git-branch": GitBranch
};

export const HUB_ACCENT_MAP: Record<string, string> = {
  emerald: "text-emerald-700 dark:text-emerald-300",
  rose: "text-rose-700 dark:text-rose-300",
  violet: "text-violet-700 dark:text-violet-300",
  sky: "text-sky-700 dark:text-sky-300",
  amber: "text-amber-700 dark:text-amber-300",
  indigo: "text-indigo-700 dark:text-indigo-300",
  orange: "text-orange-700 dark:text-orange-300",
  teal: "text-teal-700 dark:text-teal-300"
};
