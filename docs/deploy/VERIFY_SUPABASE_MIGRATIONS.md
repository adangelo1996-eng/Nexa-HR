# Checklist verifica migrazioni Supabase (staging / prod)

Eseguire dopo ogni `supabase db push`, deploy Render (`supabase-remote-push.mjs`), o workflow GitHub **Supabase DB push**.

## Budget annuo (`personnel_budget_year_status`)

```sql
select to_regclass('public.personnel_budget_year_status');
```

- Atteso: `personnel_budget_year_status` (non null).
- Se null: applicare migrazioni fino a **`028_ensure_personnel_budget_schema_and_reload_postgrest.sql`** (include `NOTIFY pgrst, 'reload schema'`).

Smoke UI: **Personnel budget → Annuale**, nessun errore *schema cache*.

## Sicurezza RLS (`033`)

```sql
select relrowsecurity from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'users';
```

- Atteso: `relrowsecurity = true` su `users` dopo `033`.

Smoke: workflow **Approvazioni** / Realtime, notifiche, login Supabase + sessione browser.

## Se la 028 fallisce per FK

Assicurarsi che esistano `cost_centers` e `users` (migrazioni `005`, `001`, `012` ecc.) prima della 028.
