import {
  COWORK_AREA_LABELS,
  COWORK_DOMAIN_LABELS,
  COWORK_TOOL_CATALOG,
  COWORK_TOOL_LIST
} from "./cowork-tool-catalog";
import type { CoworkDomain } from "./cowork.types";

export {
  COWORK_AREA_LABELS,
  COWORK_DOMAIN_LABELS,
  COWORK_TOOL_CATALOG,
  COWORK_TOOL_LIST
};

export const COWORK_PLAN_TTL_MS = 24 * 60 * 60 * 1000;
export const COWORK_MAX_ROWS = 200;
export const SCHEMA_COWORK_PLAN = "ai_cowork_plan_v1";
export const SCHEMA_COWORK_PLANNER = "ai_cowork_planner_v2";

/** Sotto questa soglia il planner chiede chiarimenti (se needs_clarification o messaggio ambiguo). */
export const COWORK_PLANNER_CONFIDENCE_THRESHOLD = 0.55;

export const COWORK_CONVERSATION_HISTORY_MAX = 8;

export const COWORK_EXAMPLE_PROMPTS = [
  "Rinnova accordi smart working 2026 per tutti i dipendenti",
  "Estendi richieste smart working approvate fino al 31/12/2026",
  "Prenota sala riunioni domani 10:00-11:00 titolo Riunione HR",
  "Inserisci ferie 15-20 agosto per il team Marketing",
  "Approva tutte le richieste ferie in attesa nel perimetro",
  "Avvia offboarding per chi esce a fine mese"
] as const;

/** Domini con executor legacy dedicato (accordi / richieste / contratti). */
export const COWORK_EXECUTABLE_DOMAINS: CoworkDomain[] = [
  "smartworking_agreements",
  "smartworking_requests",
  "employment_contracts",
  "calendar",
  "time_off",
  "lifecycle",
  "generic",
  "compensation",
  "payroll",
  "personnel_budget",
  "recruiting",
  "third_party_licenses",
  "admin",
  "org"
];
