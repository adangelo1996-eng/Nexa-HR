# HEBB AI for HR — Roadmap copilota

Proposte dalla discussione prodotto (maggio 2026) per evolvere HEBB da assistente generico a **copilota HR** ancorato a Nexa.

## Tabella prioritaria

| Priorità | Iniziativa | Descrizione | Stato |
|----------|------------|-------------|-------|
| 1 | **Contesto automatico** | Ogni sessione conosce pagina corrente, ruolo (HR/manager/dipendente/superuser), company, perimetro team/CC, stato impiego e sintesi «cosa fa questa pagina». | In corso |
| 2 | **Playbook HR predefiniti** | Chip/bottoni oltre alle aree analisi: retention 7 giorni, chiusura mese HR, onboarding checklist, budget vs actual (controller). Prompt + aggregati + output strutturato. | Pianificato |
| 3 | **Insight → azione** | Dopo ogni insight LLM, azioni eseguibili con link (corso GDPR, wizard onboarding, export varianza) — chiude il ciclo operativo. | Pianificato |
| 4 | **Spiegazione calcoli** | Formule in linguaggio naturale (turnover score, varianza budget) + link alla pagina dati, senza numeri inventati. | Pianificato |
| 5 | **Agent multi-step briefing** | Endpoint orchestrato: KPI + approvazioni + formazione + turnover → executive summary + task con link. | Pianificato |
| 6 | **Memoria sessione e follow-up** | «Approfondisci punto 2», confronto mese precedente, riassunto COMEX; storico + ultimo `insightId`. | Pianificato |
| 7 | **Guardrail pseudonimizzazione intelligente** | Se l’utente chiede un nominativo → reindirizzamento ad aggregati + spiegazione GDPR/policy. | Pianificato |
| 8 | **HITL azioni sensibili** | Bozze HEBB (corsi massivi, email manager) in pannello «Proposte HEBB» con conferma HR (`hr_hitl_proposals`). | Pianificato |
| 9 | **Feedback loop qualità** | 👍/👎 + metadati (topic, pagina, no PII) per affinare prompt e playbook. | Pianificato |
| 10 | **Integrazione Plasticity / Suite Synapse** | Export aggregati verso BI esterna; HEBB allineato al dashboard CFO su Plasticity. | Pianificato |

## Dettaglio iniziative

### 1. Contesto automatico (quick win)
- `currentPath` / etichetta pagina
- `userRole`: HR, manager, dipendente, superuser
- `companyId`, `teamScope`, `costCenterScope` (se selezionati in UI)
- `employmentState` per dipendenti
- `pageHelp`: stringa breve da mappa pagina

**Perché:** migliora tutte le risposte successive; domande tipo «cosa devo fare?» diventano operative sul perimetro reale.

### 2. Analisi → azione
Non solo testo: pulsanti verso moduli Nexa (formazione, workflow, export) con controllo permessi.

### 3. Playbook HR
Sostituisce lavoro ripetitivo HRBP/controller con flussi precomposti (retention, chiusura mese, onboarding, budget).

### 4–10
Vedi tabella; ordine ROI consigliato: **1 → 2 → 3 → 4 → 5**, poi 6–10 in base a capacità team.

## Primo sprint consigliato
Pacchetto **1 + 2 + 3** su `/ai-hub` e analisi avanzate, riusando `AnalyticsOrchestrator`, `AiPrivacyGateway` e agente piattaforma già presenti.
