#!/usr/bin/env node
/**
 * Verifica allineamento repo ↔ env locale ↔ Render (se RENDER_API_KEY) senza stampare segreti.
 * Controlli HTTP pubblici su Render e dominio API Supabase.
 *
 * Uso:
 *   node scripts/verify-render-supabase-alignment.mjs
 *   node scripts/verify-render-supabase-alignment.mjs --strict
 *   pnpm supabase:verify
 *
 * Con `--strict` o `NEXA_VERIFY_STRICT=1`: exit code 1 se ref progetto non allineati
 * (locale o Render vs infra/supabase/config.toml).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict =
  process.argv.includes("--strict") || String(process.env.NEXA_VERIFY_STRICT ?? "").trim() === "1";

function loadEnvFiles(paths) {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const raw = readFileSync(p, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq === -1) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k && process.env[k] === undefined) {
          process.env[k] = v;
        }
      }
    } catch {
      /* ignore */
    }
  }
}

loadEnvFiles([
  join(root, ".env"),
  join(root, ".env.local"),
  join(root, "apps", "backend", ".env"),
  join(root, "infra", "supabase", ".env")
]);

const configToml = readFileSync(join(root, "infra", "supabase", "config.toml"), "utf8");
const mRef = configToml.match(/project_id\s*=\s*"([^"]+)"/);
const repoProjectRef = mRef?.[1] ?? null;

function hostFromPostgresUri(u) {
  if (!u) return null;
  try {
    const normalized = u.replace(/^postgres(ql)?:/i, "https:");
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

function refFromSupabaseApiUrl(u) {
  if (!u) return null;
  try {
    const h = new URL(u).hostname;
    const sub = h.replace(/\.supabase\.co$/i, "");
    return sub || null;
  } catch {
    return null;
  }
}

function refFromDbHost(h) {
  if (!h) return null;
  const m = /^db\.([^.]+)\.supabase\.co$/i.exec(h);
  return m?.[1] ?? null;
}

const supabaseUrl = process.env.SUPABASE_URL;
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

const apiRef = refFromSupabaseApiUrl(supabaseUrl);
const dbHost = hostFromPostgresUri(dbUrl);
const dbRef = refFromDbHost(dbHost);

const alignment = {
  repo_config_toml_project_id: repoProjectRef,
  apps_backend_env_SUPABASE_URL_project_ref: apiRef,
  apps_backend_env_DATABASE_host: dbHost ? `${dbHost.split(".")[0]}…` : null,
  apps_backend_env_db_project_ref_matches_api: apiRef && dbRef ? apiRef === dbRef : null,
  repo_toml_matches_api: repoProjectRef && apiRef ? repoProjectRef === apiRef : null,
  repo_toml_matches_db: repoProjectRef && dbRef ? repoProjectRef === dbRef : null
};

async function headStatus(url) {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return r.status;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const publicChecks = {
  nexa_hr_backend_onrender: await headStatus("https://nexa-hr-backend.onrender.com/"),
  nexa_hr_frontend_onrender: await headStatus("https://nexa-hr-frontend.onrender.com/"),
  supabase_project_api_host:
    repoProjectRef != null
      ? await headStatus(`https://${repoProjectRef}.supabase.co/`)
      : null,
  render_api_unauthorized_without_key: await (async () => {
    try {
      const r = await fetch("https://api.render.com/v1/services/srv-d6vcbocr85hc73b9ha5g", {
        headers: { Accept: "application/json" }
      });
      return r.status;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  })()
};

/** Coerenza ref progetto: locale (env) vs config.toml. */
function evaluateLocalCoordination() {
  const problems = [];
  if (supabaseUrl && repoProjectRef && apiRef && repoProjectRef !== apiRef) {
    problems.push("SUPABASE_URL project ref differs from infra/supabase/config.toml project_id");
  }
  if (supabaseUrl && dbUrl && apiRef && dbRef && apiRef !== dbRef) {
    problems.push("DATABASE_URL / SUPABASE_DB_URL host ref differs from SUPABASE_URL project ref");
  }
  return {
    ok: problems.length === 0,
    problems,
    checked: Boolean(supabaseUrl || dbUrl)
  };
}

const localCoord = evaluateLocalCoordination();

const RENDER_API_KEY = process.env.RENDER_API_KEY?.trim();
const DEFAULT_SERVICE_ID = "srv-d6vcbocr85hc73b9ha5g";
const SERVICE_ID = process.env.RENDER_BACKEND_SERVICE_ID?.trim() || DEFAULT_SERVICE_ID;

let renderCoord = { ok: null, skipped: true, problems: [] };

async function fetchRenderEnv() {
  const out = [];
  let cursor = null;
  for (;;) {
    const u = new URL(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, {
      headers: { Authorization: `Bearer ${RENDER_API_KEY}`, Accept: "application/json" }
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Render API ${res.status}: ${t.slice(0, 200)}`);
    }
    const body = await res.json();
    const arr = Array.isArray(body) ? body : body.envVars ?? [];
    out.push(...arr);
    cursor = body.cursor ?? body.nextCursor ?? null;
    if (!cursor) break;
  }
  const map = new Map();
  for (const row of out) {
    const key = row.envVar?.key ?? row.key;
    const value = row.envVar?.value ?? row.value;
    if (key) map.set(key, value);
  }
  return map;
}

if (RENDER_API_KEY) {
  try {
    const renderMap = await fetchRenderEnv();
    const rUrl = renderMap.get("SUPABASE_URL");
    const rDb = renderMap.get("SUPABASE_DB_URL") || renderMap.get("DATABASE_URL");
    const renderApiRef = refFromSupabaseApiUrl(rUrl);
    const renderDbHost = hostFromPostgresUri(rDb);
    const renderDbRef = refFromDbHost(renderDbHost);

    const problems = [];
    if (repoProjectRef && renderApiRef && repoProjectRef !== renderApiRef) {
      problems.push("Render SUPABASE_URL ref differs from infra/supabase/config.toml project_id");
    }
    if (renderApiRef && renderDbRef && renderApiRef !== renderDbRef) {
      problems.push("Render DB connection host ref differs from Render SUPABASE_URL ref");
    }

    renderCoord = {
      ok: problems.length === 0,
      skipped: false,
      problems,
      service_id: SERVICE_ID,
      render_SUPABASE_URL_project_ref: renderApiRef,
      render_db_project_ref: renderDbRef,
      render_matches_repo_toml:
        repoProjectRef && renderApiRef ? repoProjectRef === renderApiRef : null,
      render_db_matches_api: renderApiRef && renderDbRef ? renderApiRef === renderDbRef : null,
      keys_present: {
        SUPABASE_URL: Boolean(rUrl),
        SUPABASE_DB_URL: Boolean(renderMap.get("SUPABASE_DB_URL")),
        DATABASE_URL: Boolean(renderMap.get("DATABASE_URL"))
      }
    };
  } catch (e) {
    renderCoord = {
      ok: false,
      skipped: false,
      problems: [e instanceof Error ? e.message : String(e)],
      service_id: SERVICE_ID
    };
  }
}

const coordination_ok =
  localCoord.ok &&
  (renderCoord.skipped || renderCoord.ok === true) &&
  renderCoord.ok !== false;

const summary = {
  strict,
  coordination_ok,
  local_coordination: localCoord,
  render_coordination: renderCoord,
  alignment,
  public_checks: publicChecks
};

console.log(JSON.stringify(summary, null, 2));

if (!RENDER_API_KEY) {
  console.log(
    JSON.stringify({
      hint: "Aggiungi RENDER_API_KEY per verificare le env sul Web Service Render; usa --strict per fallire su mismatch."
    })
  );
}

process.exit(strict && !coordination_ok ? 1 : 0);
