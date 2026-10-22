import {
  ANAGRAFICA_FIELD_WHITELIST,
  NEXA_KPI_CATALOG,
  PLASTICITY_KPI_CATALOG,
  TENANT_PACK_CAPABILITIES
} from "./catalog";
import { CONFIGURABLE_WITHOUT_CODE, REQUIRES_CUSTOM_EXCEPTION } from "./policy";
import { ACTIVITY_TEMPLATES } from "./templates";
import { TENANT_PACK_VERSION, type TenantPackCatalog } from "./types";

export * from "./types";
export * from "./catalog";
export * from "./templates";
export * from "./policy";
export * from "./apply";
export * from "./route-map";

export function getTenantPackCatalog(): TenantPackCatalog {
  return {
    version: TENANT_PACK_VERSION,
    capabilities: TENANT_PACK_CAPABILITIES,
    templates: ACTIVITY_TEMPLATES,
    anagraficaFieldWhitelist: [...ANAGRAFICA_FIELD_WHITELIST],
    nexaKpiCatalog: [...NEXA_KPI_CATALOG],
    plasticityKpiCatalog: [...PLASTICITY_KPI_CATALOG],
    customPolicy: {
      configurableWithoutCode: [...CONFIGURABLE_WITHOUT_CODE],
      requiresCustomException: [...REQUIRES_CUSTOM_EXCEPTION]
    }
  };
}
