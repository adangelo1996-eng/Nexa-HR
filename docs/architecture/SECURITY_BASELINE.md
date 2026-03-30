# Baseline sicurezza massima — Nexa HR

Implementazione coordinata con il codice: header HTTP in `main.ts`, RBAC in `permission-catalog`, audit in `audit.interceptor`, accesso DB solo backend con service role ([SUPABASE_RLS.md](../deploy/SUPABASE_RLS.md)).

## Obblighi prodotto

1. **Classificazione**: inventario dati per contesto; tier “vincolato HR/payroll” per buste, IBAN, certificati, export F24/UniEmens.
2. **Cifratura**: TLS end-to-end; segreti solo su secret manager / env server-side; valutare KMS per bucket documenti.
3. **Accesso**: MFA per ruoli HR/admin/consulenti (integrazione IdP); sessioni brevi; minimo privilegio; consulenti time-boxed.
4. **Audit**: eventi immutabili per accesso cedolini, export paghe, correzioni timbrature, impersonation (estendere interceptor / tabella audit).
5. **Logging**: no PII nei log applicativi; retention limitata.
6. **AI**: minimizzazione, DPA fornitori, dati di training non produttivi senza base giuridica; human-in-the-loop per decisioni impattanti.
7. **DR**: backup cifrati, test ripristino, RTO/RPO documentati per payroll e documenti.

## Verifica periodica

- Threat model e DPIA aggiornati a major release.
- Dependency scan in CI; pentest prima di GA su nuovi moduli esposti.
