# Catalogo funzionalità payroll Svizzera (CH)

## Attivazione

| Ambiente | Variabile | Effetto |
|---------|-----------|---------|
| Backend | `NEXA_SWISS_PAYROLL_ENABLED=true` | Abilita motore CH, export CH, default giurisdizione CH su nuovi utenti (se non specificato), ramo budget CH |
| Frontend | `NEXT_PUBLIC_NEXA_SWISS_PAYROLL_ENABLED=true` | Mostra opzioni CH in admin, benchmark CH, valute CHF dove previsto |

**Default:** assenti o diversi da `true` → funzionalità **disattivata** (solo IT lato calcolo).

## Backend

| Area | File / simboli |
|------|----------------|
| Flag | `apps/backend/src/platform/nexa-swiss-payroll-flag.ts` |
| Calcolo cedolino CH, budget employer CH, simulazione assunzione | `apps/backend/src/platform/hr-data.store.ts` — `calculateSwissPayroll`, `employerBudgetBucketsFromGrossChf`, `simulateHirePayroll`, `generatePayslip`, `getPersonnelBudgetSnapshot` |
| Export + PDF | `apps/backend/src/compensation/payroll.controller.ts` — `createChExportGenerator`, titoli PDF «Svizzera», CHF |
| Pacchetti | `packages/payroll-ch-rules`, `packages/payroll-adapters-ch` |
| DB default `users.jurisdiction` | `infra/supabase/migrations/014_it_profile_calendar_holidays.sql` (`'CH'`) — anagrafica storica; con flag off il calcolo forza IT |

## Frontend

| Area | File |
|------|------|
| Flag e valuta busta paga | `apps/frontend/lib/nexa-swiss-payroll-flag.ts` |
| Admin: giurisdizione, cantone, comune CH | `apps/frontend/app/(app)/(hr)/admin/page.tsx` |
| Budget personale (copy CH) | `apps/frontend/app/(app)/(hr)/personnel-budget/page.tsx` |
| Benchmark mercato CH | `apps/frontend/app/(app)/(hr)/compensation/bench/page.tsx`, `public/data/ch-benchmark.json` |
| Forecast (label CHF) | `apps/frontend/app/(app)/(hr)/forecast/page.tsx` |
| Calcolo cedolino / lista cedolini | `payroll-calc/page.tsx`, `payslips/page.tsx`, `components/payslip-area.tsx` |
| Ricerca globale (route bench / forecast) | `components/app-shell.tsx` |
| Note spese (default valuta) | `expenses/page.tsx` |

## Non è “prodotto Svizzera”

- `toLocaleString("it-CH")` e simili: **locale** di formattazione data/ora, non payroll CH.

## Deploy

Vedi commenti in `render.yaml` per le variabili opzionali da impostare su backend e frontend quando si riattiva la Svizzera.
