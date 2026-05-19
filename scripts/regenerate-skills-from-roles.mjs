#!/usr/bin/env node
/**
 * Entry CLI: rigenera competenze aziendali da ruoli catalogo (vedi skills-regeneration.ts).
 *
 * PowerShell (root repo):
 *   $env:SUPABASE_URL="https://....supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."
 *   node scripts/regenerate-skills-from-roles.mjs --company-id=demo --dry-run
 *   node scripts/regenerate-skills-from-roles.mjs --company-id=demo --apply --backfill-users
 *
 * Flag:
 *   --company-id=...     (obbligatorio) tenant users.companyId
 *   --dry-run            default: solo report (equivale API ?dryRun=true)
 *   --apply              scrive su DB (?apply=true)
 *   --backfill-users     inserisce hr_user_skills mancanti
 *   --replace-role-requirements  rimuove fabbisogni non in profilo (richiede --backup)
 *   --backup             snapshot in hr_skills_regeneration_snapshots
 *   --overwrite-user-skills      aggiorna livelli esistenti (richiede --backup)
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cliTs = join(__dirname, "regenerate-skills-from-roles-cli.ts");
const args = process.argv.slice(2);

const child = spawnSync(
  process.platform === "win32" ? "corepack.cmd" : "corepack",
  ["pnpm", "exec", "tsx", cliTs, ...args],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
);

process.exit(child.status === null ? 1 : child.status);
