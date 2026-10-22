import type { CapabilityDefinition } from "./types";

const nexa = (
  id: string,
  kind: CapabilityDefinition["kind"],
  labelIt: string,
  descriptionIt: string
): CapabilityDefinition => ({
  id: `nexa.${id}`,
  product: "nexa_hr",
  kind,
  labelIt,
  descriptionIt
});

const plasticity = (
  id: string,
  kind: CapabilityDefinition["kind"],
  labelIt: string,
  descriptionIt: string
): CapabilityDefinition => ({
  id: `plasticity.${id}`,
  product: "plasticity",
  kind,
  labelIt,
  descriptionIt
});

export const TENANT_PACK_CAPABILITIES: CapabilityDefinition[] = [
  nexa("people", "always_on", "Anagrafiche persone", "Dipendenti, ruoli, centri di costo: sempre presenti."),
  nexa("attendance", "always_on", "Presenze e timbrature", "Clock-in/out e riepiloghi presenza."),
  nexa("leaves", "always_on", "Ferie e permessi", "Richieste e saldi assenza."),
  nexa("sickness", "always_on", "Malattia", "Eventi malattia e certificati."),
  nexa("approvals", "always_on", "Approvazioni", "Coda unica ferie/malattia/smartworking."),
  nexa("org", "always_on", "Organigramma", "Struttura e reportistica organizzativa base."),
  nexa("documents", "always_on", "Documenti", "Vault documenti dipendente/azienda."),
  nexa("admin_core", "always_on", "Amministrazione tenant", "Utenti, ruoli, dati azienda, pacchetto standard."),
  nexa("payroll", "optional", "Payroll Italia", "Calcolo e simulazione cedolino."),
  nexa("payslips", "optional", "Cedolini", "Pubblicazione e consultazione buste paga."),
  nexa("scheduling", "optional", "Turni", "Pianificazione turni e coperture."),
  nexa("smartworking", "optional", "Remote working", "Accordi e quote lavoro da remoto."),
  nexa("expenses", "optional", "Note spese", "Rimborsi, ricevute, approvazione manager/HR."),
  nexa("recruiting", "optional", "Recruiting", "Posizioni, candidati, pipeline."),
  nexa("lifecycle", "optional", "Onboarding e offboarding", "Checklist ingresso/uscita."),
  nexa("training", "optional", "Formazione", "Corsi e scadenze formative."),
  nexa("personnel_budget", "optional", "Budget personale", "Pianificazione costo organico."),
  nexa("analytics", "optional", "Analytics HR", "Dashboard e recap HR."),
  nexa("ai", "optional", "Hebb AI HR", "Assistente e copilot HR."),
  nexa("contracts", "optional", "Contratti standard", "Generazione e firma contratti HR."),
  nexa("third_party_licenses", "optional", "Licenze terze", "Inventario utenze software."),
  nexa("meeting_rooms", "optional", "Sale riunioni", "Prenotazione sale."),
  nexa("cowork", "optional", "Cowork HR", "Richieste cowork / automazioni HR."),
  nexa("workforce_planning", "optional", "Workforce planning", "Pianificazione organico."),
  nexa("innovation", "optional", "Innovation", "Job AI/ATS sperimentali."),
  plasticity("import", "always_on", "Import dati", "Caricamento Excel/CSV verso i moduli BI."),
  plasticity("dashboard", "always_on", "Dashboard BI", "Vista KPI principale sul dataset caricato."),
  plasticity("pl", "optional", "Profit & Loss", "Modulo conto economico."),
  plasticity("bs", "optional", "Balance Sheet", "Modulo stato patrimoniale."),
  plasticity("cf", "optional", "Cash Flow", "Modulo flussi di cassa."),
  plasticity("geographic", "optional", "Geographic", "Viste geografiche sui dataset."),
  plasticity("kpi_alerts", "optional", "Alert KPI", "Soglie e notifiche sugli indicatori."),
  plasticity("hebb", "optional", "Hebb AI BI", "Analisi assistita sui dataset finanziari."),
  plasticity("budget_forecast", "optional", "Budget e forecast", "Confronto budget vs actual e previsioni."),
  {
    id: "suite.sso",
    product: "suite",
    kind: "always_on",
    labelIt: "SSO suite",
    descriptionIt: "Identità condivisa Hub / Nexa / Plasticity."
  }
];

export const ANAGRAFICA_FIELD_WHITELIST = [
  "costCenter",
  "team",
  "ccnlLevel",
  "legalCategory",
  "iban",
  "phone",
  "hireDate",
  "contractType",
  "weeklyContractHours",
  "atecoCode"
] as const;

export const NEXA_KPI_CATALOG = [
  "headcount",
  "turnover",
  "absence_rate",
  "overtime_hours",
  "labor_cost",
  "time_to_hire",
  "training_completion"
] as const;

export const PLASTICITY_KPI_CATALOG = [
  "net_sales",
  "gross_margin",
  "ebitda",
  "cash",
  "working_capital",
  "budget_vs_actual",
  "current_ratio"
] as const;

export const ALWAYS_ON_CAPABILITY_IDS: string[] = TENANT_PACK_CAPABILITIES.filter((c) => c.kind === "always_on").map(
  (c) => c.id
);

export const OPTIONAL_CAPABILITY_IDS: string[] = TENANT_PACK_CAPABILITIES.filter((c) => c.kind === "optional").map(
  (c) => c.id
);

export const ALL_CAPABILITY_IDS: string[] = TENANT_PACK_CAPABILITIES.map((c) => c.id);
