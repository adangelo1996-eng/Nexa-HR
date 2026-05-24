import type { User } from "@payday/domain";
import type { CompanySettingsDto } from "../platform/hr-data.store";
import {
  DEFAULT_MAX_REMOTE_DAYS_PER_MONTH,
  DEFAULT_MAX_REMOTE_DAYS_PER_WEEK
} from "./hr-contract-brand.constants";

export type ContractPartyPayload = {
  companyLegalName: string;
  companyAddress?: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeAddress?: string;
  roleTitle?: string;
  workLocation?: string;
  startDateIso?: string;
  ralEuros?: number;
  payMonthsPerYear?: 12 | 13 | 14;
  endDateIso?: string;
  fixedTermReason?: string;
  weeklyHours?: number;
  employeeUserId: string;
  costCenterCode?: string;
  costCenterName?: string;
  fiscalCode?: string;
  contractType?: string;
  ccnlCode?: string;
  legalCategory?: string;
  contractKind?: "employment" | "remote_working";
  generationSource?: string;
  maxRemoteDaysPerWeek?: number;
  maxRemoteDaysPerMonth?: number;
  policyVersion?: string;
};

export type ContractBlockPayload = {
  key: string;
  title: string;
  content: string;
  locked?: boolean;
  type?: string;
  metadata?: Record<string, unknown>;
};

function formatItLongDateFromIso(iso?: string): string {
  const raw = iso?.trim();
  if (!raw) {
    return "[data]";
  }
  const d = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return raw;
  }
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function fillTemplate(template: string, party: ContractPartyPayload): string {
  const map: Record<string, string> = {
    "{{companyLegalName}}": party.companyLegalName || "Società",
    "{{companyAddress}}": party.companyAddress || "[indirizzo azienda]",
    "{{employeeFullName}}": `${party.employeeFirstName} ${party.employeeLastName}`.trim(),
    "{{employeeAddress}}": party.employeeAddress || "[indirizzo lavoratore]",
    "{{roleTitle}}": party.roleTitle || "[mansione]",
    "{{workLocation}}": party.workLocation || "[sede]",
    "{{startDate}}": party.startDateIso ? formatItLongDateFromIso(party.startDateIso) : "[data inizio]",
    "{{endDate}}": party.endDateIso ? formatItLongDateFromIso(party.endDateIso) : "[data fine rapporto]",
    "{{fixedTermReason}}": party.fixedTermReason?.trim() || "[causale / motivazione del termine]",
    "{{weeklyHours}}":
      party.weeklyHours != null && party.weeklyHours > 0
        ? `${party.weeklyHours} ore settimanali`
        : "[ore settimanali contrattuali]",
    "{{ral}}": party.ralEuros != null ? `${party.ralEuros.toLocaleString("it-IT")} EUR` : "[RAL]",
    "{{payMonths}}": party.payMonthsPerYear != null ? String(party.payMonthsPerYear) : "[mensilità]",
    "{{maxRemoteDaysPerWeek}}": String(party.maxRemoteDaysPerWeek ?? DEFAULT_MAX_REMOTE_DAYS_PER_WEEK),
    "{{maxRemoteDaysPerMonth}}": String(party.maxRemoteDaysPerMonth ?? DEFAULT_MAX_REMOTE_DAYS_PER_MONTH),
    "{{costCenter}}":
      party.costCenterCode && party.costCenterName
        ? `${party.costCenterCode} — ${party.costCenterName}`
        : party.costCenterName || party.costCenterCode || "[centro di costo]",
    "{{contractType}}": party.contractType?.trim() || "subordinato",
    "{{policyVersion}}": party.policyVersion ?? String(new Date().getFullYear())
  };
  let out = template;
  for (const [k, v] of Object.entries(map)) {
    out = out.split(k).join(v);
  }
  return out;
}

function applyBlocks(party: ContractPartyPayload, blocks: ContractBlockPayload[]): ContractBlockPayload[] {
  return blocks.map((b) => ({ ...b, content: fillTemplate(b.content, party) }));
}

export function employmentBlocksForParty(party: ContractPartyPayload): ContractBlockPayload[] {
  const raw: ContractBlockPayload[] = [
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra\n\n- {{companyLegalName}}, con sede in {{companyAddress}} (di seguito, “Datore di lavoro”)\n\nE\n\n- {{employeeFullName}}, residente in {{employeeAddress}} (di seguito, “Lavoratore”)\n\nsi conviene e stipula quanto segue."
    },
    {
      key: "oggetto",
      title: "2. Oggetto del contratto",
      content:
        "Il Datore di lavoro assume il Lavoratore con contratto di lavoro {{contractType}}, con decorrenza dal {{startDate}}, per lo svolgimento delle mansioni di {{roleTitle}}, presso il centro di costo {{costCenter}}."
    },
    {
      key: "inquadramento_retribuzione",
      title: "3. Inquadramento e retribuzione",
      content:
        "Il rapporto è disciplinato dal CCNL {{ccnl}} e dalle policy interne. La retribuzione annua lorda è pari a {{ral}}, ripartita su {{payMonths}} mensilità."
    },
    {
      key: "orario_sede",
      title: "4. Orario di lavoro e sede",
      content:
        "L’orario contrattuale è di {{weeklyHours}}. La sede di lavoro principale è {{workLocation}}; eventuali trasferte potranno essere richieste secondo esigenze organizzative."
    },
    {
      key: "ferie_permessi",
      title: "5. Ferie e permessi",
      content: "Ferie e permessi secondo normativa, CCNL e regolamento aziendale."
    },
    {
      key: "privacy",
      title: "6. Trattamento dei dati personali",
      content: "Il trattamento dei dati personali avviene ai sensi del GDPR e dell’informativa aziendale."
    },
    {
      key: "firma",
      title: "7. Sottoscrizione",
      content: "Letto, confermato e sottoscritto in duplice copia."
    }
  ];
  const ccnl = party.ccnlCode?.trim() || "applicato dall’azienda";
  const weekly =
    party.weeklyHours != null && party.weeklyHours > 0 ? `${party.weeklyHours} ore settimanali` : "40 ore settimanali";
  const withCcnl = raw.map((b) => ({
    ...b,
    content: b.content.replace("{{ccnl}}", ccnl).replace("{{weeklyHours}}", weekly)
  }));
  return applyBlocks(party, withCcnl);
}

export function remoteWorkingBlocksForParty(party: ContractPartyPayload): ContractBlockPayload[] {
  const week = party.maxRemoteDaysPerWeek ?? DEFAULT_MAX_REMOTE_DAYS_PER_WEEK;
  const month = party.maxRemoteDaysPerMonth ?? DEFAULT_MAX_REMOTE_DAYS_PER_MONTH;
  const raw: ContractBlockPayload[] = [
    {
      key: "remote_work_limits",
      title: "Limiti lavoro agile (dati strutturati)",
      content: "",
      type: "remote_work_limits",
      metadata: {
        allowedDaysPerWeek: week,
        allowedDaysPerMonth: month,
        maxRemoteDaysPerWeek: week,
        maxRemoteDaysPerMonth: month
      }
    },
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra {{companyLegalName}} e il/la dipendente {{employeeFullName}} si stipula il presente accordo di lavoro agile (smart working)."
    },
    {
      key: "oggetto",
      title: "2. Oggetto",
      content:
        "Il Lavoratore può svolgere la prestazione in modalità agile, nel rispetto della mansione {{roleTitle}} e delle policy aziendali versione {{policyVersion}}."
    },
    {
      key: "quota",
      title: "3. Giorni massimi di lavoro da remoto",
      content:
        "Salvo deroghe autorizzate dal Datore di lavoro, il Lavoratore può richiedere fino a {{maxRemoteDaysPerWeek}} giorni di lavoro agile per settimana solare e fino a {{maxRemoteDaysPerMonth}} giorni per mese di calendario, tramite il sistema Nexa HR.",
      type: "remote_working_quota",
      metadata: {
        allowedDaysPerWeek: week,
        allowedDaysPerMonth: month,
        maxRemoteDaysPerWeek: week,
        maxRemoteDaysPerMonth: month
      }
    },
    {
      key: "modalita",
      title: "4. Modalità operative",
      content:
        "Il Lavoratore garantisce idoneità del luogo di lavoro, connessione, riservatezza e reperibilità negli orari concordati. Il Datore di lavoro fornisce gli strumenti necessari secondo policy IT."
    },
    {
      key: "durata",
      title: "5. Validità",
      content: "Il presente accordo è valido dall’anno di riferimento indicato in piattaforma fino a revoca o sostituzione."
    },
    {
      key: "firma",
      title: "6. Sottoscrizione",
      content: "Letto, confermato e sottoscritto."
    }
  ];
  const policyVersion = party.policyVersion ?? String(new Date().getFullYear());
  return applyBlocks({ ...party, policyVersion }, raw);
}

export function buildPartyFromUser(
  user: User,
  company: CompanySettingsDto,
  opts: {
    roleTitle?: string;
    costCenterCode?: string;
    costCenterName?: string;
    contractKind: "employment" | "remote_working";
    maxRemoteDaysPerWeek?: number;
    maxRemoteDaysPerMonth?: number;
    policyVersion?: string;
  }
): ContractPartyPayload {
  const first = user.firstName?.trim() || user.fullName.split(/\s+/)[0] || "";
  const last =
    user.lastName?.trim() || user.fullName.split(/\s+/).slice(1).join(" ") || user.fullName;
  const payMonths = user.payMonthsPerYear;
  const payNorm =
    payMonths === 12 || payMonths === 13 || payMonths === 14 ? (payMonths as 12 | 13 | 14) : undefined;

  return {
    companyLegalName: company.companyLegalName?.trim() || "Datore di lavoro",
    companyAddress:
      company.companyAddress?.trim() ||
      company.companyRegistrationInfo?.trim() ||
      undefined,
    employeeFirstName: first,
    employeeLastName: last,
    employeeAddress: user.address?.trim() || undefined,
    roleTitle: opts.roleTitle?.trim() || user.legalCategory?.trim() || "dipendente",
    workLocation: user.taxMunicipalityIt?.trim() || user.address?.trim() || "sede aziendale",
    startDateIso: user.hireDate?.slice(0, 10) || undefined,
    ralEuros:
      user.annualGrossSalary != null && Number(user.annualGrossSalary) > 0
        ? Number(user.annualGrossSalary)
        : undefined,
    payMonthsPerYear: payNorm,
    weeklyHours: user.weeklyContractHours ?? company.weeklyFullTimeHours ?? 40,
    endDateIso: user.contractEndDate?.slice(0, 10) || undefined,
    employeeUserId: user.id,
    costCenterCode: opts.costCenterCode,
    costCenterName: opts.costCenterName,
    fiscalCode: user.fiscalCode?.trim() || undefined,
    contractType: user.contractType?.trim() || undefined,
    ccnlCode: user.ccnlCode?.trim() || company.companyCcnl?.trim() || undefined,
    legalCategory: user.legalCategory?.trim() || undefined,
    contractKind: opts.contractKind,
    generationSource: "batch_generate_v1",
    maxRemoteDaysPerWeek: opts.maxRemoteDaysPerWeek,
    maxRemoteDaysPerMonth: opts.maxRemoteDaysPerMonth,
    policyVersion: opts.policyVersion
  };
}

export function employmentContractTitle(user: User): string {
  const ct = user.contractType?.trim() || "indeterminato";
  return `Contratto di lavoro — ${user.fullName} (${ct})`;
}

export function remoteWorkingContractTitle(user: User, year: number): string {
  return `Accordo lavoro agile — ${user.fullName} (${year})`;
}

export function batchKeyFor(userId: string, kind: "employment" | "remote_working", year?: number): string {
  if (kind === "remote_working") {
    return `${userId}:remote_working:${year ?? new Date().getFullYear()}`;
  }
  return `${userId}:employment`;
}
