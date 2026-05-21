import type { Route } from "next";

/** Aree analisi Nexa richiedibili da HEBB AI for HR (ai-hub, brief HR). */
export type HebbAnalysisAreaId =
  | "economico"
  | "retention"
  | "competenze"
  | "operativo"
  | "produttivita"
  | "equita"
  | "carico_manager"
  | "what_if"
  | "budget"
  | "turnover";

export type HebbAnalysisAreaChip = {
  id: HebbAnalysisAreaId;
  labelIt: string;
  hintIt: string;
  /** Id accettato da `/analytics/advanced/:id/insight` (alias risolti lato backend). */
  orchestratorId: HebbAnalysisAreaId;
  href: Route;
};

export const HEBB_ANALYSIS_AREA_CHIPS: HebbAnalysisAreaChip[] = [
  {
    id: "economico",
    labelIt: "Economico",
    hintIt: "Budget vs actual vs forecast per centro di costo.",
    orchestratorId: "economico",
    href: "/analytics/advanced/economico" as Route
  },
  {
    id: "retention",
    labelIt: "Retention",
    hintIt: "Flight risk e fasce di score su aggregati.",
    orchestratorId: "retention",
    href: "/analytics/advanced/retention" as Route
  },
  {
    id: "competenze",
    labelIt: "Competenze",
    hintIt: "Gap competenze vs fabbisogno per ruolo.",
    orchestratorId: "competenze",
    href: "/analytics/advanced/competenze" as Route
  },
  {
    id: "operativo",
    labelIt: "Operativo",
    hintIt: "Approvazioni, lifecycle e backlog HR.",
    orchestratorId: "operativo",
    href: "/analytics/advanced/operativo" as Route
  },
  {
    id: "produttivita",
    labelIt: "Produttività",
    hintIt: "Ore, straordinari e assenze su aggregati.",
    orchestratorId: "produttivita",
    href: "/analytics/advanced/produttivita" as Route
  },
  {
    id: "equita",
    labelIt: "Equità retributiva",
    hintIt: "Spread retributivo per ruolo e centro di costo.",
    orchestratorId: "equita",
    href: "/analytics/advanced/equita-retributiva" as Route
  },
  {
    id: "carico_manager",
    labelIt: "Carico manager",
    hintIt: "Report diretti e colli di bottiglia approvazioni.",
    orchestratorId: "carico_manager",
    href: "/analytics/advanced/carico-manager" as Route
  },
  {
    id: "what_if",
    labelIt: "What-if organico",
    hintIt: "Scenari workforce base, crescita e freeze.",
    orchestratorId: "what_if",
    href: "/analytics/advanced/what-if" as Route
  },
  {
    id: "budget",
    labelIt: "Budget",
    hintIt: "Varianza massa retributiva e driver di scostamento.",
    orchestratorId: "budget",
    href: "/analytics/advanced/economico" as Route
  },
  {
    id: "turnover",
    labelIt: "Turnover",
    hintIt: "Trend retention e profili ad alto score.",
    orchestratorId: "turnover",
    href: "/analytics/advanced/retention" as Route
  }
];
