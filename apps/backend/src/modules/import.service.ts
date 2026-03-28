import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { AuthRole } from "./auth";
import { HrDataStore } from "./hr-data.store";
import { isSynapseSuperuserEmail } from "./synapse-superuser";

export type ImportCategory = "users" | "cost_centers" | "roles";

export interface ImportCellError {
  row: number;
  field: string;
  message: string;
}

export interface ImportHistoryRecord {
  id: string;
  category: ImportCategory;
  startedAt: string;
  finishedAt: string;
  status: "ok" | "failed";
  rowCount: number;
  errorCount: number;
  errorsSnapshot?: ImportCellError[];
  createdByUserId: string;
}

interface UserImportRow {
  firstName: string;
  lastName: string;
  email?: string;
  role: AuthRole;
  roleId: string;
  costCenterId: string;
  contractType: string;
  weeklyContractHours: number;
  companyId: string;
}

interface CostCenterImportRow {
  name: string;
  description?: string;
}

interface RoleImportRow {
  name: string;
  description?: string;
  permissions: string[];
}

const MAX_IMPORT_ROWS = 5000;
/** Esportato per limiti multipart nel controller. */
export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = IMPORT_MAX_FILE_BYTES;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

@Injectable()
export class ImportService {
  private readonly history: ImportHistoryRecord[] = [];
  private readonly rateHits = new Map<string, number[]>();

  constructor(private readonly store: HrDataStore) {}

  assertRateLimit(userId: string): void {
    const now = Date.now();
    const windowStart = now - RATE_WINDOW_MS;
    const prev = this.rateHits.get(userId) ?? [];
    const next = prev.filter((t) => t > windowStart);
    next.push(now);
    this.rateHits.set(userId, next);
    if (next.length > RATE_MAX) {
      throw new BadRequestException("Troppe richieste di import. Riprova tra un minuto.");
    }
  }

  assertXlsxMagic(buffer: Buffer): void {
    if (buffer.length < 4) {
      throw new BadRequestException("File troppo piccolo o non valido");
    }
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new BadRequestException("Il file deve essere un foglio Excel .xlsx valido (firma ZIP PK).");
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException(`Dimensione massima file ${MAX_FILE_BYTES / (1024 * 1024)} MB`);
    }
  }

  listHistory(): ImportHistoryRecord[] {
    return [...this.history].reverse().slice(0, 50);
  }

  async buildTemplate(category: ImportCategory): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Dati", { views: [{ state: "frozen", ySplit: 1 }] });
    const help = wb.addWorksheet("Istruzioni");

    if (category === "users") {
      sheet.columns = [
        { header: "Nome", key: "firstName", width: 18 },
        { header: "Cognome", key: "lastName", width: 18 },
        { header: "Email (opzionale)", key: "email", width: 28 },
        { header: "Ruolo piattaforma", key: "role", width: 22 },
        { header: "ID ruolo organizzativo", key: "roleId", width: 22 },
        { header: "ID centro di costo", key: "costCenterId", width: 22 },
        { header: "Tipo contratto", key: "contractType", width: 18 },
        { header: "Ore settimanali", key: "weeklyContractHours", width: 16 },
        { header: "ID azienda", key: "companyId", width: 18 }
      ];
      sheet.addRow({});
      help.addRow(["Ruolo piattaforma: admin | manager_controllo_gestione | employee"]);
      help.addRow(["Email: se vuota viene generata automaticamente (nome.cognome@dominio)."]);
    } else if (category === "cost_centers") {
      sheet.columns = [
        { header: "Nome", key: "name", width: 28 },
        { header: "Descrizione (opzionale)", key: "description", width: 36 }
      ];
      sheet.addRow({});
      help.addRow(["Il codice a 10 cifre viene generato dal sistema alla creazione."]);
    } else {
      sheet.columns = [
        { header: "Nome ruolo", key: "name", width: 24 },
        { header: "Descrizione (opzionale)", key: "description", width: 32 },
        { header: "Permessi (id separati da virgola)", key: "permissions", width: 48 }
      ];
      sheet.addRow({});
      help.addRow(["Usa gli id del catalogo (es. nexa.attendance:read) o * per tutti."]);
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async validateUsers(buffer: Buffer): Promise<{ errors: ImportCellError[]; rows: UserImportRow[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as never);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Foglio Excel vuoto");
    }
    const errors: ImportCellError[] = [];
    const rows: UserImportRow[] = [];
    let dataRows = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }
      dataRows += 1;
      if (dataRows > MAX_IMPORT_ROWS) {
        return;
      }
      const c = (n: number): string => {
        const v = row.getCell(n).value;
        if (v === null || v === undefined) {
          return "";
        }
        if (typeof v === "object" && v !== null && "text" in v) {
          return String((v as { text?: string }).text ?? "").trim();
        }
        return String(v).trim();
      };
      const firstName = c(1);
      const lastName = c(2);
      const email = c(3) || undefined;
      const roleRaw = c(4).toLowerCase();
      const roleId = c(5);
      const costCenterId = c(6);
      const contractType = c(7);
      const weeklyRaw = c(8);
      const companyId = c(9);

      const baseRow = rowNumber;
      if (!firstName) {
        errors.push({ row: baseRow, field: "Nome", message: "Obbligatorio" });
      }
      if (!lastName) {
        errors.push({ row: baseRow, field: "Cognome", message: "Obbligatorio" });
      }
      const role =
        roleRaw === "admin" || roleRaw === "manager_controllo_gestione" || roleRaw === "employee"
          ? (roleRaw as AuthRole)
          : ("" as AuthRole);
      if (!roleRaw || !role) {
        errors.push({ row: baseRow, field: "Ruolo piattaforma", message: "Valore non valido (admin | manager_controllo_gestione | employee)" });
      }
      if (!roleId) {
        errors.push({ row: baseRow, field: "ID ruolo organizzativo", message: "Obbligatorio" });
      }
      if (!costCenterId) {
        errors.push({ row: baseRow, field: "ID centro di costo", message: "Obbligatorio" });
      }
      if (!contractType) {
        errors.push({ row: baseRow, field: "Tipo contratto", message: "Obbligatorio" });
      }
      let weeklyContractHours = Number(weeklyRaw);
      if (!weeklyRaw || Number.isNaN(weeklyContractHours) || weeklyContractHours < 1 || weeklyContractHours > 80) {
        errors.push({ row: baseRow, field: "Ore settimanali", message: "Numero tra 1 e 80" });
        weeklyContractHours = 1;
      }
      if (!companyId) {
        errors.push({ row: baseRow, field: "ID azienda", message: "Obbligatorio" });
      }

      if (firstName && lastName && role && roleId && costCenterId && contractType && companyId) {
        rows.push({
          firstName,
          lastName,
          email,
          role,
          roleId,
          costCenterId,
          contractType,
          weeklyContractHours,
          companyId
        });
      }
    });

    return { errors, rows };
  }

  async validateCostCenters(buffer: Buffer): Promise<{ errors: ImportCellError[]; rows: CostCenterImportRow[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as never);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Foglio Excel vuoto");
    }
    const errors: ImportCellError[] = [];
    const rows: CostCenterImportRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }
      const c = (n: number): string => {
        const v = row.getCell(n).value;
        if (v === null || v === undefined) {
          return "";
        }
        if (typeof v === "object" && v !== null && "text" in v) {
          return String((v as { text?: string }).text ?? "").trim();
        }
        return String(v).trim();
      };
      const name = c(1);
      const description = c(2) || undefined;
      if (!name) {
        errors.push({ row: rowNumber, field: "Nome", message: "Obbligatorio" });
        return;
      }
      rows.push({ name, description });
    });
    return { errors, rows };
  }

  async validateRoles(buffer: Buffer): Promise<{ errors: ImportCellError[]; rows: RoleImportRow[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as never);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Foglio Excel vuoto");
    }
    const errors: ImportCellError[] = [];
    const rows: RoleImportRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }
      const c = (n: number): string => {
        const v = row.getCell(n).value;
        if (v === null || v === undefined) {
          return "";
        }
        if (typeof v === "object" && v !== null && "text" in v) {
          return String((v as { text?: string }).text ?? "").trim();
        }
        return String(v).trim();
      };
      const name = c(1);
      const description = c(2) || undefined;
      const permRaw = c(3);
      if (!name) {
        errors.push({ row: rowNumber, field: "Nome ruolo", message: "Obbligatorio" });
        return;
      }
      const permissions = permRaw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (permissions.length === 0) {
        errors.push({ row: rowNumber, field: "Permessi", message: "Specificare almeno un permesso o *" });
        return;
      }
      rows.push({ name, description, permissions });
    });
    return { errors, rows };
  }

  async applyUsers(rows: UserImportRow[], userId: string): Promise<{ created: number; errors: ImportCellError[] }> {
    const errors: ImportCellError[] = [];
    let created = 0;
    let idx = 0;
    for (const r of rows) {
      idx += 1;
      try {
        await this.store.createUser({
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          role: r.role,
          companyId: r.companyId,
          roleId: r.roleId,
          costCenterId: r.costCenterId,
          contractType: r.contractType,
          weeklyContractHours: r.weeklyContractHours
        });
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore creazione";
        errors.push({ row: idx, field: "—", message: msg });
      }
    }
    this.pushHistory("users", userId, rows.length, errors.length, errors.length ? errors : undefined);
    return { created, errors };
  }

  async applyCostCenters(rows: CostCenterImportRow[], userId: string): Promise<{ created: number; errors: ImportCellError[] }> {
    const errors: ImportCellError[] = [];
    let created = 0;
    let idx = 0;
    for (const r of rows) {
      idx += 1;
      try {
        await this.store.createCostCenter({ name: r.name, description: r.description });
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore creazione";
        errors.push({ row: idx, field: "—", message: msg });
      }
    }
    this.pushHistory("cost_centers", userId, rows.length, errors.length, errors.length ? errors : undefined);
    return { created, errors };
  }

  async applyRoles(rows: RoleImportRow[], userId: string): Promise<{ created: number; errors: ImportCellError[] }> {
    const errors: ImportCellError[] = [];
    let created = 0;
    let idx = 0;
    for (const r of rows) {
      idx += 1;
      try {
        await this.store.createRole({ name: r.name, description: r.description, permissions: r.permissions });
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore creazione";
        errors.push({ row: idx, field: "—", message: msg });
      }
    }
    this.pushHistory("roles", userId, rows.length, errors.length, errors.length ? errors : undefined);
    return { created, errors };
  }

  private pushHistory(
    category: ImportCategory,
    createdByUserId: string,
    rowCount: number,
    errorCount: number,
    errorsSnapshot?: ImportCellError[]
  ): void {
    const id = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const rec: ImportHistoryRecord = {
      id,
      category,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: errorCount > 0 ? "failed" : "ok",
      rowCount,
      errorCount,
      errorsSnapshot: errorsSnapshot?.slice(0, 200),
      createdByUserId
    };
    this.history.push(rec);
    if (this.history.length > 200) {
      this.history.splice(0, this.history.length - 200);
    }
  }
}

/** Usato dal controller per verificare superuser tramite email utente. */
export async function assertImportSuperuser(store: HrDataStore, userId: string): Promise<void> {
  const user = await store.getUser(userId);
  if (!isSynapseSuperuserEmail(user.email)) {
    throw new ForbiddenException("Operazione riservata ai superuser Synapse");
  }
}
