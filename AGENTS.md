# Nexa-HR — note per agenti

## Security: fine sviluppo

Al termine di un blocco di sviluppo significativo (feature, refactor, fix multi-file, o prima di merge/release), **non chiudere senza** quanto segue.

### 1. Vulnerability assessment (ordine suggerito)

- **Dipendenze**: `pnpm audit` / `npm audit` su workspace interessato; valutare CVE su backend, frontend, edge.
- **Segreti e config**: nessun segreto in repo; env solo tramite variabili gestite; verificare che esempi `.env` non contengano valori reali.
- **Autenticazione e autorizzazione**: route/API protette con guard coerenti; controlli ruolo/permesso (`admin`, `team_lead`, permessi Nexa) su ogni nuovo endpoint o bypass aggiunto.
- **Input e query**: validazione DTO/class-validator; niente SQL/raw non parametrizzato; attenzione a upload (tipo, size) e path traversal.
- **Supabase / DB**: RLS e policy allineate alle nuove tabelle/colonne; PostgREST espone solo ciò che serve; migrazioni idempotenti senza permessi eccessivi di default.
- **CORS / cookie / header**: coerenza con ambiente deploy; header sicurezza dove applicabile (API gateway, Next.js).
- **XSS / CSRF**: endpoint che riflettono dati utente; form e contenuti sanitizzati lato UI dove serve.

Documentare in sintesi **trovamenti** (anche «nessun issue noto») e **azioni** nel messaggio di chiusura o nella descrizione PR.

### 2. Hardening (dopo l’assessment)

Applicare o pianificare esplicitamente:

- fix o aggiornamento dipendenze dove l’audit segnala roba risolvibile senza breaking major non gestito;
- restringere permessi, validare input, correggere check auth mancanti emersi dal review;
- rivedere log per non esporre PII o token;
- eventuale rate limiting o messaggi errore generici lato pubblico.

Se un rischio non è correggibile subito, **issue o nota tecnica** con severity e follow-up datare.

### 3. Guardrail

- Non dichiarare il blocco «completato in sicurezza» senza aver almeno eseguito audit dipendenze e un passaggio mirato su auth/input sul codice toccato.
- Per modifiche solo documentazione/isolate, ridurre scope ma mantenere audit dipendenze se è passato molto tempo dall’ultimo run nel branch.
