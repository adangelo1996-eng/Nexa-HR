# Linear — progetto Cyber Security / milestone NEXA

Usare queste specifiche se il tool Linear MCP non è disponibile. Workspace: **Synapse-Promethys**. Team: **Synapse-Promethys**.

## Struttura

1. **Progetto:** `Cyber Security` (priority **High**).  
   - URL esempio (se già creato): `https://linear.app/synapse-promethys/project/cyber-security-beed4011f6ca`
2. **Milestone:** `NEXA` sul progetto Cyber Security (sottocartella funzionale).
3. **Issue:** `project` = Cyber Security, `milestone` = NEXA, `priority` = **High** (2), `team` = Synapse-Promethys.

## Issue da creare (9)

### 1. Fix Budget annuo: personnel_budget_year_status / PostgREST

Applicare migrazioni **027–028**, verifica `to_regclass`, reload schema se PGRST204; smoke pagina Annuale.  
File: `infra/supabase/migrations/027_*.sql`, `028_*.sql`, `apps/backend/src/platform/hr-data.store.ts`.

### 2. Verifica deploy migrazione 033 RLS

`033_security_rls_users_fix_superuser_policies.sql`; smoke Realtime workflow e notifiche.

### 3. Sostituire dipendenza xlsx nel frontend

Completato in repo: `exceljs` in `apps/frontend`, export report presenze. Chiudere issue dopo `pnpm audit` senza path `xlsx` su frontend.

### 4. Rivedere auth Edge payday-attendance

`infra/supabase/config.toml`, `functions/payday-attendance/index.ts`, `functions/payday-attendance/README.md` (documentazione `verify_jwt = false`).

### 5. Audit RLS tabelle public PostgREST

Usare `docs/SECURITY_RLS_INVENTORY.md`; pianificare migration follow-up.

### 6. Mitigare CVE path-to-regexp / Nest

`pnpm why path-to-regexp`; bump `@nestjs/*` testato.

### 7. Hardening import Excel backend

Limite righe `apply`: `IMPORT_MAX_ROWS`; rate limit e dimensione file già presenti in `ImportService` / controller.

### 8. CI: gate audit dipendenze

`.github/workflows/dependency-audit.yml` — job `audit-critical` (fallisce su critical).

### 9. Runbook rotazione segreti

`docs/security-runbook.md`.

---

**Nota:** se esiste già **SYN-125** (Budget annuo), aggiornare quella issue invece di duplicare.
