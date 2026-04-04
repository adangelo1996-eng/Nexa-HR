/**
 * Aggiorna su Supabase gli utenti demo (stessi 20 profili del seed) con IBAN IT sintetici
 * (check digit ISO 13616) e RAL / mensilità / anagrafica fiscale coerenti con `italian-demo-payroll.ts`.
 *
 * Uso (root monorepo):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SYNAPSE_EMAIL_DOMAIN=synapse.com \
 *     corepack pnpm exec tsx scripts/update-demo-users-iban-ral.ts
 */

import { createClient } from "@supabase/supabase-js";
import { buildSyntheticItalianIban, demoPayrollItFields } from "./lib/italian-demo-payroll";
import { emailLocal, people, seedPayrollAnagrafica } from "./nexa-seed-demo-users";

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const domain = (process.env.SYNAPSE_EMAIL_DOMAIN ?? "synapse.com").replace(/^@/, "");
  if (!url || !service) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richiesti");
  }
  const supabase = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let updated = 0;
  let missing = 0;

  for (let i = 0; i < people.length; i += 1) {
    const p = people[i]!;
    const email = `${emailLocal(p.firstName, p.lastName)}@${domain}`.toLowerCase();
    const fullName = `${p.firstName} ${p.lastName}`;
    const banking = buildSyntheticItalianIban(i);
    const patch = {
      iban: banking.iban,
      bankName: banking.bankName,
      bicSwift: banking.bicSwift,
      accountHolder: fullName,
      ...seedPayrollAnagrafica(),
      ...demoPayrollItFields(i, p.roleCatalogId)
    };

    const { data, error } = await supabase
      .from("users")
      .update(patch)
      .ilike("email", email)
      .select("id");
    if (error) {
      throw new Error(`${email}: ${error.message}`);
    }
    if (!data?.length) {
      // eslint-disable-next-line no-console
      console.warn(`Nessun utente con email ${email} — salta (eseguire prima il seed).`);
      missing += 1;
    } else {
      updated += 1;
      // eslint-disable-next-line no-console
      console.log(`Aggiornato ${email} → RAL ${patch.annualGrossSalary} €, IBAN ${String(patch.iban).slice(0, 8)}…`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Completato: ${updated} righe aggiornate, ${missing} email non trovate.`);
}

const run = (process.argv[1] ?? "").includes("update-demo-users-iban-ral");
if (run) {
  void main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
