# Deploy Render — verifica locale prima del push

Guida rapida per evitare deploy falliti su **nexa-hr-backend** e **nexa-hr-frontend** (Blueprint: [`render.yaml`](../render.yaml) in root).

## Comando canonico

```bash
pnpm run build:ci
```

Alias equivalenti (stesso script):

| Script | Descrizione |
|--------|-------------|
| `pnpm run build:ci` | Nome usato in CI / checklist pre-push |
| `pnpm render:verify-build` | Nome esplicito per agenti |
| `pnpm prepush` | Suggerimento opzionale prima di `git push` |

Tutti eseguono `node scripts/verify-render-build.mjs`, che replica **solo la compile** di Render:

1. `pnpm install --frozen-lockfile`
2. `pnpm run build:backend:render` → servizio `nexa-hr-backend`
3. `pnpm --filter @payday/frontend build` → servizio `nexa-hr-frontend`

**Non** esegue `supabase-remote-push.mjs --optional` (richiede `SUPABASE_DB_URL` su Render).

## Prima di ogni push

```bash
pnpm run build:ci
```

Se fallisce, correggere in locale e rieseguire fino a:

```text
[render:verify-build] OK — backend + frontend production builds passed.
```

Solo dopo: commit (se non già fatto) e push. Render deploya dal remote; build locale verde ≠ deploy automatico finché non pushi.

## Health check post-deploy

| Servizio | URL health |
|----------|------------|
| Frontend | `https://nexa-hr-frontend.onrender.com/health` |
| Backend | `https://nexa-hr-backend.onrender.com/` (JSON `status: ok`) |

## Documentazione correlata

- Backend dettagliato: [`docs/deploy/BACKEND_RENDER_DEPLOY.md`](deploy/BACKEND_RENDER_DEPLOY.md)
- Regola Cursor agenti: [`.cursor/rules/nexa-hr-pre-deploy-verify.mdc`](../.cursor/rules/nexa-hr-pre-deploy-verify.mdc)

## Cause frequenti di failure Render

- **`hr-data.store.ts` o `api.ts` troncati** — commit parziali rimuovono metodi/export; `build:ci` fallisce su TypeScript.
- **Lockfile non allineato** — committare `pnpm-lock.yaml` dopo `pnpm install`.
- **Start command con `pnpm` su Render** — usare `node apps/backend/dist/main.js` e `node scripts/render-start-nexa-frontend.mjs` (già in `render.yaml`).
