/**
 * Crea 20 utenti Supabase Auth + righe public.users con anagrafica completa.
 * Prerequisito: migrazione 013 (centri di costo e ruoli catalogo).
 *
 * Uso (dalla root del monorepo):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SYNAPSE_EMAIL_DOMAIN=synapse.com \
 *     corepack pnpm exec tsx scripts/nexa-seed-demo-users.ts
 */

import { createClient } from "@supabase/supabase-js";
import { buildSyntheticItalianIban, demoPayrollItFields } from "./lib/italian-demo-payroll";

const PASSWORD = "Synapse2026";

type RoleName = "superuser" | "user";

export interface SeedPerson {
  firstName: string;
  lastName: string;
  role: RoleName;
  /** Indice nel array people del manager (creato prima), null = vertice */
  managerIndex: number | null;
  costCenterId: string;
  roleCatalogId: string;
  birthDate: string;
  hireDate: string;
  phone: string;
  address: string;
  contractType: string;
  weeklyContractHours: number;
  vacationAllowanceDays: number;
  avsNumber: string;
}

/** Campi payroll / fisco IT per calcolo cedolino (allineati a migrazione 024 + 026). */
export function seedPayrollAnagrafica(): Record<string, unknown> {
  return {
    jurisdiction: "IT",
    taxRegion: "LOM",
    taxMunicipalityIt: "Como",
    payrollItSector: "services",
    payrollEmployerInpsPercent: null,
    payrollInailPermille: 3.2,
    payrollTfrDivisor: 13.5,
    payrollAtecoCode: "62.01",
    payrollInailRiskDescription: "Ufficio / rischio basso (demo)"
  };
}

export function emailLocal(first: string, last: string): string {
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

export const people: SeedPerson[] = [
  {
    firstName: "Giulia",
    lastName: "Ferrari",
    role: "superuser",
    managerIndex: null,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-01",
    birthDate: "1982-04-12",
    hireDate: "2018-01-15",
    phone: "+39 02 91 500 1101",
    address: "Via Borghetto 4, 22100 Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "",
  },
  {
    firstName: "Marco",
    lastName: "Bernasconi",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-09",
    birthDate: "1985-09-03",
    hireDate: "2019-03-01",
    phone: "+39 02 91 500 1102",
    address: "Via Pretorio 12, 22100 Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "",
  },
  {
    firstName: "Elena",
    lastName: "Rossi",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-5",
    roleCatalogId: "nexa-r-02",
    birthDate: "1987-11-21",
    hireDate: "2019-06-10",
    phone: "+39 02 91 500 1103",
    address: "Riva Paradiso 3, Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "",
  },
  {
    firstName: "Luca",
    lastName: "Colombo",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-10",
    birthDate: "1991-02-18",
    hireDate: "2020-01-20",
    phone: "+39 02 78 200 3301",
    address: "Via Industria 2, Erba",
    contractType: "indeterminato",
    weeklyContractHours: 42,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Sofia",
    lastName: "Marini",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-11",
    birthDate: "1992-07-30",
    hireDate: "2020-09-01",
    phone: "+39 02 78 200 3302",
    address: "Corso Elvezia 8, Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Andrea",
    lastName: "Greco",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-12",
    birthDate: "1993-01-05",
    hireDate: "2021-02-15",
    phone: "+39 02 78 200 3303",
    address: "Via Gaggiolo 14, Cantù",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Chiara",
    lastName: "Fontana",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-13",
    birthDate: "1994-10-11",
    hireDate: "2021-11-08",
    phone: "+39 02 78 200 3304",
    address: "Via Campagna 9, Mariano Comense",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Davide",
    lastName: "Serra",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-14",
    birthDate: "1989-05-22",
    hireDate: "2019-11-01",
    phone: "+39 02 78 200 3305",
    address: "Piazza Dante 1, Lomazzo",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 24,
    avsNumber: "",
  },
  {
    firstName: "Francesca",
    lastName: "Vitale",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-03",
    birthDate: "1995-03-17",
    hireDate: "2022-01-10",
    phone: "+39 02 78 200 4401",
    address: "Via Pretorio 30, Fino Mornasco",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Matteo",
    lastName: "Caruso",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-4",
    roleCatalogId: "nexa-r-04",
    birthDate: "1990-08-08",
    hireDate: "2020-04-01",
    phone: "+39 02 78 200 4402",
    address: "Viale Stefano 6, Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Valentina",
    lastName: "Pellegrini",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-05",
    birthDate: "1993-12-01",
    hireDate: "2021-07-19",
    phone: "+39 02 78 200 4403",
    address: "Strada Regina 44, Mozzate",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Alessandro",
    lastName: "De Luca",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-5",
    roleCatalogId: "nexa-r-18",
    birthDate: "1988-06-14",
    hireDate: "2019-09-15",
    phone: "+39 02 78 200 4404",
    address: "Via Zurigo 22, Lomazzo",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 23,
    avsNumber: "",
  },
  {
    firstName: "Ilaria",
    lastName: "Romano",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-5",
    roleCatalogId: "nexa-r-19",
    birthDate: "1992-04-25",
    hireDate: "2020-11-01",
    phone: "+39 02 78 200 4405",
    address: "Via Medici 7, Mozzate",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Paolo",
    lastName: "Bianco",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-4",
    roleCatalogId: "nexa-r-17",
    birthDate: "1984-01-29",
    hireDate: "2018-06-01",
    phone: "+39 02 91 500 2201",
    address: "Via Maggio 15, Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "",
  },
  {
    firstName: "Nadia",
    lastName: "Costa",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-15",
    birthDate: "1991-09-09",
    hireDate: "2021-04-12",
    phone: "+39 02 78 200 5501",
    address: "Corso Pestalozzi 48, Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Giorgio",
    lastName: "Leone",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-16",
    birthDate: "1986-12-19",
    hireDate: "2019-02-01",
    phone: "+39 02 78 200 5502",
    address: "Via Borromini 3, Erba",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 24,
    avsNumber: "",
  },
  {
    firstName: "Beatrice",
    lastName: "Galliani",
    role: "user",
    managerIndex: 0,
    costCenterId: "nexa-cc-3",
    roleCatalogId: "nexa-r-06",
    birthDate: "1983-07-07",
    hireDate: "2018-09-01",
    phone: "+39 02 91 500 2202",
    address: "Via Cattedrale 2, Como",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 25,
    avsNumber: "",
  },
  {
    firstName: "Simone",
    lastName: "Parisi",
    role: "user",
    managerIndex: 2,
    costCenterId: "nexa-cc-4",
    roleCatalogId: "nexa-r-07",
    birthDate: "1996-05-05",
    hireDate: "2022-09-01",
    phone: "+39 02 78 200 5503",
    address: "Via Franco Zorzi 11, Lomazzo",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Teresa",
    lastName: "Mancini",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-1",
    roleCatalogId: "nexa-r-08",
    birthDate: "1993-02-28",
    hireDate: "2021-01-11",
    phone: "+39 02 78 200 5504",
    address: "Piazza Indipendenza 5, Cantù",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
  },
  {
    firstName: "Riccardo",
    lastName: "Fabbri",
    role: "user",
    managerIndex: 1,
    costCenterId: "nexa-cc-2",
    roleCatalogId: "nexa-r-20",
    birthDate: "1997-11-13",
    hireDate: "2023-03-01",
    phone: "+39 02 78 200 5505",
    address: "Via Dogana 9, Lomazzo",
    contractType: "indeterminato",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
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
    const banking = buildSyntheticItalianIban(i);

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
            iban: banking.iban,
            bankName: banking.bankName,
            bicSwift: banking.bicSwift,
            accountHolder: fullName,
            ...seedPayrollAnagrafica(),
            ...demoPayrollItFields(i, p.roleCatalogId)
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
      iban: banking.iban,
      bankName: banking.bankName,
      bicSwift: banking.bicSwift,
      accountHolder: fullName,
      ...seedPayrollAnagrafica(),
      ...demoPayrollItFields(i, p.roleCatalogId)
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

const runSeed = (process.argv[1] ?? "").includes("nexa-seed-demo-users");
if (runSeed) {
  void main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
