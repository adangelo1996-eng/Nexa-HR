/**
 * Genera SQL UPDATE per allineare public.users agli utenti demo seed (solo IT).
 * Uso: corepack pnpm exec tsx scripts/emit-italy-demo-users-sql.ts [file.sql]
 * Se `file.sql` è passato, scrive UTF-8 su disco (evita pipe PowerShell che corrompe accenti).
 */

import { writeFileSync } from "node:fs";
import { buildSyntheticItalianIban, demoPayrollItFields } from "./lib/italian-demo-payroll";
import { emailLocal, people, seedPayrollAnagrafica } from "./nexa-seed-demo-users";

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function sqlVal(v: unknown): string {
  if (v === null || v === undefined) {
    return "NULL";
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "NULL";
  }
  return `'${esc(String(v))}'`;
}

/** Colonne sempre lowercase senza quote in questo schema. */
function usersCol(key: string): string {
  if (key === "jurisdiction" || key === "phone" || key === "address" || key === "iban") {
    return key;
  }
  return `"${key}"`;
}

const domain = (process.env.SYNAPSE_EMAIL_DOMAIN ?? "synapse.com").replace(/^@/, "");

const seedEmails: string[] = [];
const sqlChunks: string[] = [];

for (let i = 0; i < people.length; i += 1) {
  const p = people[i]!;
  const email = `${emailLocal(p.firstName, p.lastName)}@${domain}`.toLowerCase();
  seedEmails.push(email);
  const fullName = `${p.firstName} ${p.lastName}`;
  const banking = buildSyntheticItalianIban(i);
  const pa = seedPayrollAnagrafica();
  const it = demoPayrollItFields(i, p.roleCatalogId);
  const patch: Record<string, unknown> = {
    avsNumber: null,
    taxCanton: null,
    taxMunicipality: null,
    jurisdiction: "IT",
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
    ...pa,
    ...it
  };

  const setParts: string[] = [];
  for (const [k, val] of Object.entries(patch)) {
    setParts.push(`${usersCol(k)} = ${sqlVal(val)}`);
  }

  sqlChunks.push(`UPDATE public.users SET ${setParts.join(", ")} WHERE lower(email) = '${esc(email)}';`);
}

const fallback = buildSyntheticItalianIban(499);
const inList = seedEmails.map((e) => `'${esc(e)}'`).join(", ");
sqlChunks.push(`UPDATE public.users SET
  "avsNumber" = NULL,
  "taxCanton" = NULL,
  "taxMunicipality" = NULL,
  jurisdiction = 'IT',
  iban = ${sqlVal(fallback.iban)},
  "bankName" = ${sqlVal(fallback.bankName)},
  "bicSwift" = ${sqlVal(fallback.bicSwift)},
  phone = CASE WHEN phone LIKE '+41%' THEN '+39 02 0000 0000' ELSE phone END
WHERE regexp_replace(coalesce(iban, ''), '\\s', '', 'g') ~* '^ch[0-9]'
  AND lower(email) NOT IN (${inList});`);

const body = `${sqlChunks.join("\n")}\n`;
const outPath = process.argv[2]?.trim();
if (outPath) {
  writeFileSync(outPath, body, "utf8");
} else {
  // eslint-disable-next-line no-console
  process.stdout.write(body);
}
