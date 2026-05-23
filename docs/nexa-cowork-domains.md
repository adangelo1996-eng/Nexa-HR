# Nexa Cowork — domini e prompt NL

Workspace HR per **modifiche di massa** con linguaggio naturale, preview HITL obbligatoria e LLM solo su aggregati pseudonimizzati (`AiPrivacyGateway`).

**Route:** `/hr/cowork` · **API:** `POST /cowork/plan`, `POST /cowork/apply`, `GET /cowork/plans/:id`

**Permessi:** `nexa.lifecycle:read` (meta/plan read), `nexa.lifecycle:write` (plan/apply) — HR esteso / superuser.

## Priorità domini (classificazione intent)

1. **Accordi smart working annuali** (`smartworking_agreements`) — tabella `smartworking_agreements`
2. **Estensione richieste SW** (`smartworking_requests`) — batch update `endDay` su richieste approvate
3. **Contratti standard + clausola SW** (`employment_contracts`) — `hr_standard_contracts` (bozza/versione)
4. **Formazione batch** (`training`) — stub v1, messaggio «in arrivo»

Parole chiave indicative: *accordo/policy/annuale* → (1); *richiest/estend/approv/remot* → (2); *contratt/clausol/firm* → (3).

## Esempi prompt supportati (v1)

| Prompt (NL) | Dominio | Effetto preview |
|-------------|---------|-----------------|
| «Rinnova accordi smart working 2026 per tutti i dipendenti» | accordi | Riga per dipendente: create/renew con `valid_from`/`valid_to` anno |
| «Rinnova accordi SW 2026 per centro di costo Marketing» | accordi | Stesso, filtro CC se passato in body o risolto in scope |
| «Estendi richieste smart working approvate fino al 31/12/2026» | richieste | Solo richieste `approved` con `endDay` &lt; target |
| «Estendi periodi remote approvati fino a fine anno» | richieste | `endDay` → 31/12 anno corrente o anno nel testo |
| «Prepara rinnovo contratti con clausola smart working» | contratti | Bozza o update clausola SW su contratto esistente |
| «Assegna corso formazione a tutti» | training | Errore v1 — dominio in arrivo |

## Flusso HITL

1. HR scrive in chat → `POST /cowork/plan`
2. Backend: classifica dominio, aggregati → LLM (solo summary), **hydration** righe con nominativi
3. UI: tabella con checkbox, **Applica selezionati**
4. `POST /cowork/apply` → executor di dominio, audit `cowork_plan` / `cowork_apply`
5. Piano in `hr_cowork_plans`, TTL 24h

## Privacy

- **UI HR:** nominativi in preview (decisione prodotto)
- **LLM:** solo `scopeCount`, `aggregates`, `domain`, `message` — mai `fullName` nel payload modello
- Audit: fingerprint input, no PII in log LLM

## Limiti v1

- Max **200** righe per piano (`COWORK_MAX_ROWS`)
- Formazione, policy aziendali, organigramma: registry con messaggio «dominio in arrivo»
- Template PDF accordo SW: bozza record DB; upload documento vault opzionale in iterazione successiva

## Migration

Applicare `infra/supabase/migrations/076_smartworking_agreements.sql` (tabelle `smartworking_agreements`, `hr_cowork_plans` + RLS).

## Test manuali

1. Login HR admin → `/hr/cowork`
2. Chip «Rinnova accordi…» → verifica summary + tabella con nominativi
3. Deseleziona metà righe → **Applica selezionati** → stati `applied` / resto `proposed`
4. Prompt «Estendi richieste…» con almeno una richiesta SW approvata in DB
5. Verifica banner privacy e assenza errori console
