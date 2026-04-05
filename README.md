# Nexa HR (CH)

Piattaforma HR cloud enterprise per:
- timbratura entrata/uscita e presenze
- smartworking e accumuli mensili
- ferie e malattia con workflow approvativo
- organigramma dinamico e dipendenze gerarchiche
- cedolino svizzero automatico con area riservata

## Workspace

- `apps/backend`: backend NestJS
- `apps/frontend`: frontend Next.js
- `packages/domain`: tipi dominio condivisi
- `packages/payroll-ch-rules`: motore regole payroll svizzere
- `infra`: Supabase CLI, docker locale, terraform, CI

## Documentazione deploy e backend

- [Deploy backend NestJS su Render (Supabase)](docs/deploy/BACKEND_RENDER_DEPLOY.md)
- [RLS Supabase e accesso ai dati](docs/deploy/SUPABASE_RLS.md)
- [Piano migrazione backend / Supabase](docs/deploy/BACKEND_SUPABASE_PLAN.md)
- [Blueprint Render (due servizi: API + web)](render.yaml)
- [Solo backend — Fase 1](render-phase1-backend.yaml) (blueprint ridotto; vedi commenti nel file)

### Render + GitLab (configurazione iniziale dal repo)

**Flusso repo:** il codice può essere pubblicato prima su **GitHub** e il progetto **Nexa-HR** restare collegato anche su **GitLab** (mirror, push su due remote, o import). In quel caso Render può continuare a fare deploy dal repo **GitHub** (`adangelo1996-eng/Nexa-HR`): l’importante è che il branch **`main`** su GitHub sia allineato a quello che consideri “fonte di verità” (es. stesso `main` su GitLab dopo ogni merge/push).

Non serve Docker: usa **Node** e la root del monorepo.

1. **Opzione A — deploy da GitHub** (come il servizio `nexa-hr-backend` già collegato): nessuna integrazione GitLab richiesta su Render; ogni push su `main` su GitHub avvia il deploy.
2. **Opzione B — deploy da GitLab:** in [Render](https://dashboard.render.com) → **Account Settings** (o **Team**) → **GitLab** → collega l’account e autorizza il progetto **Nexa-HR** ([guida Render](https://render.com/docs/gitlab)). Poi **New +** → **Blueprint** (o Web Service) → repository GitLab, branch **`main`**. Render legge [`render.yaml`](render.yaml) alla root se usi il blueprint.
3. Conferma la creazione (blueprint); quando richiesto, compila le variabili segnate `sync: false` (Supabase, URL frontend/backend incrociati dopo il primo deploy). `AUTH_JWT_SECRET` può essere generata automaticamente dal blueprint.
4. Se preferisci partire **solo dal backend**, segui la [Fase 1 in guida Render](docs/deploy/BACKEND_RENDER_DEPLOY.md) oppure usa il file [`render-phase1-backend.yaml`](render-phase1-backend.yaml) come riferimento (vedi commenti nel file).

## Quick start

1. Installare pnpm.
2. Eseguire `pnpm install`.
3. Eseguire `pnpm dev`.

## Setup Supabase

1. Crea un progetto su Supabase e copia:
   - `Project URL`
   - `service_role key` (Settings -> API)
2. Crea `apps/backend/.env` partendo da `apps/backend/.env.example`.
3. Login CLI: `pnpm supabase:login`
4. Link progetto cloud: `pnpm supabase:link` (ti chiede project ref e password DB)
5. Applica migration: `pnpm supabase:db:push`

Note:
- le migration sono in `infra/supabase/migrations`
- la configurazione CLI e' in `infra/supabase/config.toml`
- il backend usa Supabase solo se trova entrambe le env `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- se manca una delle due env, l'API usa fallback in-memory (utile solo per demo)
- autenticazione backend via JWT (`AUTH_JWT_SECRET`) e password demo condivisa in modalità legacy

Quando hai i valori reali (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`):
1. aggiornali in `apps/backend/.env`
2. aggiungili come variabili d’ambiente sul **servizio backend** (Render, Railway, ecc.) — il backend **non** va deployato come progetto Vercel
3. ridistribuisci il backend

## Login applicativo

Il frontend usa login reale su `POST /api/auth/login` e token JWT Bearer.

Account principale (produzione / Supabase attuale): **`admin@synapse.com`** / **`Synapse2026`** (presente in Auth e in `public.users`).

In **modalità in-memory** (backend senza DB), restano anche i demo **`manager@synapse.com`** e **`employee@synapse.com`** con la stessa password **`Synapse2026`** (utile per test gerarchia/payroll in locale).

In **Supabase Auth** usa **`Synapse2026`** per ogni utente email/password così coincide con Plasticity e Nexa.

Senza override in env, in modalità legacy (backend senza `signInWithPassword`) il default nel codice è **`Synapse2026`**.

Override opzionale:
- `AUTH_SHARED_PASSWORD` (o `AUTH_PASSWORD`) — sostituisce il default legacy

## Nuove funzionalita dashboard/payroll

- Dashboard:
  - rimosso widget "Cedolini disponibili"
  - aggiunti bottoni `Timbratura entrata` e `Timbratura uscita`
  - aggiunto storico timbrature recenti e riepilogo giornaliero
- Pagina `attendance`:
  - storico completo timbrature per giorno (oggi e giorni passati)
  - riepilogo minuti lavorati e modalita (office/smartworking)
- Pagina `payroll-calc` (solo manager/admin):
  - selezione dipendente + periodo
  - calcolo cedolino con endpoint backend
  - export PDF dal risultato

## Deploy (stessa piattaforma consigliata: Render)

Due **Web Service** sulla root del monorepo, comandi pnpm con `--filter` (vedi [`render.yaml`](render.yaml) e [guida Render](docs/deploy/BACKEND_RENDER_DEPLOY.md)):

- **Backend**: build `@payday/backend`, start `pnpm --filter @payday/backend start`
- **Frontend**: build `@payday/frontend`, start `pnpm --filter @payday/frontend start`

Dopo il deploy, allinea `CORS_ORIGIN` (backend) e `NEXT_PUBLIC_API_BASE_URL` (frontend) agli URL pubblici dei due servizi.

`NEXT_PUBLIC_API_BASE_URL` può essere l’URL del backend **con o senza** suffisso `/api`: se manca, il client in `lib/api.ts` lo aggiunge.

### Troubleshooting build Render

- **`pnpm install` fallisce con `frozen-lockfile` / lockfile non allineato** — dopo aver aggiunto dipendenze in un package (es. `apps/backend/package.json`), eseguire in root del monorepo: `pnpm install` e **committare** `pnpm-lock.yaml` aggiornato. Il blueprint usa `--frozen-lockfile`.
- **Monorepo più grande su GitHub** — se il servizio Render punta al repo **Synapse** invece che al repo **Nexa-HR** dedicato, impostare **Root Directory** su `Nexa-HR` (stessi comandi `pnpm` del [`render.yaml`](render.yaml)).
- **Evitare `package-lock.json` dentro `apps/*`** — il workspace è solo **pnpm**; un lockfile npm nella frontend confonde Next.js. Usare solo `pnpm-lock.yaml` in root.

## Prossimi passi (ordine logico)

1. **Repository** — commit e push su `main` (stesso remote collegato a Render).
2. **Frontend online** — da [Render Blueprint](render.yaml) aggiungi il servizio `nexa-hr-frontend`, oppure deploy di `apps/frontend` su Vercel.
3. **Variabili frontend** — `NEXT_PUBLIC_API_BASE_URL` = URL pubblico del backend (es. `https://nexa-hr-backend.onrender.com`). Opzionale: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` se usi funzionalità che leggono Supabase dal browser.
4. **Variabili backend** — `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` già necessarie per il DB; `CORS_ORIGIN` = URL del frontend (lista separata da virgole se hai più origini). Per migrazioni in build e import Excel in transazione: imposta **`SUPABASE_DB_URL`** (URI Postgres session mode 5432); opzionale **`DATABASE_URL`** se vuoi separarla (vedi [`BACKEND_RENDER_DEPLOY.md`](docs/deploy/BACKEND_RENDER_DEPLOY.md)). Nota: in sviluppo il backend accetta anche origini `*.onrender.com` e `*.vercel.app` oltre a `localhost` (vedi `main.ts`).
5. **Smoke test** — apri il frontend, login con le credenziali demo, prova dashboard e una chiamata API (es. timbratura).

## Checklist operativa (Render + Supabase)

- **Health check (frontend)** — Se `nexa-hr-frontend` è stato creato manualmente o via API, in [Render Dashboard](https://dashboard.render.com) apri il servizio → **Settings** → **Health Checks** e imposta **Health Check Path** su `/health` (risposta JSON da `apps/frontend/app/health/route.ts`). I servizi creati dal [blueprint `render.yaml`](render.yaml) hanno già questo valore.
- **RLS e sicurezza DB** — Leggi [SUPABASE_RLS.md](docs/deploy/SUPABASE_RLS.md): i dati HR passano dal backend Nest con **service_role**; non esporre mai la service role al browser.
- **Supabase Dashboard** — *Database → Advisors* per lint sicurezza/prestazioni (es. policy RLS, indici). Correggere in priorità gli avvisi **WARN**; molti **INFO** (FK senza indice, tabelle con RLS senza policy lato client) sono attesi se l’accesso dati è solo via service role.

## Deploy frontend su Vercel (opzionale)

1. Login: `corepack pnpm dlx vercel login`
2. Collega il progetto: `pnpm vercel:link` (root: `apps/frontend`)
3. Env locali: `pnpm vercel:env:pull`
4. Preview / prod: `pnpm vercel:preview` / `pnpm vercel:prod`

Note:

- Su Vercel va solo **Next.js** in `apps/frontend`
- Il backend Nest resta su Render (o altro hosting Node)
- In Vercel imposta `NEXT_PUBLIC_API_BASE_URL` (URL del backend; `/api` è opzionale, vedi sopra) e le altre `NEXT_PUBLIC_*` Supabase
- Sul backend imposta `CORS_ORIGIN` con l’URL del frontend (Vercel o Render)

## Note compliance CH

Le aliquote e le regole di calcolo sono versionate e parametrizzabili per:
- cantone
- sede aziendale
- tipologia di azienda
- anno fiscale
