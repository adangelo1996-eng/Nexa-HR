import type { CoworkDomain } from "./cowork.types";

export const COWORK_PLAN_TTL_MS = 24 * 60 * 60 * 1000;
export const COWORK_MAX_ROWS = 200;
export const SCHEMA_COWORK_PLAN = "ai_cowork_plan_v1";
export const SCHEMA_COWORK_PLANNER = "ai_cowork_planner_v1";

/** Sotto questa soglia il planner chiede chiarimenti (se needs_clarification o messaggio ambiguo). */
export const COWORK_PLANNER_CONFIDENCE_THRESHOLD = 0.55;

export const COWORK_CONVERSATION_HISTORY_MAX = 8;

export const COWORK_DOMAIN_LABELS: Record<string, string> = {
  smartworking_agreements: "Accordi smart working annuali",
  smartworking_requests: "Estensione richieste smart working",
  employment_contracts: "Contratti di lavoro (clausola SW)",
  training: "Formazione (batch)",
  unknown: "Dominio non riconosciuto"
};

export const COWORK_EXAMPLE_PROMPTS = [
  "Rinnova accordi smart working 2026 per tutti i dipendenti",
  "Estendi richieste smart working approvate fino al 31/12/2026",
  "Prepara rinnovo contratti con clausola smart working per Marketing"
] as const;

/** Tool whitelisted per dominio — il planner può citarli; il server valida e idrata le righe. */
export const COWORK_TOOL_CATALOG: Record<
  string,
  { domain: CoworkDomain; labelIt: string; hintIt: string; executable: boolean }
> = {
  renew_agreements: {
    domain: "smartworking_agreements",
    labelIt: "Rinnovo accordi smart working annuali",
    hintIt: "create_agreement / renew_agreement per dipendente nel perimetro",
    executable: true
  },
  extend_approved_requests: {
    domain: "smartworking_requests",
    labelIt: "Estensione richieste smart working approvate",
    hintIt: "extend_request su richieste approved con endDay prima della data target",
    executable: true
  },
  update_contract_sw_clause: {
    domain: "employment_contracts",
    labelIt: "Contratti standard con clausola smart working",
    hintIt: "update_contract_sw_clause o create_contract_draft",
    executable: true
  },
  training_batch: {
    domain: "training",
    labelIt: "Assegnazione formazione batch",
    hintIt: "Dominio in arrivo — spiegare in chiarimento, nessuna riga applicabile",
    executable: false
  }
};

export const COWORK_EXECUTABLE_DOMAINS: CoworkDomain[] = [
  "smartworking_agreements",
  "smartworking_requests",
  "employment_contracts"
];
