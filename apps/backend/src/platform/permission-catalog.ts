/**
 * Catalogo permessi Nexa HR / ecosistema Synapse.
 */

export type PermissionCategoryId = "nexa_hr" | "plasticity" | "soma" | "hub";

export interface PermissionDefinition {
  id: string;
  category: PermissionCategoryId;
  resourceKey: string;
  suffix: "read" | "write";
  labelIt: string;
  descriptionReadIt: string;
  descriptionWriteIt: string;
}

const cat = (id: PermissionCategoryId, resourceKey: string, labelIt: string, dr: string, dw: string): PermissionDefinition[] => [
  {
    id: `nexa.${resourceKey}:read`,
    category: id,
    resourceKey,
    suffix: "read",
    labelIt,
    descriptionReadIt: dr,
    descriptionWriteIt: dw
  },
  {
    id: `nexa.${resourceKey}:write`,
    category: id,
    resourceKey,
    suffix: "write",
    labelIt,
    descriptionReadIt: dr,
    descriptionWriteIt: dw
  }
];

export const NEXA_HR_PERMISSIONS: PermissionDefinition[] = [
  ...cat(
    "nexa_hr",
    "attendance",
    "Timbrature e presenze",
    "Consultare timbrature, riepiloghi e stato presenza.",
    "Registrare timbrature entrata/uscita e aggiornare lo stato presenza."
  ),
  ...cat(
    "nexa_hr",
    "leaves",
    "Ferie e permessi",
    "Vedere piani ferie, saldi e richieste.",
    "Creare o modificare richieste ferie e permessi."
  ),
  ...cat(
    "nexa_hr",
    "sickness",
    "Malattia e certificati",
    "Consultare eventi di malattia e allegati.",
    "Inserire o aggiornare comunicazioni e certificati di malattia."
  ),
  ...cat(
    "nexa_hr",
    "approvals",
    "Approvazioni",
    "Vedere le richieste in attesa di approvazione.",
    "Approvare o rifiutare richieste (ferie, malattia, ecc.)."
  ),
  ...cat(
    "nexa_hr",
    "payslips",
    "Cedolini",
    "Consultare cedolini e dettagli retributivi consentiti.",
    "Operazioni su cedolini se previsto."
  ),
  ...cat(
    "nexa_hr",
    "org",
    "Organigramma",
    "Visualizzare struttura organizzativa e collegamenti.",
    "Modificare viste o dati organizzativi se previsto."
  ),
  ...cat(
    "nexa_hr",
    "payroll",
    "Payroll e calcoli",
    "Accedere a simulazioni e report payroll consentiti.",
    "Eseguire calcoli o ricalcoli payroll se previsto."
  ),
  ...cat(
    "nexa_hr",
    "admin_users",
    "Amministrazione utenti",
    "Elencare e consultare anagrafiche utente.",
    "Creare, modificare o disattivare utenti."
  ),
  ...cat(
    "nexa_hr",
    "admin_roles",
    "Amministrazione ruoli",
    "Consultare ruoli e permessi.",
    "Creare o modificare ruoli e assegnazioni permessi."
  ),
  ...cat(
    "nexa_hr",
    "admin_cost_centers",
    "Centri di costo",
    "Consultare centri di costo.",
    "Creare o modificare centri di costo."
  ),
  ...cat(
    "nexa_hr",
    "import",
    "Import dati",
    "Scaricare template e vedere lo storico import.",
    "Eseguire import massivi da file."
  ),
  ...cat(
    "nexa_hr",
    "documents",
    "Documenti e vault",
    "Consultare documenti aziendali e personali consentiti.",
    "Caricare o aggiornare documenti nel vault."
  ),
  ...cat(
    "nexa_hr",
    "shifts",
    "Turni e pianificazione",
    "Consultare turni e calendari lavoro.",
    "Creare o modificare turni e assegnazioni."
  ),
  ...cat(
    "nexa_hr",
    "work_calendar",
    "Calendario lavoro",
    "Vedere calendario team: turni, smart working, ferie, ROL e festività.",
    "Gestire viste o integrazioni calendario se previsto."
  ),
  ...cat(
    "nexa_hr",
    "expenses",
    "Note spese e rimborsi",
    "Consultare note spese e stato rimborso.",
    "Creare o inviare note spese e rimborsi chilometrici."
  ),
  ...cat(
    "nexa_hr",
    "lifecycle",
    "Onboarding e offboarding",
    "Consultare stato percorsi HR lifecycle.",
    "Gestire checklist, contratti e asset onboarding/offboarding."
  ),
  ...cat(
    "nexa_hr",
    "reports_hr",
    "Report e analytics HR",
    "Consultare dashboard, export e indicatori HR.",
    "Avviare export o configurazioni reporting."
  ),
  ...cat(
    "nexa_hr",
    "personnel_budget",
    "Budget personale",
    "Consultare budget/ consuntivo personale per reparto e mese.",
    "Modificare pianificazione budget e ordinamento reparti."
  ),
  ...cat(
    "nexa_hr",
    "innovation",
    "Innovation (AI/ATS/ML)",
    "Consultare capacità e job innovation.",
    "Avviare pipeline AI o integrazioni innovation."
  ),
  ...cat(
    "nexa_hr",
    "benefits",
    "Benefici",
    "Consultare benefit e welfare.",
    "Gestire benefit e assegnazioni."
  ),
  ...cat(
    "nexa_hr",
    "consultant",
    "Consulenti HR",
    "Accesso in lettura delegato per consulenti.",
    "Operazioni consentite in ambito consulenza."
  ),
  ...cat(
    "nexa_hr",
    "recruiting",
    "Recruiting e selezione",
    "Consultare posizioni, candidati e pipeline.",
    "Gestire posizioni, candidati, fasi pipeline e decisioni."
  ),
  ...cat(
    "nexa_hr",
    "standard_contracts",
    "Contratti standard HR",
    "Consultare bozze e contratti a blocchi.",
    "Creare, modificare ed eliminare contratti standard e stati di approvazione."
  ),
  ...cat(
    "nexa_hr",
    "third_party_licenses",
    "Utenze e licenze terze",
    "Consultare inventario licenze (Power BI, ChatGPT, ecc.) e assegnazioni.",
    "Gestire catalogo licenze, costi e assegnazioni agli utenti."
  ),
  ...cat(
    "nexa_hr",
    "corporate_policies",
    "Corporate Policies",
    "Consultare policy e documenti aziendali condivisi.",
    "Caricare o aggiornare documenti Corporate Policies (titolo, descrizione, file)."
  ),
  ...cat(
    "nexa_hr",
    "ai_assistant",
    "Assistente HR (AI)",
    "Usare l’assistente contestuale su dati e policy consentiti.",
    "Avviare azioni assistite dall’assistente dove previsto."
  ),
  ...cat(
    "nexa_hr",
    "ai_nl_query",
    "Ricerca HR in linguaggio naturale",
    "Eseguire interrogazioni guidate in linguaggio naturale su dati consentiti.",
    "Salvare viste o report da ricerche NL ove previsto."
  ),
  ...cat(
    "nexa_hr",
    "ai_anomalies",
    "Anomalie presenze / payroll",
    "Consultare segnalazioni anomalie e code di controllo.",
    "Gestire stato risoluzione o note operative sulle anomalie."
  ),
  ...cat(
    "nexa_hr",
    "ai_triage",
    "Triage richieste HR (AI)",
    "Classificare e prioritizzare richieste con supporto AI.",
    "Applicare triage o assegnazioni suggerite ove previsto."
  )
];

function plasticityPair(resource: string, labelIt: string, dr: string, dw: string): PermissionDefinition[] {
  return [
    {
      id: `plasticity.${resource}:read`,
      category: "plasticity",
      resourceKey: resource,
      suffix: "read",
      labelIt,
      descriptionReadIt: dr,
      descriptionWriteIt: dw
    },
    {
      id: `plasticity.${resource}:write`,
      category: "plasticity",
      resourceKey: resource,
      suffix: "write",
      labelIt,
      descriptionReadIt: dr,
      descriptionWriteIt: dw
    }
  ];
}

export const PLASTICITY_PERMISSIONS: PermissionDefinition[] = [
  ...plasticityPair("dashboard", "Dashboard BI", "Aprire dashboard e indicatori.", "Modificare layout o filtri salvati."),
  ...plasticityPair("reports", "Report", "Esportare e consultare report.", "Creare o pubblicare report."),
  ...plasticityPair("kpi_settings", "Impostazioni KPI", "Vedere configurazioni KPI.", "Modificare soglie e definizioni KPI.")
];

function somaPair(resource: string, labelIt: string, dr: string, dw: string): PermissionDefinition[] {
  return [
    {
      id: `soma.${resource}:read`,
      category: "soma",
      resourceKey: resource,
      suffix: "read",
      labelIt,
      descriptionReadIt: dr,
      descriptionWriteIt: dw
    },
    {
      id: `soma.${resource}:write`,
      category: "soma",
      resourceKey: resource,
      suffix: "write",
      labelIt,
      descriptionReadIt: dr,
      descriptionWriteIt: dw
    }
  ];
}

export const SOMA_PERMISSIONS: PermissionDefinition[] = [
  ...somaPair("module_a", "Modulo SOMA (A)", "Consultare dati del modulo.", "Modificare dati del modulo."),
  ...somaPair("module_b", "Modulo SOMA (B)", "Consultare report di sintesi.", "Gestire configurazioni modulo.")
];

function hubPair(resource: string, labelIt: string, dr: string, dw: string): PermissionDefinition[] {
  return [
    {
      id: `hub.${resource}:read`,
      category: "hub",
      resourceKey: resource,
      suffix: "read",
      labelIt,
      descriptionReadIt: dr,
      descriptionWriteIt: dw
    },
    {
      id: `hub.${resource}:write`,
      category: "hub",
      resourceKey: resource,
      suffix: "write",
      labelIt,
      descriptionReadIt: dr,
      descriptionWriteIt: dw
    }
  ];
}

export const HUB_PERMISSIONS: PermissionDefinition[] = [
  ...hubPair("profile", "Profilo Hub", "Vedere preferenze e profilo.", "Aggiornare preferenze account."),
  ...hubPair("handoff", "Handoff tra app", "Usare link di handoff in lettura.", "Avviare handoff verso altre app.")
];

export const ALL_CATALOG_PERMISSION_IDS: string[] = [
  ...NEXA_HR_PERMISSIONS.map((p) => p.id),
  ...PLASTICITY_PERMISSIONS.map((p) => p.id),
  ...SOMA_PERMISSIONS.map((p) => p.id),
  ...HUB_PERMISSIONS.map((p) => p.id)
];

export const LEGACY_TO_NEW_KEYS: Record<string, string[]> = {
  "*": ALL_CATALOG_PERMISSION_IDS,
  clock: ["nexa.attendance:write"],
  "request:leave": ["nexa.leaves:write"],
  "request:sickness": ["nexa.sickness:write"],
  "approve:leave": ["nexa.approvals:write"],
  "approve:sickness": ["nexa.approvals:write"],
  // Non mappare `nexa.admin_users:read` qui: `read:team` è per visibilità team/org, non console admin.
  "read:team": [
    "nexa.org:read",
    "nexa.personnel_budget:read",
    "nexa.personnel_budget:write",
    "nexa.reports_hr:read",
    "nexa.shifts:read",
    "nexa.shifts:write",
    "nexa.work_calendar:read",
    "nexa.work_calendar:write",
    "nexa.documents:read",
    "nexa.documents:write",
    "nexa.expenses:read",
    "nexa.lifecycle:read",
    "nexa.lifecycle:write",
    "nexa.innovation:read",
    "nexa.innovation:write",
    "nexa.recruiting:read",
    "nexa.recruiting:write",
    "nexa.standard_contracts:read",
    "nexa.standard_contracts:write",
    "nexa.third_party_licenses:read",
    "nexa.third_party_licenses:write",
    "nexa.corporate_policies:read",
    "nexa.corporate_policies:write",
    "nexa.ai_assistant:read",
    "nexa.ai_assistant:write",
    "nexa.ai_nl_query:read",
    "nexa.ai_nl_query:write",
    "nexa.ai_anomalies:read",
    "nexa.ai_anomalies:write",
    "nexa.ai_triage:read",
    "nexa.ai_triage:write"
  ],
  "read:self": [
    "nexa.attendance:read",
    "nexa.attendance:write",
    "nexa.leaves:read",
    "nexa.leaves:write",
    "nexa.sickness:read",
    "nexa.sickness:write",
    "nexa.org:read",
    "nexa.documents:read",
    "nexa.expenses:read",
    "nexa.expenses:write",
    "nexa.lifecycle:read",
    "nexa.lifecycle:write",
    "nexa.innovation:read",
    "nexa.corporate_policies:read",
    "nexa.ai_assistant:read",
    "nexa.ai_nl_query:read",
    "nexa.ai_anomalies:read",
    "nexa.ai_triage:read"
  ],
  "read:payslip:self": ["nexa.payslips:read"],
  "read:payslip:team": ["nexa.payslips:read", "nexa.org:read"]
};
