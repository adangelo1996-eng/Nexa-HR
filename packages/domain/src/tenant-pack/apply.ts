import {
  ALL_CAPABILITY_IDS,
  ALWAYS_ON_CAPABILITY_IDS,
  ANAGRAFICA_FIELD_WHITELIST,
  NEXA_KPI_CATALOG,
  OPTIONAL_CAPABILITY_IDS,
  PLASTICITY_KPI_CATALOG
} from "./catalog";
import { getActivityTemplate } from "./templates";
import { TENANT_PACK_VERSION, type TenantPack, type TenantPackApplyInput } from "./types";

const ANAG_SET = new Set<string>(ANAGRAFICA_FIELD_WHITELIST);
const NEXA_KPI_SET = new Set<string>(NEXA_KPI_CATALOG);
const PLAST_KPI_SET = new Set<string>(PLASTICITY_KPI_CATALOG);
const OPTIONAL_SET = new Set(OPTIONAL_CAPABILITY_IDS);

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : fallback;
  return Math.min(max, Math.max(min, v));
}

function filterKnown(values: string[] | undefined, allowed: Set<string>, fallback: string[]): string[] {
  if (!Array.isArray(values)) {
    return fallback;
  }
  return [...new Set(values.filter((x) => typeof x === "string" && allowed.has(x)))];
}

export function emptyModules(enabledOptional: string[]): Record<string, boolean> {
  const enabled = new Set(enabledOptional);
  const modules: Record<string, boolean> = {};
  for (const id of ALL_CAPABILITY_IDS) {
    modules[id] = ALWAYS_ON_CAPABILITY_IDS.includes(id) || enabled.has(id);
  }
  return modules;
}

export function applyActivityTemplate(input: TenantPackApplyInput): TenantPack {
  const template = getActivityTemplate(input.templateId);
  if (!template) {
    throw new Error(`Template attività non supportato: ${input.templateId}`);
  }
  const overlay = input.overlay ?? {};
  const baseModules = emptyModules(template.enabledOptional);
  const modules = { ...baseModules };
  if (overlay.modules) {
    for (const [id, on] of Object.entries(overlay.modules)) {
      if (!OPTIONAL_SET.has(id)) {
        continue;
      }
      modules[id] = Boolean(on);
    }
  }
  for (const id of ALWAYS_ON_CAPABILITY_IDS) {
    modules[id] = true;
  }

  const limits = {
    maxEmployees: clampInt(overlay.limits?.maxEmployees, 1, 50_000, template.limits.maxEmployees),
    maxHrSeats: clampInt(overlay.limits?.maxHrSeats, 1, 5_000, template.limits.maxHrSeats),
    plasticityMaxDatasets: clampInt(
      overlay.limits?.plasticityMaxDatasets,
      1,
      100,
      template.limits.plasticityMaxDatasets
    )
  };

  const d = overlay.defaults;
  const defaults = {
    fiscalYearStartMonth: clampInt(d?.fiscalYearStartMonth, 1, 12, template.defaults.fiscalYearStartMonth),
    weeklyFullTimeHours: clampInt(d?.weeklyFullTimeHours, 1, 80, template.defaults.weeklyFullTimeHours),
    currency: (d?.currency?.trim() || template.defaults.currency).slice(0, 8).toUpperCase(),
    payrollCountry: d?.payrollCountry === "none" || d?.payrollCountry === "IT" ? d.payrollCountry : template.defaults.payrollCountry,
    payrollInstallmentMonths: clampInt(d?.payrollInstallmentMonths, 12, 14, template.defaults.payrollInstallmentMonths)
  };

  const workflows = {
    expenseApproval:
      overlay.workflows?.expenseApproval === "hr_only" || overlay.workflows?.expenseApproval === "manager_then_hr"
        ? overlay.workflows.expenseApproval
        : template.workflows.expenseApproval,
    leaveApprover:
      overlay.workflows?.leaveApprover === "hr" || overlay.workflows?.leaveApprover === "manager"
        ? overlay.workflows.leaveApprover
        : template.workflows.leaveApprover
  };

  const kpis = {
    nexa: filterKnown(overlay.kpis?.nexa, NEXA_KPI_SET, template.kpis.nexa),
    plasticity: filterKnown(overlay.kpis?.plasticity, PLAST_KPI_SET, template.kpis.plasticity)
  };

  const anagrafiche = {
    extraFields: filterKnown(overlay.anagrafiche?.extraFields, ANAG_SET, template.anagrafiche.extraFields)
  };

  const customExceptions = Array.isArray(overlay.customExceptions)
    ? overlay.customExceptions
        .filter((e) => e && typeof e.id === "string" && typeof e.reason === "string" && typeof e.reviewBy === "string")
        .map((e) => ({
          id: e.id.trim().slice(0, 80),
          reason: e.reason.trim().slice(0, 500),
          reviewBy: e.reviewBy.trim().slice(0, 32)
        }))
        .filter((e) => e.id && e.reason && e.reviewBy)
    : [];

  return {
    version: TENANT_PACK_VERSION,
    templateId: template.id,
    activityLabelIt: template.labelIt,
    sectorLabelIt: template.sectorLabelIt,
    modules,
    limits,
    defaults,
    workflows,
    kpis,
    anagrafiche,
    customExceptions
  };
}

export function isCapabilityEnabled(pack: TenantPack | null | undefined, capabilityId: string): boolean {
  if (ALWAYS_ON_CAPABILITY_IDS.includes(capabilityId)) {
    return true;
  }
  if (!pack) {
    return true;
  }
  return pack.modules[capabilityId] === true;
}

export function defaultTenantPack(): TenantPack {
  return applyActivityTemplate({ templateId: "full_suite" });
}
