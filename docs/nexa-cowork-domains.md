# Nexa Cowork — domini e prompt NL

Workspace HR per **modifiche di massa** con linguaggio naturale, preview HITL obbligatoria e LLM planner su aggregati pseudonimizzati (`AiPrivacyGateway`).

**Route:** `/hr/cowork` · **API:** `POST /cowork/plan`, `POST /cowork/apply`, `GET /cowork/plans/:id`

**Permessi:** `nexa.lifecycle:read` (meta/plan read), `nexa.lifecycle:write` (plan/apply) — HR esteso / superuser.

## Planner LLM (`ai_cowork_planner_v1`)

- Sostituisce l’errore rigido «Intento non riconosciuto» quando il modello è attivo.
- Output: **più sezioni** (accordi + richieste + contratti nello stesso piano), **summary**, o **chiarimento** (`kind: clarification`, HTTP 200).
- Tool whitelisted in `COWORK_TOOL_CATALOG`; le righe con nominativi sono generate **solo server-side** (`CoworkPlanHydrationService`).
- Fallback senza LLM: `classifyDomains` regex → sezioni multiple o chiarimento.
- `conversationHistory` (ultimi N turni) passato al planner; mai nominativi nel payload modello.

## Domini operativi

1. **Accordi smart working annuali** (`smartworking_agreements`) — `renew_agreements`
2. **Estensione richieste SW** (`smartworking_requests`) — `extend_approved_requests`
3. **Contratti standard + clausola SW** (`employment_contracts`) — `update_contract_sw_clause`
4. **Formazione batch** (`training`) — `training_batch`, spiegazione «in arrivo» (nessun executor)

## Esempi prompt

| Prompt (NL) | Effetto |
|-------------|---------|
| «Rinnova accordi smart working 2026 per tutti» | Sezione accordi, righe create/renew |
| «Estendi richieste approvate fino al 31/12/2026» | Sezione richieste |
| «Accordi 2026 e estendi richieste approvate» | **Due sezioni** nello stesso piano |
| «Assegna corso formazione a tutti» | Chiarimento (dominio in arrivo), non 400 |
| Messaggio ambiguo | Chiarimento + `suggestions` |

## Flusso HITL

1. HR scrive in chat (+ filtri CC/team opzionali) → `POST /cowork/plan`
2. Planner + hydration → `sections[]` e `rows[]` con `sectionId`
3. UI: sezioni collassabili, **Approva sezione**, selezione globale
4. `POST /cowork/apply` — sempre manuale, per `selectedRowIds`
5. Piano in `hr_cowork_plans` (`rows_json` v2 con `sectionMeta`), TTL 24h

## Privacy

- **UI HR:** nominativi in preview
- **LLM:** `scopeCount`, `aggregatesByDomain`, tool catalog, `conversationTail` — no `fullName`
- Schema summary legacy: `ai_cowork_plan_v1` (solo refine summary, opzionale)

## Limiti

- Max **200** righe per piano (`COWORK_MAX_ROWS`)
- Formazione: nessuna riga applicabile fino a executor dedicato

## Migration

`infra/supabase/migrations/076_smartworking_agreements.sql` — tabelle `smartworking_agreements`, `hr_cowork_plans` + RLS.
