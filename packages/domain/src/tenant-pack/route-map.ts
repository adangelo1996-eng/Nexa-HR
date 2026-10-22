/** Mapping route frontend Nexa e path API Nest → capability del pacchetto. */

export const NEXA_ROUTE_CAPABILITY: Array<{ prefix: string; capabilityId: string }> = [
  { prefix: "/recruiting", capabilityId: "nexa.recruiting" },
  { prefix: "/payroll-hebb", capabilityId: "nexa.payroll" },
  { prefix: "/payroll-calc", capabilityId: "nexa.payroll" },
  { prefix: "/personnel-budget", capabilityId: "nexa.personnel_budget" },
  { prefix: "/hr-center", capabilityId: "nexa.ai" },
  { prefix: "/analytics", capabilityId: "nexa.analytics" },
  { prefix: "/hr/formazione", capabilityId: "nexa.training" },
  { prefix: "/percorso/formazione", capabilityId: "nexa.training" },
  { prefix: "/formazione", capabilityId: "nexa.training" },
  { prefix: "/lifecycle", capabilityId: "nexa.lifecycle" },
  { prefix: "/hr/onboarding", capabilityId: "nexa.lifecycle" },
  { prefix: "/hr/offboarding", capabilityId: "nexa.lifecycle" },
  { prefix: "/scheduling", capabilityId: "nexa.scheduling" },
  { prefix: "/smartworking", capabilityId: "nexa.smartworking" },
  { prefix: "/expenses", capabilityId: "nexa.expenses" },
  { prefix: "/tools/third-party-licenses", capabilityId: "nexa.third_party_licenses" },
  { prefix: "/sale-riunioni", capabilityId: "nexa.meeting_rooms" },
  { prefix: "/hr/cowork", capabilityId: "nexa.cowork" },
  { prefix: "/contracts", capabilityId: "nexa.contracts" },
  { prefix: "/admin/contratti", capabilityId: "nexa.contracts" },
  { prefix: "/workforce-planning", capabilityId: "nexa.workforce_planning" },
  { prefix: "/hebb-ai-support", capabilityId: "nexa.ai" },
  { prefix: "/nexa-hr-copilot", capabilityId: "nexa.ai" },
  { prefix: "/ai-hub", capabilityId: "nexa.ai" },
  { prefix: "/payslips", capabilityId: "nexa.payslips" }
];

export const NEXA_API_CAPABILITY: Array<{ prefix: string; capabilityId: string }> = [
  { prefix: "/api/recruiting", capabilityId: "nexa.recruiting" },
  { prefix: "/api/recruit", capabilityId: "nexa.recruiting" },
  { prefix: "/api/payroll", capabilityId: "nexa.payroll" },
  { prefix: "/api/hr/personnel-budget", capabilityId: "nexa.personnel_budget" },
  { prefix: "/api/analytics", capabilityId: "nexa.analytics" },
  { prefix: "/api/training", capabilityId: "nexa.training" },
  { prefix: "/api/lifecycle", capabilityId: "nexa.lifecycle" },
  { prefix: "/api/hr-onboarding", capabilityId: "nexa.lifecycle" },
  { prefix: "/api/hr-offboarding", capabilityId: "nexa.lifecycle" },
  { prefix: "/api/scheduling", capabilityId: "nexa.scheduling" },
  { prefix: "/api/smartworking", capabilityId: "nexa.smartworking" },
  { prefix: "/api/expenses", capabilityId: "nexa.expenses" },
  { prefix: "/api/third-party-licenses", capabilityId: "nexa.third_party_licenses" },
  { prefix: "/api/meeting-rooms", capabilityId: "nexa.meeting_rooms" },
  { prefix: "/api/cowork", capabilityId: "nexa.cowork" },
  { prefix: "/api/hr-contracts", capabilityId: "nexa.contracts" },
  { prefix: "/api/contracts", capabilityId: "nexa.contracts" },
  { prefix: "/api/ai/", capabilityId: "nexa.ai" },
  { prefix: "/api/hr-center", capabilityId: "nexa.ai" },
  { prefix: "/api/innovation", capabilityId: "nexa.innovation" },
  { prefix: "/api/payslips", capabilityId: "nexa.payslips" }
];

function longestPrefixMatch(path: string, rows: Array<{ prefix: string; capabilityId: string }>): string | null {
  const p = path.split("?")[0] ?? path;
  let best: { prefix: string; capabilityId: string } | null = null;
  for (const row of rows) {
    if (p === row.prefix || p.startsWith(`${row.prefix}/`) || p.startsWith(row.prefix)) {
      if (!best || row.prefix.length > best.prefix.length) {
        best = row;
      }
    }
  }
  return best?.capabilityId ?? null;
}

export function capabilityForNexaRoute(pathname: string): string | null {
  return longestPrefixMatch(pathname, NEXA_ROUTE_CAPABILITY);
}

export function capabilityForNexaApiPath(pathname: string): string | null {
  return longestPrefixMatch(pathname, NEXA_API_CAPABILITY);
}
