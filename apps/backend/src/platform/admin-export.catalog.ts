import { BadRequestException } from "@nestjs/common";

export interface AdminExportFieldDefinition {
  id: string;
  label: string;
  /** Campi che devono essere presenti nell’export se questo è selezionato (es. mese competenza per variabili). */
  requires?: string[];
}

/** Variabili “mensili” non hanno senso senza un mese di competenza: restano disabilitate in UI finché non è scelto `competencePeriod`. */
export const ADMIN_EXPORT_VARIABLE_FIELD_IDS = new Set([
  "vacationDaysUsed",
  "sicknessDays",
  "smartworkingDays",
  "overtimeAmountEuro",
  "approvedExpenseReimbursementEuro"
]);

/** Colonne solo lettura nel foglio export (non si applicano a DB da import Excel dipendenti). */
export const ADMIN_EMPLOYEE_EXCEL_READONLY_IDS = new Set<string>([
  ...ADMIN_EXPORT_VARIABLE_FIELD_IDS,
  "competencePeriod"
]);

/**
 * Colonne extra per creazione utenti da template (non incluse nell’export standard).
 * Devono avere `label` univoco rispetto a `ADMIN_EXPORT_FIELD_CATALOG`.
 */
export const ADMIN_EMPLOYEE_EXCEL_EXTRA_FIELDS: AdminExportFieldDefinition[] = [
  { id: "roleId", label: "ID ruolo organizzativo" },
  { id: "platformRole", label: "Ruolo piattaforma (superuser/user)" }
];

export const ADMIN_EXPORT_FIELD_CATALOG: AdminExportFieldDefinition[] = [
  { id: "userId", label: "ID utente" },
  { id: "email", label: "Email" },
  { id: "fullName", label: "Nome completo" },
  { id: "firstName", label: "Nome" },
  { id: "lastName", label: "Cognome" },
  { id: "fiscalCode", label: "Codice fiscale" },
  { id: "phone", label: "Telefono" },
  { id: "address", label: "Indirizzo (via e numero)" },
  { id: "taxMunicipalityIt", label: "Comune di residenza" },
  { id: "taxRegion", label: "Regione (fiscale)" },
  { id: "hireDate", label: "Data assunzione" },
  { id: "birthDate", label: "Data di nascita" },
  { id: "contractType", label: "Tipo contratto" },
  { id: "weeklyContractHours", label: "Ore contrattuali settimanali" },
  { id: "baseSalaryMonthly", label: "Retribuzione mensile lorda base" },
  { id: "annualGrossSalary", label: "RAL annua indicativa" },
  { id: "vacationAllowanceDays", label: "Ferie annuali contrattuali (giorni)" },
  { id: "costCenterCode", label: "Codice centro di costo" },
  { id: "costCenterName", label: "Nome centro di costo" },
  { id: "teamName", label: "Team" },
  { id: "managerFullName", label: "Manager (nome)" },
  { id: "competencePeriod", label: "Mese competenza variabili (YYYY-MM)" },
  {
    id: "vacationDaysUsed",
    label: "Giorni ferie (nel mese variabili)",
    requires: ["competencePeriod"]
  },
  {
    id: "sicknessDays",
    label: "Giorni malattia (nel mese variabili)",
    requires: ["competencePeriod"]
  },
  {
    id: "smartworkingDays",
    label: "Giorni smart working (nel mese variabili)",
    requires: ["competencePeriod"]
  },
  {
    id: "overtimeAmountEuro",
    label: "Straordinari stimati (€, mese variabili)",
    requires: ["competencePeriod"]
  },
  {
    id: "approvedExpenseReimbursementEuro",
    label: "Note spese approvate da liquidare (€, competenza)",
    requires: ["competencePeriod"]
  }
];

const CATALOG_IDS = new Set(ADMIN_EXPORT_FIELD_CATALOG.map((f) => f.id));

export function expandAdminExportFieldSelection(selected: string[]): string[] {
  const set = new Set<string>();
  for (const id of selected) {
    set.add(id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...set]) {
      const def = ADMIN_EXPORT_FIELD_CATALOG.find((d) => d.id === id);
      for (const r of def?.requires ?? []) {
        if (!set.has(r)) {
          set.add(r);
          changed = true;
        }
      }
    }
  }
  return [...set];
}

export function assertAdminExportFieldSelection(
  fields: string[],
  competencePeriodParam?: string
): { fields: string[]; competencePeriod?: string } {
  for (const f of fields) {
    if (!CATALOG_IDS.has(f)) {
      throw new BadRequestException(`Campo export sconosciuto: ${f}`);
    }
  }
  let expanded = expandAdminExportFieldSelection(fields);
  const needsPeriod = expanded.some((id) => ADMIN_EXPORT_VARIABLE_FIELD_IDS.has(id));
  const cp = competencePeriodParam?.trim();
  if (needsPeriod && (!cp || !/^\d{4}-\d{2}$/.test(cp))) {
    throw new BadRequestException(
      "Parametro competencePeriod (YYYY-MM) obbligatorio per le variabili mensili selezionate."
    );
  }
  if (!expanded.includes("competencePeriod") && needsPeriod && cp) {
    expanded = [...expanded, "competencePeriod"];
  }
  return { fields: expanded, competencePeriod: cp };
}
