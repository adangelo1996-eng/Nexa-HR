# Runbook — rotazione segreti Nexa-HR

## Variabili critiche

| Segreto | Dove | Effetto se ruotato |
|---------|------|-------------------|
| `AUTH_JWT_SECRET` | Backend Nest, Edge `payday-attendance` | Tutti i JWT app invalidati; utenti devono rifare login |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend, script seed/update, Edge | Accesso DB amministrativo; aggiornare ovunque prima di revocare vecchia chiave in dashboard |
| `SUPABASE_ANON_KEY` | Frontend `NEXT_PUBLIC_*`, Edge | Client API; coerenza con progetto Supabase |
| `SUPABASE_JWT_SECRET` | Se usato per validare JWT Supabase | Sessioni Supabase OAuth |
| `APP_SSO_SHARED_KEY` | SSO Synapse | Token SSO invalidati |
| `AUTH_SHARED_PASSWORD` | Solo modalità legacy senza Supabase Auth | Password condivisa demo |

## Produzione (`NODE_ENV=production`)

Il backend chiama `assertProductionAuthConfig()` all’avvio ([`main.ts`](../apps/backend/src/main.ts)):

- `AUTH_JWT_SECRET` obbligatorio e diverso dal default di sviluppo.
- Senza Supabase URL + service role: obbligatorio `AUTH_SHARED_PASSWORD` (o `AUTH_PASSWORD`).

## Ordine operativo consigliato

1. Generare nuovo valore (es. 32+ caratteri casuali per JWT).
2. Aggiornare **Render** / **Vercel** / **GitHub Secrets** / **Supabase Edge secrets** nello stesso intervento.
3. Redeploy backend e funzioni Edge.
4. Comunicare logout forzato agli utenti se ruoti `AUTH_JWT_SECRET`.

## Verifica post-deploy

- Login password e OAuth (se abilitato).
- Timbrature / Edge se usate in produzione.
- Vedi [VERIFY_SUPABASE_MIGRATIONS.md](deploy/VERIFY_SUPABASE_MIGRATIONS.md) per schema DB.
