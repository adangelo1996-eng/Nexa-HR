#!/usr/bin/env node
/**
 * Wrapper CLI → generate-hr-contracts-batch-cli.ts (Nest + Supabase service role).
 *
 *   node scripts/generate-hr-contracts-batch.mjs --company-id=comp-1 --dry-run
 *   node scripts/generate-hr-contracts-batch.mjs --company-id=comp-1 --apply
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliTs = join(__dirname, "generate-hr-contracts-batch-cli.ts");
const args = process.argv.slice(2);

const child = spawnSync(
  process.platform === "win32" ? "corepack.cmd" : "corepack",
  ["pnpm", "exec", "tsx", cliTs, ...args],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
);

process.exit(child.status === null ? 1 : child.status);
