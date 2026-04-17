/**
 * Allineato a `apps/backend/src/platform/permission-catalog.ts` (LEGACY_TO_NEW_KEYS)
 * per espandere permessi legacy nella UI Gestione ruoli.
 */
export const LEGACY_TO_NEW_KEYS: Record<string, string[]> = {
  clock: ["nexa.attendance:write"],
  "request:leave": ["nexa.leaves:write"],
  "request:sickness": ["nexa.sickness:write"],
  "approve:leave": ["nexa.approvals:write"],
  "approve:sickness": ["nexa.approvals:write"],
  "read:team": [
    "nexa.ai_assistant:scope_managed",
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
  "nexa.admin_users:read": ["nexa.ai_assistant:scope_org"],
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

export function expandRolePermissions(raw: string[], allCatalogIds: string[]): Set<string> {
  const out = new Set<string>();
  for (const p of raw) {
    if (p === "*") {
      for (const id of allCatalogIds) {
        out.add(id);
      }
      continue;
    }
    out.add(p);
    const mapped = LEGACY_TO_NEW_KEYS[p];
    if (mapped?.length) {
      for (const id of mapped) {
        out.add(id);
      }
    }
  }
  return out;
}
