"use client";

import type { SessionUser } from "./auth-session";
import { getHebbAiPageHelp, type HebbAiPageKey } from "./hebb-ai-for-hr-help";
import { getNexaPageHelp, type NexaPageHelpKey } from "./nexa-page-help";
import { navCatalogBestLabelForPathname } from "./nav-routes-catalog";

/** Allineato a `HebbPageContextDto` backend. */
export type HebbPageContextUserRole = "superuser" | "hr" | "manager" | "employee";

export type HebbPageContextPayload = {
  currentPath: string;
  pageLabel: string;
  userRole: HebbPageContextUserRole;
  companyId: string;
  teamScope?: string;
  costCenterScope?: string;
  periodScope?: string;
  employmentState?: "active" | "hr_onboarding" | "offboarding";
  pageHelp: string;
};

export type BuildHebbPageContextOptions = {
  pathname: string;
  sessionUser?: SessionUser | null;
  teamScope?: string;
  costCenterScope?: string;
  periodScope?: string;
};

/** Percorsi → chiave help HEBB (match più lungo). */
const PATH_HEBB_HELP: { prefix: string; key: HebbAiPageKey }[] = [
  { prefix: "/hebb-ai-support", key: "hebb-ai-support" },
  { prefix: "/ai-hub", key: "ai-hub" },
  { prefix: "/payroll-hebb", key: "payroll-hebb" },
  { prefix: "/workforce-planning", key: "workforce-planning" },
  { prefix: "/manager-copilot", key: "manager-copilot" },
  { prefix: "/nexa-hr-copilot", key: "nexa-hr-copilot" },
  { prefix: "/hr/cowork", key: "hr-cowork" },
  { prefix: "/insights", key: "insights" },
  { prefix: "/tools/cost-calculator", key: "cost-calculator" },
  { prefix: "/hr-center/analisi", key: "hr-center-analisi" },
  { prefix: "/hr-center/budget-report", key: "hr-center-budget-report" },
  { prefix: "/hr-center/recap", key: "hr-center-recap" }
];

/** Percorsi → chiave help Nexa generica. */
const PATH_NEXA_HELP: { prefix: string; key: NexaPageHelpKey }[] = [
  { prefix: "/analytics/advanced/retention", key: "analytics-retention" },
  { prefix: "/analytics/retention", key: "analytics-retention" },
  { prefix: "/analytics/competenze", key: "analytics-competenze" },
  { prefix: "/analytics/advanced/competenze", key: "analytics-competenze" },
  { prefix: "/personnel-budget/analysis", key: "personnel-budget-analysis" },
  { prefix: "/personnel-budget", key: "personnel-budget" },
  { prefix: "/compensation/bench", key: "compensation-bench" },
  { prefix: "/hr-recap", key: "manager-copilot" },
  { prefix: "/mappa-portale", key: "mappa-portale" },
  { prefix: "/workflow", key: "workflow" },
  { prefix: "/attendance", key: "attendance" },
  { prefix: "/payslips", key: "payslips" },
  { prefix: "/scheduling", key: "scheduling" },
  { prefix: "/smartworking", key: "smartworking" },
  { prefix: "/work-calendar", key: "work-calendar" },
  { prefix: "/organigramma", key: "organigramma" },
  { prefix: "/org-chart", key: "org-chart" },
  { prefix: "/recruiting/onboarding", key: "recruiting-onboarding" },
  { prefix: "/recruiting/integrations", key: "recruiting-integrations" },
  { prefix: "/recruiting", key: "recruiting" },
  { prefix: "/hr/formazione", key: "hr-formazione" },
  { prefix: "/percorso/formazione", key: "formazione" },
  { prefix: "/", key: "dashboard" }
];

function bestPrefixMatch<T extends { prefix: string }>(pathname: string, rows: T[]): T | undefined {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const hits = rows.filter((r) => normalized === r.prefix || normalized.startsWith(`${r.prefix}/`));
  if (!hits.length) return undefined;
  hits.sort((a, b) => b.prefix.length - a.prefix.length);
  return hits[0];
}

export function resolveHebbPageHelpSummary(pathname: string): string {
  const hebb = bestPrefixMatch(pathname, PATH_HEBB_HELP);
  if (hebb) {
    return getHebbAiPageHelp(hebb.key).summary;
  }
  const nexa = bestPrefixMatch(pathname, PATH_NEXA_HELP);
  if (nexa) {
    return getNexaPageHelp(nexa.key).summary;
  }
  return `Pagina Nexa HR: ${navCatalogBestLabelForPathname(pathname)}. Usa i moduli e i report collegati dal menu per operazioni ufficiali.`;
}

export function resolveHebbUserRole(sessionUser?: SessionUser | null): HebbPageContextUserRole {
  if (!sessionUser) {
    return "employee";
  }
  if (sessionUser.role === "superuser" || sessionUser.isSynapseSuperuser || sessionUser.canNexaAdmin) {
    return "superuser";
  }
  if (
    sessionUser.canAccessHrExtendedConsole ||
    sessionUser.canAccessHrRecapDashboard ||
    sessionUser.canAccessPersonnelBudgetArea
  ) {
    return "hr";
  }
  if (sessionUser.hasDirectReports || sessionUser.isTeamResponsible) {
    return "manager";
  }
  return "employee";
}

/** Costruisce il contesto pagina da inviare alle API HEBB. */
export function buildHebbPageContext(options: BuildHebbPageContextOptions): HebbPageContextPayload {
  const pathname = options.pathname.replace(/\/$/, "") || "/";
  const user = options.sessionUser;
  const companyId = user?.companyId?.trim() || user?.tenantId?.trim() || "unknown";
  return {
    currentPath: pathname,
    pageLabel: navCatalogBestLabelForPathname(pathname),
    userRole: resolveHebbUserRole(user),
    companyId,
    teamScope: options.teamScope?.trim() || undefined,
    costCenterScope: options.costCenterScope?.trim() || undefined,
    periodScope: options.periodScope?.trim() || undefined,
    employmentState: user?.employmentState,
    pageHelp: resolveHebbPageHelpSummary(pathname)
  };
}
