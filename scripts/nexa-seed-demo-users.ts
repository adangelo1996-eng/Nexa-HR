/**
 * Crea 20 utenti Supabase Auth + righe public.users con anagrafica completa.
 * Prerequisito: migrazione 013 (centri di costo e ruoli catalogo).
 *
 * Uso (dalla root del monorepo):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SYNAPSE_EMAIL_DOMAIN=synapse.com \
 *     corepack pnpm exec tsx scripts/nexa-seed-demo-users.ts
 */

import { createClient } from "@supabase/supabase-js";

const PASSWORD = "Synapse2026";

type RoleName = "superuser" | "user";

interface SeedPerson {
  firstName: string;
  lastName: string;
  role: RoleName;
  /** Indice nel array people del manager (creato prima), null = vertice */
  managerIndex: number | null;
  costCenterId: string;
  roleCatalogId: string;
  baseSalaryMonthly: number;
  birthDate: string;
  hireDate: string;
  phone: string;
  address: string;
  contractType: string;
  weeklyContractHours: number;
  vacationAllowanceDays: number;
  avsNumber: string;
  iban: string;
  bankName: string;
  bicSwift: string;
  accountHolder: string;
  taxCanton: string;
  taxMunicipality: string;
}

/** Campi payroll / fisco IT per calcolo cedolino (allineati a migrazione 024 + 026). */
function seedPayrollAnagrafica(): Record<string, unknown> {
  return {
    jurisdiction: "IT",
    taxRegion: "LAZ",
    taxMunicipalityIt: "Roma",
    payrollItSector: "services",
    payrollEmployerInpsPercent: null,
    payrollInailPermille: 3.2,
    payrollTfrDivisor: 13.5,
    payrollAtecoCode: "62.01",
    payrollInailRiskDescription: "Ufficio / rischio basso (demo)"
  };
}

const IT_REGIONS = ["LAZ", "LOM", "PIE", "EMR", "VEN", "TOS"] as const;
const IT_COMUNI = ["Roma", "Milano", "Torino", "Bologna", "Venezia", "Firenze"] as const;
const IT_LEGAL = ["impiegato", "operaio", "quadro", "dirigente"] as const;

function pseudoFiscalCode(seed: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 16; i += 1) {
    s += chars[(seed.charCodeAt(i % seed.length) + i * 7) % chars.length];
  }
  return s;
}

/**
 * RAL credibile IT e campi anagrafica coerenti (deterministico per indice).
 * Sostituisce `baseSalaryMonthly` con RAL / payMonths.
 */
function seedItPayrollExtensions(index: number): Record<string, unknown> {
  const payMonths = index % 9 === 0 ? 14 : 13;
  const mod5 = index % 5;
  const band =
    mod5 === 0
      ? 28_000 + (index % 4) * 1_500
      : mod5 === 1
        ? 36_000 + (index % 4) * 2_000
        : mod5 === 2
          ? 48_000 + (index % 3) * 2_500
          : mod5 === 3
            ? 62_000 + (index % 4) * 2_800
            : 80_000 + (index % 3) * 3_500;
  const jitter = ((index * 17) % 2_400) - 800;
  const ral = Math.max(24_000, Math.min(95_000, band + jitter));
  const baseSalaryMonthly = Math.round((ral / payMonths) * 100) / 100;
  return {
    payMonthsPerYear: payMonths,
    annualGrossSalary: ral,
    baseSalaryMonthly,
    taxRegion: IT_REGIONS[index % IT_REGIONS.length],
    taxMunicipalityIt: IT_COMUNI[index % IT_COMUNI.length],
    taxDomicileSameAsResidence: index % 5 !== 0,
    taxDomicileMunicipalityIt: index % 5 === 0 ? IT_COMUNI[(index + 2) % IT_COMUNI.length] : null,
    fiscalCode: pseudoFiscalCode(`nexa-seed-${index}-${ral}`),
    maritalStatus: index % 4 === 0 ? "married" : index % 4 === 1 ? "single" : "divorced",
    dependentsChildren: index % 6,
    dependentSpouse: index % 7 === 0,
    disabilityFlag: index % 13 === 0,
    legalCategory: IT_LEGAL[index % IT_LEGAL.length],
    partTimeModality: index % 10 === 0 ? "horizontal" : "full",
    ccnlCode: index % 3 === 0 ? "Commercio" : "Metalmeccanico",
    ccnlLevel: `L${(index % 5) + 1}`,
    contractFixedTerm: index % 11 === 0,
    contractEndDate: index % 11 === 0 ? "2026-12-31" : null,
    fixedSupplementMonthly: index % 8 === 0 ? 120 : null,
    garnishmentMonthlyEstimate: index % 15 === 0 ? 50 : null,
    fringeBenefitYtdEuros: index % 4 === 0 ? 400 : 0
  };
}

function emailLocal(first: string, last: string): string {
  const f = first
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
  const l = last
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
  return `${f}.${l}`.replace(/^\.+|\.+$/g, "") || "utente";
}

const people: SeedPerson[] = [
  {
    firstName: "Giulia",
    lastName: "Ferrari",
    role: "superuser",
    managerIndex: null,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-01",
    baseSalaryMonthly: 9800,
    birthDate: "1982-04-12",
    hireDate: "2018-01-15",
    phone: "+41 91 500 1101",
    address: "Via Borghetto 4, 6900 Lugano",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "756.1234.5678.91",
    iban: "CH93 0076 2011 6238 5295 7",
    bankName: "UBS Switzerland AG",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Giulia Ferrari",
    taxCanton: "TI",
    taxMunicipality: "Lugano"
  },
  {
    firstName: "Marco",
    lastName: "Bernasconi",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-09",
    baseSalaryMonthly: 8900,
    birthDate: "1985-09-03",
    hireDate: "2019-03-01",
    phone: "+41 91 500 1102",
    address: "Via Pretorio 12, 6900 Lugano",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "756.2234.5678.12",
    iban: "CH12 0483 5012 3456 7890 0",
    bankName: "Credit Suisse",
    bicSwift: "CRESCHZZ80A",
    accountHolder: "Marco Bernasconi",
    taxCanton: "TI",
    taxMunicipality: "Lugano"
  },
  {
    firstName: "Elena",
    lastName: "Rossi",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-5",
    roleCatalogId: "nexa-r-02",
    baseSalaryMonthly: 8600,
    birthDate: "1987-11-21",
    hireDate: "2019-06-10",
    phone: "+41 91 500 1103",
    address: "Riva Paradiso 3, Paradiso",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "756.3234.5678.23",
    iban: "CH45 0900 0000 1234 5678 1",
    bankName: "PostFinance",
    bicSwift: "POFICHBEXXX",
    accountHolder: "Elena Rossi",
    taxCanton: "TI",
    taxMunicipality: "Paradiso"
  },
  {
    firstName: "Luca",
    lastName: "Colombo",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-10",
    baseSalaryMonthly: 7200,
    birthDate: "1991-02-18",
    hireDate: "2020-01-20",
    phone: "+41 78 200 3301",
    address: "Via Industria 2, Mendrisio",
    contractType: "indeterminato",
    weeklyContractHours: 42,
    vacationAllowanceDays: 22,
    avsNumber: "756.4234.5678.34",
    iban: "CH56 0070 0110 1234 5678 9",
    bankName: "Raiffeisen",
    bicSwift: "RAIFCH22",
    accountHolder: "Luca Colombo",
    taxCanton: "TI",
    taxMunicipality: "Mendrisio"
  },
  {
    firstName: "Sofia",
    lastName: "Marini",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-11",
    baseSalaryMonthly: 7100,
    birthDate: "1992-07-30",
    hireDate: "2020-09-01",
    phone: "+41 78 200 3302",
    address: "Corso Elvezia 8, Lugano",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.5234.5678.45",
    iban: "CH67 0020 2200 1234 5678 0",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Sofia Marini",
    taxCanton: "TI",
    taxMunicipality: "Lugano"
  },
  {
    firstName: "Andrea",
    lastName: "Greco",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-12",
    baseSalaryMonthly: 6800,
    birthDate: "1993-01-05",
    hireDate: "2021-02-15",
    phone: "+41 78 200 3303",
    address: "Via Gaggiolo 14, Chiasso",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.6234.5678.56",
    iban: "CH78 0483 5030 9876 5432 1",
    bankName: "Credit Suisse",
    bicSwift: "CRESCHZZ80A",
    accountHolder: "Andrea Greco",
    taxCanton: "TI",
    taxMunicipality: "Chiasso"
  },
  {
    firstName: "Chiara",
    lastName: "Fontana",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-13",
    baseSalaryMonthly: 6500,
    birthDate: "1994-10-11",
    hireDate: "2021-11-08",
    phone: "+41 78 200 3304",
    address: "Via Campagna 9, Massagno",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.7234.5678.67",
    iban: "CH89 0900 0000 9876 5432 0",
    bankName: "PostFinance",
    bicSwift: "POFICHBEXXX",
    accountHolder: "Chiara Fontana",
    taxCanton: "TI",
    taxMunicipality: "Massagno"
  },
  {
    firstName: "Davide",
    lastName: "Serra",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-14",
    baseSalaryMonthly: 7500,
    birthDate: "1989-05-22",
    hireDate: "2019-11-01",
    phone: "+41 78 200 3305",
    address: "Piazza Dante 1, Bellinzona",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 24,
    avsNumber: "756.8234.5678.78",
    iban: "CH90 0076 2000 1122 3344 5",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Davide Serra",
    taxCanton: "TI",
    taxMunicipality: "Bellinzona"
  },
  {
    firstName: "Francesca",
    lastName: "Vitale",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-03",
    baseSalaryMonthly: 6200,
    birthDate: "1995-03-17",
    hireDate: "2022-01-10",
    phone: "+41 78 200 4401",
    address: "Via Pretorio 30, Locarno",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.9234.5678.89",
    iban: "CH01 0020 2200 9988 7766 5",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Francesca Vitale",
    taxCanton: "TI",
    taxMunicipality: "Locarno"
  },
  {
    firstName: "Matteo",
    lastName: "Caruso",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-4",
    roleCatalogId: "nexa-r-04",
    baseSalaryMonthly: 7000,
    birthDate: "1990-08-08",
    hireDate: "2020-04-01",
    phone: "+41 78 200 4402",
    address: "Viale Stefano 6, Lugano",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.1334.5678.90",
    iban: "CH02 0483 5040 5566 7788 0",
    bankName: "Credit Suisse",
    bicSwift: "CRESCHZZ80A",
    accountHolder: "Matteo Caruso",
    taxCanton: "TI",
    taxMunicipality: "Lugano"
  },
  {
    firstName: "Valentina",
    lastName: "Pellegrini",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-05",
    baseSalaryMonthly: 6400,
    birthDate: "1993-12-01",
    hireDate: "2021-07-19",
    phone: "+41 78 200 4403",
    address: "Strada Regina 44, Melide",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.2334.5678.01",
    iban: "CH03 0900 0000 4433 2211 0",
    bankName: "PostFinance",
    bicSwift: "POFICHBEXXX",
    accountHolder: "Valentina Pellegrini",
    taxCanton: "TI",
    taxMunicipality: "Melide"
  },
  {
    firstName: "Alessandro",
    lastName: "De Luca",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-5",
    roleCatalogId: "nexa-r-18",
    baseSalaryMonthly: 6900,
    birthDate: "1988-06-14",
    hireDate: "2019-09-15",
    phone: "+41 78 200 4404",
    address: "Via Zurigo 22, Rivera",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 23,
    avsNumber: "756.3334.5678.12",
    iban: "CH04 0076 2000 6677 8899 0",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Alessandro De Luca",
    taxCanton: "TI",
    taxMunicipality: "Rivera"
  },
  {
    firstName: "Ilaria",
    lastName: "Romano",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-5",
    roleCatalogId: "nexa-r-19",
    baseSalaryMonthly: 6600,
    birthDate: "1992-04-25",
    hireDate: "2020-11-01",
    phone: "+41 78 200 4405",
    address: "Via Medici 7, Castel San Pietro",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.4334.5678.23",
    iban: "CH05 0020 2200 3344 5566 7",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Ilaria Romano",
    taxCanton: "TI",
    taxMunicipality: "Castel San Pietro"
  },
  {
    firstName: "Paolo",
    lastName: "Bianco",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-4",
    roleCatalogId: "nexa-r-17",
    baseSalaryMonthly: 9100,
    birthDate: "1984-01-29",
    hireDate: "2018-06-01",
    phone: "+41 91 500 2201",
    address: "Via Maggio 15, Lugano",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "756.5334.5678.34",
    iban: "CH06 0483 5050 7788 9900 1",
    bankName: "Credit Suisse",
    bicSwift: "CRESCHZZ80A",
    accountHolder: "Paolo Bianco",
    taxCanton: "TI",
    taxMunicipality: "Lugano"
  },
  {
    firstName: "Nadia",
    lastName: "Costa",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-15",
    baseSalaryMonthly: 6700,
    birthDate: "1991-09-09",
    hireDate: "2021-04-12",
    phone: "+41 78 200 5501",
    address: "Corso Pestalozzi 48, Lugano",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.6334.5678.45",
    iban: "CH07 0900 0000 5566 4433 2",
    bankName: "PostFinance",
    bicSwift: "POFICHBEXXX",
    accountHolder: "Nadia Costa",
    taxCanton: "TI",
    taxMunicipality: "Lugano"
  },
  {
    firstName: "Giorgio",
    lastName: "Leone",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-16",
    baseSalaryMonthly: 7300,
    birthDate: "1986-12-19",
    hireDate: "2019-02-01",
    phone: "+41 78 200 5502",
    address: "Via Borromini 3, Mendrisio",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 24,
    avsNumber: "756.7334.5678.56",
    iban: "CH08 0076 2000 8899 0011 2",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Giorgio Leone",
    taxCanton: "TI",
    taxMunicipality: "Mendrisio"
  },
  {
    firstName: "Beatrice",
    lastName: "Galliani",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-06",
    baseSalaryMonthly: 7800,
    birthDate: "1983-07-07",
    hireDate: "2018-09-01",
    phone: "+41 91 500 2202",
    address: "Via Cattedrale 2, Lugano",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "756.8334.5678.67",
    iban: "CH09 0483 5020 2233 4455 6",
    bankName: "Credit Suisse",
    bicSwift: "CRESCHZZ80A",
    accountHolder: "Beatrice Galliani",
    taxCanton: "TI",
    taxMunicipality: "Lugano"
  },
  {
    firstName: "Simone",
    lastName: "Parisi",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-4",
    roleCatalogId: "nexa-r-07",
    baseSalaryMonthly: 6000,
    birthDate: "1996-05-05",
    hireDate: "2022-09-01",
    phone: "+41 78 200 5503",
    address: "Via Franco Zorzi 11, Giubiasco",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.9334.5678.78",
    iban: "CH10 0020 2200 6677 8899 3",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Simone Parisi",
    taxCanton: "TI",
    taxMunicipality: "Giubiasco"
  },
  {
    firstName: "Teresa",
    lastName: "Mancini",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-08",
    baseSalaryMonthly: 6550,
    birthDate: "1993-02-28",
    hireDate: "2021-01-11",
    phone: "+41 78 200 5504",
    address: "Piazza Indipendenza 5, Chiasso",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.0434.5678.89",
    iban: "CH11 0900 0000 7788 5566 4",
    bankName: "PostFinance",
    bicSwift: "POFICHBEXXX",
    accountHolder: "Teresa Mancini",
    taxCanton: "TI",
    taxMunicipality: "Chiasso"
  },
  {
    firstName: "Riccardo",
    lastName: "Fabbri",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-20",
    baseSalaryMonthly: 5900,
    birthDate: "1997-11-13",
    hireDate: "2023-03-01",
    phone: "+41 78 200 5505",
    address: "Via Dogana 9, Stabio",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "756.1434.5678.90",
    iban: "CH12 0076 2000 3344 5566 8",
    bankName: "UBS",
    bicSwift: "UBSWCHZH80A",
    accountHolder: "Riccardo Fabbri",
    taxCanton: "TI",
    taxMunicipality: "Stabio"
  }
];

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const domain = (process.env.SYNAPSE_EMAIL_DOMAIN ?? "synapse.com").replace(/^@/, "");
  if (!url || !service) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richiesti");
  }
  const supabase = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids: string[] = [];

  for (let i = 0; i < people.length; i += 1) {
    const p = people[i]!;
    const email = `${emailLocal(p.firstName, p.lastName)}@${domain}`;
    const fullName = `${p.firstName} ${p.lastName}`;
    const managerId = p.managerIndex != null ? ids[p.managerIndex]! : null;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (createErr) {
      if (/already|registered|exists/i.test(createErr.message)) {
        const { data: list } = await supabase.auth.admin.listUsers();
        const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (!found) {
          throw createErr;
        }
        ids.push(found.id);
        const uid = found.id;
        const { error: upErr } = await supabase.from("users").upsert(
          {
            id: uid,
            email,
            fullName,
            firstName: p.firstName,
            lastName: p.lastName,
            role: p.role,
            managerId,
            companyId: "comp-1",
            roleId: p.roleCatalogId,
            costCenterId: p.costCenterId,
            contractType: p.contractType,
            weeklyContractHours: p.weeklyContractHours,
            vacationAllowanceDays: p.vacationAllowanceDays,
            dailyTargetSeconds: Math.round((p.weeklyContractHours / 5) * 3600),
            birthDate: p.birthDate,
            hireDate: p.hireDate,
            phone: p.phone,
            address: p.address,
            avsNumber: p.avsNumber,
            iban: p.iban,
            bankName: p.bankName,
            bicSwift: p.bicSwift,
            accountHolder: p.accountHolder,
            taxCanton: p.taxCanton,
            taxMunicipality: p.taxMunicipality,
            ...seedPayrollAnagrafica(),
            ...seedItPayrollExtensions(i)
          },
          { onConflict: "id" }
        );
        if (upErr) {
          throw upErr;
        }
        // eslint-disable-next-line no-console
        console.log(`Aggiornato esistente: ${email}`);
        continue;
      }
      throw createErr;
    }
    const uid = created.user!.id;
    ids.push(uid);

    const { error: insErr } = await supabase.from("users").insert({
      id: uid,
      email,
      fullName,
      firstName: p.firstName,
      lastName: p.lastName,
      role: p.role,
      managerId,
      companyId: "comp-1",
      roleId: p.roleCatalogId,
      costCenterId: p.costCenterId,
      contractType: p.contractType,
      weeklyContractHours: p.weeklyContractHours,
      vacationAllowanceDays: p.vacationAllowanceDays,
      dailyTargetSeconds: Math.round((p.weeklyContractHours / 5) * 3600),
      birthDate: p.birthDate,
      hireDate: p.hireDate,
      phone: p.phone,
      address: p.address,
      avsNumber: p.avsNumber,
      iban: p.iban,
      bankName: p.bankName,
      bicSwift: p.bicSwift,
      accountHolder: p.accountHolder,
      taxCanton: p.taxCanton,
      taxMunicipality: p.taxMunicipality,
      ...seedPayrollAnagrafica(),
      ...seedItPayrollExtensions(i)
    });
    if (insErr) {
      // eslint-disable-next-line no-console
      console.error(insErr);
      throw insErr;
    }
    // eslint-disable-next-line no-console
    console.log(`Creato: ${email} (${uid})`);
  }
  // eslint-disable-next-line no-console
  console.log(`Completato: ${ids.length} utenti (password: ${PASSWORD}).`);
  await seedCalendarMockRows(supabase, ids, people);
}

/** Turni demo aprile 2026, smart working, ferie e ROL — idempotente per id seed-* */
async function seedCalendarMockRows(
  supabase: ReturnType<typeof createClient>,
  personIds: string[],
  seededPeople: SeedPerson[]
): Promise<void> {
  const monthDays: string[] = [];
  for (let d = 1; d <= 28; d += 1) {
    monthDays.push(`2026-04-${String(d).padStart(2, "0")}`);
  }

  await supabase.from("shifts").delete().like("id", "nexa-seed-sh%");
  await supabase.from("leave_plans").delete().like("id", "nexa-seed-%");

  const shifts: Array<Record<string, unknown>> = [];
  let sh = 0;
  const pushShift = (
    userId: string,
    day: string,
    shH: number,
    enH: number,
    premium?: string | null
  ): void => {
    sh += 1;
    shifts.push({
      id: `nexa-seed-sh${String(sh).padStart(4, "0")}`,
      userId,
      startAt: `${day}T${String(shH).padStart(2, "0")}:00:00.000Z`,
      endAt: `${day}T${String(enH).padStart(2, "0")}:00:00.000Z`,
      premiumCode: premium ?? null,
      status: "scheduled"
    });
  };

  for (let i = 0; i < personIds.length; i += 1) {
    const uid = personIds[i]!;
    const rc = seededPeople[i]!.roleCatalogId;
    for (const day of monthDays) {
      const wd = new Date(`${day}T12:00:00.000Z`).getUTCDay();
      if (wd === 0 || wd === 6) {
        if (rc === "nexa-r-10" || rc === "nexa-r-11") {
          if (Number(day.slice(8)) % 6 === 0) {
            pushShift(uid, day, 10, 18, "weekend");
          }
        }
        continue;
      }
      if (rc === "nexa-r-20") {
        const rot = i % 2 === Number(day.slice(8)) % 2;
        pushShift(uid, day, rot ? 8 : 9, rot ? 16 : 17);
      } else if (rc === "nexa-r-10" || rc === "nexa-r-11") {
        pushShift(uid, day, 14, 22, Number(day.slice(8)) % 5 === 0 ? "evening" : null);
      } else {
        pushShift(uid, day, 9, 18);
      }
    }
  }

  const { error: shErr } = await supabase.from("shifts").insert(shifts);
  if (shErr) {
    // eslint-disable-next-line no-console
    console.warn("seed shifts:", shErr.message);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Inseriti ${shifts.length} turni demo (aprile 2026).`);
  }

  const swRows = personIds.slice(0, 4).flatMap((uid, idx) => {
    const d1 = `2026-04-${String(7 + idx).padStart(2, "0")}`;
    const d2 = `2026-04-${String(15 + idx).padStart(2, "0")}`;
    return [
      {
        userId: uid,
        date: d1,
        minutesWorked: 420,
        mode: "smartworking",
        workedSeconds: 420 * 60,
        overtimeSeconds: 0
      },
      {
        userId: uid,
        date: d2,
        minutesWorked: 360,
        mode: "smartworking",
        workedSeconds: 360 * 60,
        overtimeSeconds: 0
      }
    ];
  });

  const { error: swErr } = await supabase.from("workday_summaries").upsert(swRows, {
    onConflict: "userId,date"
  });
  if (swErr) {
    // eslint-disable-next-line no-console
    console.warn("seed smartworking summaries:", swErr.message);
  }

  if (personIds.length >= 10) {
    const leaveRows = [
      {
        id: "nexa-seed-leave-annual-1",
        userId: personIds[5]!,
        startDate: "2026-04-21",
        endDate: "2026-04-23",
        status: "approved",
        version: 1,
        kind: "annual"
      },
      {
        id: "nexa-seed-leave-rol-1",
        userId: personIds[8]!,
        startDate: "2026-04-10",
        endDate: "2026-04-10",
        status: "approved",
        version: 1,
        kind: "rol"
      }
    ];
    const { error: lvErr } = await supabase.from("leave_plans").upsert(leaveRows, { onConflict: "id" });
    if (lvErr) {
      // eslint-disable-next-line no-console
      console.warn("seed leave_plans:", lvErr.message);
    } else {
      // eslint-disable-next-line no-console
      console.log("Inseriti piani ferie/ROL demo.");
    }
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
