#!/usr/bin/env node
/**
 * Imposta lo Start Command del Web Service nexa-hr-frontend su Render via API.
 *
 * Prerequisito: RENDER_API_KEY (Dashboard → Account → API Keys).
 *   PowerShell: $env:RENDER_API_KEY="rnd_..."
 *
 * Opzionale: RENDER_FRONTEND_SERVICE_ID (default: srv nexa-hr-frontend Nexa-HR).
 */
const DEFAULT_SERVICE_ID = "srv-d6vctun5gffc73d8m3gg";
const START_COMMAND = "node scripts/render-start-nexa-frontend.mjs";

const SERVICE_ID = process.env.RENDER_FRONTEND_SERVICE_ID?.trim() || DEFAULT_SERVICE_ID;
const API_KEY = process.env.RENDER_API_KEY?.trim();

async function main() {
  if (!API_KEY) {
    console.error(
      "Manca RENDER_API_KEY. In PowerShell: $env:RENDER_API_KEY=\"rnd_...\" poi rilancia:\n  node scripts/render-update-frontend-start.mjs"
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

  const prev = details.envSpecificDetails.startCommand ?? "";
  if (prev === START_COMMAND) {
    console.log(`OK: "${name}" ha già startCommand corretto:\n  ${START_COMMAND}`);
    process.exit(0);
  }

  const buildCommand = details.envSpecificDetails.buildCommand ?? "";
  const minimalBody = {
    serviceDetails: {
      env: "node",
      envSpecificDetails: {
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
  console.log(`  startCommand: ${prev || "(vuoto)"}\n  → ${START_COMMAND}`);
  console.log("\nRender può avviare un deploy automatico se autoDeploy è attivo.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
