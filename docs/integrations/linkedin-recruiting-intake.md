# LinkedIn → Nexa-HR — intake candidati

Documento operativo per collegare candidature LinkedIn alla pipeline recruiting di Nexa-HR.

## Cosa funziona oggi (MVP)

| Capacità | Stato | Note |
|----------|--------|------|
| Webhook firmato `POST /api/recruiting/integrations/linkedin/webhook` | ✅ | HMAC-SHA256 sul body grezzo; rate limit per IP |
| Payload normalizzato (Zapier / Make / script) | ✅ | `companyId`, `jobId` (UUID posizione Nexa), nome, email, URL LinkedIn/CV |
| Eventi LinkedIn-style (`application.received`, `job.posted`, …) | ✅ | Crea/aggiorna posizioni da `linkedin_job_id` |
| Dedup per email azienda + `externalId` | ✅ | Log in `recruiting_integration_events` |
| UI **Integrazioni** + test ingest (HR) | ✅ | `/recruiting/integrations` |
| Pubblicazione job su LinkedIn via API OAuth | ⚠️ Stub | Serve partner credentials (vedi sotto) |
| Import CSV manuale | ✅ | Già in UI candidati (fallback) |

## Percorsi di integrazione

### 1. LinkedIn Recruiter / Talent Solutions API (ufficiale)

- **Prodotti**: LinkedIn Recruiting API, Apply Connect, Job Posting (varia per contratto).
- **Accesso**: in genere **partner program** o account Talent Solutions con approvazione LinkedIn; OAuth 2.0 con scope dedicati.
- **Limitazioni**: non disponibile con una semplice app LinkedIn “Sign In”; spesso richiede accordo commerciale, sandbox separata, revisione use-case.
- **In Nexa-HR**: adapter `oauth` in `linkedin-job-adapter.oauth.ts` — attivo solo con `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ORGANIZATION_URN`. Senza queste variabili resta **stub** (nessuna chiamata reale a LinkedIn).

**Quando usarlo**: sync bidirezionale job + application in tempo reale, brand employer su LinkedIn, volumi alti.

### 2. Webhook via Zapier / Make (consigliato per MVP)

1. In Render (backend) impostare `LINKEDIN_WEBHOOK_SECRET` (≥ 16 caratteri casuali).
2. Opzionale: `LINKEDIN_WEBHOOK_COMPANY_ID=comp-1`, `LINKEDIN_WEBHOOK_ALLOWED_COMPANY_IDS=comp-1`.
3. In Nexa: aprire **Colloqui e selezione → Integrazioni**, copiare URL webhook e `companyId`.
4. Su Zapier: trigger (es. “New Lead”, email parser, export LinkedIn Recruiter se disponibile nel piano) → **Webhooks by Zapier → POST**.
5. Header: `Content-Type: application/json`, `X-Nexa-Signature: sha256=<hmac>`.
6. Body esempio:

```json
{
  "companyId": "comp-1",
  "jobId": "UUID_POSIZIONE_NEXA",
  "firstName": "Mario",
  "lastName": "Rossi",
  "email": "mario.rossi@example.com",
  "linkedinUrl": "https://www.linkedin.com/in/...",
  "resumeUrl": "https://...",
  "appliedAt": "2026-05-19T10:00:00Z",
  "externalId": "linkedin-application-12345"
}
```

**Firma** (Zapier Code step o Make function):

```javascript
const crypto = require("crypto");
const body = JSON.stringify({ /* stesso oggetto del POST */ });
const hex = crypto.createHmac("sha256", process.env.LINKEDIN_WEBHOOK_SECRET).update(body).digest("hex");
// Header: X-Nexa-Signature: sha256=${hex}
```

`jobId` deve essere l’UUID di una posizione esistente in Nexa (`recruit_positions.id`), visibile dall’URL pipeline o API.

### 3. Import CSV (fallback)

Per batch o assenza automazione: caricare candidati da UI **Candidati** e **Allega a posizione**. Nessun secret webhook richiesto.

## Variabili ambiente (backend)

Vedi `apps/backend/.env.example`. Nessun segreto reale nel repository.

| Variabile | Obbligatoria | Descrizione |
|-----------|--------------|-------------|
| `LINKEDIN_WEBHOOK_SECRET` | Per webhook | HMAC condiviso con Zapier |
| `LINKEDIN_WEBHOOK_COMPANY_ID` | No | Default `companyId` se omesso nel body |
| `LINKEDIN_WEBHOOK_ALLOWED_COMPANY_IDS` | No | Allowlist CSV tenant |
| `LINKEDIN_WEBHOOK_RATE_LIMIT_PER_MIN` | No | Default 60 req/min per IP |
| `LINKEDIN_INTEGRATION_ACTOR_USER_ID` | No | User Nexa per audit `created_by` |
| `PUBLIC_API_BASE_URL` | UI | Es. `https://nexa-hr-api.onrender.com/api` per URL webhook in Integrazioni |
| `LINKEDIN_CLIENT_ID` / `SECRET` / `ORGANIZATION_URN` | API ufficiale | Partner LinkedIn |
| `LINKEDIN_JOB_SYNC_ENABLED` | No | Auto-publish posizioni Nexa → LinkedIn (stub/oauth) |

## Sicurezza

- Webhook **senza JWT** ma con **firma obbligatoria** e rate limit.
- Config e test ingest richiedono `nexa.recruiting:read` / `write`.
- Eventi in `recruiting_integration_events` (RLS: select HR admin).

## Setup rapido utente (Zapier)

1. Creare posizione in Nexa e copiare il suo **ID** (UUID).
2. Configurare secret su Render e ridistribuire backend.
3. Zap: Trigger → Webhook POST verso URL da UI Integrazioni.
4. Mappare campi → body JSON sopra; calcolare `X-Nexa-Signature` sul body identico.
5. Usare **Test ingest** in Nexa per verificare senza Zapier.
6. Controllare candidato sulla pipeline della posizione.

## Cosa richiede ancora credenziali LinkedIn partner

- Pubblicazione automatica annunci su LinkedIn da Nexa (`POST .../linkedin/publish`).
- Ricezione application native LinkedIn senza middleware (Apply Connect).
- Sync job bidirezionale in tempo reale via API ufficiale.

Fino ad allora: **webhook Zapier + payload normalizzato** è il percorso supportato in produzione.
