# Nexa-HR — Fix routing “rimandi” + hide aree non autorizzate

Data: 26 aprile 2026

## Contesto / problema

Nel frontend alcune voci del **menu** e/o tile della **mappa portale** portano a pagine che, al click, vengono reindirizzate a un’altra pagina (tipicamente `/mappa-portale`).

Le cause identificate:

- **Link errato**: nel menu la voce “Dashboard” punta a `/mappa-portale`, mentre la “dashboard operativa” storica (timbratura/ferie/spese, ecc.) è su `/`.
- **Guard UI troppo restrittivo**: `AppShell` esegue un redirect a `/mappa-portale` se `canAccessNexaPortalRoute(pathname, user, hideSensitiveHr)` ritorna `false`.  
  La funzione è una whitelist “esatta” e non include molte sottopagine reali (`/expenses/scan`, `/contracts/[id]`, ecc.) → l’utente viene mandato via anche se la pagina esiste e appartiene ad una sezione consentita.

## Obiettivi

- **O1**: cliccando nel menu o nella mappa portale, la navigazione deve portare alla **pagina corretta** (nessun redirect “spurio”).
- **O2**: un dipendente senza autorizzazioni **non deve vedere** nel menu e nella mappa portale le aree non consentite.

## Non-obiettivi

- Modificare le regole di sicurezza lato backend.  
  (Le regole qui impattano UX/UI; le API restano protette da guard/permessi server-side.)

## Approccio scelto (A): access rules per prefisso + eccezioni

Si aggiorna `canAccessNexaPortalRoute` per:

- Normalizzare la route (rimuovere querystring e trailing slash).
- Gestire **gruppi per prefisso** quando la sezione è consentita:
  - Se `/expenses` è consentita → anche `/expenses/*` (eccetto rotte “speciali” con permesso diverso).
  - Se `/contracts` è consentita → anche `/contracts/*` (dettaglio contratto).
  - Se `/recruiting` è consentita → anche `/recruiting/*` (candidate, pipelines, onboarding segue regola dedicata).
  - Se `/personnel-budget` è consentita → anche `/personnel-budget/*`.
  - Se `/admin` è consentita → anche `/admin/*`.
  - Se `/hr-center` è consentita → anche `/hr-center/*` (incluso budget-report con check addizionale).
- Mantenere **eccezioni esplicite** dove i permessi differiscono:
  - `/expenses/org` (permesso “org expense claims”).
  - `/workflow/approvals` (HR extras).
  - `/recruiting/onboarding` (HR recap dashboard).
  - `/hr-center/budget-report` (LLM + admin o personnel budget access).

## Cambi UX specifici

- Nel menu principale, la voce **“Dashboard”** deve puntare a **`/`** (dashboard operativa).
- La “Mappa portale” resta su `/mappa-portale`.

## Impatto su menu e mappa portale (visibilità permessi)

- **Menu**: continua a mostrare solo le aree consentite, usando `canAccessNexaPortalRoute` e i check già presenti in `AppShell`.
- **Mappa portale**: `groupPortalTiles` filtra con `filterPortalHref` che usa `canAccessNexaPortalRoute` → con la logica a prefissi, anche tile che portano a sottopagine resteranno coerenti.

## Verifica (criteri di accettazione)

- Clic su “Dashboard” nel menu porta a `/` e resta su `/` (nessun redirect a `/mappa-portale`).
- Pagine con sottoroute (es. `/expenses/scan`, `/contracts/<id>`, `/admin/roles`) non vengono più reindirizzate a `/mappa-portale` quando l’utente ha accesso alla sezione.
- Un utente senza permessi HR/admin non vede le relative voci nel menu e non vede le tile corrispondenti nella mappa portale.

## File principali toccati

- `apps/frontend/lib/nexa-route-access.ts`
- `apps/frontend/components/app-shell.tsx`

