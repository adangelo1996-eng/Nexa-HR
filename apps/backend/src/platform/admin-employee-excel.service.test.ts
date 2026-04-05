import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  ADMIN_EMPLOYEE_EXCEL_EXTRA_FIELDS,
  ADMIN_EXPORT_FIELD_CATALOG,
  EMPLOYEE_EXCEL_IMPORT_FIELD_IDS
} from "./admin-export.catalog";
import { AdminEmployeeExcelService } from "./admin-employee-excel.service";
import { HrDataStore } from "./hr-data.store";

const labelById = new Map(
  [...ADMIN_EXPORT_FIELD_CATALOG, ...ADMIN_EMPLOYEE_EXCEL_EXTRA_FIELDS].map((x) => [x.id, x.label] as const)
);

function fillCompleteNewUserRow(sheet: ExcelJS.Worksheet, rowNum: number): void {
  const data: Record<string, string | number> = {
    email: "import.test.user@nexa-hr.example.com",
    fullName: "Mario Rossi Test",
    firstName: "Mario",
    lastName: "Rossi Test",
    fiscalCode: "RSSMRA80A01H501Z",
    phone: "+39 333 1234567",
    address: "Via Template 1",
    taxMunicipalityIt: "Roma",
    taxRegion: "LAZ",
    hireDate: "2026-01-15",
    birthDate: "1980-01-01",
    contractType: "Indeterminato",
    weeklyContractHours: 40,
    baseSalaryMonthly: 2500,
    annualGrossSalary: 32500,
    vacationAllowanceDays: 22,
    costCenterName: "Risorse Umane",
    costCenterCode: "HR",
    teamName: "Team HR demo",
    managerFullName: "Manager Controllo",
    roleId: "r3",
    platformRole: "user"
  };
  EMPLOYEE_EXCEL_IMPORT_FIELD_IDS.forEach((id, i) => {
    const col = i + 1;
    if (id === "userId") {
      return;
    }
    const v = data[id];
    if (v !== undefined) {
      sheet.getRow(rowNum).getCell(col).value = v;
    }
  });
}

describe("AdminEmployeeExcelService", () => {
  it("genera foglio Export con id u-tpl- e fogli CentriDiCosto, Team, Regioni", async () => {
    const store = new HrDataStore();
    const pool = {
      isConfigured: () => false,
      withTransaction: async () => {
        /* mock */
      }
    } as unknown as ConstructorParameters<typeof AdminEmployeeExcelService>[1];
    const svc = new AdminEmployeeExcelService(store, pool);
    const buf = await svc.buildNewUsersTemplate("u-admin", 4);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.ok(wb.getWorksheet("Export"));
    assert.ok(wb.getWorksheet("CentriDiCosto"));
    assert.ok(wb.getWorksheet("Team"));
    assert.ok(wb.getWorksheet("Regioni"));
    const exp = wb.getWorksheet("Export")!;
    const headers = exp.getRow(1).values;
    assert.ok(Array.isArray(headers));
    const labels = EMPLOYEE_EXCEL_IMPORT_FIELD_IDS.map((id) => labelById.get(id) ?? id);
    for (let i = 0; i < labels.length; i++) {
      assert.equal(String(exp.getRow(1).getCell(i + 1).value ?? "").trim(), labels[i]);
    }
    const idVal = stringifyCell(exp.getRow(2).getCell(1).value);
    assert.match(idVal, /^u-tpl-[0-9a-f]+$/);
  });

  it("validateWorkbook accetta riga template completa e rifiuta email mancante", async () => {
    const store = new HrDataStore();
    const pool = {
      isConfigured: () => false,
      withTransaction: async () => {}
    } as unknown as ConstructorParameters<typeof AdminEmployeeExcelService>[1];
    const svc = new AdminEmployeeExcelService(store, pool);
    const bufTwo = await svc.buildNewUsersTemplate("u-admin", 2);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bufTwo);
    const exp = wb.getWorksheet("Export")!;
    fillCompleteNewUserRow(exp, 2);
    fillCompleteNewUserRow(exp, 3);
    exp.getRow(3).getCell(EMPLOYEE_EXCEL_IMPORT_FIELD_IDS.indexOf("email") + 1).value = "";
    const badBuf = Buffer.from(await wb.xlsx.writeBuffer());
    const bad = await svc.validateWorkbook(badBuf, "u-admin");
    assert.ok(bad.errors.length > 0);

    const bufOne = await svc.buildNewUsersTemplate("u-admin", 1);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(bufOne);
    const exp2 = wb2.getWorksheet("Export")!;
    fillCompleteNewUserRow(exp2, 2);
    const goodBuf = Buffer.from(await wb2.xlsx.writeBuffer());
    const good = await svc.validateWorkbook(goodBuf, "u-admin");
    assert.equal(good.errors.length, 0);
    assert.equal(good.preview.length, 1);
  });

  it("apply con mock transazione: fallimento sulla seconda INSERT non esegue COMMIT", async () => {
    const store = new HrDataStore();
    Object.assign(store, { usesDatabase: () => true });
    const sqlLog: string[] = [];
    const pool = {
      isConfigured: () => true,
      withTransaction: async (fn: (c: { query: (s: string) => Promise<unknown> }) => Promise<void>) => {
        const client = {
          query: async (sql: string) => {
            sqlLog.push(sql);
            if (sql.startsWith("INSERT INTO users")) {
              const n = sqlLog.filter((s) => s.startsWith("INSERT INTO users")).length;
              if (n >= 2) {
                throw new Error("simulated_second_insert_failure");
              }
            }
            return { rowCount: 1 };
          }
        };
        await client.query("BEGIN");
        try {
          await fn(client as never);
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        }
      }
    } as unknown as ConstructorParameters<typeof AdminEmployeeExcelService>[1];
    const svc = new AdminEmployeeExcelService(store, pool);
    const buf = await svc.buildNewUsersTemplate("u-admin", 2);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const exp = wb.getWorksheet("Export")!;
    fillCompleteNewUserRow(exp, 2);
    exp.getRow(2).getCell(EMPLOYEE_EXCEL_IMPORT_FIELD_IDS.indexOf("email") + 1).value =
      "first.tx.user@nexa-hr.example.com";
    fillCompleteNewUserRow(exp, 3);
    exp.getRow(3).getCell(EMPLOYEE_EXCEL_IMPORT_FIELD_IDS.indexOf("email") + 1).value =
      "second.tx.user@nexa-hr.example.com";
    const twoRowBuf = Buffer.from(await wb.xlsx.writeBuffer());
    await assert.rejects(
      () => svc.applyWorkbook(twoRowBuf, "u-admin", { userId: "u-admin", email: "admin@synapse.com" }),
      /Transazione annullata/
    );
    assert.ok(sqlLog.includes("BEGIN"));
    assert.ok(sqlLog.includes("ROLLBACK"));
    assert.ok(!sqlLog.includes("COMMIT"));
  });
});

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text?: string }).text ?? "").trim();
  }
  if (typeof v === "object" && v !== null && "result" in v && (v as { result?: unknown }).result != null) {
    return String((v as { result: unknown }).result).trim();
  }
  return String(v).trim();
}
