#!/usr/bin/env node
/**
 * Aggiorna apps/backend/.env con le variabili del Web Service Render nexa-hr-backend.
 *
 * Prerequisito: API key Render (Dashboard → Account → API Keys), non committare mai.
 *   Windows PowerShell: $env:RENDER_API_KEY="rnd_..."
 *   Poi: node scripts/render-pull-backend-env.mjs
 *
 * Opzionale: RENDER_BACKEND_SERVICE_ID (default: srv Nexa-HR collegato al repo).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SERVICE_ID = "srv-d6vcbocr85hc73b9ha5g";
const SERVICE_ID = process.env.RENDER_BACKEND_SERVICE_ID?.trim() || DEFAULT_SERVICE_ID;
const API_KEY = process.env.RENDER_API_KEY?.trim();
const ROOT = resolve(process.cwd());
const ENV_PATH = resolve(ROOT, "apps/backend/.env");

const KEYS_TO_MERGE = new Set([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "AUTH_JWT_SECRET",
  "AUTH_SHARED_PASSWORD",
  "CORS_ORIGIN",
  "APP_SSO_SHARED_KEY",
  "USER_PII_ENCRYPTION_KEY",
]);

async function fetchAllEnvVars() {
  const out = [];
  let cursor = null;
  for (;;) {
    const u = new URL(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Render API ${res.status}: ${t.slice(0, 500)}`);
    }
    const body = await res.json();
    const arr = Array.isArray(body) ? body : body.envVars ?? [];
    out.push(...arr);
    cursor = body.cursor ?? body.nextCursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/** @param {Map<string,string>} updates */
function mergeEnvFile(raw, updates) {
  const lines = raw.split(/\r?\n/);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m && updates.has(m[1])) {
      out.push(`${m[1]}=${updates.get(m[1])}`);
      seen.add(m[1]);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of updates) {
    if (!seen.has(k)) {
      out.push(`${k}=${v}`);
    }
  }
  const text = out.join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

async function main() {
  if (!API_KEY) {
    console.error(
      "Imposta RENDER_API_KEY (Dashboard Render → Account → API Keys) e rilancia questo script."
    );
    process.exit(1);
  }

  const envRows = await fetchAllEnvVars();
  /** @type {Map<string,string>} */
  const fromRender = new Map();
  for (const row of envRows) {
    const o = row.envVar ?? row;
    const key = o.key ?? row.key;
    const val = o.value ?? row.value;
    if (key && typeof val === "string" && KEYS_TO_MERGE.has(key)) {
      fromRender.set(key, val);
    }
  }

  const prev = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  writeFileSync(ENV_PATH, mergeEnvFile(prev, fromRender), "utf8");
  console.log(
    `Aggiornato ${ENV_PATH} con ${fromRender.size} chiavi da Render (service ${SERVICE_ID}).`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
