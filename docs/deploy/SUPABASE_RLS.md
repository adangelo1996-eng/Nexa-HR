# Supabase RLS — Nexa HR

## Modello attuale

- Le tabelle in `public` (es. `users`, `time_entries`, …) hanno **Row Level Security (RLS) attivo**.
- **Non** sono definite policy per i ruoli `anon` e `authenticated` su quei dati HR: in pratica, accesso diretto dal client con la **anon key** non espone righe (comportamento “chiuso”).
- Il backend **NestJS** usa il client Supabase con **`SUPABASE_SERVICE_ROLE_KEY`**: il service role **non è soggetto a RLS** e può leggere/scrivere come oggi implementato in `HrDataStore`.
- **Non** chiamare `auth.signInWithPassword` sul client service_role usato per le query: la sessione utente sostituirebbe il contesto e le `insert` andrebbero in errore RLS. La verifica password in `HrDataStore` usa un client separato (preferire `SUPABASE_ANON_KEY` per quel solo scopo; vedi `.env.example` del backend).

## Cosa non fare

- Non inserire la **service_role** in variabili `NEXT_PUBLIC_*` o in codice eseguito nel browser.
- Non aggiungere policy permissive (`USING (true)`, ecc.) senza una review esplicita di sicurezza.

## Se in futuro userai Supabase dal browser

1. Definire policy **minime** (es. solo `SELECT` sulla propria riga in `public.users`), in genere legando `auth.uid()` / email da **Supabase Auth** al modello dominio.
2. Testare con utenti reali e ruoli; evitare di esporre colonne sensibili (IBAN, ecc.) a ruoli non autorizzati.
3. Valutare **viste** o **Edge Functions** al posto di accesso tabella piena per casi complessi.

## Riferimenti

- Migration schema: `infra/supabase/migrations/`
- Piano evolutivo: [BACKEND_SUPABASE_PLAN.md](./BACKEND_SUPABASE_PLAN.md)
