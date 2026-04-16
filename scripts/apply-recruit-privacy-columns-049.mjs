#!/usr/bin/env node
/**
 * Applica sul Postgres remoto lo stesso SQL di `049_recruit_candidates_privacy_postgrest_reload.sql`
 * (colonne privacy + notify PostgREST), senza passare dalla CLI Supabase.
 *
 * Uso (PowerShell, dalla root del repo):
 *   $env:SUPABASE_DB_URL = "postgresql://postgres:...@...:5432/postgres"
 *   node scripts/apply-recruit-privacy-columns-049.mjs
 *
 * Variabili accettate: SUPABASE_DB_URL o DATABASE_URL (anche caricate da .env come in supabase-remote-push).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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

const dbUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error(
    "Manca SUPABASE_DB_URL o DATABASE_URL (es. copia la connection string Session mode dal dashboard Supabase, o da Render → Environment)."
  );
  process.exit(1);
}

const migrationPath = join(
  root,
  "infra",
  "supabase",
  "migrations",
  "049_recruit_candidates_privacy_postgrest_reload.sql"
);
const sql = readFileSync(migrationPath, "utf8");

const require = createRequire(import.meta.url);
const { Client } = require(join(root, "apps", "backend", "node_modules", "pg"));

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("OK: colonne recruit_candidates (privacy) + notify pgrst applicate.");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("Errore SQL:", msg);
  if (/ENOTFOUND|no such host|getaddrinfo/i.test(msg)) {
    console.error(
      "Il host nel connection string non esiste o non risolve DNS. In Supabase: Settings → Database → copia URI " +
        "Session mode del progetto effettivo usato da Render; aggiorna DATABASE_URL / SUPABASE_DB_URL."
    );
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
