import type { Route } from "next";
import {
  sessionCanAccessHrRecapDashboard,
  sessionCanAccessManagerPanel,
  sessionCanAccessPayrollArea,
  sessionCanAccessPersonnelBudgetArea,
  sessionCanNexaAdmin,
  sessionCanSeeApprovalsAndHrExtras,
  sessionCanUseNexaAiOpenAiLlm,
  sessionCanViewOrgExpenseClaims,
  type SessionUser
} from "@/lib/auth-session";

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

  const r = href.split("?")[0] ?? href;

  switch (r) {
    case "/mappa-portale":
    case "/":
    case "/attendance":
    case "/work-calendar":
    case "/workflow":
    case "/expenses":
    case "/payslips":
    case "/settings":
    case "/org-chart":
    case "/scheduling":
    case "/smartworking":
      return true;
    case "/organigramma":
    case "/workforce-planning":
    case "/workflow/approvals":
    case "/reports":
      return !hide && hrExtras;
    case "/manager-copilot":
      return !hide && sessionCanAccessManagerPanel(user);
    case "/hr-center":
    case "/hr-center/analisi":
    case "/hr-center/recap":
      return !hide && sessionCanUseNexaAiOpenAiLlm(user);
    case "/hr-center/budget-report":
      return (
        !hide &&
        sessionCanUseNexaAiOpenAiLlm(user) &&
        (sessionCanNexaAdmin(user) || sessionCanAccessPersonnelBudgetArea(user) === true)
      );
    case "/ai-hub":
      return !hide && sessionCanUseNexaAiOpenAiLlm(user);
    case "/insights":
    case "/recruiting":
    case "/contracts":
    case "/tools/third-party-licenses":
    case "/tools/cost-calculator":
    case "/forecast":
    case "/compensation/bench":
      return hrTools;
    case "/recruiting/onboarding":
      return !hide && sessionCanAccessHrRecapDashboard(user);
    case "/corporate-policies":
      return !hide && sessionCanNexaAdmin(user);
    case "/personnel-budget":
      return !hide && sessionCanNexaAdmin(user);
    case "/hr-recap":
      return !hide && sessionCanAccessHrRecapDashboard(user);
    case "/expenses/org":
      return !hide && sessionCanViewOrgExpenseClaims(user);
    case "/payroll-hebb":
      return !hide && sessionCanAccessPayrollArea(user);
    case "/admin":
    case "/admin/data-export":
    case "/admin/cost-centers":
      return !hide && sessionCanNexaAdmin(user);
    default:
      return false;
  }
}

export function filterPortalHref(href: Route, user: SessionUser | null, hideSensitiveHr: boolean): boolean {
  return canAccessNexaPortalRoute(String(href), user, hideSensitiveHr);
}
