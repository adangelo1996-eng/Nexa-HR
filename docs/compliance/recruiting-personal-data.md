# Trattamento dati personali — modulo Recruiting (Nexa-HR)

Documento di supporto per DPO / ufficio legale. **Non** sostituisce consulenza legale né il registro dei trattamenti aziendale.

## 1. Categorie di dati trattati

- Dati anagrafici e di contatto del candidato (nome, cognome, email, telefono, note).
- Documenti di candidatura (CV, lettere, attestati) in formato elettronico.
- Metadati di processo: fase pipeline, esiti, timestamp aggiornamenti, identificativi tecnici (UUID).
- Opzionale: versione informativa privacy e timestamp di registrazione consenso/base giuridica lato organizzazione.

## 2. Finalità (da confermare internamente)

Placeholder per compilazione: selezione personale, gestione colloqui, tenuta storico processi di assunzione fino a decisione.

## 3. Base giuridica (placeholder)

Da definire in base al contesto (es. art. 6 GDPR: misure precontrattuali, consenso ove applicabile, obblighi legali per conservazione documentazione).

## 4. Conservazione e cancellazione

- Definire periodi di retention per candidature non assunte e per dipendenti assunti (collegamento a fascicolo dipendente).
- Funzioni applicative: **esportazione JSON** dati candidato; **eliminazione** candidato con rimozione allegati dallo storage.
- Dopo eliminazione, verificare backup / replica e log applicativi di terze parti (hosting, DB).

## 5. Sottoprocessori e infrastruttura (esempio)

Aggiornare con contratti effettivi: hosting applicativo (es. Render), database e storage oggetti (es. Supabase), eventuali strumenti di monitoraggio. Garantire DPA/CADE firmati dove richiesto.

## 6. Misure tecniche (implementazione Nexa-HR)

- Accesso API con autenticazione e permessi (`nexa.recruiting:read` / `:write`).
- Row Level Security PostgreSQL su tabelle recruiting (policy HR/authenticated coerenti con migrazioni).
- Bucket dedicato `recruit-candidate-files` non pubblico; upload/scarico tramite backend con service role.
- Validazione input (DTO) e limiti dimensione/tipo file allegati.
- Audit spostamenti fase (`recruit_stage_transition_log`) e `updated_by_user_id` sugli stati candidato.

## 7. Diritti degli interessati

Allineare procedure interne a: accesso, rettifica, cancellazione, limitazione, portabilità (l’export JSON supporta parte delle esigenze documentali), opposizione ove applicabile.

## 8. DPIA — schema sintetico (bozza)

| Rischio | Esempio | Mitigazione tecnica (indicativa) |
|--------|---------|----------------------------------|
| Accesso non autorizzato | Account compromesso | Ruoli, permessi Nexa, RLS, password policy lato IdM |
| Esfiltrazione allegati | URL pubblici o leak bucket | Bucket privato, download autenticato tramite API |
| Tracciabilità insufficiente | Contesta decisione assunzione | Log transizioni fase, timestamp aggiornamenti |
| Conservazione eccessiva | Dati oltre necessità | Policy retention + cancellazione da prodotto |

## 9. Accountability

Assegnare un responsabile interno per aggiornare questo documento quando cambiano fornitori, finalità o tempi di conservazione.
