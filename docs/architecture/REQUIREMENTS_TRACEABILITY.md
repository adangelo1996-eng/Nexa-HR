# Nexa HR — tracciamento requisiti (source of truth)

Ogni voce collega: **bounded context** backend, **permesso** (`nexa.<resource>:read|write`), **persistenza** (tabella/migrazione quando esiste), **UI** (route frontend).

## 1. Tutti gli utenti

| # | Requisito | Context | Permessi | Persistenza | UI |
|---|-----------|---------|----------|-------------|-----|
| 1.1 | Timbratura app/browser/QR/NFC/badge, data/ora, geo opt-in, realtime | `workforce`, `realtime` | `nexa.attendance:*` | `time_entries` (+ meta clock, migrazione 006) | [`app/(employee)/attendance`](../../apps/frontend/app/(employee)/attendance) |
| 1.2 | Ferie/permessi/congedi, residuo live, workflow HR | `timeoff` | `nexa.leaves:*`, `nexa.approvals:*` | `leave_plans`, `leave_balances`, `approvals` | `app/(employee)/workflow` |
| 1.3 | Buste, contratti, documenti, profilo; ore, turni, saldo ferie | `documents`, `people`, `workforce`, `timeoff` | `nexa.payslips:*`, `nexa.documents:*`, `nexa.attendance:read` | `payslips`, vault TBD | dashboard, payslip-area |
| 1.4 | Note spese, rimborsi km → cedolino | `expenses`, `compensation` | `nexa.expenses:*` | `expense_claims` TBD | [`app/(employee)/expenses`](../../apps/frontend/app/(employee)/expenses) |
| 1.5 | Calendario, push scadenze, self-service, accrediti | `timeoff`, `platform` | vari | notifiche TBD | `app/(employee)/calendar`, settings |

## 2. Utenti HR

| # | Requisito | Context | Permessi | Note |
|---|-----------|---------|----------|------|
| 2.1 | Presenze realtime, anomalie, correzioni, fogli, ore/straordinari | `workforce`, `analytics` | `nexa.attendance:*`, report | audit su correzioni |
| 2.2 | Turni, auto-assegnazione, maggiorazioni, sync payroll | `scheduling`, `compensation` | `nexa.shifts:*`, `nexa.payroll:*` | `shifts` TBD |
| 2.3 | Payroll 1-clic, SEPA/F24/UniEmens, simulatore | `compensation` | `nexa.payroll:*` | `@payday/payroll-core` + adapter CH/IT |
| 2.4 | Ferie workflow, congedi, calendario, compliance | `timeoff` | `nexa.leaves:*`, `nexa.approvals:*` | |
| 2.5 | On/offboarding, firma, asset | `lifecycle` | `nexa.lifecycle:*` | TBD |
| 2.6 | Dashboard budget, Excel, scadenziario | `analytics` | `nexa.reports_hr:*` | export job TBD |
| 2.7 | Benefici, compliance, RBAC, integrazioni, forecast, consulenti | `people`, `platform` | `nexa.benefits:*`, `nexa.consultant:*` | scope limitato |

## 3. Sviluppo innovativo

| # | Requisito | Context | Permessi |
|---|-----------|---------|----------|
| 3.1 | AI CV, chatbot, micro-video | `innovation` | `nexa.innovation:*` |
| 3.2 | Retention ML | `innovation` | idem |
| 3.3 | Performance AI | `innovation` | idem |
| 3.4 | Blockchain firma / audit | `innovation`, `lifecycle` | idem |
| 3.5 | Smart contract payroll / SEPA / verifica F24 | `innovation`, `compensation` | idem |
| 3.6 | Wellbeing sentiment | `innovation` | idem |
| 3.7 | ATS LinkedIn/Indeed | `innovation` | idem |
| 3.8 | VR onboarding | `innovation` | idem |
| 3.9 | Spese OCR/ML | `innovation`, `expenses` | idem |

## Aggiornamenti

Allineare questa tabella ad ogni nuova migrazione o permesso in `apps/backend/src/platform/permission-catalog.ts` (dopo cut-over monorepo).
