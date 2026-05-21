# Nexa Guide — knowledge base (manutenibile)

Documento ingestito all'avvio dell'agente piattaforma. Aggiornare quando cambiano flussi o percorsi principali.

## Come usare questa guida

Ogni voce indica **cosa fare**, **dove** (percorso) e **permesso** tipico. I permessi effettivi dipendono dal ruolo Nexa assegnato in admin.

---

## Presenze e timbratura (1–8)

1. **Timbrare entrata** — Apri **Presenze** (`/attendance`), premi entrata. Serve account attivo.
2. **Timbrare uscita** — Stessa pagina `/attendance`, chiusura giornata.
3. **Correggere una timbratura dimenticata** — Contatta HR o manager; le rettifiche ufficiali passano da workflow/HR, non dall'assistente AI.
4. **Vedere le mie timbrature del mese** — `/attendance` mostra lo storico recente; export completo in **Report presenze** (`/reports`) se hai permesso report.
5. **Esportare report presenze (HR/manager)** — `/reports`, scegli periodo e centro di costo se filtrabile.
6. **Pianificare turni** — `/scheduling` (permesso turni / HR).
7. **Richiedere smart working** — `/smartworking` per invio; il manager approva da `/workflow/approvals` o pannello manager.
8. **Consultare calendario lavoro** — `/work-calendar` (festività, assenze approvate).

## Ferie, permessi e malattia (9–16)

9. **Inviare richiesta ferie** — `/workflow`, tipo «ferie», date e note.
10. **Inviare permesso o malattia** — `/workflow`, seleziona categoria corretta e allega certificato se richiesto dalla policy.
11. **Vedere stato delle mie richieste** — `/workflow` elenco personale.
12. **Annullare una richiesta in bozza** — `/workflow` prima dell'invio definitivo.
13. **Approvare richieste del team (manager)** — `/workflow/approvals` oppure **HEBB AI for HR — Manager** (`/manager-copilot`). Serve `nexa.approvals:read` o ruolo lead con report diretti.
14. **Delegare approvazioni** — Configurazione HR in admin/workflow; l'agente indica il percorso ma non modifica deleghe.
15. **Verificare ferie residue** — Dashboard personale `/` o assistente AI (`/ai-hub`) su dati propri; cedolini e anagrafica per dettaglio contrattuale.
16. **Policy assenze** — `/corporate-policies` (admin/HR) o chiedi a Nexa Guide su regole generali.

## Budget e costi del personale (17–24)

17. **Aprire budget personale** — `/personnel-budget` (permesso budget o admin HR).
18. **Analisi budget per CDC** — `/personnel-budget/analysis`.
19. **Forecast budget annuale** — `/personnel-budget/forecast` e `/personnel-budget/annual`.
20. **Report budget con LLM** — `/hr-center/budget-report` (confronto Actual/Budget/Forecast, export).
21. **Analisi costi HR aggregati** — `/hr-center/analisi`.
22. **Forecast costi organico** — `/forecast`.
23. **Controllo economico workforce (analytics)** — `/analytics/economico` — KPI budget vs actual, insight AI su aggregati.
24. **Simulare costo assunzione** — `/tools/cost-calculator` (stima indicativa, non payroll ufficiale).

## Analytics HR — quattro analisi (25–32)

25. **Hub delle quattro analisi** — `/analytics` (permesso report HR + LLM Nexa se narrativa AI).
26. **Retention e flight risk** — `/analytics/retention` (sostituisce il vecchio `/insights`, reindirizzato automaticamente).
27. **Gap competenze** — `/analytics/competenze`.
28. **Sintesi operativa HR** — `/analytics/operativo` (approvazioni, lifecycle, backlog).
29. **Generare insight strutturato** — Nella pagina analisi o da `/ai-hub` (chip economico, retention, competenze, operativo, budget, turnover): insight su aggregati via `AiPrivacyGateway.toModelPayload`. Vietato inserire nominativi nei messaggi chat.
30. **Chiedere all'analista (chat)** — Box «Chiedi all'analista» nella pagina analisi; solo aggregati del dataset di quella analisi.
31. **Dashboard HR giornaliera** — `/hr/dashboard` — organico, task, link alle analisi.
32. **Recap attività HR** — `/hr-recap` — coda operativa (contratti, onboarding, solleciti).

## Recruiting e lifecycle (33–38)

33. **Gestire colloqui e pipeline** — `/recruiting`, `/recruiting/pipelines`, `/recruiting/candidates`.
34. **Onboarding candidato post-offerta** — `/recruiting/onboarding`.
35. **Creare contratto da template** — `/contracts`.
36. **Offboarding dipendente** — `/lifecycle/offboard`.
37. **Workforce planning scenari** — `/workforce-planning` (headcount e costo stimato, what-if).
38. **Benchmark retribuzione** — `/compensation/bench` (se configurato).

## Permessi, ruoli e sicurezza (39–40)

39. **Capire perché non vedo una pagina** — Controlla ruolo Nexa e permessi (`nexa.reports_hr:read`, `nexa.approvals:read`, `nexa.ai_assistant:read`, budget, payroll). La mappa portale (`/mappa-portale`) nasconde le tile non consentite; l'API resta protetta da guard server.
40. **Usare HEBB AI for HR / Nexa Guide (Cmd+K)** — Disponibile con `nexa.ai_assistant:read`; orientamento su percorsi e how-to senza esporre PII al modello. Hub assistente e chip analisi (economico, retention, competenze, operativo, budget, turnover): `/ai-hub`. Brief HRBP: `/nexa-hr-copilot`. I messaggi con nomi, cognomi o email di persone sono rifiutati (policy pseudonimizzazione).

---

## Riferimenti rapidi

| Argomento | Percorso |
|-----------|----------|
| Cedolini | `/payslips` |
| Note spese | `/expenses` |
| Spese organico (HR) | `/expenses/org` |
| Payroll operativo | `/payroll-hebb` |
| Organigramma | `/org-chart`, `/organigramma` |
| Impostazioni profilo | `/settings` |
| Admin utenti/ruoli | `/admin` |

## Turnover score (retention / flight risk)

- Analisi retention: **`/analytics/retention`** (il percorso `/insights` reindirizza qui).
- Modello: **`rule-v1`** — indicatore rule-based su anagrafica e saldo ferie; **non** è una decisione automatica su singole persone nel modello LLM.
- Scala **0–100** (più alto = maggiore segnale di rischio retention, da leggere come proxy operativo, non verdetto HR).
- **Formula (alto livello):** parte da **22** e somma/sottrae punti in base a:
  - **Tenure** (mesi da `hireDate`): <6 mesi +18; <24 mesi +10; ≥120 mesi −12.
  - **Ore contrattuali settimanali** ≥42: +14.
  - **Ferie residue** (`residualDays` anno corrente): <3 giorni +16; <8 giorni +8.
  - **Ferie contrattuali** (`vacationAllowanceDays`) <20: +6.
  - Se nessun segnale marcato: messaggio «profilo nella media».
- Risultato arrotondato e clamp **0–100**; `confidence` ≈ 0,42 + 0,12 × numero segnali usati (max ~0,92).
- **Fasce operative** (dashboard / Copilot): basso <34, medio 34–66, alto ≥67; alert HR se media settimanale ≥58 (warning) o ≥75 (critical), o ≥2 profili con score ≥78 nell’ultimo run.
- **Refresh:** job/API `POST /analytics/turnover-retention/refresh` (HR); snapshot in `hr_turnover_signals`.
- **Consiglio HR tipico:** score alto + ferie basse → colloquio su carico e pianificazione assenze; tenure bassa → onboarding/check-in strutturato; non usare lo score come unico criterio disciplinare.

## Varianza budget personale

- Viste: **`/personnel-budget/analysis`**, **`/analytics/economico`**, report LLM **`/hr-center/budget-report`**.
- **Costo totale azienda (mese):** somma per dipendente di RAL, straordinari, trasferte, INPS, INAIL, TFR (+ eventuali extra) → `totalCompanyCost`.
- **Varianza per categoria (analisi budget):** per ogni voce (ral, overtime, travel, inps, inail, tfr, totalCompanyCost):
  - `varianceBf = forecast − budget`
  - `variancePct = (varianceBf / budget) × 100` se |budget| > 0, altrimenti null.
  - Soglia alert: |varianceBf| ≥ soglia assoluta **oppure** |variancePct| ≥ soglia % (parametri API analisi).
- **Varianza mese corrente (segnale Copilot / economico):** `((actual − budget) / budget) × 100` sul `totalCompanyCost` del mese in corso (arrotondato 0,1%); positivo = actual sopra budget.
- **Consiglio HR tipico:** varianza forte su **overtime** → verificare timbrature e pianificazione turni; su **travel** → policy trasferte; su **totalCompanyCost** → drill-down per CDC in analisi budget prima di revisione organico.

## Presenze e aggregazione straordinari

- Timbrature: **`/attendance`**; report: **`/reports`**.
- **Ore lavorate giorno:** da coppie entrata/uscita (`time_entries`); se c’è entrata aperta, include ore fino a «ora» (timezone **Europe/Rome** per il giorno corrente).
- **Target giornaliero:** da `weeklyContractHours / 5 × 3600` secondi (es. 40 h/sett → 8 h/giorno = 28 800 s); fallback `dailyTargetSeconds` o 28 800.
- **Straordinario giorno:** `max(0, workedSeconds − targetSeconds)`; salvato in `workday_summaries.overtimeSeconds` o ricalcolato in lettura.
- **Aggregati API** (`GET` presenze overtime): somma `overtimeSeconds` per giorno / settimana (range settimana da `referenceDate`) / mese / anno; per **oggi** usa il massimo tra summary e stato live timbratura.
- **Consiglio HR tipico:** picchi mensili su un CDC → incrocia con turni (`/scheduling`) e assenze; dipendente con straordinario ricorrente → verifica contratto e riposi, non solo export Excel.

## Avanzamento formazione (%)

- Percorso dipendente: **`/percorso/formazione`**; gestione HR: area formazione / assegnazioni corsi.
- Stati assegnazione: `not_started`, `in_progress`, `completed`.
- **percentComplete** = `round((completed / total) × 100)` dove `total` = numero assegnazioni dell’utente (o azienda in vista HR), `completed` = stato `completed`.
- **In ritardo (overdue):** assegnazioni non `completed` con `due_date` < oggi (ISO date).
- Corso piattaforma Nexa: codice **`nexa-hr-piattaforma`** (onboarding obbligatorio tipico, scadenza default ~14 giorni dall’assegnazione).
- **Consiglio HR tipico:** overdue su corsi obbligatori (sicurezza, GDPR) → sollecito + blocco accessi soft se policy aziendale; percentuale bassa su team → sessione dedicata o riduzione carico prima della scadenza.

## Prenotazione sale riunioni

- UI: **`/sale-riunioni`**; API: `GET/POST /meeting-rooms`, `GET /meeting-rooms/bookings`, `POST /meeting-rooms/:roomId/bookings`, `DELETE /meeting-rooms/bookings/:id`.
- **Creazione:** `startsAt` e `endsAt` obbligatori (ISO); `title` opzionale; `ends_at` deve essere **>** `starts_at`.
- **Anti-overlap:** vincolo DB `meeting_room_bookings_no_overlap` — stessa `room_id`, intervalli che si sovrappongono su prenotazioni **non cancellate** → errore «Sala già prenotata in quell'orario».
- **Annullamento:** soft-delete con `canceled_at`; può annullare il **prenotante** o **superuser** (stessa company).
- **Creazione sala:** solo superuser o admin Synapse (`/admin`).
- Le prenotazioni compaiono nel calendario lavoro come eventi `room_booking`.
- **Consiglio HR tipico:** conflitto orario → proporre fascia libera o altra sala; per riunioni ricorrenti verificare capienza (`seats`) e attrezzature (videoconferenza, proiettore) in scheda sala.

---

## Assistente AI

- Chat piattaforma: **`POST /ai/hr/platform-agent/chat`** (UI: pannello Nexa Guide e `/ai-hub`).
- Analytics avanzate: **`/analytics/advanced/:id/kpis`**, **`insight`**, **`chat`** — sempre con `nexa.reports_hr:read`.

## FAQ cross-dominio (Nexa Guide)

Domande ampie che incrociano più ambiti HR — esempi e come risponde l’agente:

1. **«Cosa devo fare oggi?» / «Quali priorità?»** — Sintesi da **Approvazioni** (pendingCount), **Formazione** (overdueCount), **Presenze** (straordinari/assenze mese), **Budget** (fascia varianza). Percorsi: `/workflow/approvals`, `/hr/formazione`, `/reports`, `/analytics/advanced/economico`.
2. **«Come stanno presenze e budget insieme?»** — Correla straordinari/assenze (Presenze) con varianza actual vs budget (Budget). Se varianza su overtime in analisi budget → verifica timbrature e turni.
3. **«Formazione in ritardo e approvazioni in sospeso?»** — Conteggi da **Formazione** e **Approvazioni**; suggerisce smaltire approvazioni prima dei solleciti corsi se backlog alto.
4. **«Panoramica situazione team»** (manager) — Approvazioni visibili al manager + snapshot assistente; domini org (Presenze/Budget/Formazione) solo con permessi HR/report.
5. **«Approfondisci»** (follow-up o pulsante UI) — Secondo passaggio LLM con `deepen: true`: aggregati **expanded** (pendingByType, topVariances CDC, dettaglio formazione) da 2–4 domini, sempre via **AiPrivacyGateway** (nessun nominativo).
6. **Policy nomi** — Messaggi con nomi/cognomi/email di persone sono **rifiutati** (`assertHebbUserMessageAllowed`); l’agente usa solo pseudonimi e aggregati.

| Area | Segnali lite | Segnali expanded (deepen) |
|------|--------------|---------------------------|
| Presenze | headcount, ore straord., assenze, smart working | top 3 CDC per assenze |
| Budget | varianza %, fascia within/warning/critical | top varianze per categoria |
| Formazione | overdue, % completamento | totali per stato |
| Approvazioni | conteggio pending | breakdown per tipo richiesta |
