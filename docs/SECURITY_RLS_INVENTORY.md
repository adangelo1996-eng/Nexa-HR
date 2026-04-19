# Inventario RLS — schema `public` (Nexa-HR)

Riferimento per audit PostgREST / client **anon** + **authenticated**. Il backend Nest usa **service role** (bypass RLS).

## Tabelle con RLS esplicito (migrazioni)

| Tabella | Migrazione / nota |
|---------|-------------------|
| `users` | `033` — SELECT solo propria riga (`auth.uid()::text`) |
| `approvals` | `033` — ENABLE RLS + policy superuser/manager/owner |
| `user_notifications` | `033` — ENABLE RLS + policy già in `011` |
| `smartworking_requests` (remote working) | `011` — policy visibilità |
| `travel_requests` | `023` — policy visibilità |

## Tabelle `public` senza RLS in questo inventario

Accesso effettivo dipende da **GRANT** Supabase e da uso (solo API server vs browser). Da valutare caso per caso:

- `time_entries`, `workday_summaries`, `leave_plans`, `sickness_events`, `delegations`, `payslips`, `leave_balances`
- `roles`, `cost_centers`, `nexa_import_events`
- `expense_claims`, `shifts`, `employee_documents`, `lifecycle_onboarding`, `innovation_jobs`
- `smartworking_requests` — remote working, RLS sì; `nfc_badge_tokens`, `payslip_reads`
- `work_teams`, `company_holidays`, `company_settings`
- `personnel_budget_*`, `payroll_annual_state`
- `payroll_*` workflow oltre `payslips` se presenti

## Follow-up consigliato

1. Per ogni tabella: chi deve leggerla dal **browser** con JWT Supabase?
2. Se nessuno: documentare “solo service_role” e considerare `REVOKE` verso `anon`/`authenticated` o RLS deny-by-default.
3. Se il client legge: policy minime + test Realtime.

Vedi anche [SUPABASE_RLS.md](deploy/SUPABASE_RLS.md) e [SECURITY_BASELINE.md](architecture/SECURITY_BASELINE.md).
