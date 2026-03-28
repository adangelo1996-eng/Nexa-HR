/** Allineato a `permission-catalog.ts` (backend) per espandere permessi legacy in UI. */
export const LEGACY_TO_NEW_KEYS: Record<string, string[]> = {
  "*": [],
  clock: ["nexa.attendance:write"],
  "request:leave": ["nexa.leaves:write"],
  "request:sickness": ["nexa.sickness:write"],
  "approve:leave": ["nexa.approvals:write"],
  "approve:sickness": ["nexa.approvals:write"],
  "read:team": ["nexa.org:read", "nexa.admin_users:read"],
  "read:self": ["nexa.attendance:read", "nexa.leaves:read", "nexa.sickness:read", "nexa.org:read"],
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
