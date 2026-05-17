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
13. **Approvare richieste del team (manager)** — `/workflow/approvals` oppure **Pannello manager** (`/manager-copilot`). Serve `nexa.approvals:read` o ruolo lead con report diretti.
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
29. **Generare insight strutturato** — Nella pagina analisi: pulsante «Genera insight AI»; dati pseudonimizzati via AiPrivacyGateway.
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
40. **Usare Nexa Guide (Cmd+K)** — Disponibile con `nexa.ai_assistant:read`; orientamento su percorsi e how-to senza esporre PII al modello. Chat completa: `/ai-hub`.

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

## Turnover score

- Analisi retention: **`/analytics/retention`** (il percorso `/insights` reindirizza qui).
- Lo score è indicatore rule-based su aggregati; non è decisione automatica su singole persone nel modello LLM.

## Assistente AI

- Chat piattaforma: **`POST /ai/hr/platform-agent/chat`** (UI: pannello Nexa Guide e `/ai-hub`).
- Analytics avanzate: **`/analytics/advanced/:id/kpis`**, **`insight`**, **`chat`** — sempre con `nexa.reports_hr:read`.
