/**
 * Backfill anagrafica solo Italia: azzera AVS e fisco CH; allinea utenti demo (email seed)
 * a indirizzo/telefono/IBAN IT; per altri utenti corregge IBAN CH/LI e telefono +41.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SYNAPSE_EMAIL_DOMAIN=synapse.com \
 *     corepack pnpm exec tsx scripts/backfill-users-italy-anagrafica.ts
 *
 * Con USER_PII_ENCRYPTION_KEY: decrittura in lettura e ricrittura in update (stesso backend).
 */

import type { User } from "@payday/domain";
import {
  decryptUserFromStorage,
  encryptPlainObjectFieldsForStorage,
  loadUserPiiKeyFromEnv
} from "@payday/user-pii-crypto";
import { createClient } from "@supabase/supabase-js";
import { buildSyntheticItalianIban, demoPayrollItFields, pseudoFiscalCode } from "./lib/italian-demo-payroll";
import { emailLocal, people, seedPayrollAnagrafica } from "./nexa-seed-demo-users";

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const domain = (process.env.SYNAPSE_EMAIL_DOMAIN ?? "synapse.com").replace(/^@/, "");
  if (!url || !service) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richiesti");
  }
  const supabase = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const piiKey = loadUserPiiKeyFromEnv();

  const { data: users, error } = await supabase
    .from("users")
    .select("id,email,firstName,lastName,roleId,iban,phone,fiscalCode");
  if (error) {
    throw error;
  }
  if (!users?.length) {
    // eslint-disable-next-line no-console
    console.log("Nessun utente.");
    return;
  }

  const baseClear: Record<string, unknown> = {
    avsNumber: null,
    taxCanton: null,
    taxMunicipality: null,
    jurisdiction: "IT"
  };

  for (const u of users) {
    const uDec = decryptUserFromStorage(u as User, piiKey);
    const email = String(uDec.email ?? "").toLowerCase();
    const idx = people.findIndex(
      (p) => `${emailLocal(p.firstName, p.lastName)}@${domain}`.toLowerCase() === email
    );

    let patch: Record<string, unknown> = { ...baseClear };

    if (idx >= 0) {
      const p = people[idx]!;
      const fullName = `${p.firstName} ${p.lastName}`;
      const banking = buildSyntheticItalianIban(idx);
      patch = {
        ...patch,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName,
        phone: p.phone,
        address: p.address,
        birthDate: p.birthDate,
        hireDate: p.hireDate,
        contractType: p.contractType,
        weeklyContractHours: p.weeklyContractHours,
        vacationAllowanceDays: p.vacationAllowanceDays,
        iban: banking.iban,
        bankName: banking.bankName,
        bicSwift: banking.bicSwift,
        accountHolder: fullName,
        dailyTargetSeconds: Math.round((p.weeklyContractHours / 5) * 3600),
        ...seedPayrollAnagrafica(),
        ...demoPayrollItFields(idx, p.roleCatalogId)
      };
    } else {
      const ibanNorm = String(uDec.iban ?? "")
        .replace(/\s/g, "")
        .toUpperCase();
      const phone = String(uDec.phone ?? "").trim();
      if (ibanNorm.startsWith("CH") || ibanNorm.startsWith("LI")) {
        const banking = buildSyntheticItalianIban(hashId(uDec.id) % 500);
        patch.iban = banking.iban;
        patch.bankName = banking.bankName;
        patch.bicSwift = banking.bicSwift;
      }
      if (phone.startsWith("+41")) {
        patch.phone = "+39 02 0000 0000";
      }
      const fc = uDec.fiscalCode != null ? String(uDec.fiscalCode).trim() : "";
      if (!fc) {
        patch.fiscalCode = pseudoFiscalCode(`backfill-${uDec.id}-${String(uDec.email ?? "")}`);
      }
    }

    const sealed = encryptPlainObjectFieldsForStorage(patch, piiKey);
    const { error: upErr } = await supabase.from("users").update(sealed).eq("id", u.id);
    if (upErr) {
      // eslint-disable-next-line no-console
      console.error(`Errore ${u.id}:`, upErr);
      throw upErr;
    }
    // eslint-disable-next-line no-console
    console.log(`OK ${email}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Completato: ${users.length} utenti.`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
