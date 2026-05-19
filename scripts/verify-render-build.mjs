#!/usr/bin/env node
/**
 * Pre-deploy guard: same compile steps as Render (render.yaml).
 * Skips Supabase migrate (needs SUPABASE_DB_URL); use pnpm supabase:migrate:optional locally if needed.
 *
 * Usage: pnpm render:verify-build
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const pnpm = "pnpm";

function run(label, args, opts = {}) {
  console.log(`\n==> ${label}`);
  const r = spawnSync(pnpm, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, ...opts.env }
  });
  if (r.status !== 0) {
    console.error(`\n[render:verify-build] FAILED: ${label}`);
    process.exit(r.status ?? 1);
  }
}

console.log("[render:verify-build] Nexa-HR — mirroring Render build commands");

run("pnpm install --frozen-lockfile", ["install", "--frozen-lockfile"]);
run("build:backend:render", ["run", "build:backend:render"]);
run("@payday/frontend build", ["--filter", "@payday/frontend", "build"]);

console.log("\n[render:verify-build] OK — backend + frontend production builds passed.");
