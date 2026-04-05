## Deploy backend NestJS (`apps/backend`) su Render (usando Supabase come DB/Auth)

Questa guida spiega come mettere online il backend NestJS su **Render** così che il frontend (Render o Vercel) possa usare gli endpoint `/api/...`, con **Supabase** come database e, se vuoi, come Auth.

> Il monorepo usa **pnpm** e il lockfile è nella **root del repository**. Per questo i comandi di build/start devono partire dalla root (oppure usare il [`render.yaml`](../../render.yaml) in root).

> Nota tecnica:
> - `apps/backend/package.json` ha `"start": "node dist/main.js"`.
> - `apps/backend/src/main.ts` usa `process.env.PORT` (o `API_PORT` come fallback).

---

## Deploy a fasi

### Fase 1 — Solo backend su Render (fai questo step adesso)

**Obiettivo:** API Nest online su Render con **Supabase** come database; nessun frontend su Render ancora (potrai testare dal frontend locale o con curl/Postman).

**0. Prima di Render**

- Codice su **Git** remoto che Render può collegare. Per **GitLab**: integrazione account in Render → [documentazione](https://render.com/docs/gitlab); repository **Nexa-HR**, branch `main`.
- In **Supabase** → *Settings* → *API*: copia **Project URL** (`SUPABASE_URL`) e **service_role** (`SUPABASE_SERVICE_ROLE_KEY`).

**1. Crea il Web Service**

1. [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**.
2. Collega il repository del monorepo **Nexa HR**.
3. Imposta:
   - **Name**: `nexa-hr-backend` (consigliato)
   - **Region**: es. **Frankfurt**
   - **Branch**: `main` (o il tuo default)
   - **Root Directory**: **lasciare vuoto** (root del repo, *non* `apps/backend`)
   - **Runtime**: **Node**
   - **Build Command**:
     ```bash
     corepack enable && corepack prepare pnpm@10.6.0 --activate && pnpm install --frozen-lockfile && pnpm run build:backend:render
     ```
   - **Start Command**:
     ```bash
     pnpm --filter @payday/backend start
     ```

**2. Variabili d’ambiente** (tab *Environment* del servizio)

| Key | Valore |
|-----|--------|
| `NODE_VERSION` | `22` |
| `SUPABASE_URL` | URL del progetto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chiave service role (segreta) |
| `AUTH_JWT_SECRET` | Stringa lunga casuale (es. genera con `openssl rand -hex 32`) |
| `CORS_ORIGIN` | `http://localhost:3000` se testerai il frontend in locale; in **Fase 2** aggiungerai l’URL https del frontend Render (origini multiple separate da **virgola**). |
| `AUTH_SHARED_PASSWORD` | Opzionale: override della password legacy condivisa (default nel codice `Synapse2026`). Su Render imposta `Synapse2026` se vuoi esplicitarla. |

**3. Deploy**

Salva → Render esegue build e start. Se la build fallisce per **`--frozen-lockfile`**, dalla root del repo in locale esegui `pnpm install`, committa `pnpm-lock.yaml` e ripusha; oppure rimuovi temporaneamente `--frozen-lockfile` dal Build Command (solo per sbloccare).

**4. Verifica che la Fase 1 sia ok**

- Apri nel browser: `https://<nome-servizio>.onrender.com/`  
  → risposta JSON con `"status":"ok"`, `"service":"nexa-hr-backend"`, `"basePath":"/api"`.
- **Annota l’URL pubblico del backend** (servirà in Fase 2 per `NEXT_PUBLIC_API_BASE_URL`).

**Fase 2 (dopo):** secondo Web Service per Next (`apps/frontend`) e aggiornamento di `CORS_ORIGIN` con l’URL del frontend. Vedi §6 e [`render.yaml`](../../render.yaml) completo.

Opzione **Blueprint solo backend**: in root esiste [`render-phase1-backend.yaml`](../../render-phase1-backend.yaml) — puoi crearne un blueprint su Render con solo questo file se preferisci l’IaC al posto della compilazione manuale.

---

## 1. Preparazione repository

1. Codice su GitHub (o altro Git supportato da Render).
2. Struttura attesa: backend in `apps/backend`, frontend in `apps/frontend`, root con `pnpm-workspace.yaml` e `pnpm-lock.yaml`.

---

## 2. Database + chiave service role (Supabase)

Hai già (o applichi con CLI):

- migration in `infra/supabase/migrations/001_payday_hr_core.sql`
- utenti demo e Auth email/password se previsti

Dalla dashboard Supabase (Settings → API):

1. **Project URL** → `SUPABASE_URL`
2. **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (solo backend, mai nel frontend)

---

## 3. Servizio backend su Render (monorepo root)

1. Render → **New +** → **Web Service** → collega il repo.
2. Configurazione consigliata:
   - **Name**: es. `nexa-hr-backend`
   - **Region**: EU (es. Frankfurt) se possibile
   - **Branch**: `main` (o la tua principale)
   - **Root Directory**: lasciare **vuoto** (`.`) — **root del monorepo**, non `apps/backend`
   - **Runtime**: Node
   - **Build Command**:
     ```bash
     corepack enable && corepack prepare pnpm@10.6.0 --activate && pnpm install --frozen-lockfile && pnpm run build:backend:render
     ```
   - **Start Command**:
     ```bash
     pnpm --filter @payday/backend start
     ```

Render imposta `PORT` automaticamente; Nest la legge già da `process.env.PORT`.

---

## 4. Variabili d’ambiente (backend)

Nel servizio backend, **Environment Variables**:

| Chiave | Note |
|--------|------|
| `CORS_ORIGIN` | URL del frontend (es. `https://tuo-frontend.onrender.com`). Più origini separate da virgola. Includi `http://localhost:3000` per sviluppo locale se serve. |
| `AUTH_JWT_SECRET` | Stringa lunga casuale (non committare). |
| `AUTH_SHARED_PASSWORD` | Opzionale: password legacy condivisa (default `Synapse2026`). |
| `SUPABASE_URL` | URL progetto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo server-side. |
| `SUPABASE_ANON_KEY` | Opzionale: per `verifySupabasePassword` senza usare la service role sul client di sign-in. |
| `SUPABASE_DB_URL` | Opzionale ma **consigliata** su Render: URI Postgres in **session mode** (porta **5432**, da *Settings → Database*). Serve al build (`supabase-remote-push.mjs --optional`) e, se `DATABASE_URL` è vuota, al **pool transazioni** dell’import Excel dipendenti. |
| `DATABASE_URL` | Opzionale: stesso tipo di URI se vuoi una variabile dedicata solo al pool import (altrimenti basta `SUPABASE_DB_URL`). |

### Verifica deploy Render

- Dashboard: [Render](https://dashboard.render.com) → servizio `nexa-hr-backend` / `nexa-hr-frontend` → **Events** / **Logs** per ultimo deploy e errori di build.
- Il plugin **Render MCP** in Cursor richiede workspace autenticato: se `list_services` risponde *unauthorized*, riapri le integrazioni MCP / account Render e seleziona il workspace corretto (non automatizzabile dal repo).

---

## 5. Deploy e test

1. Dopo il deploy, URL tipo `https://nexa-hr-backend-xxxx.onrender.com`.
2. Root: `GET /` → JSON con `status`, `service`, `basePath: "/api"`.
3. Gli endpoint applicativi sono sotto `/api/...`.

---

## 6. Frontend: puntare al backend

In `apps/frontend`, l’URL API è `NEXT_PUBLIC_API_BASE_URL` (senza suffisso `/api` finale: `lib/api.ts` aggiunge `/api` se manca).

### 6.1 Locale — `apps/frontend/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=https://nexa-hr-backend-xxxx.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<tuo-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### 6.2 Render (secondo Web Service per Next.js)

Stessi comandi pnpm dalla **root**, con:

```bash
corepack enable && corepack prepare pnpm@10.6.0 --activate && pnpm install --frozen-lockfile && pnpm --filter @payday/frontend build
```

```bash
pnpm --filter @payday/frontend start
```

Imposta `NEXT_PUBLIC_API_BASE_URL` all’URL pubblico del backend. Imposta `CORS_ORIGIN` sul backend all’URL del frontend.

### 6.3 Vercel (solo frontend)

Resta possibile ospitare solo `apps/frontend` su Vercel (`pnpm vercel:*` dalla root usa `--cwd apps/frontend`). Configura le stesse env `NEXT_PUBLIC_*` e aggiorna `CORS_ORIGIN` sul backend con l’URL Vercel.

---

## 7. Passi successivi

- Endpoint `/api/health` dedicato (opzionale)
- Log e monitoring su Render
- Rotazione periodica di `AUTH_JWT_SECRET`

Per una definizione dichiarativa di due servizi sulla stessa piattaforma Render, vedi [`render.yaml`](../../render.yaml) nella root del repo.

---

## 8. Checklist: Render (frontend + backend) + DB su Supabase

| Voce | Stato nel repo |
|------|----------------|
| Monorepo pnpm, build dalla **root** con `--filter @payday/backend` / `@payday/frontend` | Sì (`render.yaml`, guida §3) |
| Backend ascolta `PORT` e `0.0.0.0` | Sì (`apps/backend/src/main.ts`) |
| Frontend `next start` con host `0.0.0.0`, porta da env `PORT` (Render) | Sì (`apps/frontend/package.json`) |
| Health check frontend senza login | Sì: `GET /health` escluso dal middleware (`apps/frontend/app/health/route.ts`); in `render.yaml` → `healthCheckPath: /health` |
| Health check backend | Sì: `GET /` → JSON (prima del prefisso `/api`) |
| CORS: pattern `*.onrender.com` + `CORS_ORIGIN` esplicito consigliato | Sì (`main.ts`); imposta `CORS_ORIGIN` con l’URL **https** del frontend Render |
| Supabase: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` solo backend | In `render.yaml` come `sync: false` |
| Postgres URI per migrazioni build + import Excel transazionale | `SUPABASE_DB_URL` (e opz. `DATABASE_URL`) in `render.yaml` come `sync: false` |
| Frontend: `NEXT_PUBLIC_SUPABASE_*` + `NEXT_PUBLIC_API_BASE_URL` (URL backend **senza** `/api`) | In `render.yaml` come `sync: false` |
| Password demo login (`AUTH_*_PASSWORD`) se usi utenti seed | Opzionali; in blueprint come `sync: false` — valorizza al primo setup se servono |

**Ordine consigliato al primo deploy**

1. Deploy **backend**, copia l’URL pubblico (`https://….onrender.com`).
2. Deploy **frontend** con `NEXT_PUBLIC_API_BASE_URL` = quell’URL.
3. Sul backend, imposta `CORS_ORIGIN` = URL pubblico del **frontend** (anche qui `https://….onrender.com`). Senza questo passo il browser può bloccare le chiamate API.
4. In Supabase: schema/migration già applicati; stesse credenziali demo coerenti con le env `AUTH_*` se usi login Nest oltre a Supabase Auth.

---

## 9. Troubleshooting build

### `ERR_PNPM_NO_PKG_MANIFEST` — *No package.json found in /opt/render/project/src*

Significa che nella **root del repository** che Render clona **non c’è** `package.json` (e spesso manca tutto il monorepo).

**Cause tipiche**

1. Su GitHub il repo `Nexa-HR` ha solo un “Initial commit” con README o cartelle sbagliate, **senza** il codice che hai in locale (`package.json`, `pnpm-workspace.yaml`, `apps/backend`, …).
2. In Render, **Root Directory** punta a una sottocartella che non contiene il monorepo (lasciala **vuota** se `package.json` è alla root del repo).

**Cosa fare**

1. Apri su GitHub il repo collegato al servizio e verifica che alla **root** del branch `main` compaiano almeno:
   - `package.json`
   - `pnpm-workspace.yaml`
   - `pnpm-lock.yaml`
   - `apps/backend/` e `apps/frontend/` (e il resto del progetto).
2. Se mancano, dal progetto locale (cartella che contiene davvero quei file):
   ```bash
   git clone https://github.com/adangelo1996-eng/Nexa-HR.git
   cd Nexa-HR
   # copia qui il contenuto della root del monorepo (non una sottocartella annidata)
   git add .
   git commit -m "Add Nexa HR monorepo for Render"
   git push origin main
   ```
   In alternativa, se il monorepo è già un repo Git separato, aggiungi `origin` GitHub e fai `git push -u origin main`.
3. Su Render → servizio **nexa-hr-backend** → **Settings** → controlla **Root Directory**: deve essere vuoto, salvo che il `package.json` non sia volutamente in una sottocartella.
4. **Manual Deploy** → **Clear build cache & deploy** (o attendi il deploy automatico dopo il push).
