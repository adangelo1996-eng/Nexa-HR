#!/usr/bin/env node
/**
 * Imposta Start Command e Health Check del Web Service nexa-hr-backend su Render via API.
 *
 * Chiave API (prima non vuota vince): come render-update-frontend-start.mjs
 *
 * Opzionale: RENDER_BACKEND_SERVICE_ID (default: nexa-hr-backend Nexa-HR).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SERVICE_ID = "srv-d6vcbocr85hc73b9ha5g";
const START_COMMAND = "node apps/backend/dist/main.js";
const HEALTH_CHECK_PATH = "/";

const SERVICE_ID = process.env.RENDER_BACKEND_SERVICE_ID?.trim() || DEFAULT_SERVICE_ID;

function parseEnvFileKey(text) {
  const m = text.match(/^\s*RENDER_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) return "";
  return m[1].replace(/^["']|["']$/g, "").trim();
}

function resolveApiKey() {
  const fromEnv = process.env.RENDER_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const filePath = process.env.RENDER_API_KEY_FILE?.trim();
  const candidates = [filePath, resolve(process.cwd(), ".render-api-key"), resolve(process.cwd(), "apps/backend/.env")].filter(
    Boolean
  );

  for (const p of candidates) {
    if (!p || !existsSync(p)) continue;
    try {
      const raw = readFileSync(p, "utf8").trim();
      if (p.endsWith(".env")) {
        const k = parseEnvFileKey(raw);
        if (k) return k;
      } else {
        const line = raw.split(/\r?\n/)[0]?.trim() ?? "";
        if (line) return line;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

const API_KEY = resolveApiKey();

async function main() {
  if (!API_KEY) {
    console.error(
      [
        "Manca RENDER_API_KEY. Scegli una opzione:",
        "  • PowerShell: $env:RENDER_API_KEY=\"rnd_...\"",
        "  • Crea .render-api-key nella root (una riga, file gitignored) con la chiave",
        "  • Aggiungi RENDER_API_KEY=rnd_... in apps/backend/.env",
        "Poi: pnpm render:backend:start-command",
      ].join("\n")
    );
    process.exit(1);
  }

  const base = `https://api.render.com/v1/services/${SERVICE_ID}`;
  const getRes = await fetch(base, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
  });
  if (!getRes.ok) {
    const t = await getRes.text();
    throw new Error(`GET service ${getRes.status}: ${t.slice(0, 800)}`);
  }
  const raw = await getRes.json();
  const svc = raw.service ?? raw;
  const name = svc.name ?? SERVICE_ID;
  const details = svc.serviceDetails;
  if (!details?.envSpecificDetails) {
    throw new Error("Risposta API senza serviceDetails.envSpecificDetails; controlla che sia un Web Service Node.");
  }

  const prevStart = details.envSpecificDetails.startCommand ?? "";
  const prevHealth = details.healthCheckPath ?? "";
  if (prevStart === START_COMMAND && prevHealth === HEALTH_CHECK_PATH) {
    console.log(`OK: "${name}" ha già startCommand e healthCheckPath corretti:\n  ${START_COMMAND}\n  health: ${HEALTH_CHECK_PATH}`);
    process.exit(0);
  }

  const buildCommand = details.envSpecificDetails.buildCommand ?? "";
  const minimalBody = {
    serviceDetails: {
      healthCheckPath: HEALTH_CHECK_PATH,
      env: details.env ?? "node",
      envSpecificDetails: {
        ...details.envSpecificDetails,
        buildCommand,
        startCommand: START_COMMAND,
      },
    },
  };

  let patchRes = await fetch(base, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(minimalBody),
  });

  if (!patchRes.ok) {
    const nextDetails = {
      ...details,
      healthCheckPath: HEALTH_CHECK_PATH,
      envSpecificDetails: {
        ...details.envSpecificDetails,
        startCommand: START_COMMAND,
      },
    };
    patchRes = await fetch(base, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ serviceDetails: nextDetails }),
    });
  }

  if (!patchRes.ok) {
    const t = await patchRes.text();
    throw new Error(`PATCH service ${patchRes.status}: ${t.slice(0, 1200)}`);
  }

  console.log(`Aggiornato servizio "${name}" (${SERVICE_ID})`);
  console.log(`  startCommand: ${prevStart || "(vuoto)"}\n  → ${START_COMMAND}`);
  console.log(`  healthCheckPath: ${prevHealth || "(vuoto)"}\n  → ${HEALTH_CHECK_PATH}`);
  console.log("\nRender può avviare un deploy automatico se autoDeploy è attivo.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
