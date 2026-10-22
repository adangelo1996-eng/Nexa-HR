import { OPTIONAL_CAPABILITY_IDS } from "./catalog";
import type { ActivityTemplate, ActivityTemplateId } from "./types";

const coreHrOptional = [
  "nexa.payslips",
  "nexa.smartworking",
  "nexa.expenses",
  "nexa.lifecycle",
  "nexa.contracts",
  "nexa.analytics"
];

const biFull = [
  "plasticity.pl",
  "plasticity.bs",
  "plasticity.cf",
  "plasticity.geographic",
  "plasticity.kpi_alerts",
  "plasticity.hebb",
  "plasticity.budget_forecast"
];

const defaultsIt = {
  fiscalYearStartMonth: 1,
  weeklyFullTimeHours: 40,
  currency: "EUR",
  payrollCountry: "IT" as const,
  payrollInstallmentMonths: 13
};

export const ACTIVITY_TEMPLATES: ActivityTemplate[] = [
  {
    id: "full_suite",
    labelIt: "Suite completa",
    sectorLabelIt: "Tutti i settori",
    summaryIt: "Tutte le capability opzionali accese. Default se il tenant non ha ancora un template.",
    enabledOptional: [...OPTIONAL_CAPABILITY_IDS],
    limits: { maxEmployees: 500, maxHrSeats: 25, plasticityMaxDatasets: 12 },
    defaults: defaultsIt,
    workflows: { expenseApproval: "manager_then_hr", leaveApprover: "manager" },
    kpis: {
      nexa: ["headcount", "turnover", "absence_rate", "labor_cost"],
      plasticity: ["net_sales", "ebitda", "cash", "budget_vs_actual"]
    },
    anagrafiche: { extraFields: ["costCenter", "team", "ccnlLevel", "hireDate", "iban"] }
  },
  {
    id: "professional_services",
    labelIt: "Servizi professionali",
    sectorLabelIt: "Studi, consulenza, B2B servizi",
    summaryIt: "HR core + timesheet-like (presenze, spese, smartworking) e P&L. Senza turni e recruiting pesante.",
    enabledOptional: [
      ...coreHrOptional,
      "nexa.payroll",
      "nexa.ai",
      "nexa.personnel_budget",
      "nexa.third_party_licenses",
      "plasticity.pl",
      "plasticity.kpi_alerts",
      "plasticity.hebb",
      "plasticity.budget_forecast"
    ],
    limits: { maxEmployees: 150, maxHrSeats: 8, plasticityMaxDatasets: 6 },
    defaults: defaultsIt,
    workflows: { expenseApproval: "manager_then_hr", leaveApprover: "manager" },
    kpis: {
      nexa: ["headcount", "labor_cost", "absence_rate"],
      plasticity: ["net_sales", "gross_margin", "ebitda"]
    },
    anagrafiche: { extraFields: ["costCenter", "team", "iban", "weeklyContractHours"] }
  },
  {
    id: "retail_commerce",
    labelIt: "Commercio e retail",
    sectorLabelIt: "Retail, GDO, boutique, e-commerce",
    summaryIt: "Turni, recruiting, payroll e P&L. Adatto a punti vendita e sede.",
    enabledOptional: [
      ...coreHrOptional,
      "nexa.payroll",
      "nexa.scheduling",
      "nexa.recruiting",
      "nexa.training",
      "nexa.personnel_budget",
      "nexa.workforce_planning",
      "nexa.ai",
      "plasticity.pl",
      "plasticity.bs",
      "plasticity.geographic",
      "plasticity.budget_forecast",
      "plasticity.kpi_alerts"
    ],
    limits: { maxEmployees: 400, maxHrSeats: 12, plasticityMaxDatasets: 8 },
    defaults: { ...defaultsIt, payrollInstallmentMonths: 14 },
    workflows: { expenseApproval: "manager_then_hr", leaveApprover: "manager" },
    kpis: {
      nexa: ["headcount", "turnover", "overtime_hours", "labor_cost"],
      plasticity: ["net_sales", "gross_margin", "budget_vs_actual"]
    },
    anagrafiche: { extraFields: ["costCenter", "team", "ccnlLevel", "legalCategory", "hireDate"] }
  },
  {
    id: "manufacturing",
    labelIt: "Manifattura",
    sectorLabelIt: "Produzione, industriale",
    summaryIt: "Turni, formazione obbligatoria, costo del lavoro e P&L + BS.",
    enabledOptional: [
      ...coreHrOptional,
      "nexa.payroll",
      "nexa.scheduling",
      "nexa.training",
      "nexa.personnel_budget",
      "nexa.workforce_planning",
      "nexa.recruiting",
      "plasticity.pl",
      "plasticity.bs",
      "plasticity.cf",
      "plasticity.budget_forecast"
    ],
    limits: { maxEmployees: 800, maxHrSeats: 15, plasticityMaxDatasets: 8 },
    defaults: defaultsIt,
    workflows: { expenseApproval: "hr_only", leaveApprover: "manager" },
    kpis: {
      nexa: ["headcount", "absence_rate", "overtime_hours", "labor_cost", "training_completion"],
      plasticity: ["net_sales", "ebitda", "working_capital"]
    },
    anagrafiche: { extraFields: ["costCenter", "team", "legalCategory", "atecoCode", "hireDate"] }
  },
  {
    id: "hospitality",
    labelIt: "Hospitality",
    sectorLabelIt: "Hotel, ristorazione, turismo",
    summaryIt: "Turni, recruiting stagionale, spese e P&L. Payroll opzionale.",
    enabledOptional: [
      ...coreHrOptional,
      "nexa.payroll",
      "nexa.scheduling",
      "nexa.recruiting",
      "nexa.training",
      "nexa.workforce_planning",
      "plasticity.pl",
      "plasticity.geographic",
      "plasticity.budget_forecast",
      "plasticity.kpi_alerts"
    ],
    limits: { maxEmployees: 300, maxHrSeats: 10, plasticityMaxDatasets: 6 },
    defaults: { ...defaultsIt, payrollInstallmentMonths: 14 },
    workflows: { expenseApproval: "manager_then_hr", leaveApprover: "manager" },
    kpis: {
      nexa: ["headcount", "turnover", "overtime_hours"],
      plasticity: ["net_sales", "gross_margin", "budget_vs_actual"]
    },
    anagrafiche: { extraFields: ["costCenter", "team", "contractType", "hireDate"] }
  },
  {
    id: "executive_bi",
    labelIt: "Executive BI",
    sectorLabelIt: "Direzione / controlling",
    summaryIt: "Plasticity completo. Nexa ridotto al nucleo persone/presenze, senza payroll né recruiting.",
    enabledOptional: [...biFull, "nexa.analytics", "nexa.personnel_budget"],
    limits: { maxEmployees: 80, maxHrSeats: 5, plasticityMaxDatasets: 12 },
    defaults: { ...defaultsIt, payrollCountry: "none", payrollInstallmentMonths: 12 },
    workflows: { expenseApproval: "hr_only", leaveApprover: "hr" },
    kpis: {
      nexa: ["headcount", "labor_cost"],
      plasticity: ["net_sales", "ebitda", "cash", "working_capital", "budget_vs_actual", "current_ratio"]
    },
    anagrafiche: { extraFields: ["costCenter"] }
  }
];

export const ACTIVITY_TEMPLATE_IDS: ActivityTemplateId[] = ACTIVITY_TEMPLATES.map((t) => t.id);

export function getActivityTemplate(id: string): ActivityTemplate | undefined {
  return ACTIVITY_TEMPLATES.find((t) => t.id === id);
}
