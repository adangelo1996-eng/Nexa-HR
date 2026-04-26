# Portal routing + permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare i redirect “spurî” verso `/mappa-portale` e allineare menu + mappa portale alle stesse regole di permesso, includendo le sottoroute reali.

**Architecture:** Rendere `canAccessNexaPortalRoute` robusta per sezioni (prefissi) con eccezioni dove i permessi differiscono. Correggere il link “Dashboard” del menu per puntare alla dashboard operativa (`/`).

**Tech Stack:** Next.js App Router, React, TypeScript.

---

### Task 1: Correggere “Dashboard” nel menu

**Files:**
- Modify: `apps/frontend/components/app-shell.tsx` (NAV_DASHBOARD)

- [ ] **Step 1: Aggiornare NAV_DASHBOARD a `/`**

Implementazione (estratto):

```tsx
const NAV_DASHBOARD: NavItem = { href: "/" as Route, label: "Dashboard", icon: LayoutDashboard };
```

- [ ] **Step 2: Verifica statica**

Aprire il file e verificare che:
- la voce “Mappa portale” resti su `/mappa-portale`
- la voce “Dashboard operativa” resti su `/`

---

### Task 2: Permessi route per prefisso + eccezioni

**Files:**
- Modify: `apps/frontend/lib/nexa-route-access.ts`

- [ ] **Step 1: Introdurre normalizzazione path**

Implementare una normalizzazione che:
- rimuove querystring
- rimuove trailing slash (eccetto root `/`)

Esempio:

```ts
function normalizePath(href: string): string {
  const base = (href.split("?")[0] ?? href).trim();
  if (!base) return "/";
  if (base === "/") return "/";
  return base.replace(/\/+$/, "");
}
```

- [ ] **Step 2: Gestire eccezioni con permessi diversi**

Gestire prima i casi speciali (match esatto):
- `/expenses/org`
- `/workflow/approvals`
- `/recruiting/onboarding`
- `/hr-center/budget-report`

- [ ] **Step 3: Gestire sezioni per prefisso**

Regole:
- `/admin/*` → stesso permesso di `/admin`
- `/expenses/*` → stesso permesso di `/expenses` (salvo `/expenses/org`)
- `/contracts/*` → stesso permesso di `/contracts`
- `/recruiting/*` → stesso permesso di `/recruiting` (salvo `/recruiting/onboarding`)
- `/personnel-budget/*` → stesso permesso di `/personnel-budget`
- `/hr-center/*` → stesso permesso di `/hr-center` (salvo `/hr-center/budget-report`)

Implementazione attesa:
- riconoscere il “root” della sezione e rientrare nelle regole già esistenti (admin/hrTools/hrExtras/LLM).

- [ ] **Step 4: Mantenere i match esatti per le route “base”**

Conservare i casi “always true” e i casi già condizionati (es. `/organigramma`, `/manager-copilot`, ecc.).

---

### Task 3: Verifica comportamento (senza browser automation)

**Files:**
- (nessuno, solo verifica)

- [ ] **Step 1: Controllo che le sottopagine più comuni siano ammesse**

Verificare nel codice che queste route non risultino `false` solo perché sono sottoroute:
- `/expenses/scan`, `/expenses/scan/review`
- `/admin/roles`, `/admin/data-import`, `/admin/payslip-import`
- `/personnel-budget/annual`, `/personnel-budget/analysis`, `/personnel-budget/forecast`
- `/contracts/<id>` (pattern: `/contracts/`)
- `/recruiting/candidates`, `/recruiting/candidates/<id>`, `/recruiting/pipelines/<id>`

- [ ] **Step 2: Verifica che le eccezioni restino protette**

Assicurarsi che:
- `/expenses/org` non passi con la regola `/expenses/*` se l’utente non ha `sessionCanViewOrgExpenseClaims`
- `/hr-center/budget-report` mantenga il controllo addizionale

