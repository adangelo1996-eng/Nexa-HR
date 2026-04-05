import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { User } from "@payday/domain";
import type { AuthRole } from "./auth";
import {
  ADMIN_EMPLOYEE_EXCEL_EXTRA_FIELDS,
  ADMIN_EMPLOYEE_EXCEL_READONLY_IDS,
  ADMIN_EXPORT_FIELD_CATALOG,
  EMPLOYEE_EXCEL_IMPORT_FIELD_IDS,
  EMPLOYEE_EXCEL_TEMPLATE_USER_ID_PREFIX,
  ITALIAN_TAX_REGION_CODES
} from "./admin-export.catalog";
import { DatabasePoolService } from "./database-pool.service";
import { HrDataStore, type NexaImportEventRow } from "./hr-data.store";
import type { ImportCellError } from "./import.service";
import { insertUserRowPg, updateUserFullRowPg } from "./user-pg-writer";

export const EMPLOYEE_EXCEL_MAX_ROWS = 2000;
export const EMPLOYEE_EXCEL_MAX_BYTES = 10 * 1024 * 1024;

/** Valore cella per «nessun team» / «nessun manager» (campo comunque compilato). */
const EXCEL_EMPTY_SENTINEL = "-";

const TAX_REGION_SET = new Set(ITALIAN_TAX_REGION_CODES);

function excelColumnLetter(colIndex1Based: number): string {
  let n = colIndex1Based;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function isTemplateNewUserId(id: string): boolean {
  const t = id.trim();
  return t.startsWith(EMPLOYEE_EXCEL_TEMPLATE_USER_ID_PREFIX) && t.length > EMPLOYEE_EXCEL_TEMPLATE_USER_ID_PREFIX.length + 4;
}

function stringifyExcelCellValue(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v).trim();
  }
  if (typeof v === "object") {
    if ("text" in v && v.text != null) {
      return String(v.text).trim();
    }
    if ("richText" in v && Array.isArray((v as { richText?: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((x) => x.text).join("").trim();
    }
    if ("result" in v && (v as { result: unknown }).result !== undefined && (v as { result: unknown }).result !== null) {
      return String((v as { result: unknown }).result).trim();
    }
  }
  return String(v).trim();
}

type UserUpdatePayload = Parameters<HrDataStore["updateUser"]>[1];

interface PreparedUpdate {
  kind: "update";
  row: number;
  userId: string;
  before: User;
  patch: UserUpdatePayload;
}

interface PreparedCreate {
  kind: "create";
  row: number;
  payload: Parameters<HrDataStore["createUser"]>[0];
  /** Se valorizzato, insert/create usa questo id (righe template u-tpl-…). */
  forcedUserId?: string;
}

type PreparedOp = PreparedUpdate | PreparedCreate;

function normalizeHeaderLabel(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildLabelToFieldId(): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of [...ADMIN_EXPORT_FIELD_CATALOG, ...ADMIN_EMPLOYEE_EXCEL_EXTRA_FIELDS]) {
    m.set(normalizeHeaderLabel(f.label), f.id);
  }
  return m;
}

const LABEL_TO_ID = buildLabelToFieldId();

export interface EmployeeExcelValidateResult {
  errors: ImportCellError[];
  preview: Array<{
    row: number;
    action: "create" | "update";
    userLabel: string;
    changes: string[];
  }>;
}

export interface EmployeeExcelApplyResult {
  applied: number;
  created: number;
  updated: number;
  log: string[];
  errors: ImportCellError[];
}

@Injectable()
export class AdminEmployeeExcelService {
  private readonly logger = new Logger(AdminEmployeeExcelService.name);

  constructor(
    private readonly store: HrDataStore,
    private readonly dbPool: DatabasePoolService
  ) {}

  assertXlsxMagic(buffer: Buffer): void {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new BadRequestException("Il file deve essere un Excel .xlsx valido.");
    }
    if (buffer.length > EMPLOYEE_EXCEL_MAX_BYTES) {
      throw new BadRequestException(`Dimensione massima ${EMPLOYEE_EXCEL_MAX_BYTES / (1024 * 1024)} MB`);
    }
  }

  async buildNewUsersTemplate(requesterId: string, rowCount: number): Promise<Buffer> {
    const n = Math.min(Math.max(Math.floor(rowCount), 1), 200);
    const requester = await this.store.getUser(requesterId);
    const roles = await this.store.listRoles();
    const defaultRole =
      roles.find((r) => !/superuser|admin/i.test(r.name)) ?? roles.find((r) => r.id) ?? roles[0];
    if (!defaultRole) {
      throw new BadRequestException("Nessun ruolo organizzativo disponibile per il template");
    }

    const labelById = new Map(
      [...ADMIN_EXPORT_FIELD_CATALOG, ...ADMIN_EMPLOYEE_EXCEL_EXTRA_FIELDS].map((x) => [x.id, x.label] as const)
    );

    const centersAll = await this.store.listCostCenters();
    const centers = centersAll.filter((c) => !c.companyId || c.companyId === requester.companyId);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Export", { views: [{ state: "frozen", ySplit: 1 }] });

    const ccSheet = wb.addWorksheet("CentriDiCosto");
    ccSheet.addRow(["Codice centro di costo", "Nome centro di costo"]);
    for (const c of centers.sort((a, b) => a.code.localeCompare(b.code, "it"))) {
      ccSheet.addRow([c.code, c.name]);
    }

    const teamSheet = wb.addWorksheet("Team");
    teamSheet.addRow(["Nome team", "Codice centro di costo", "Nome centro di costo"]);
    for (const c of centers) {
      const teams = await this.store.listWorkTeamsByCostCenter(c.id);
      for (const t of teams.sort((a, b) => a.name.localeCompare(b.name, "it"))) {
        teamSheet.addRow([t.name, c.code, c.name]);
      }
    }

    const regSheet = wb.addWorksheet("Regioni");
    regSheet.addRow(["Codice regione (fiscale)"]);
    for (const code of ITALIAN_TAX_REGION_CODES) {
      regSheet.addRow([code]);
    }

    const help = wb.addWorksheet("Istruzioni");
    help.addRow([
      "L’import legge solo il foglio «Export». Compila tutte le colonne per ogni nuova riga; valori mancanti causano errore in validazione."
    ]);
    help.addRow([
      "ID utente: per nuovi dipendenti usa gli ID già presenti nel template (prefisso u-tpl-). Per aggiornamenti incolla l’ID reale dall’export anagrafica."
    ]);
    help.addRow([
      `Team / manager: se assenti nel tuo caso, scrivi «${EXCEL_EMPTY_SENTINEL}» nelle celle (campo comunque obbligatorio).`
    ]);
    help.addRow([
      "Nome centro di costo: scegli un valore coerente col foglio CentriDiCosto; il codice CDC si può compilare a mano oppure lasciare la formula nella colonna."
    ]);
    help.addRow([
      `Regione (fiscale): codice a 3 lettere dal foglio Regioni (es. LOM, LAZ). Azienda: companyId del richiedente = ${requester.companyId}.`
    ]);
    help.addRow([
      "Dopo aver compilato il foglio Export, apri il file in Excel (o LibreOffice) e salva: così le formule del codice CDC calcolano il valore memorizzato nel file per l’import server-side."
    ]);

    const fieldIds = EMPLOYEE_EXCEL_IMPORT_FIELD_IDS;
    const cols = fieldIds.map((id) => labelById.get(id) ?? id);
    sheet.addRow(cols);

    const idxCostCenterName = fieldIds.indexOf("costCenterName") + 1;
    const letterName = excelColumnLetter(idxCostCenterName);

    for (let i = 0; i < n; i++) {
      const rowNum = 2 + i;
      const tplId = `${EMPLOYEE_EXCEL_TEMPLATE_USER_ID_PREFIX}${randomBytes(10).toString("hex")}`;
      const rowVals: (string | number | { formula: string })[] = fieldIds.map((id) => {
        if (id === "userId") {
          return tplId;
        }
        if (id === "weeklyContractHours") {
          return 40;
        }
        if (id === "contractType") {
          return "Indeterminato";
        }
        if (id === "vacationAllowanceDays") {
          return 22;
        }
        if (id === "roleId") {
          return defaultRole.id;
        }
        if (id === "platformRole") {
          return "user";
        }
        if (id === "costCenterCode") {
          return {
            formula: `IF(TRIM(${letterName}${rowNum})="","",IFERROR(INDEX(CentriDiCosto!$A:$A,MATCH(TRIM(${letterName}${rowNum}),CentriDiCosto!$B:$B,0)),""))`
          };
        }
        return "";
      });
      sheet.addRow(rowVals);
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async validateWorkbook(buffer: Buffer, requesterId: string): Promise<EmployeeExcelValidateResult> {
    const { errors, ops } = await this.prepareOperations(buffer, requesterId);
    const preview = ops.map((op) => {
      if (op.kind === "update") {
        const u = op.before;
        return {
          row: op.row,
          action: "update" as const,
          userLabel: `${u.fullName} (${u.id})`,
          changes: this.describePatch(u, op.patch)
        };
      }
      const p = op.payload;
      return {
        row: op.row,
        action: "create" as const,
        userLabel: `${p.firstName} ${p.lastName}`.trim() || "(nuovo)",
        changes: [
          `Creazione utente: ruolo piattaforma ${p.role}, CDC ${p.costCenterId}, contratto ${p.contractType}, ${p.weeklyContractHours} h/sett.`
        ]
      };
    });
    return { errors, preview };
  }

  async applyWorkbook(
    buffer: Buffer,
    requesterId: string,
    actor: { userId: string; email: string }
  ): Promise<EmployeeExcelApplyResult> {
    const { errors, ops } = await this.prepareOperations(buffer, requesterId);
    if (errors.length > 0) {
      throw new BadRequestException({ message: "File non valido: correggere gli errori segnalati.", errors });
    }

    const log: string[] = [];
    let updated = 0;
    let created = 0;

    if (!this.store.usesDatabase()) {
      for (const op of ops) {
        if (op.kind === "update") {
          await this.store.updateUser(op.userId, op.patch, { skipTeamLeadLinkValidation: true });
          updated += 1;
          log.push(`Riga ${op.row}: aggiornato ${op.before.fullName} (${op.userId})`);
        } else {
          const u = await this.store.createUser(op.payload, { forcedUserId: op.forcedUserId });
          created += 1;
          log.push(`Riga ${op.row}: creato ${u.fullName} (${u.id}) — ${u.email}`);
        }
      }
      await this.recordApplyEvent(actor, ops.length, created, log);
      return { applied: ops.length, created, updated, log, errors: [] };
    }

    if (!this.dbPool.isConfigured()) {
      throw new BadRequestException(
        "Import transazionale: configurare DATABASE_URL oppure SUPABASE_DB_URL con la connection string PostgreSQL del progetto Supabase (session mode, porta 5432). Su Render di solito è già presente SUPABASE_DB_URL per le migrazioni in build."
      );
    }

    const takenLower = new Set((await this.store.listUsers()).map((u) => u.email.trim().toLowerCase()));

    type Mat =
      | { kind: "create"; row: number; user: User }
      | { kind: "update"; row: number; user: User };

    const materialized: Mat[] = [];
    const updateWorking = new Map<string, User>();
    let seq = 0;

    for (const op of ops) {
      if (op.kind === "create") {
        const payload = { ...op.payload };
        const email = await this.store.allocateBatchCreateEmail(payload, takenLower);
        payload.email = email;
        const id =
          op.forcedUserId?.trim() ||
          `u-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 10)}`;
        const user = await this.store.materializeUserRowForPgInsert(payload, id);
        materialized.push({ kind: "create", row: op.row, user });
      } else {
        let base = updateWorking.get(op.userId);
        if (!base) {
          base = await this.store.getUser(op.userId);
        }
        const user = await this.store.mergeUserUpdateIntoRecord(
          base,
          op.patch,
          { skipTeamLeadLinkValidation: true },
          takenLower
        );
        updateWorking.set(op.userId, user);
        materialized.push({ kind: "update", row: op.row, user });
      }
      seq += 1;
    }

    try {
      await this.dbPool.withTransaction(async (client) => {
        for (const m of materialized) {
          if (m.kind === "create") {
            await insertUserRowPg(client, m.user);
          } else {
            await updateUserFullRowPg(client, m.user);
          }
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      this.logger.warn(`employee-excel apply transaction failed: ${msg}`);
      throw new BadRequestException(
        `Transazione annullata: nessuna modifica è stata confermata sul database. Dettaglio: ${msg}`
      );
    }

    for (const m of materialized) {
      if (m.kind === "create") {
        created += 1;
        log.push(`Riga ${m.row}: creato ${m.user.fullName} (${m.user.id}) — ${m.user.email}`);
      } else {
        updated += 1;
        log.push(`Riga ${m.row}: aggiornato ${m.user.fullName} (${m.user.id})`);
      }
    }

    await this.recordApplyEvent(actor, ops.length, created, log);

    return {
      applied: ops.length,
      created,
      updated,
      log,
      errors: []
    };
  }

  private async recordApplyEvent(
    actor: { userId: string; email: string },
    rowCount: number,
    created: number,
    log: string[]
  ): Promise<void> {
    const finishedAt = new Date().toISOString();
    const row: NexaImportEventRow = {
      id: `imp-excel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "apply",
      category: "employee_excel",
      startedAt: finishedAt,
      finishedAt,
      status: "ok",
      rowCount,
      createdCount: created,
      errorCount: 0,
      fileSizeBytes: null,
      fileName: null,
      errorsSnapshot: undefined,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      auditMeta: {
        nexaAudit: "admin.employee_excel.apply",
        logPreview: log.slice(0, 100)
      }
    };
    try {
      await this.store.insertImportEvent(row);
    } catch {
      /* insertImportEvent non deve bloccare */
    }
  }

  private describePatch(before: User, patch: UserUpdatePayload): string[] {
    const out: string[] = [];
    const keys = Object.keys(patch) as (keyof UserUpdatePayload)[];
    for (const k of keys) {
      const v = patch[k];
      if (v === undefined) continue;
      const prev = before[k as keyof User];
      if (JSON.stringify(prev) === JSON.stringify(v)) continue;
      out.push(`${String(k)}: "${String(prev ?? "")}" → "${String(v ?? "")}"`);
    }
    return out.length ? out : ["Nessun campo modificato rispetto ai valori attuali"];
  }

  private async prepareOperations(
    buffer: Buffer,
    requesterId: string
  ): Promise<{ errors: ImportCellError[]; ops: PreparedOp[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as never);
    const sheet = wb.getWorksheet("Export");
    if (!sheet) {
      throw new BadRequestException('Il file deve contenere un foglio denominato «Export» (gli altri fogli sono solo di supporto e non vengono importati).');
    }

    const headerRow = sheet.getRow(1);
    const colIndexByField = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const label = normalizeHeaderLabel(String(cell.value ?? ""));
      const id = LABEL_TO_ID.get(label);
      if (id) {
        colIndexByField.set(id, colNumber);
      }
    });

    if (colIndexByField.size === 0) {
      throw new BadRequestException(
        "Nessuna colonna riconosciuta: usa le stesse intestazioni del template Nexa HR sul foglio «Export»."
      );
    }

    const requester = await this.store.getUser(requesterId);
    const allUsers = await this.store.listUsers();
    const inScope = (u: User) =>
      requester.role === "superuser" || u.companyId === requester.companyId;
    const scopeUsers = allUsers.filter(inScope);
    const byId = new Map(scopeUsers.map((u) => [u.id, u] as const));

    const errors: ImportCellError[] = [];
    const ops: PreparedOp[] = [];
    const seenUserIds = new Set<string>();
    const seenTemplateIds = new Set<string>();
    let dataRows = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      let rowHasCell = false;
      const maxCol = Math.max(
        sheet.columnCount ?? 0,
        colIndexByField.size > 0 ? Math.max(...colIndexByField.values()) : 0
      );
      for (let c = 1; c <= maxCol; c++) {
        const v = row.getCell(c).value;
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          rowHasCell = true;
          break;
        }
      }
      if (!rowHasCell) continue;

      const get = (id: string): string => {
        const col = colIndexByField.get(id);
        if (!col) return "";
        return stringifyExcelCellValue(row.getCell(col).value);
      };

      const raw: Record<string, string> = {};
      for (const id of colIndexByField.keys()) {
        if (ADMIN_EMPLOYEE_EXCEL_READONLY_IDS.has(id)) {
          continue;
        }
        raw[id] = get(id);
      }

      const nonEmpty = Object.values(raw).some((x) => x.length > 0);
      if (!nonEmpty) continue;

      dataRows += 1;
      if (dataRows > EMPLOYEE_EXCEL_MAX_ROWS) {
        errors.push({ row: rowNumber, field: "—", message: `Superato il massimo di ${EMPLOYEE_EXCEL_MAX_ROWS} righe` });
        break;
      }

      const userIdCell = get("userId").trim();
      const emailNorm = get("email").trim().toLowerCase();
      const templateNewId = Boolean(userIdCell && isTemplateNewUserId(userIdCell));

      if (templateNewId) {
        if (seenTemplateIds.has(userIdCell)) {
          errors.push({ row: rowNumber, field: "ID utente", message: "Stesso ID template ripetuto più volte nel file" });
          continue;
        }
        if (emailNorm && scopeUsers.some((u) => u.email.trim().toLowerCase() === emailNorm)) {
          errors.push({
            row: rowNumber,
            field: "Email",
            message:
              "Email già presente in anagrafica: per aggiornare quell’utente usa il suo ID reale nel foglio Export (non un ID u-tpl-)."
          });
          continue;
        }
        seenTemplateIds.add(userIdCell);
        try {
          const payload = await this.buildCreatePayload(rowNumber, raw, requester, scopeUsers, {
            templateUserId: userIdCell
          });
          ops.push({ kind: "create", row: rowNumber, payload, forcedUserId: userIdCell });
        } catch (e) {
          errors.push({
            row: rowNumber,
            field: "—",
            message: e instanceof Error ? e.message : "Errore validazione riga"
          });
        }
        continue;
      }

      let targetUser: User | undefined;
      if (userIdCell) {
        targetUser = byId.get(userIdCell);
        if (!targetUser) {
          errors.push({
            row: rowNumber,
            field: "ID utente",
            message:
              "Utente non trovato o fuori ambito. Per nuove anagrafiche usa gli ID del template (prefisso u-tpl-)."
          });
          continue;
        }
      } else if (emailNorm) {
        const hits = scopeUsers.filter((u) => u.email.trim().toLowerCase() === emailNorm);
        if (hits.length > 1) {
          errors.push({ row: rowNumber, field: "Email", message: "Email ambigua in anagrafica" });
          continue;
        }
        if (hits.length === 1) {
          targetUser = hits[0];
        }
      }

      if (targetUser) {
        if (seenUserIds.has(targetUser.id)) {
          errors.push({ row: rowNumber, field: "—", message: "Stesso utente ripetuto più volte nel file" });
          continue;
        }
        seenUserIds.add(targetUser.id);
        try {
          const patch = await this.buildUpdatePatch(rowNumber, targetUser, raw, scopeUsers, requester);
          if (Object.keys(patch).length === 0) {
            errors.push({ row: rowNumber, field: "—", message: "Nessun campo modificabile valorizzato" });
            continue;
          }
          const before = { ...targetUser };
          ops.push({ kind: "update", row: rowNumber, userId: targetUser.id, before, patch });
        } catch (e) {
          errors.push({
            row: rowNumber,
            field: "—",
            message: e instanceof Error ? e.message : "Errore validazione riga"
          });
        }
      } else {
        try {
          const payload = await this.buildCreatePayload(rowNumber, raw, requester, scopeUsers);
          ops.push({ kind: "create", row: rowNumber, payload });
        } catch (e) {
          errors.push({
            row: rowNumber,
            field: "—",
            message: e instanceof Error ? e.message : "Errore validazione riga"
          });
        }
      }
    }

    if (dataRows === 0 && errors.length === 0) {
      errors.push({ row: 0, field: "—", message: "Nessuna riga dati nel foglio" });
    }

    return { errors, ops };
  }

  private parsePlatformRoleCell(raw: string): AuthRole {
    const s = raw.trim().toLowerCase();
    if (s === "superuser" || s === "admin") return "superuser";
    if (s === "user" || s === "employee") return "user";
    throw new Error(`Ruolo piattaforma non valido (superuser | user)`);
  }

  private async resolveCostCenterId(
    row: number,
    companyId: string,
    codeRaw: string,
    nameRaw: string
  ): Promise<string> {
    const code = codeRaw.trim();
    const name = nameRaw.trim().toLowerCase();
    const centers = await this.store.listCostCenters();
    const inCompany = centers.filter((c) => !c.companyId || c.companyId === companyId);
    if (code) {
      const digits = code.replace(/\s/g, "");
      const hit = inCompany.find((c) => c.code.replace(/\s/g, "") === digits);
      if (!hit) {
        throw new BadRequestException(`Riga ${row}: Centro di costo con codice «${code}» non trovato`);
      }
      return hit.id;
    }
    if (name) {
      const hits = inCompany.filter((c) => c.name.trim().toLowerCase() === name);
      if (hits.length === 1) return hits[0].id;
      if (hits.length === 0) {
        throw new BadRequestException(`Riga ${row}: Centro di costo con nome «${nameRaw}» non trovato`);
      }
      throw new BadRequestException(`Riga ${row}: Nome centro di costo ambiguo`);
    }
    throw new BadRequestException(`Riga ${row}: Specificare codice o nome centro di costo`);
  }

  private async resolveTeamId(
    row: number,
    costCenterId: string,
    teamNameRaw: string
  ): Promise<string | null> {
    const name = teamNameRaw.trim();
    if (!name) return null;
    const teams = await this.store.listWorkTeamsByCostCenter(costCenterId);
    const hits = teams.filter((t) => t.name.trim().toLowerCase() === name.toLowerCase());
    if (hits.length === 1) return hits[0].id;
    if (hits.length === 0) {
      throw new BadRequestException(`Riga ${row}: Team «${name}» non trovato nel centro di costo`);
    }
    throw new BadRequestException(`Riga ${row}: Nome team ambiguo nel centro di costo`);
  }

  private resolveManagerId(row: number, scopeUsers: User[], managerFullNameRaw: string): string | undefined {
    const q = managerFullNameRaw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return undefined;
    const hits = scopeUsers.filter((u) => u.fullName.trim().toLowerCase().replace(/\s+/g, " ") === q);
    if (hits.length === 1) return hits[0].id;
    if (hits.length === 0) {
      throw new BadRequestException(`Riga ${row}: Manager «${managerFullNameRaw}» non trovato nell’ambito`);
    }
    throw new BadRequestException(`Riga ${row}: Manager «${managerFullNameRaw}» ambiguo`);
  }

  private readOptionalNumber(raw: string): number | undefined {
    const s = raw.trim().replace(/\s/g, "").replace(",", ".");
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  private async buildUpdatePatch(
    row: number,
    user: User,
    raw: Record<string, string>,
    scopeUsers: User[],
    requester: User
  ): Promise<UserUpdatePayload> {
    const patch: UserUpdatePayload = {};
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (raw.email?.trim()) {
      const em = raw.email.trim();
      if (!emailRe.test(em)) {
        throw new BadRequestException(`Riga ${row}: email non valida`);
      }
      patch.email = em;
    }
    if (raw.firstName?.trim()) patch.firstName = raw.firstName.trim();
    if (raw.lastName?.trim()) patch.lastName = raw.lastName.trim();
    if (raw.fullName?.trim()) patch.fullName = raw.fullName.trim();
    if (raw.fiscalCode?.trim()) patch.fiscalCode = raw.fiscalCode.trim();
    if (raw.phone?.trim()) patch.phone = raw.phone.trim();
    if (raw.address?.trim()) patch.address = raw.address.trim();
    if (raw.taxMunicipalityIt?.trim()) patch.taxMunicipalityIt = raw.taxMunicipalityIt.trim();
    if (raw.taxRegion?.trim()) patch.taxRegion = raw.taxRegion.trim().toUpperCase();
    if (raw.hireDate?.trim()) {
      if (!iso.test(raw.hireDate.trim())) throw new BadRequestException(`Riga ${row}: data assunzione YYYY-MM-DD`);
      patch.hireDate = raw.hireDate.trim();
    }
    if (raw.birthDate?.trim()) {
      if (!iso.test(raw.birthDate.trim())) throw new BadRequestException(`Riga ${row}: data nascita YYYY-MM-DD`);
      patch.birthDate = raw.birthDate.trim();
    }
    if (raw.contractType?.trim()) patch.contractType = raw.contractType.trim();

    const wch = this.readOptionalNumber(raw.weeklyContractHours ?? "");
    if (wch !== undefined) {
      if (wch < 1 || wch > 80) throw new BadRequestException(`Riga ${row}: ore settimanali 1–80`);
      patch.weeklyContractHours = wch;
    }
    const base = this.readOptionalNumber(raw.baseSalaryMonthly ?? "");
    if (base !== undefined) {
      if (base < 0) throw new BadRequestException(`Riga ${row}: retribuzione mensile non valida`);
      patch.baseSalaryMonthly = base;
    }
    const ral = this.readOptionalNumber(raw.annualGrossSalary ?? "");
    if (ral !== undefined) {
      if (ral <= 0) throw new BadRequestException(`Riga ${row}: RAL non valida`);
      patch.annualGrossSalary = ral;
    }
    const vac = this.readOptionalNumber(raw.vacationAllowanceDays ?? "");
    if (vac !== undefined) {
      if (vac < 0 || vac > 120) throw new BadRequestException(`Riga ${row}: ferie annuali non valide`);
      patch.vacationAllowanceDays = vac;
    }

    let effectiveCcId = user.costCenterId ?? "";
    if (raw.costCenterCode?.trim() || raw.costCenterName?.trim()) {
      effectiveCcId = await this.resolveCostCenterId(
        row,
        requester.role === "superuser" ? user.companyId : requester.companyId,
        raw.costCenterCode ?? "",
        raw.costCenterName ?? ""
      );
      patch.costCenterId = effectiveCcId;
    }

    if (raw.teamName?.trim()) {
      const cc = (patch.costCenterId as string | undefined) ?? user.costCenterId;
      if (!cc) throw new BadRequestException(`Riga ${row}: impostare centro di costo prima del team`);
      const tid = await this.resolveTeamId(row, cc, raw.teamName);
      if (tid) patch.teamId = tid;
    }

    if (raw.managerFullName?.trim()) {
      patch.managerId = this.resolveManagerId(row, scopeUsers, raw.managerFullName);
    }

    if (raw.roleId?.trim()) {
      patch.roleId = raw.roleId.trim();
      const roles = await this.store.listRoles();
      if (!roles.some((r) => r.id === patch.roleId)) {
        throw new BadRequestException(`Riga ${row}: ID ruolo organizzativo non valido`);
      }
    }

    if (raw.platformRole?.trim()) {
      try {
        patch.role = this.parsePlatformRoleCell(raw.platformRole);
      } catch (e) {
        throw new BadRequestException(`Riga ${row}: ${e instanceof Error ? e.message : "Ruolo piattaforma non valido"}`);
      }
    }

    return patch;
  }

  private async buildCreatePayload(
    row: number,
    raw: Record<string, string>,
    requester: User,
    scopeUsers: User[],
    opts?: { templateUserId?: string }
  ): Promise<Parameters<HrDataStore["createUser"]>[0]> {
    const requireCell = (fieldId: string, label: string): string => {
      const v = (raw[fieldId] ?? "").trim();
      if (!v) {
        throw new BadRequestException(`Riga ${row}: campo obbligatorio mancante: ${label}`);
      }
      return v;
    };

    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (opts?.templateUserId && (raw.userId ?? "").trim() !== opts.templateUserId.trim()) {
      throw new BadRequestException(`Riga ${row}: ID utente non allineato al template`);
    }

    const firstName = requireCell("firstName", "Nome");
    const lastName = requireCell("lastName", "Cognome");
    const fullName = requireCell("fullName", "Nome completo");
    const emailOpt = requireCell("email", "Email");
    if (!emailRe.test(emailOpt)) {
      throw new BadRequestException(`Riga ${row}: formato email non valido`);
    }

    requireCell("fiscalCode", "Codice fiscale");
    requireCell("phone", "Telefono");
    requireCell("address", "Indirizzo (via e numero)");
    requireCell("taxMunicipalityIt", "Comune di residenza");
    const taxReg = requireCell("taxRegion", "Regione (fiscale)").toUpperCase();
    if (!TAX_REGION_SET.has(taxReg)) {
      throw new BadRequestException(
        `Riga ${row}: regione fiscale non valida (${taxReg}). Usa un codice dal foglio Regioni.`
      );
    }

    const birthDate = requireCell("birthDate", "Data di nascita");
    if (!iso.test(birthDate)) {
      throw new BadRequestException(`Riga ${row}: data di nascita YYYY-MM-DD`);
    }
    const hireDate = requireCell("hireDate", "Data assunzione");
    if (!iso.test(hireDate)) {
      throw new BadRequestException(`Riga ${row}: data assunzione YYYY-MM-DD`);
    }

    const contractType = requireCell("contractType", "Tipo contratto");
    const wchRaw = requireCell("weeklyContractHours", "Ore contrattuali settimanali");
    const wchParsed = Number(String(wchRaw).replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(wchParsed) || wchParsed < 1 || wchParsed > 80) {
      throw new BadRequestException(`Riga ${row}: ore settimanali 1–80`);
    }
    const weeklyContractHours = wchParsed;

    const baseStr = requireCell("baseSalaryMonthly", "Retribuzione mensile lorda base");
    const base = Number(String(baseStr).replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(base) || base < 0) {
      throw new BadRequestException(`Riga ${row}: retribuzione mensile non valida`);
    }

    const ralStr = requireCell("annualGrossSalary", "RAL annua indicativa");
    const ral = Number(String(ralStr).replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(ral) || ral <= 0) {
      throw new BadRequestException(`Riga ${row}: RAL annua non valida`);
    }

    const vacStr = requireCell("vacationAllowanceDays", "Ferie annuali contrattuali (giorni)");
    const vacParsed = Number(String(vacStr).replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(vacParsed) || vacParsed < 0 || vacParsed > 120) {
      throw new BadRequestException(`Riga ${row}: ferie annuali non valide`);
    }
    const vacationAllowanceDays = vacParsed;

    const ccName = (raw.costCenterName ?? "").trim();
    const ccCode = (raw.costCenterCode ?? "").trim();
    if (!ccName && !ccCode) {
      throw new BadRequestException(`Riga ${row}: indicare nome o codice centro di costo`);
    }

    const teamCell = (raw.teamName ?? "").trim();
    if (!teamCell) {
      throw new BadRequestException(
        `Riga ${row}: campo Team obbligatorio (usa «${EXCEL_EMPTY_SENTINEL}» se nessun team)`
      );
    }
    const mgrCell = (raw.managerFullName ?? "").trim();
    if (!mgrCell) {
      throw new BadRequestException(
        `Riga ${row}: campo Manager obbligatorio (usa «${EXCEL_EMPTY_SENTINEL}» se assente)`
      );
    }

    const roleId = requireCell("roleId", "ID ruolo organizzativo");
    const platformRoleStr = requireCell("platformRole", "Ruolo piattaforma");
    let role: AuthRole;
    try {
      role = this.parsePlatformRoleCell(platformRoleStr);
    } catch (e) {
      throw new BadRequestException(
        `Riga ${row}: ${e instanceof Error ? e.message : "Ruolo piattaforma non valido"}`
      );
    }
    const roles = await this.store.listRoles();
    if (!roles.some((r) => r.id === roleId)) {
      throw new BadRequestException(`Riga ${row}: ID ruolo organizzativo non valido`);
    }

    const companyId = requester.companyId;
    const costCenterId = await this.resolveCostCenterId(row, companyId, ccCode, ccName);

    let managerId: string | undefined;
    if (mgrCell !== EXCEL_EMPTY_SENTINEL) {
      managerId = this.resolveManagerId(row, scopeUsers, mgrCell);
    }

    let teamId: string | null | undefined;
    if (teamCell !== EXCEL_EMPTY_SENTINEL) {
      teamId = await this.resolveTeamId(row, costCenterId, teamCell);
    }

    const payload: Parameters<HrDataStore["createUser"]>[0] = {
      firstName,
      lastName,
      fullName,
      email: emailOpt,
      role,
      companyId,
      roleId,
      costCenterId,
      contractType,
      weeklyContractHours,
      managerId,
      teamId: teamId ?? undefined,
      phone: (raw.phone ?? "").trim(),
      birthDate,
      hireDate,
      fiscalCode: (raw.fiscalCode ?? "").trim(),
      address: (raw.address ?? "").trim(),
      taxMunicipalityIt: (raw.taxMunicipalityIt ?? "").trim(),
      taxRegion: taxReg,
      vacationAllowanceDays,
      baseSalaryMonthly: base,
      annualGrossSalary: ral
    };

    return payload;
  }
}
