# Pacchetto standard Nexa HR + Plasticity (SYN-246)

Contratto unico per tenant: un cliente nuovo si configura da un **template di attività**, senza fork di codice.

## Varianti supportate

| Id | Uso |
|----|-----|
| `full_suite` | Tutto acceso (default se manca una riga) |
| `professional_services` | Studi / consulenza |
| `retail_commerce` | Commercio e retail |
| `manufacturing` | Produzione |
| `hospitality` | Hotel, ristorazione, turismo |
| `executive_bi` | Plasticity completo, Nexa ridotto al nucleo |

## Sempre acceso

Nexa: anagrafiche, presenze, ferie, malattia, approvazioni, organigramma, documenti, admin tenant, SSO.

Plasticity: import dati, dashboard.

Il resto è opzionale e si accende dal template o da overlay in `/admin/pacchetto`.

## Custom vs standard

- **Standard:** template, moduli del catalogo, limiti, default, enum workflow, KPI e campi anagrafica in whitelist.
- **Custom:** nuovo modulo, nuovo workflow, formula KPI fuori catalogo, colonna SQL ad hoc, fork. Va registrato come eccezione datata sul pacchetto.

## API

- `GET /api/tenant-pack/catalog`
- `GET /api/tenant-pack`
- `POST /api/tenant-pack/apply` `{ templateId, modules?, limits?, … }`

Il pack è anche in `GET /api/users/me` (`tenantPack`) e nasconde menu/API dei moduli spenti.

Plasticity legge lo stesso contratto (`tenant-pack.js`, chiave `synapse_tenant_pack` e capability `plasticity.*`).
