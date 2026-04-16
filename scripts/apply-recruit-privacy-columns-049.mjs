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
const { resolve4, resolve6 } = await import("node:dns/promises");

/** Hostname-only DNS: su Windows `dns.lookup` spesso fallisce per `db.*.supabase.co` (solo AAAA). */
async function resolveTcpHost(hostname) {
  try {
    const r = await resolve4(hostname);
    return { address: r[0], family: 4 };
  } catch {
    const r = await resolve6(hostname);
    return { address: r[0], family: 6 };
  }
}

function parsePgConnectionString(conn) {
  const u = new URL(conn.replace(/^postgresql:/i, "http:"));
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "postgres"
  };
}

const cfg = parsePgConnectionString(dbUrl);
const { address } = await resolveTcpHost(cfg.host);
const client = new Client({
  host: address,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.database,
  ssl: { rejectUnauthorized: false, servername: cfg.host }
});
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
  if (/ENETUNREACH|ECONNREFUSED/i.test(msg)) {
    console.error(
      "Rete senza route IPv6 verso db.*.supabase.co oppure firewall: usa Connection pooling (host pooler, IPv4) " +
        "dal dashboard, oppure esegui lo SQL in Supabase → SQL Editor, oppure `pnpm supabase:db:push:remote` da una rete che raggiunge Postgres."
    );
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
