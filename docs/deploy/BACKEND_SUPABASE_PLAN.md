## Nexa HR – Piano backend (Supabase + frontend attuale)

Questo file riassume come proseguire con il backend partendo dalla situazione attuale (login già su Supabase, resto ancora agganciato al vecchio backend Nest via `NEXT_PUBLIC_API_BASE_URL`).

L’idea è:
- **A breve termine** (per demo): puoi riaccendere Nest oppure lasciare alcune parti “vuote”.
- **A medio termine**: migrare gradualmente ogni area funzionale su **Supabase Edge Functions**.

Puoi usare questo piano da qualsiasi macchina aprendo il progetto in Cursor.

---

## 1. Stato attuale (riassunto tecnico)

- Frontend: `apps/frontend` (Next.js 15 App Router, React 19, Tailwind).
- Login:
  - Ora usa **Supabase Auth** (`supabase.auth.signInWithPassword` in `app/login/page.tsx`).
  - Dopo il login salviamo:
    - `SessionUser` (id, email, fullName, role) in `localStorage` via `saveSession` (`lib/auth-session.ts`).
    - `token` = `data.session.access_token` (Supabase JWT).
  - La **home** (`app/page.tsx`) legge l’utente tramite `fetchCurrentUser`, che ora restituisce direttamente il `SessionUser` salvato (`getSessionUser`), senza più chiamare Nest.
- Il resto delle API (`fetchUsers`, `fetchAttendance*`, `fetchPayslips`, `generatePayslip`, ecc. in `lib/api.ts`) punta ancora a:
  - `NEXT_PUBLIC_API_BASE_URL` (es. `http://localhost:4000/api`), cioè il vecchio backend Nest.

Con Nest spento:
- Login funziona (Supabase).
- Dashboard si carica, ma:
  - Le chiamate a `/attendance/*`, `/payroll/*`, `/users`, `/org/*` → 404 / ERR_FAILED.
  - Pagina `/payroll-calc` non funziona perché dipende da `fetchUsers` e `generatePayslip`.

---

## 2. Opzione veloce: riaccendere temporaneamente Nest

Se hai bisogno di una demo “end-to-end” **senza** completare subito la migrazione:

1. **Deploy Nest di nuovo**
   - Usa `apps/backend` (NestJS) e pubblicalo su:
     - Vercel (Node serverless),
     - oppure Railway / Render / altro hosting Node.
   - Assicurati che l’app esponga ancora gli endpoint con prefisso `/api`:
     - `/auth/login`
     - `/users`, `/users/me`
     - `/attendance/*`
     - `/payroll/*`
     - `/org/*`, `/leave/*`, `/sickness/*`

2. **Configura l’URL in ambiente**
   - Su Vercel (progetto `apps/frontend`) e in `.env.local` per lo sviluppo:
     - `NEXT_PUBLIC_API_BASE_URL=https://<host-nest>/api`
       - Esempio: `https://payday-api.yourdomain.com/api`

3. **Risultato**
   - Login continua a usare Supabase.
   - Tutte le funzioni HR (timbrature, cedolini, org chart) tornano a funzionare tramite Nest, come prima.
   - Nel frattempo puoi procedere con la migrazione verso Supabase senza rompere l’esperienza utente.

Il resto di questo documento descrive invece **l’opzione definitiva**: sostituire Nest con Supabase.

---

## 3. Obiettivo finale backend (solo Supabase)

Target architettura:

- **Supabase** fornisce:
  - DB Postgres con tabelle da `infra/supabase/migrations/001_payday_hr_core.sql`:
    - `users`, `time_entries`, `workday_summaries`, `leave_plans`,
      `sickness_events`, `approvals`, `delegations`, `payslips`.
  - **Auth** (email/password): in produzione tipicamente **`admin@synapse.com`** (password **`Synapse2026`**); opzionalmente anche `manager@synapse.com` / `employee@synapse.com` per demo multi-ruolo.
  - **Edge Functions** che sostituiscono gli endpoint Nest.

- **Frontend Next.js**:
  - Usa Supabase Auth per login/sessione.
  - Chiama Supabase Edge Functions invece del backend Nest (o, per alcune operazioni semplici, direttamente il DB con RLS).

---

## 4. Configurazione Supabase (riassunto operativo)

1. **Tabelle DB**
   - In Supabase Dashboard → SQL → New query:
     - Incolla e lancia il contenuto di `infra/supabase/migrations/001_payday_hr_core.sql`.

2. **Utenti applicativi**
   - In **Table editor → users**:
     - Inserisci i 3 record standard:
       - `u-admin`, `admin@synapse.com`, `HR Admin`, `admin`, `companyId = comp-1` (o `id` UUID se allineato ad Auth).
       - `u-manager`, `manager@synapse.com`, `Manager Controllo`, `manager_controllo_gestione`, `companyId = comp-1`.
       - `u-employee`, `employee@synapse.com`, `Dipendente Demo`, `employee`, `managerId = u-manager`, `companyId = comp-1`.

3. **Auth**
   - In Supabase Dashboard → Authentication:
     - Abilita **Email/Password**.
     - Crea in Auth gli stessi utenti (`admin@synapse.com`, ecc.) con password **`Synapse2026`**. Preferisci **Dashboard** o **Admin API**: inserimenti SQL su `auth.users` richiedono token a stringa vuota (`''`) dove non usati (vedi nota in `docs/render-supabase-live.md`).

4. **Env per frontend**
   - In `apps/frontend/.env.local` (e in Vercel):
     - `NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`
   - (Già impostate nel lavoro recente; basta riutilizzarle.

---

## 5. Migrazione per feature – Edge Functions da creare

L’approccio consigliato è migrare **una feature alla volta**. Per ogni feature:

1. Crea una Edge Function in Supabase (via Editor web).
2. Implementa la logica copiando/riproducendo quanto c’è oggi in Nest e `HrDataStore`.
3. Aggiorna `lib/api.ts` in `apps/frontend` per chiamare:
   - O `supabase.functions.invoke("<nome-funzione>")`
   - O l’URL diretto `https://<project>.supabase.co/functions/v1/<nome-funzione>`.
4. Tieni Nest attivo come “backup” finché non sei sicuro della funzione.
5. Quando tutte le funzioni di un dominio sono migrate, puoi smettere di usare gli endpoint Nest per quel dominio.

### 5.1. Users / sessione corrente

**Stato attuale:**
- Funzione Edge `payday-users-me` creata, ma **non più usata**: il frontend ora usa l’utente salvato in `localStorage`.

**Strategia finale (quando vorrai usare davvero l’Edge Function):**
1. Rifinire `payday-users-me` per:
   - Leggere l’utente Auth tramite `supabase.auth.getUser()` (come già fa).
   - Restituire `SessionUser` (`id`, `email`, `fullName`, `role`) preso dalla tabella `users`.
2. In `lib/api.ts`, rimettere `fetchCurrentUser` a usare l’Edge Function:
   - `Authorization: Bearer <access_token>` (Supabase session).
3. Gestire errori 401/404 senza fare subito `clearSession()`, per evitare logout aggressivi.

Per ora, dato che la dashboard funziona con il `SessionUser` in cache, puoi lasciare così e concentrarti su altre feature.

### 5.2. Attendance (timbrature)

Endpoint Nest attuali (da replicare):
- `POST /attendance/clock`
- `GET /attendance/entries`
- `GET /attendance/summary`

**Edge Function suggerita:** `payday-attendance`.

**Passi:**

1. In Supabase → Edge Functions → New function:
   - Nome: `payday-attendance`.
2. Implementa routing interno nella funzione in base a:
   - Metodo (`GET` / `POST`).
   - Path secondario (ad es. usare query param `action=clock|entries|summary` o segmenti nel path).
3. Logica (da `HrDataStore` in `apps/backend/src/modules/hr-data.store.ts`):
   - `clock`: inserisce un record in `time_entries` e aggiorna `workday_summaries`.
   - `entries`: seleziona da `time_entries` per `userId`.
   - `summary`: seleziona da `workday_summaries` per `userId`.
4. Usa l’utente corrente:
   - Ottieni `auth.user()` nella Edge Function.
   - Risali al record corrispondente in `users` per ottenere `id` e `role`.
5. Aggiorna `lib/api.ts`:
   - `clock`, `fetchAttendanceEntries`, `fetchAttendanceSummary` devono chiamare `payday-attendance` anziché `buildApiUrl(...)`.

Finché non migri questi endpoint, la dashboard mostrerà ancora errori API sulle timbrature se Nest non è attivo.

### 5.3. Payroll (cedolini)

Endpoint Nest attuali:
- `POST /payroll/:userId/:period/generate`
- `GET /payroll/payslips`
- `GET /payroll/:userId/:period/pdf`

**Edge Function suggerita:** `payday-payroll`.

**Passi:**

1. Crea Edge Function `payday-payroll`.
2. Replica la logica di `generatePayslip` da `HrDataStore` + `swiss-payroll.util.ts`:
   - Calcolo salari, righe, tasse, ecc.
   - Scrittura in tabella `payslips`.
3. Per il PDF:
   - In una prima fase puoi restituire solo dati (niente vero PDF) o generare un PDF semplice via libreria.
   - L’endpoint `downloadPayslipPdf` nel frontend può essere adattato a scaricare un blob generato dalla funzione.
4. Aggiorna `lib/api.ts`:
   - `generatePayslip` e `downloadPayslipPdf` devono chiamare la Edge Function.

Finché non fai questo, la pagina `/payroll-calc` continuerà a dipendere dal backend Nest.

### 5.4. Users list, Org chart, Leave, Sickness

Endpoint Nest:
- `/users`, `/org/chart`, `/org/approver-chain`, `/org/delegation`
- `/leave/*`
- `/sickness/*`

**Edge Functions suggerite:**
- `payday-users` (lista utenti, ruoli).
- `payday-org` (org chart, approver chain, deleghe).
- `payday-leave` (ferie).
- `payday-sickness` (malattia).

Ogni funzione:
1. Riceve il JWT Supabase (header `Authorization` gestito automaticamente usando il client JS in Edge).
2. Risale alla riga `users` corrispondente.
3. Applica la logica prima presente in Nest (`hr-data.store.ts`).

---

## 6. Adattamenti frontend dopo la migrazione

Quando avrai implementato le Edge Functions:

1. **`lib/api.ts`**
   - Per ogni funzione, sostituisci la chiamata al vecchio endpoint Nest con:
     - `await fetch("https://<project>.supabase.co/functions/v1/<nome-funzione>", {...})`
     - oppure `await supabase.functions.invoke("<nome-funzione>", {...})`.
   - Usa sempre il token Supabase (quello salvato in `saveSession`) nell’header `Authorization: Bearer <token>`.

2. **Rimozione Graduale di Nest**
   - Quando una feature funziona bene via Supabase:
     - Smetti di usare i relativi endpoint in Nest.
   - Quando tutte le feature principali (attendance, payroll, org, leave, sickness) sono migrate:
     - Puoi spegnere definitivamente il backend Nest e rimuovere la dipendenza da `NEXT_PUBLIC_API_BASE_URL`.

3. **Pulizia finale**
   - Rimuovi da `lib/api.ts` ogni funzione non più usata.
   - Aggiorna README / documentazione progetto per riflettere la nuova architettura:
     - Login + sessione: Supabase Auth.
     - Dati HR: Supabase DB + Edge Functions.

---

## 7. Priorità consigliata (ordine di lavoro)

1. **Breve termine (per demo stabile)**
   - Riaccendere Nest su un URL pubblico e impostare `NEXT_PUBLIC_API_BASE_URL` → tutto torna a funzionare subito.
2. **Migrazione progressiva (se vuoi eliminare Nest)**
   1. `payday-users-me` (già in bozza) → riusare lato frontend quando stabile.
   2. `payday-attendance` (timbrature) → per avere dashboard pienamente funzionante.
   3. `payday-payroll` (cedolini + `/payroll-calc`).
   4. `payday-org`, `payday-users`, `payday-leave`, `payday-sickness`.
3. **Lungo termine**
   - Rimuovere completamente `apps/backend` e la variabile `NEXT_PUBLIC_API_BASE_URL`.

Con questo piano puoi riprendere il lavoro da qualsiasi macchina: basta aprire questo file in Cursor e seguire i passi, migrando una funzione alla volta e testando nel frontend.

