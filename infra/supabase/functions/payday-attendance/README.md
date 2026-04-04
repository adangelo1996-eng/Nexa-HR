# payday-attendance (Edge)

## Sicurezza

- **`verify_jwt = false`** in `config.toml`: necessario perché i client possono autenticarsi con il **JWT applicativo** (Nest, `AUTH_JWT_SECRET`, HS256) oppure con sessione Supabase.
- Ogni richiesta mutativa / sensibile passa da **`getAuthContext`** in `index.ts`, che:
  1. Verifica `Authorization: Bearer` con `jose.jwtVerify` e `AUTH_JWT_SECRET`.
  2. In fallback, usa `anon` + `auth.getUser()` e risolve `public.users` via **service role** lato funzione.

Non esporre la **service role** al browser; resta solo in secret Deno.

## Variabili

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `AUTH_JWT_SECRET` (stesso segreto del backend Nest in produzione)
