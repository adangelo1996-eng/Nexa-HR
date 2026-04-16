#!/usr/bin/env node
/**
 * Applica `supabase db push` usando la Session pooler URI (IPv4), quando la direct connection
 * `db.*.supabase.co` è solo IPv6 e non raggiungibile.
 *
 * Costruisce: postgresql://postgres.[ref]:...@aws-0-[region].pooler.supabase.com:5432/postgres
 * e prova più region AWS comuni finché una risponde.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const directUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!directUrl) {
  console.error("Manca SUPABASE_DB_URL o DATABASE_URL (connection string direct dal dashboard).");
  process.exit(1);
}

/** Estrae ref e password dalla URI direct `...@db.REF.supabase.co:5432/...` */
function parseDirectUrl(conn) {
  const u = new URL(conn.replace(/^postgresql:/i, "http:"));
  const host = u.hostname;
  const m = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(host);
  if (!m) {
    throw new Error(
      "Host atteso db.<project_ref>.supabase.co nella SUPABASE_DB_URL/DATABASE_URL; altrimenti imposta SUPABASE_POOLER_URL a mano."
    );
  }
  const projectRef = m[1];
  const password = decodeURIComponent(u.password);
  return { projectRef, password };
}

const { projectRef, password } = parseDirectUrl(directUrl);

/** Region AWS del progetto (es. eu-central-1) da Management API — necessaria per il pooler condiviso. */
async function fetchProjectRegionFromSupabaseApi(ref) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) return null;
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    if (!r.ok) return null;
    const j = await r.json();
    const reg = j.region;
    return typeof reg === "string" && reg.length > 0 ? reg : null;
  } catch {
    return null;
  }
}

const hintedRegion = process.env.SUPABASE_POOLER_REGION?.trim();
const apiRegion = await fetchProjectRegionFromSupabaseApi(projectRef);

const regionsFallback = [
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "sa-east-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-northeast-1"
];

const regions = [...new Set([hintedRegion, apiRegion, ...regionsFallback].filter(Boolean))];
const awsPrefixes = ["aws-0", "aws-1"];
if (apiRegion) {
  console.error(`Regione progetto (Management API): ${apiRegion}`);
} else if (!hintedRegion) {
  console.error(
    "Suggerimento: aggiungi SUPABASE_ACCESS_TOKEN (PAT da supabase.com/dashboard/account/tokens) in apps/backend/.env " +
      "per risolvere la regione pooler, oppure SUPABASE_POOLER_REGION=eu-central-1."
  );
}

function buildSessionPoolerUrl(region, awsPrefix = "aws-0") {
  const user = `postgres.${projectRef}`;
  const host = `${awsPrefix}-${region}.pooler.supabase.com`;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/postgres`;
}

let lastOutput = "";
for (const awsPrefix of awsPrefixes) {
  for (const region of regions) {
  const poolUrl = buildSessionPoolerUrl(region, awsPrefix);
  console.error(`Tentativo pooler ${awsPrefix} region=${region} …`);
  const r = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["supabase", "db", "push", "--db-url", poolUrl, "--yes", "--workdir", "infra/supabase"],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
      windowsHide: true
    }
  );
  lastOutput = `exit ${r.status}`;
  if (r.status === 0) {
    console.error(`OK: migrazioni applicate via pooler (${region}).`);
    process.exit(0);
  }
  console.error(`  fallito (exit ${r.status}), provo combinazione successiva…`);
  }
}

console.error("Nessuna combinazione pooler ha funzionato. Ultimo output:\n", lastOutput.slice(0, 2000));
process.exit(1);
