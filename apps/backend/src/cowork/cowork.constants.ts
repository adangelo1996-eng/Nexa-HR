export const COWORK_PLAN_TTL_MS = 24 * 60 * 60 * 1000;
export const COWORK_MAX_ROWS = 200;
export const SCHEMA_COWORK_PLAN = "ai_cowork_plan_v1";

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
