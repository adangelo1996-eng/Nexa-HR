# Piano Nexa-HR: Blocco 2 e 3 — vincoli Hebb for HR (aggiornamento)

Questo documento **sostituisce/affina** il piano precedente sui blocchi 2–3 con i requisiti **tassativi** indicati dal prodotto.

---

## Principi non negoziabili

### 1. Funzionamento “reale”: niente proxy, niente bozza come risposta finale

- **Niente proxy** per le capacità strategiche (turnover, workforce, skills gap, narrative, copilot): i numeri e i segnali devono derivare da **definizioni operative + query/metric store** (tabelle, job di calcolo, versionamento), non da euristiche “simili a” senza base dati (es. il rischio attuale in [`HrDataStore.getPeopleInsightsRisk`](apps/backend/src/platform/hr-data.store.ts) va **sostituito o dismesso** finché non c’è un modello dati turnover accettato in prodotto).
- **Niente bozza utente come output** nel percorso Hebb for HR: la risposta mostrata all’utente deve provenire dal **modello** che elabora **solo** il JSON pseudonimizzato. Se il modello non è disponibile (env off, errore API, JSON non valido, perdita token), l’endpoint deve restituire **errore controllato** (`503` / `424` / messaggio chiaro), **non** il testo generato da [`buildAssistantDraft`](apps/backend/src/ai-hr/ai-hr.service.ts) come fallback silenzioso. Eventuale bozza resta solo uso interno pre-invio (se ancora necessaria) ma **non** viene restituita al client.

### 2. Dati verso il modello: **esclusivamente pseudonimizzati**

- Oggi il payload include `facts.message` in chiaro e una bozza in `envelope.text` prima della pseudonimizzazione: **non conforme** al requisito.
- **Obbligo**: tutto ciò che transita verso OpenAI dopo `toModelPayload` deve essere **privo di PII e di testo libero identificante** secondo le regole del vault ([`AiPrivacyGateway`](apps/backend/src/ai-privacy/ai-privacy-gateway.service.ts), registry in [`pseudonymize-json`](apps/backend/src/ai-privacy/pseudonymize-json.ts) / registry campi).
- **Interventi tecnici previsti** (Blocco 1 / Hebb for HR, prerequisito al 2–3):
  - **Domanda utente**: non inviare la stringa grezza al modello; opzioni (da scegliere in implementazione, compatibili col vincolo):
    - (A) Intent + slot strutturati (classificazione lato server senza LLM, o LLM locale solo su testo mai loggato fuori vault) → solo token/struttura pseudonimizzata nel JSON modello; oppure
    - (B) Passaggio del testo libero attraverso una **singola stringa tokenizzata** nel vault (come campo registrato) così che nel JSON al modello compaia solo `__nexa_ref:…`.
  - **Rimuovere** `envelope.text` in chiaro dal blob inviato al modello: il modello riceve **solo** fatti/struttura pseudonimizzata e produce `envelope.text` in uscita (o schema equivalente).
  - Verifica automatica: test contract “nessuna substring PII / email / CF” nel JSON serializzato inviato al provider (suite CI mirata, non log in produzione).

### 3. Branding e navigazione: **Hebb for HR**

- Il tasto **non** si chiama più “Centro AI HR” ma **“Hebb for HR”**.
- **Posizione menu**: **subito sotto “Dashboard”**, **fuori da ogni categoria** (non dentro “Assistenza” o altre sezioni collassabili).
- File principale: [`apps/frontend/components/app-shell.tsx`](apps/frontend/components/app-shell.tsx) — oggi `Centro AI HR` è in `NAV_SECTIONS_MAIN` → `assistenza`; va spostato in un blocco dedicato sotto [`NAV_DASHBOARD`](apps/frontend/components/app-shell.tsx) (linee ~59–93).
- Allineare etichette/percorsi descrittivi: [`apps/frontend/lib/nav-routes-catalog.ts`](apps/frontend/lib/nav-routes-catalog.ts), [`apps/backend/src/ai-hr/ai-hr-agent.ts`](apps/backend/src/ai-hr/ai-hr-agent.ts), titoli pagina [`apps/frontend/app/(app)/(hr)/ai-hub/page.tsx`](apps/frontend/app/(app)/(hr)/ai-hub/page.tsx) (testo “Centro AI HR” → “Hebb for HR”). La route può restare `/ai-hub` salvo decisione di rename URL.

---

## Blocco 2 (strategico) — con i vincoli sopra

Ogni feature espone **API + UI** con metriche da fonte ufficiale; dove c’è LLM, **stesso confine privacy** del punto 2 (solo pseudonimizzato, nessuna bozza come risposta finale).

| Area | Direzione |
|------|-----------|
| Turnover risk | Metriche da schema dedicato + refresh job; UI trend; LLM solo su aggregati pseudonimizzati per narrativa. |
| Workforce planning | Cockpit su dati budget/forecast/headcount già in DB; scenari; niente numeri “inventati”. |
| Simulatore cedolino assistito | Output strutturato da motore payroll; LLM opzionale solo su JSON pseudonimizzato; errore se modello off. |
| Narrative analytics | Input = snapshot metrico pseudonimizzato; output = testo; fallimento = errore, non template utente. |
| Manager copilot | Scope già presente; segnali team da metriche reali; stesso confine OpenAI. |
| Skills gap | Schema competenze + gap calcolato; raccomandazioni LLM solo su aggregati pseudonimizzati. |

---

## Blocco 3 (orchestrativo)

Invariato nel concetto (alert, agenti HITL, integrazioni suite), ma **subordinato** al rispetto dei tre principi: orchestrazione **non** invia mai dati non pseudonimizzati ai provider esterni; azioni side-effect solo dopo approvazione umana tracciata.

---

## Ordine di esecuzione suggerito (engineering)

1. **Nav + copy** “Hebb for HR” (quick win, visibile).
2. **Refactor confine modello** (rimozione fallback bozza per `/ai/hr/assistant`, pseudonimizzazione completa payload, gestione errore esplicita) — **gate** per qualsiasi altra feature AI.
3. Estendere lo stesso pattern agli altri endpoint AI HR (NL, anomalie, triage) per coerenza.
4. Blocco 2 per aree (turnover dati veri → workforce → …) come nel piano lungo, ma ogni sprint **non** ship-a feature AI senza il gate del punto 2.

---

## Todo (sintetico)

- `nav-hebb-for-hr`: Menu sotto Dashboard, fuori sezioni; rename label; sync catalog/agent copy.
- `ai-payload-all-pseudo`: Eliminare testo in chiaro nel path modello; intent/tokenize message; rimuovere bozza dall’payload verso OpenAI.
- `ai-no-draft-response`: Risposta utente = solo output modello valido; errori espliciti se LLM off/fallisce.
- `b2-real-metrics`: Turnover/workforce/skills senza proxy; migrazioni + job.
- `b3-orchestration`: Alert + HITL dopo gate privacy.
