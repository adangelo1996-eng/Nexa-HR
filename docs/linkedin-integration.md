# Integrazione LinkedIn — Nexa-HR (recruiting)

Sincronizzazione **bidirezionale** delle posizioni lavoro tra Nexa-HR (`recruit_positions`) e LinkedIn Jobs.

## Cosa funziona senza credenziali LinkedIn

| Funzione | Comportamento |
|----------|----------------|
| Pubblicazione Nexa → LinkedIn | Adapter **stub**: genera `linkedin_job_id` tipo `stub-…` e URL placeholder; stato `synced` in DB |
| Webhook LinkedIn → Nexa | Con `LINKEDIN_WEBHOOK_SECRET` configurato: crea/aggiorna posizioni per `linkedin_job_id` |
| Candidature via webhook | Evento `application.received` crea candidato e lo collega alla posizione |
| UI | Badge sync, pulsanti «Pubblica su LinkedIn» / «Sincronizza ora», pagina Integrazioni |

Utile per sviluppo, demo e flussi **Zapier/Make** che inviano job/candidature al webhook senza API Jobs partner.

## Cosa richiede credenziali LinkedIn (OAuth)

Impostare su Render (backend):

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_ORGANIZATION_URN` (es. `urn:li:organization:123456`)

Con tutte e tre presenti, il backend usa l’adapter **oauth** e tenta la pubblicazione su `https://api.linkedin.com/v2/simpleJobPostings`. L’accesso all’API Jobs in produzione spesso richiede **programma partner LinkedIn**; in caso di errore HTTP la posizione resta in `linkedin_sync_status = error` con messaggio in `linkedin_sync_error`.

## Variabili ambiente (backend)

| Variabile | Obbligatoria | Descrizione |
|-----------|--------------|-------------|
| `LINKEDIN_WEBHOOK_SECRET` | Per webhook | Secret condiviso per HMAC SHA-256 sul body raw |
| `LINKEDIN_WEBHOOK_COMPANY_ID` | Consigliata | Tenant default per eventi senza `company_id` (default `comp-1`) |
| `LINKEDIN_JOB_SYNC_ENABLED` | No | `true` / `1` → pubblica automaticamente ogni nuova posizione Nexa |
| `LINKEDIN_CLIENT_ID` | Per API reale | App LinkedIn Developer |
| `LINKEDIN_CLIENT_SECRET` | Per API reale | Secret app |
| `LINKEDIN_ORGANIZATION_URN` | Per API reale | URN pagina azienda |

Non committare segreti: solo `apps/backend/.env.example`.

## Endpoint API

Base: `/api/recruiting/…`

### HR (JWT + permesso `nexa.recruiting:write`)

- `POST /positions` — body opzionale `publishToLinkedIn: true`, `location`
- `POST /positions/:id/linkedin/publish`
- `POST /positions/:id/linkedin/sync` (stesso effetto publish per MVP)
- `GET /positions/:id` — include campi LinkedIn
- `GET /integrations/linkedin/status` — stato adapter (senza segreti)

### Webhook (nessun JWT)

- `POST /integrations/linkedin/webhook`
- Header firma: `X-Nexa-Webhook-Signature: sha256=<hex>` (HMAC-SHA256 del body raw)
- Header alternativi accettati: `X-LinkedIn-Signature`, `X-Hub-Signature-256`

#### Eventi job (LinkedIn → Nexa)

```json
{
  "event": "job.posted",
  "company_id": "comp-1",
  "linkedin_job_id": "12345678",
  "title": "Responsabile vendite",
  "description": "Testo annuncio…",
  "location": "Milano",
  "linkedin_job_url": "https://www.linkedin.com/jobs/view/…",
  "status": "open"
}
```

Idempotenza: stesso `linkedin_job_id` + `company_id` aggiorna la posizione esistente.

#### Eventi candidatura

```json
{
  "event": "application.received",
  "linkedin_job_id": "12345678",
  "applicant_first_name": "Mario",
  "applicant_last_name": "Rossi",
  "applicant_email": "mario@example.com"
}
```

## Alternativa Zapier / Make

1. Crea uno **Zap** su nuovo annuncio LinkedIn (o RSS/email) → **Webhooks by Zapier** POST verso  
   `https://<backend>/api/recruiting/integrations/linkedin/webhook`
2. Mappa i campi al JSON sopra.
3. Aggiungi step **Code** per firmare: `HMAC-SHA256(body, LINKEDIN_WEBHOOK_SECRET)` → header `X-Nexa-Webhook-Signature`.
4. Per Nexa → LinkedIn senza API partner: Zap su «nuova riga»/webhook interno quando HR crea posizione (o polling periodico) verso LinkedIn Limited Posts, oppure pubblicazione manuale + sync solo inbound.

## Database

Migration `073_recruiting_linkedin_job_sync.sql`:

- Colonne su `recruit_positions`: `linkedin_job_id`, `linkedin_job_url`, `linkedin_sync_status`, `linkedin_last_synced_at`, `source`, `location`, …
- Tabella `recruiting_integration_events` per audit eventi webhook/sync

## Setup LinkedIn Developer (API)

1. [LinkedIn Developer Portal](https://www.linkedin.com/developers/) → crea app.
2. Richiedi permessi per job posting / organization (se disponibili per il vostro account).
3. Copia Client ID e Secret su Render.
4. Trova l’**Organization URN** dalla pagina azienda (strumenti admin LinkedIn / API organization lookup).

## Sicurezza

- Webhook: solo con secret configurato e firma valida.
- Publish/sync: solo utenti con `nexa.recruiting:write`.
- Nessun secret esposto in `GET …/status` o nel frontend.
