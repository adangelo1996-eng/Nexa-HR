/**
 * Verifica variabili e file PEM per GET /api/attendance/wallet-pass.
 * Uso: da apps/backend → `pnpm wallet:check`
 *       da root monorepo → `pnpm wallet:check:backend`
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const backendRoot = resolve(__dirname, "..");

config({ path: resolve(backendRoot, ".env"), quiet: true });

function trimEnv(name) {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function certBase() {
  const fromEnv = trimEnv("APPLE_WALLET_CERT_BASE_DIR");
  if (fromEnv) {
    return resolve(fromEnv);
  }
  return resolve(backendRoot, "certs");
}

function resolveWalletFilePath(raw) {
  if (!raw) {
    return null;
  }
  const p = raw.trim();
  if (!p) {
    return null;
  }
  const base = certBase();
  return isAbsolute(p) ? resolve(p) : resolve(base, p);
}

const passType = trimEnv("APPLE_WALLET_PASS_TYPE_ID");
const team = trimEnv("APPLE_WALLET_TEAM_ID");
const org = trimEnv("APPLE_WALLET_ORGANIZATION_NAME") || "Nexa HR";
const certPath = trimEnv("APPLE_WALLET_SIGNER_CERT_PATH");
const keyPath = trimEnv("APPLE_WALLET_SIGNER_KEY_PATH");
const wwdrPath = trimEnv("APPLE_WALLET_WWDR_CERT_PATH");

const lines = [];
let ok = true;

if (!passType) {
  ok = false;
  lines.push("[missing] APPLE_WALLET_PASS_TYPE_ID");
} else {
  lines.push(`[ok] Pass Type ID: ${passType}`);
}

if (!team) {
  ok = false;
  lines.push("[missing] APPLE_WALLET_TEAM_ID");
} else {
  lines.push(`[ok] Team ID: ${team}`);
}

lines.push(`[info] Organizzazione pass: ${org}`);
lines.push(`[info] Directory certificati (base): ${certBase()}`);

for (const [label, raw] of [
  ["APPLE_WALLET_SIGNER_CERT_PATH", certPath],
  ["APPLE_WALLET_SIGNER_KEY_PATH", keyPath],
  ["APPLE_WALLET_WWDR_CERT_PATH", wwdrPath]
]) {
  const abs = resolveWalletFilePath(raw);
  if (!raw) {
    ok = false;
    lines.push(`[missing] ${label}`);
  } else if (!abs || !existsSync(abs)) {
    ok = false;
    lines.push(`[missing file] ${label} -> ${abs ?? raw}`);
  } else {
    lines.push(`[ok] ${label}`);
    lines.push(`     ${abs}`);
  }
}

console.log("Apple Wallet — controllo configurazione backend\n");
for (const l of lines) {
  console.log(l);
}
console.log("");

if (ok) {
  console.log(
    "Tutto presente: il backend può provare a firmare i pass (prova GET /api/attendance/wallet-pass con JWT)."
  );
  process.exit(0);
}

console.log(
  "Azioni: 1) Copia in apps/backend/certs/ i PEM firmati Apple (signer cert, signer key, WWDR)."
);
console.log(
  "        2) Imposta le variabili in apps/backend/.env (vedi .env.example). 3) Riesegui questo script."
);
process.exit(1);
