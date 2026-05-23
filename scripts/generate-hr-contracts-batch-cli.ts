/**
 * CLI batch PDF contratti (employment + remote working) per tutti i dipendenti del tenant.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     corepack pnpm exec tsx scripts/generate-hr-contracts-batch-cli.ts --company-id=comp-1 --dry-run
 *
 *   ... --apply
 *   ... --apply --force
 *   ... --apply --allow-production   (solo con HR_CONTRACTS_BATCH_ALLOW_PROD=1)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../apps/backend/src/app.module";
import { HrContractsBatchService } from "../apps/backend/src/hr-contracts/hr-contracts-batch.service";
import { HrDataStore } from "../apps/backend/src/platform/hr-data.store";

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
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) flags.set(body, true);
    else flags.set(body.slice(0, eq), body.slice(eq + 1));
  }
  const apply = flags.has("apply");
  return {
    companyId: String(flags.get("company-id") ?? flags.get("companyId") ?? "").trim(),
    dryRun: apply ? false : true,
    force: flags.has("force"),
    allowProduction: flags.has("allow-production"),
    actorUserId: String(flags.get("actor-user-id") ?? process.env.HR_CONTRACTS_BATCH_ACTOR_USER_ID ?? "").trim(),
    maxRemoteDaysPerWeek: flags.has("max-remote-days-per-week")
      ? Number(flags.get("max-remote-days-per-week"))
      : undefined,
    maxRemoteDaysPerMonth: flags.has("max-remote-days-per-month")
      ? Number(flags.get("max-remote-days-per-month"))
      : undefined
  };
}

async function resolveActorUserId(store: HrDataStore, companyId: string, explicit: string): Promise<string> {
  if (explicit) return explicit;
  const users = await store.listUsers();
  const su = users.find((u) => u.companyId === companyId && u.role === "superuser");
  if (su) return su.id;
  const any = users.find((u) => u.companyId === companyId);
  if (any) return any.id;
  throw new Error(`Nessun utente per company ${companyId}; passa --actor-user-id=`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.companyId) {
    console.error("Manca --company-id=<tenant>");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });
  try {
    const store = app.get(HrDataStore);
    const batch = app.get(HrContractsBatchService);
    const actorUserId = await resolveActorUserId(store, opts.companyId, opts.actorUserId);

    if (opts.allowProduction) {
      process.env.HR_CONTRACTS_BATCH_ALLOW_PROD = "1";
    }

    const report = await batch.generateAll({
      companyId: opts.companyId,
      actorUserId,
      dryRun: opts.dryRun,
      force: opts.force,
      allowProduction: opts.allowProduction,
      maxRemoteDaysPerWeek: opts.maxRemoteDaysPerWeek,
      maxRemoteDaysPerMonth: opts.maxRemoteDaysPerMonth
    });

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.errorDetails.length > 0 ? 2 : 0);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
