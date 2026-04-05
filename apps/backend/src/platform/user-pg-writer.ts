import type { PoolClient } from "pg";
import type { User } from "@payday/domain";

/**
 * Identificatori SQL colonne tabella `users` (Postgres, camelCase tra doppi apici).
 * Solo chiavi presenti qui possono essere scritte via transazione diretta.
 */
const USER_COL_SQL: Record<string, string> = {
  id: "id",
  email: "email",
  fullName: '"fullName"',
  firstName: '"firstName"',
  lastName: '"lastName"',
  role: "role",
  managerId: '"managerId"',
  companyId: '"companyId"',
  roleId: '"roleId"',
  costCenterId: '"costCenterId"',
  teamId: '"teamId"',
  contractType: '"contractType"',
  weeklyContractHours: '"weeklyContractHours"',
  avsNumber: '"avsNumber"',
  iban: "iban",
  bankName: '"bankName"',
  bicSwift: '"bicSwift"',
  accountHolder: '"accountHolder"',
  dailyTargetSeconds: '"dailyTargetSeconds"',
  vacationAllowanceDays: '"vacationAllowanceDays"',
  birthDate: '"birthDate"',
  hireDate: '"hireDate"',
  phone: "phone",
  address: "address",
  baseSalaryMonthly: '"baseSalaryMonthly"',
  taxCanton: '"taxCanton"',
  taxMunicipality: '"taxMunicipality"',
  jurisdiction: "jurisdiction",
  taxRegion: '"taxRegion"',
  taxMunicipalityIt: '"taxMunicipalityIt"',
  profilePhotoPath: '"profilePhotoPath"',
  payrollItSector: '"payrollItSector"',
  payrollEmployerInpsPercent: '"payrollEmployerInpsPercent"',
  payrollInailPermille: '"payrollInailPermille"',
  payrollTfrDivisor: '"payrollTfrDivisor"',
  payrollAtecoCode: '"payrollAtecoCode"',
  payrollInailRiskDescription: '"payrollInailRiskDescription"',
  fiscalCode: '"fiscalCode"',
  maritalStatus: '"maritalStatus"',
  dependentsChildren: '"dependentsChildren"',
  dependentSpouse: '"dependentSpouse"',
  disabilityFlag: '"disabilityFlag"',
  taxDomicileMunicipalityIt: '"taxDomicileMunicipalityIt"',
  taxDomicileSameAsResidence: '"taxDomicileSameAsResidence"',
  payMonthsPerYear: '"payMonthsPerYear"',
  annualGrossSalary: '"annualGrossSalary"',
  partTimeModality: '"partTimeModality"',
  ccnlCode: '"ccnlCode"',
  ccnlLevel: '"ccnlLevel"',
  legalCategory: '"legalCategory"',
  contractEndDate: '"contractEndDate"',
  fixedSupplementMonthly: '"fixedSupplementMonthly"',
  garnishmentMonthlyEstimate: '"garnishmentMonthlyEstimate"',
  fringeBenefitYtdEuros: '"fringeBenefitYtdEuros"',
  contractFixedTerm: '"contractFixedTerm"'
};

function userToRow(u: User): Record<string, unknown> {
  return JSON.parse(JSON.stringify(u)) as Record<string, unknown>;
}

export async function insertUserRowPg(client: PoolClient, user: User): Promise<void> {
  const flat = userToRow(user);
  const keys = Object.keys(flat).filter((k) => USER_COL_SQL[k] != null);
  if (!keys.includes("id")) {
    throw new Error("insertUserRowPg: id mancante");
  }
  const cols = keys.map((k) => USER_COL_SQL[k]);
  const vals = keys.map((k) => flat[k]);
  const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(`INSERT INTO users (${cols.join(", ")}) VALUES (${ph})`, vals);
}

export async function updateUserFullRowPg(client: PoolClient, user: User): Promise<void> {
  const flat = userToRow(user);
  const id = flat.id;
  delete flat.id;
  const keys = Object.keys(flat).filter((k) => USER_COL_SQL[k] != null);
  if (keys.length === 0) {
    throw new Error("updateUserFullRowPg: nessun campo da aggiornare");
  }
  const sets = keys.map((k, i) => `${USER_COL_SQL[k]} = $${i + 1}`);
  const vals = keys.map((k) => flat[k]);
  vals.push(id);
  const sql = `UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`;
  const res = await client.query(sql, vals);
  if (res.rowCount === 0) {
    throw new Error(`updateUserFullRowPg: utente non trovato (${String(id)})`);
  }
}
