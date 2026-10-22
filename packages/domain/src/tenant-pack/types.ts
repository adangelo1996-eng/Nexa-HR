/** Contratto di configurazione unico Nexa HR + Plasticity (SYN-246). */

export const TENANT_PACK_VERSION = 1 as const;

export type ProductId = "nexa_hr" | "plasticity" | "suite";

export type CapabilityKind = "always_on" | "optional";

export interface CapabilityDefinition {
  id: string;
  product: ProductId;
  kind: CapabilityKind;
  labelIt: string;
  descriptionIt: string;
}

export type ActivityTemplateId =
  | "full_suite"
  | "professional_services"
  | "retail_commerce"
  | "manufacturing"
  | "hospitality"
  | "executive_bi";

export type ExpenseApprovalFlow = "manager_then_hr" | "hr_only";
export type LeaveApprover = "manager" | "hr";
export type PayrollCountry = "IT" | "none";

export interface TenantPackLimits {
  maxEmployees: number;
  maxHrSeats: number;
  plasticityMaxDatasets: number;
}

export interface TenantPackDefaults {
  fiscalYearStartMonth: number;
  weeklyFullTimeHours: number;
  currency: string;
  payrollCountry: PayrollCountry;
  payrollInstallmentMonths: number;
}

export interface TenantPackWorkflows {
  expenseApproval: ExpenseApprovalFlow;
  leaveApprover: LeaveApprover;
}

export interface TenantPackKpis {
  nexa: string[];
  plasticity: string[];
}

export interface TenantPackAnagrafiche {
  /** Campi extra scelti dalla whitelist catalogo, mai colonne SQL ad hoc. */
  extraFields: string[];
}

export interface TenantPackCustomException {
  id: string;
  reason: string;
  /** ISO date; dopo questa data l'eccezione va rivalutata o rimossa. */
  reviewBy: string;
}

export interface TenantPack {
  version: typeof TENANT_PACK_VERSION;
  templateId: ActivityTemplateId;
  activityLabelIt: string;
  sectorLabelIt: string;
  /** true = modulo acceso. Le capability always_on restano sempre true. */
  modules: Record<string, boolean>;
  limits: TenantPackLimits;
  defaults: TenantPackDefaults;
  workflows: TenantPackWorkflows;
  kpis: TenantPackKpis;
  anagrafiche: TenantPackAnagrafiche;
  customExceptions: TenantPackCustomException[];
}

export interface ActivityTemplate {
  id: ActivityTemplateId;
  labelIt: string;
  sectorLabelIt: string;
  summaryIt: string;
  /** Optional capabilities da accendere (oltre alle always_on). */
  enabledOptional: string[];
  limits: TenantPackLimits;
  defaults: TenantPackDefaults;
  workflows: TenantPackWorkflows;
  kpis: TenantPackKpis;
  anagrafiche: TenantPackAnagrafiche;
}

export interface TenantPackCatalog {
  version: typeof TENANT_PACK_VERSION;
  capabilities: CapabilityDefinition[];
  templates: ActivityTemplate[];
  anagraficaFieldWhitelist: string[];
  nexaKpiCatalog: string[];
  plasticityKpiCatalog: string[];
  customPolicy: {
    configurableWithoutCode: string[];
    requiresCustomException: string[];
  };
}

export interface TenantPackApplyInput {
  templateId: ActivityTemplateId;
  /** Overlay opzionale: solo moduli optional, limiti, default, KPI, extra fields, eccezioni. */
  overlay?: {
    modules?: Record<string, boolean>;
    limits?: Partial<TenantPackLimits>;
    defaults?: Partial<TenantPackDefaults>;
    workflows?: Partial<TenantPackWorkflows>;
    kpis?: Partial<TenantPackKpis>;
    anagrafiche?: Partial<TenantPackAnagrafiche>;
    customExceptions?: TenantPackCustomException[];
  };
}
