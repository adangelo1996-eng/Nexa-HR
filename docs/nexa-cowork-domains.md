# Nexa Cowork — catalogo operazioni full-app

Workspace HR per **modifiche di massa** con linguaggio naturale, preview HITL obbligatoria e LLM planner su aggregati pseudonimizzati (`AiPrivacyGateway`).

**Route:** `/hr/cowork` · layout **verticale** (chat + preview piano + pannello storico).

**API principali**

| Metodo | Path | Permesso |
|--------|------|----------|
| `GET` | `/cowork/meta` | `nexa.lifecycle:read` |
| `POST` | `/cowork/plan` | `nexa.lifecycle:write` |
| `GET` | `/cowork/plans/:id` | `nexa.lifecycle:read` |
| `POST` | `/cowork/apply` | `nexa.lifecycle:write` |
| `POST` | `/cowork/undo` | `nexa.lifecycle:write` |
| `POST` | `/cowork/cancel` | `nexa.lifecycle:write` |
| `GET` | `/cowork/history` | `nexa.lifecycle:read` |

Ogni **tool** ha inoltre permessi Nexa dedicati (filtrati prima del planner).

## Planner LLM (`ai_cowork_planner_v2`)

- Catalogo **37 tool** in `cowork-tool-catalog.ts`, raggruppati per `areaId` — tutti `executable: true`.
- Output: più **sezioni** (tool + dominio), **summary**, o **chiarimento** (`kind: clarification`, HTTP 200) con suggerimenti per area.
- Righe con nominativi solo **server-side** (`CoworkPlanHydrationService.buildRowsForTool`).
- Fallback senza LLM: `classifyToolHints` + `classifyDomains` → sezioni o chiarimento con etichette area.
- `conversationHistory` (ultimi N turni); mai nominativi nel payload modello.

## Aree (`areaId`)

| Area | Esempi tool |
|------|-------------|
| `calendar` | `create_meeting_room_booking`, `create_shift_batch`, `cancel_meeting_room_booking`, `sync_team_calendar_view` |
| `time_off` | `create_leave_plan`, `create_smartworking_request`, `approve_pending_leaves`, … |
| `smartworking_agreements` | `renew_agreements` |
| `smartworking_requests` | `extend_approved_requests` |
| `employment_contracts` | `update_contract_sw_clause` |
| `lifecycle` | `start_offboarding` |
| `payroll` | `publish_payslips_period`, `payroll_batch_generate`, `compensation_benchmark_estimate` |
| `org` | `update_leave_allowance` |
| `training` | `training_batch`, `assign_training_course` |
| `documents` | `upload_employee_document`, `link_document_ack` |
| `onboarding` | `start_onboarding_from_candidate`, `onboarding_wizard_reminder` |
| `analytics` | `run_hr_center_recap`, `run_retention_analysis`, `evaluate_hr_alerts` |
| `personnel_budget` | `personnel_budget_adjust` |
| `recruiting` | `recruiting_linkedin_sync` |
| `corporate_policies` | `corporate_policy_publish` |
| `third_party_licenses` | `third_party_license_assign` |
| `admin` | `export_employees_preview` |
| `generic` | `create_expense_claim`, `approve_pending_expenses`, `create_innovation_job`, `hr_recap_reminder`, `attendance_qr_batch` |

## API dedicate (usate da Cowork generic executor)

| Tool Cowork | Endpoint backend |
|-------------|------------------|
| `link_document_ack` | `POST /documents/vault/:documentId/reminder` |
| `onboarding_wizard_reminder` | `POST /hr-onboarding/wizard/:userId/reminder` |
| `attendance_qr_batch` | `POST /attendance/team/entries/bulk` |
| `sync_team_calendar_view` | `POST /hr/work-calendar/export` (riepilogo JSON) |

Gli altri tool riusano servizi esistenti (`TrainingService`, `HrOnboardingService`, `HrDataStore`, `HrCenterService`, `CompensationBenchService`, `LinkedInJobSyncService`, ecc.) senza duplicare la logica di business.

## Calendario

- **Evento inseribile da Cowork:** prenotazione **sala riunioni** → `create_meeting_room_booking`.
- **Export vista team:** `sync_team_calendar_view` (solo lettura, nessuna scrittura evento generico).
- Ferie/SW/turni/malattia/trasferte usano i tool `time_off` / `calendar` dedicati e compaiono sul calendario aggregato.

## Esempi prompt

| Prompt (NL) | Tool tipico |
|-------------|-------------|
| «Rinnova accordi smart working 2026 per tutti» | `renew_agreements` |
| «Prenota sala domani 10-12 titolo Standup» | `create_meeting_room_booking` |
| «Export calendario team settimana corrente» | `sync_team_calendar_view` |
| «Timbratura entrata oggi per il team» | `attendance_qr_batch` |
| «Promemoria lettura documento vault» | `link_document_ack` |
| «Promemoria step onboarding incompleti» | `onboarding_wizard_reminder` |
| «Assegna corso formazione a tutti» | `training_batch` |
| Messaggio ambiguo | Chiarimento + `suggestions` |

## Flusso HITL

1. HR scrive in chat (+ filtri CC/team opzionali) → `POST /cowork/plan`
   - Crea/aggiorna riga in `hr_cowork_requests` (`draft` → `planned` con `plan_id` quando il piano è pronto).
2. Permessi → planner LLM (se attivo) → hydration per `toolId` → `sections[]` / `rows[]`
3. UI: etichetta **tool** + area, sezioni collassabili, approvazione manuale
4. `POST /cowork/apply` — `CoworkExecutorRegistry` → executor dominio legacy o `CoworkGenericExecutor`
   - Ogni riga applicata → `hr_cowork_apply_log` (undo dove reversibile).
   - Richiesta collegata → `applied` quando il piano è completamente applicato.
5. Piano in `hr_cowork_plans` (payload righe v2 + `sectionMeta`), TTL 24h, stati `pending` / `partial` / `applied` / `expired` / `cancelled`.

## Undo, cancel, storico

| Azione | API | Effetto |
|--------|-----|---------|
| **Undo** riga | `POST /cowork/undo` (`logId` o `planId`+`rowId`) | Ripristina entità se il tool è reversibile; aggiorna `undo_status` su `hr_cowork_apply_log`. |
| **Cancel** piano | `POST /cowork/cancel` | Piano `cancelled`; richiesta `cancelled` + `cancelled_at` / `cancelled_by`. |
| **Storico** | `GET /cowork/history` | Ultimi 30 giorni, batch da `hr_cowork_apply_log`, raggruppati per mese (`months[]` con `label` IT, es. «Maggio 2026»). Paginazione per **mese** (`page`, `pageSize`). |

Tool non reversibili (es. `publish_payslips_period`, `renew_agreements`) compaiono con `undo_status: blocked` e messaggio in UI.

## Tabelle Supabase

| Tabella | Ruolo |
|---------|--------|
| `hr_cowork_plans` | Piano HITL (righe, sezioni, TTL, stato). |
| `hr_cowork_apply_log` | Audit per riga applicata: `batch_id`, `actor_user_id`, `subject_*`, `applied_payload`, `previous_state`, `undo_status`. |
| `hr_cowork_requests` | Sessione chat NL: `message`, `conversation_history`, `status`, `plan_id`, annullamento. |

**RLS:** company-scoped; lettura `nexa.lifecycle:read` (o `read:team` / admin); scrittura `nexa.lifecycle:write`. Funzioni helper `nexa_rls_me_has_lifecycle_read/write`.

Migrazioni: `077_hr_cowork_apply_log`, `078_hr_cowork_requests`, `079_hr_cowork_apply_log_schema_repair` (allinea DB se era stata applicata la 077 legacy con schema diverso).

## Privacy

- **UI HR:** nominativi in preview
- **LLM:** `scopeCount`, `aggregatesByDomain`, `availableTools`, `regexToolHints` — no `fullName`

## Limiti

- Max **200** righe (`COWORK_MAX_ROWS`)
- Timbrature batch: max **100** entry per chiamata `POST /attendance/team/entries/bulk`

## File principali

- `apps/backend/src/cowork/cowork-tool-catalog.ts` — catalogo **37 tool**
- `apps/backend/src/cowork/cowork-apply-log.store.ts` — persistenza undo/history
- `apps/backend/src/cowork/cowork-requests.store.ts` — richieste chat draft/planned/applied/cancelled
- `apps/backend/src/cowork/cowork-undo.service.ts` — undo per tool
- `apps/backend/src/cowork/cowork-history.util.ts` — raggruppamento storico per mese
- `apps/backend/src/cowork/executors/cowork-generic.executor.ts` — apply tool non-legacy
- `apps/backend/src/cowork/cowork-permissions.service.ts` — filtro permessi per tool
- `apps/backend/src/cowork/cowork-plan-hydration.service.ts` — righe HITL per tool
- `apps/frontend/app/(app)/(hr)/hr/cowork/page.tsx` — UI verticale, storico per mese collassabile
