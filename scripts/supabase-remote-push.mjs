#!/usr/bin/env node
/**
 * Applica le migration sul database Supabase remoto.
 *
 * Modalità A — connection string (nessun access token):
 *   SUPABASE_DB_URL = URI Postgres (Session mode o Direct dal dashboard Supabase)
 *
 * Modalità B — link CLI:
 *   SUPABASE_ACCESS_TOKEN e SUPABASE_DB_PASSWORD
 *
 * Uso (PowerShell, modalità A):
 *   $env:SUPABASE_DB_URL="postgresql://postgres:...@db....supabase.co:5432/postgres"
 *   node scripts/supabase-remote-push.mjs
 *
 * Variabili lette anche da (se non già in ambiente): .env, .env.local, apps/backend/.env,
 * infra/supabase/.env — chiavi: SUPABASE_DB_URL o DATABASE_URL, oppure token + password.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Carica variabili da .env senza dipendenza dotenv (solo righe KEY=valore). */
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
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
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

/** Con `--optional`, se mancano le credenziali esce 0 (per CI/deploy senza DB URL). */
const optionalMigrate = process.argv.includes("--optional");

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim();
const dbUrl =
  process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();

const configPath = join(root, "infra", "supabase", "config.toml");
let projectRef = "kcaliyzmsvsrkuonnmrc";
try {
  const cfg = readFileSync(configPath, "utf8");
  const m = cfg.match(/project_id\s*=\s*"([^"]+)"/);
  if (m?.[1]) projectRef = m[1];
} catch {
  /* ignore */
}

function run(args, extraEnv = {}) {
  const r = spawnSync("npx", ["supabase", ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: true
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (dbUrl) {
  run(["db", "push", "--db-url", dbUrl, "--yes", "--workdir", "infra/supabase"]);
  console.log("Supabase: db push completato (SUPABASE_DB_URL).");
  process.exit(0);
}

if (!token || !dbPassword) {
  if (optionalMigrate) {
    console.log(
      "Supabase migrate: skip (--optional, nessuna di SUPABASE_DB_URL / DATABASE_URL né token+password)."
    );
    process.exit(0);
  }
  console.error(
    "Imposta SUPABASE_DB_URL, oppure insieme SUPABASE_ACCESS_TOKEN e SUPABASE_DB_PASSWORD, poi rilancia."
  );
  process.exit(1);
}

run(["link", "--project-ref", projectRef, "--password", dbPassword, "--yes", "--workdir", "infra/supabase"], {
  SUPABASE_ACCESS_TOKEN: token
});
run(["db", "push", "--yes", "--workdir", "infra/supabase"], { SUPABASE_ACCESS_TOKEN: token });
console.log("Supabase: db push completato.");
