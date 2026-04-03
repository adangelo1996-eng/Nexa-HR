import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { AuthRole } from "./auth";
import { HrDataStore, type NexaImportEventRow } from "./hr-data.store";
import { isSynapseImportOperatorDomainAllowed, isSynapseSuperuserEmail } from "./synapse-superuser";

export type ImportCategory =
  | "users"
  | "cost_centers"
  | "roles"
  | "leave_allowances"
  | "user_managers";

export interface ImportCellError {
  row: number;
  field: string;
  message: string;
}

/** Alias risposta API storico (allineato a `nexa_import_events`). */
export type ImportHistoryRecord = NexaImportEventRow;

export interface ImportActor {
  userId: string;
  email: string;
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
  managerEmail?: string;
  phone?: string;
  birthDate?: string;
  hireDate?: string;
}

interface CostCenterImportRow {
  /** Codice numerico a 10 cifre (come in anagrafica); se vuoto viene generato. */
  code?: string;
  name: string;
  description?: string;
  /** Codice / ID azienda di riferimento (allineato a users.companyId). */
  companyId?: string;
}

interface RoleImportRow {
  name: string;
  description?: string;
  permissions: string[];
}

interface LeaveAllowanceImportRow {
  email: string;
  vacationAllowanceDays: number;
}

interface UserManagerImportRow {
  userEmail: string;
  managerEmail: string;
}

const MAX_IMPORT_ROWS = 5000;
/** Esportato per limiti multipart nel controller. */
export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = IMPORT_MAX_FILE_BYTES;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
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

  async listHistory(): Promise<ImportHistoryRecord[]> {
    return this.store.listImportEvents(100);
  }

  private strictEmailDomain(): string | null {
    const v = process.env.IMPORT_STRICT_EMAIL_DOMAIN?.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes") {
      const d = process.env.SYNAPSE_EMAIL_DOMAIN?.trim().toLowerCase().replace(/^@/, "");
      return d && d.length > 0 ? d : "synapse.com";
    }
    return null;
  }

  private assertImportedEmailDomain(email: string, row: number): ImportCellError | null {
    const dom = this.strictEmailDomain();
    if (!dom) {
      return null;
    }
    const lower = email.trim().toLowerCase();
    const at = lower.lastIndexOf("@");
    if (at < 0) {
      return { row, field: "Email", message: "Formato email non valido" };
    }
    const ed = lower.slice(at + 1);
    if (ed !== dom && !ed.endsWith(`.${dom}`)) {
      return {
        row,
        field: "Email",
        message: `Dominio non consentito (atteso @${dom} — allineamento SYNAPSE_EMAIL_DOMAIN)`
      };
    }
    return null;
  }

  private newEventId(): string {
    return `imp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async persistEvent(row: NexaImportEventRow): Promise<void> {
    try {
      await this.store.insertImportEvent(row);
    } catch (e) {
      this.logger.warn(`insertImportEvent: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async notifyImportWebhook(meta: Record<string, unknown>): Promise<void> {
    const url = process.env.IMPORT_NOTIFY_WEBHOOK_URL?.trim();
    if (!url) {
      return;
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "nexa-hr-import",
          at: new Date().toISOString(),
          ...meta
        })
      });
      if (!res.ok) {
        this.logger.warn(`IMPORT_NOTIFY_WEBHOOK_URL status ${res.status}`);
      }
    } catch (e) {
      this.logger.warn(`IMPORT_NOTIFY_WEBHOOK_URL error: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Registra solo audit (chiamato dal controller dopo validate). */
  async recordValidateAttempt(params: {
    category: ImportCategory;
    actor: ImportActor;
    rowCount: number;
    errors: ImportCellError[];
    fileName?: string;
    fileSizeBytes?: number;
    clientIp?: string;
  }): Promise<void> {
    const finishedAt = new Date().toISOString();
    const errSnap = params.errors.length ? params.errors.slice(0, 200) : undefined;
    const row: NexaImportEventRow = {
      id: this.newEventId(),
      kind: "validate",
      category: params.category,
      startedAt: finishedAt,
      finishedAt,
      status: params.errors.length > 0 ? "failed" : "ok",
      rowCount: params.rowCount,
      createdCount: null,
      errorCount: params.errors.length,
      fileSizeBytes: params.fileSizeBytes ?? null,
      fileName: params.fileName ?? null,
      errorsSnapshot: errSnap,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      auditMeta: {
        clientIp: params.clientIp ?? null,
        nexaAudit: "import.validate"
      }
    };
    await this.persistEvent(row);
    this.logger.log(
      JSON.stringify({
        nexaAudit: "import.validate",
        importEventId: row.id,
        category: params.category,
        actorEmail: params.actor.email,
        rowCount: params.rowCount,
        errorCount: params.errors.length,
        fileName: params.fileName ?? null,
        fileSizeBytes: params.fileSizeBytes ?? null
      })
    );
  }

  private async recordApplyAttempt(params: {
    category: ImportCategory;
    actor: ImportActor;
    rowCount: number;
    created: number;
    errors: ImportCellError[];
    clientIp?: string;
  }): Promise<void> {
    const finishedAt = new Date().toISOString();
    const errorCount = params.errors.length;
    const status =
      errorCount === 0 ? "ok" : params.created > 0 ? "partial" : "failed";
    const row: NexaImportEventRow = {
      id: this.newEventId(),
      kind: "apply",
      category: params.category,
      startedAt: finishedAt,
      finishedAt,
      status,
      rowCount: params.rowCount,
      createdCount: params.created,
      errorCount,
      fileSizeBytes: null,
      fileName: null,
      errorsSnapshot: errorCount ? params.errors.slice(0, 200) : undefined,
      actorUserId: params.actor.userId,
      actorEmail: params.actor.email,
      auditMeta: {
        clientIp: params.clientIp ?? null,
        nexaAudit: "import.apply",
        notificationAttempted: Boolean(process.env.IMPORT_NOTIFY_WEBHOOK_URL?.trim())
      }
    };
    await this.persistEvent(row);
    this.logger.log(
      JSON.stringify({
        nexaAudit: "import.apply",
        importEventId: row.id,
        category: params.category,
        actorEmail: params.actor.email,
        rowCount: params.rowCount,
        created: params.created,
        errorCount,
        status
      })
    );
    if (status === "ok" || status === "partial") {
      await this.notifyImportWebhook({
        kind: "apply",
        importEventId: row.id,
        category: params.category,
        created: params.created,
        rowCount: params.rowCount,
        errorCount,
        status,
        actorEmail: params.actor.email
      });
    }
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
        { header: "ID azienda", key: "companyId", width: 18 },
        { header: "Email manager (opz.)", key: "managerEmail", width: 28 },
        { header: "Telefono (opz.)", key: "phone", width: 18 },
        { header: "Data nascita YYYY-MM-DD (opz.)", key: "birthDate", width: 28 },
        { header: "Data assunzione YYYY-MM-DD (opz.)", key: "hireDate", width: 28 }
      ];
      sheet.addRow({});
      help.addRow([
        "Ruolo piattaforma: superuser | user (alias import: admin→superuser, employee→user; responsabile team solo da UI CDC)"
      ]);
      help.addRow(["Email: se vuota viene generata automaticamente (nome.cognome@dominio)."]);
      help.addRow(["Manager: deve essere un utente già presente; colonna opzionale."]);
    } else if (category === "cost_centers") {
      sheet.columns = [
        { header: "Codice CDC (10 cifre, opz.)", key: "code", width: 22 },
        { header: "Nome", key: "name", width: 28 },
        { header: "Descrizione (opzionale)", key: "description", width: 36 },
        { header: "Codice / ID azienda (opz.)", key: "companyId", width: 22 }
      ];
      sheet.addRow({});
      help.addRow([
        "Codice: esattamente 10 cifre numeriche oppure vuoto (il sistema genera un codice univoco)."
      ]);
    } else if (category === "roles") {
      sheet.columns = [
        { header: "Nome ruolo", key: "name", width: 24 },
        { header: "Descrizione (opzionale)", key: "description", width: 32 },
        { header: "Permessi (id separati da virgola)", key: "permissions", width: 48 }
      ];
      sheet.addRow({});
      help.addRow(["Usa gli id del catalogo (es. nexa.attendance:read) o * per tutti."]);
    } else if (category === "leave_allowances") {
      sheet.columns = [
        { header: "Email utente", key: "email", width: 32 },
        { header: "Giorni ferie annuali (1-120)", key: "vacationAllowanceDays", width: 28 }
      ];
      sheet.addRow({});
      help.addRow(["Aggiorna vacationAllowanceDays su utenti già presenti in anagrafica."]);
    } else if (category === "user_managers") {
      sheet.columns = [
        { header: "Email dipendente", key: "userEmail", width: 32 },
        { header: "Email manager", key: "managerEmail", width: 32 }
      ];
      sheet.addRow({});
      help.addRow(["Entrambi devono essere utenti esistenti."]);
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
      const managerEmailRaw = c(10);
      const phone = c(11) || undefined;
      const birthDate = c(12) || undefined;
      const hireDate = c(13) || undefined;
      const managerEmail = managerEmailRaw ? managerEmailRaw.trim().toLowerCase() : undefined;

      const baseRow = rowNumber;
      if (!firstName) {
        errors.push({ row: baseRow, field: "Nome", message: "Obbligatorio" });
      }
      if (!lastName) {
        errors.push({ row: baseRow, field: "Cognome", message: "Obbligatorio" });
      }
      let role: AuthRole | "" = "";
      if (!roleRaw) {
        errors.push({ row: baseRow, field: "Ruolo piattaforma", message: "Obbligatorio" });
      } else if (roleRaw === "team_lead") {
        errors.push({
          row: baseRow,
          field: "Ruolo piattaforma",
          message:
            "team_lead non è importabile: usare superuser o user e nominare il responsabile da Gestione centri di costo → Team"
        });
      } else if (roleRaw === "superuser" || roleRaw === "user") {
        role = roleRaw;
      } else if (roleRaw === "admin") {
        role = "superuser";
      } else if (roleRaw === "employee") {
        role = "user";
      } else {
        errors.push({
          row: baseRow,
          field: "Ruolo piattaforma",
          message: "Valore non valido (superuser | user; alias: admin, employee)"
        });
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
      let emailDomainErr = false;
      if (email) {
        const domErr = this.assertImportedEmailDomain(email, baseRow);
        if (domErr) {
          errors.push(domErr);
          emailDomainErr = true;
        }
      }
      if (managerEmail) {
        const domErr = this.assertImportedEmailDomain(managerEmailRaw, baseRow);
        if (domErr) {
          errors.push(domErr);
          emailDomainErr = true;
        }
      }
      const isoDate = /^\d{4}-\d{2}-\d{2}$/;
      if (birthDate && !isoDate.test(birthDate)) {
        errors.push({ row: baseRow, field: "Data nascita", message: "Formato YYYY-MM-DD" });
      }
      if (hireDate && !isoDate.test(hireDate)) {
        errors.push({ row: baseRow, field: "Data assunzione", message: "Formato YYYY-MM-DD" });
      }

      if (
        firstName &&
        lastName &&
        role &&
        roleId &&
        costCenterId &&
        contractType &&
        companyId &&
        !emailDomainErr &&
        (!birthDate || isoDate.test(birthDate)) &&
        (!hireDate || isoDate.test(hireDate))
      ) {
        rows.push({
          firstName,
          lastName,
          email,
          role,
          roleId,
          costCenterId,
          contractType,
          weeklyContractHours,
          companyId,
          managerEmail,
          phone,
          birthDate: birthDate && isoDate.test(birthDate) ? birthDate : undefined,
          hireDate: hireDate && isoDate.test(hireDate) ? hireDate : undefined
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
      const codeRaw = c(1);
      const name = c(2);
      const description = c(3) || undefined;
      const companyId = c(4) || undefined;
      let code: string | undefined;
      if (codeRaw) {
        const digits = String(codeRaw).replace(/\s/g, "");
        if (!/^\d{10}$/.test(digits)) {
          errors.push({ row: rowNumber, field: "Codice CDC", message: "Deve essere esattamente 10 cifre o vuoto" });
          return;
        }
        code = digits;
      }
      if (!name) {
        errors.push({ row: rowNumber, field: "Nome", message: "Obbligatorio" });
        return;
      }
      rows.push({ code, name, description, companyId });
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

  async validateLeaveAllowances(
    buffer: Buffer
  ): Promise<{ errors: ImportCellError[]; rows: LeaveAllowanceImportRow[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as never);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Foglio Excel vuoto");
    }
    const errors: ImportCellError[] = [];
    const rows: LeaveAllowanceImportRow[] = [];
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
      const email = c(1);
      const daysRaw = c(2);
      if (!email) {
        errors.push({ row: rowNumber, field: "Email utente", message: "Obbligatorio" });
        return;
      }
      const domErr = this.assertImportedEmailDomain(email, rowNumber);
      if (domErr) {
        errors.push(domErr);
        return;
      }
      const vacationAllowanceDays = Number(daysRaw);
      if (!daysRaw || Number.isNaN(vacationAllowanceDays) || vacationAllowanceDays < 1 || vacationAllowanceDays > 120) {
        errors.push({ row: rowNumber, field: "Giorni ferie", message: "Numero tra 1 e 120" });
        return;
      }
      rows.push({ email, vacationAllowanceDays });
    });
    return { errors, rows };
  }

  async validateUserManagers(
    buffer: Buffer
  ): Promise<{ errors: ImportCellError[]; rows: UserManagerImportRow[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as never);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Foglio Excel vuoto");
    }
    const errors: ImportCellError[] = [];
    const rows: UserManagerImportRow[] = [];
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
      const userEmail = c(1);
      const managerEmail = c(2);
      if (!userEmail) {
        errors.push({ row: rowNumber, field: "Email dipendente", message: "Obbligatorio" });
        return;
      }
      if (!managerEmail) {
        errors.push({ row: rowNumber, field: "Email manager", message: "Obbligatorio" });
        return;
      }
      for (const em of [userEmail, managerEmail]) {
        const domErr = this.assertImportedEmailDomain(em, rowNumber);
        if (domErr) {
          errors.push(domErr);
          return;
        }
      }
      if (userEmail.toLowerCase() === managerEmail.toLowerCase()) {
        errors.push({ row: rowNumber, field: "Email", message: "Dipendente e manager devono differire" });
        return;
      }
      rows.push({ userEmail, managerEmail });
    });
    return { errors, rows };
  }

  async applyUsers(
    rows: UserImportRow[],
    actor: ImportActor,
    clientIp?: string
  ): Promise<{ created: number; errors: ImportCellError[] }> {
    const errors: ImportCellError[] = [];
    let created = 0;
    let idx = 0;
    for (const r of rows) {
      idx += 1;
      try {
        let managerId: string | undefined;
        if (r.managerEmail) {
          const mgr = await this.store.findUserByEmail(r.managerEmail);
          if (!mgr) {
            throw new BadRequestException(`Manager non trovato per email ${r.managerEmail}`);
          }
          managerId = mgr.id;
        }
        await this.store.createUser({
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          role: r.role,
          companyId: r.companyId,
          roleId: r.roleId,
          costCenterId: r.costCenterId,
          contractType: r.contractType,
          weeklyContractHours: r.weeklyContractHours,
          managerId,
          phone: r.phone,
          birthDate: r.birthDate,
          hireDate: r.hireDate
        });
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore creazione";
        errors.push({ row: idx, field: "—", message: msg });
      }
    }
    await this.recordApplyAttempt({
      category: "users",
      actor,
      rowCount: rows.length,
      created,
      errors,
      clientIp
    });
    return { created, errors };
  }

  async applyCostCenters(rows: CostCenterImportRow[], actor: ImportActor, clientIp?: string): Promise<{ created: number; errors: ImportCellError[] }> {
    const errors: ImportCellError[] = [];
    let created = 0;
    let idx = 0;
    for (const r of rows) {
      idx += 1;
      try {
        await this.store.createCostCenter({
          code: r.code,
          name: r.name,
          description: r.description,
          companyId: r.companyId
        });
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore creazione";
        errors.push({ row: idx, field: "—", message: msg });
      }
    }
    await this.recordApplyAttempt({
      category: "cost_centers",
      actor,
      rowCount: rows.length,
      created,
      errors,
      clientIp
    });
    return { created, errors };
  }

  async applyRoles(rows: RoleImportRow[], actor: ImportActor, clientIp?: string): Promise<{ created: number; errors: ImportCellError[] }> {
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
    await this.recordApplyAttempt({
      category: "roles",
      actor,
      rowCount: rows.length,
      created,
      errors,
      clientIp
    });
    return { created, errors };
  }

  async applyLeaveAllowances(
    rows: LeaveAllowanceImportRow[],
    actor: ImportActor,
    clientIp?: string
  ): Promise<{ created: number; errors: ImportCellError[] }> {
    const errors: ImportCellError[] = [];
    let created = 0;
    let idx = 0;
    for (const r of rows) {
      idx += 1;
      try {
        const u = await this.store.findUserByEmail(r.email);
        if (!u) {
          throw new BadRequestException("Utente non trovato");
        }
        await this.store.setLeaveAllowance(u.id, r.vacationAllowanceDays);
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore aggiornamento";
        errors.push({ row: idx, field: "—", message: msg });
      }
    }
    await this.recordApplyAttempt({
      category: "leave_allowances",
      actor,
      rowCount: rows.length,
      created,
      errors,
      clientIp
    });
    return { created, errors };
  }

  async applyUserManagers(
    rows: UserManagerImportRow[],
    actor: ImportActor,
    clientIp?: string
  ): Promise<{ created: number; errors: ImportCellError[] }> {
    const errors: ImportCellError[] = [];
    let created = 0;
    let idx = 0;
    for (const r of rows) {
      idx += 1;
      try {
        const u = await this.store.findUserByEmail(r.userEmail);
        const m = await this.store.findUserByEmail(r.managerEmail);
        if (!u || !m) {
          throw new BadRequestException("Utente o manager non trovato");
        }
        await this.store.updateUserManager(u.id, m.id);
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore aggiornamento";
        errors.push({ row: idx, field: "—", message: msg });
      }
    }
    await this.recordApplyAttempt({
      category: "user_managers",
      actor,
      rowCount: rows.length,
      created,
      errors,
      clientIp
    });
    return { created, errors };
  }
}

/** Usato dal controller per verificare superuser tramite email utente. */
export async function assertImportSuperuser(store: HrDataStore, userId: string): Promise<void> {
  const user = await store.getUser(userId);
  if (!isSynapseSuperuserEmail(user.email)) {
    throw new ForbiddenException("Operazione riservata ai superuser Synapse");
  }
  if (!isSynapseImportOperatorDomainAllowed(user.email)) {
    throw new ForbiddenException(
      "Dominio email non autorizzato per operazioni di import (verificare SYNAPSE_IMPORT_OPERATOR_EMAIL_DOMAINS)"
    );
  }
}
