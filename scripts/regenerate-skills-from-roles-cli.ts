/**
 * CLI rigenerazione competenze (stessa logica di POST /analytics/skills/regenerate-from-roles).
 *
 * Uso (root repo):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     corepack pnpm exec tsx scripts/regenerate-skills-from-roles-cli.ts --company-id=demo --dry-run
 *
 *   ... --apply --backfill-users
 *   ... --apply --replace-role-requirements --backup
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { regenerateSkillsFromRoles } from "../apps/backend/src/platform/skills-regeneration";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFiles(paths: string[]) {
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

function parseArgs(argv: string[]) {
  const flags = new Map<string, string | true>();
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq === -1) {
        flags.set(body, true);
      } else {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
      }
    }
  }
  const has = (k: string) => flags.has(k);
  const apply = has("apply");
  return {
    companyId: String(flags.get("company-id") ?? flags.get("companyId") ?? "").trim(),
    dryRun: apply ? false : !has("no-dry-run"),
    apply,
    backfillUsers: has("backfill-users") || has("backfillUsers"),
    replaceRoleRequirements: has("replace-role-requirements") || has("replaceRoleRequirements"),
    backup: has("backup"),
    overwriteUserSkills: has("overwrite-user-skills") || has("overwriteUserSkills")
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.companyId) {
    console.error("Manca --company-id=<tenant> (users.companyId).");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (service role).");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const report = await regenerateSkillsFromRoles(sb, {
    companyId: opts.companyId,
    dryRun: opts.dryRun,
    apply: opts.apply,
    backfillUsers: opts.backfillUsers,
    replaceRoleRequirements: opts.replaceRoleRequirements,
    backup: opts.backup,
    overwriteUserSkills: opts.overwriteUserSkills,
    createdBy: "script:regenerate-skills-from-roles"
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.warnings.length) {
    console.error("Warnings:", report.warnings.join("; "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
