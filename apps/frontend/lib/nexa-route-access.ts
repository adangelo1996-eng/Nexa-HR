import type { Route } from "next";
import {
  sessionCanAccessHrRecapDashboard,
  sessionCanAccessManagerPanel,
  sessionCanAccessPayrollArea,
  sessionCanAccessPersonnelBudgetArea,
  sessionCanNexaAdmin,
  sessionCanSeeApprovalsAndHrExtras,
  sessionCanUseNexaAiOpenAiLlm,
  sessionCanOpenEmployeeRecapPage,
  sessionCanViewOrgExpenseClaims,
  sessionUsesHrReorganizedNav,
  type SessionUser
} from "@/lib/auth-session";

function normalizePath(href: string): string {
  const base = (href.split("?")[0] ?? href).trim();
  if (!base) {
    return "/";
  }
  if (base === "/") {
    return "/";
  }
  return base.replace(/\/+$/, "");
}

/**
 * Allinea la mappa portale (e ricerche simili) alle stesse regole del menu / permessi sessione:
 * niente tile verso pagine che l’utente non può usare.
 *
 * Sicurezza: queste funzioni governano solo **UI e navigazione client**. Non si può impedire con il browser
 * che qualcuno apra un URL o chiami le API: ogni endpoint Nest deve verificare JWT/permessi (come già fa
 * `NexaPermissionGuard`, `RoleGuard`, controlli in service). La “vista dipendente” da admin è anteprima UX
 * (`sessionStorage`): manipolare Inspect cambia solo i link mostrati, non i permessi sul server.
 */
export function canAccessNexaPortalRoute(
  href: string,
  user: SessionUser | null,
  hideSensitiveHr: boolean
): boolean {
  if (!user) {
    return false;
  }
  const hide = hideSensitiveHr && sessionCanNexaAdmin(user);
  const hrExtras = sessionCanSeeApprovalsAndHrExtras(user);
  const hrTools = !hide && sessionCanNexaAdmin(user);

  const r = normalizePath(href);

  /**
   * Route “sezione/*” reali (App Router): abilita per prefisso quando la pagina base è consentita.
   * Le eccezioni con permessi diversi devono restare esplicite prima del match per prefisso.
   */
  if (r === "/expenses/org" || r.startsWith("/expenses/org/")) {
    return !hide && sessionCanViewOrgExpenseClaims(user);
  }
  if (r === "/workflow/approvals" || r.startsWith("/workflow/approvals/")) {
    return !hide && hrExtras;
  }
  if (r === "/recruiting/onboarding" || r.startsWith("/recruiting/onboarding/")) {
    return !hide && sessionCanAccessHrRecapDashboard(user);
  }
  if (r === "/hr/onboarding" || r.startsWith("/hr/onboarding/")) {
    return !hide && sessionCanAccessHrRecapDashboard(user);
  }
  if (r === "/percorso/formazione" || r === "/formazione") {
    return true;
  }
  if (r === "/hr-center/budget-report" || r.startsWith("/hr-center/budget-report/")) {
    return (
      !hide &&
      sessionCanUseNexaAiOpenAiLlm(user) &&
      (sessionCanNexaAdmin(user) || sessionCanAccessPersonnelBudgetArea(user) === true)
    );
  }

  const prefixToBase: Array<{ prefix: string; base: string }> = [
    { prefix: "/admin/", base: "/admin" },
    { prefix: "/expenses/", base: "/expenses" },
    { prefix: "/contracts/", base: "/contracts" },
    { prefix: "/recruiting/", base: "/recruiting" },
    { prefix: "/personnel-budget/", base: "/personnel-budget" },
    { prefix: "/hr-center/", base: "/hr-center" },
    { prefix: "/employee/", base: "/employee" },
    { prefix: "/lifecycle/", base: "/lifecycle" },
    { prefix: "/analytics/", base: "/analytics" },
    { prefix: "/hr/", base: "/hr-recap" }
  ];

  for (const { prefix, base } of prefixToBase) {
    if (r.startsWith(prefix)) {
      // Riesegui la logica sulla route base della sezione.
      return canAccessNexaPortalRoute(base, user, hideSensitiveHr);
    }
  }

  switch (r) {
    case "/mappa-portale":
    case "/":
    case "/attendance":
    case "/work-calendar":
    case "/workflow":
    case "/expenses":
    case "/payslips":
    case "/settings":
    case "/il-mio-team":
    case "/percorso":
    case "/scheduling":
    case "/smartworking":
    case "/sale-riunioni":
      return true;
    case "/org-chart":
      return sessionUsesHrReorganizedNav(user, hideSensitiveHr);
    case "/organigramma":
    case "/workforce-planning":
    case "/reports":
      return !hide && hrExtras;
    case "/manager-copilot":
      return !hide && sessionCanAccessManagerPanel(user);
    case "/hr-center":
      return !hide && sessionCanUseNexaAiOpenAiLlm(user);
    case "/ai-hub":
      return !hide && sessionCanUseNexaAiOpenAiLlm(user);
    case "/analytics":
      return (
        !hide &&
        sessionCanUseNexaAiOpenAiLlm(user) &&
        (sessionCanNexaAdmin(user) ||
          sessionCanAccessHrRecapDashboard(user) ||
          sessionCanAccessPersonnelBudgetArea(user) === true)
      );
    case "/recruiting":
    case "/contracts":
    case "/tools/third-party-licenses":
    case "/tools/cost-calculator":
    case "/forecast":
    case "/compensation/bench":
    case "/lifecycle":
    case "/lifecycle/offboard":
      return hrTools;
    case "/corporate-policies":
      return !hide && sessionCanNexaAdmin(user);
    case "/personnel-budget":
      return (
        !hide &&
        (sessionCanNexaAdmin(user) ||
          sessionCanAccessHrRecapDashboard(user) ||
          sessionCanAccessPersonnelBudgetArea(user) === true)
      );
    case "/hr-recap":
    case "/hr/dashboard":
      return !hide && sessionCanAccessHrRecapDashboard(user);
    case "/payroll-hebb":
      return !hide && sessionCanAccessPayrollArea(user);
    case "/admin":
    case "/admin/data-export":
    case "/admin/cost-centers":
      return !hide && sessionCanNexaAdmin(user);
    case "/employee":
      return !hide && sessionCanOpenEmployeeRecapPage(user);
    default:
      return false;
  }
}

export function filterPortalHref(href: Route, user: SessionUser | null, hideSensitiveHr: boolean): boolean {
  return canAccessNexaPortalRoute(String(href), user, hideSensitiveHr);
}
