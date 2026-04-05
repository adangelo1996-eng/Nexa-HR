import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { User } from "@payday/domain";
import type { AuthRole } from "./auth";
import {
  ADMIN_EMPLOYEE_EXCEL_EXTRA_FIELDS,
  ADMIN_EMPLOYEE_EXCEL_READONLY_IDS,
  ADMIN_EXPORT_FIELD_CATALOG
} from "./admin-export.catalog";
import { DatabasePoolService } from "./database-pool.service";
import { HrDataStore, type NexaImportEventRow } from "./hr-data.store";
import type { ImportCellError } from "./import.service";
import { insertUserRowPg, updateUserFullRowPg } from "./user-pg-writer";

export const EMPLOYEE_EXCEL_MAX_ROWS = 2000;
export const EMPLOYEE_EXCEL_MAX_BYTES = 10 * 1024 * 1024;

/** Colonne nel template “nuovi utenti” (stessi header possibili dell’export + extra creazione). */
const TEMPLATE_FIELD_IDS: string[] = [
  "userId",
  "email",
  "firstName",
  "lastName",
  "fullName",
  "fiscalCode",
  "phone",
  "address",
  "taxMunicipalityIt",
  "taxRegion",
  "hireDate",
  "birthDate",
  "contractType",
  "weeklyContractHours",
  "baseSalaryMonthly",
  "annualGrossSalary",
  "vacationAllowanceDays",
  "costCenterCode",
  "costCenterName",
  "teamName",
  "managerFullName",
  "roleId",
  "platformRole"
];

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

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Export", { views: [{ state: "frozen", ySplit: 1 }] });
    const help = wb.addWorksheet("Istruzioni");

    const cols = TEMPLATE_FIELD_IDS.map((id) => labelById.get(id) ?? id);
    sheet.addRow(cols);

    for (let i = 0; i < n; i++) {
      const row: Record<string, string | number> = {
        weeklyContractHours: 40,
        contractType: "Indeterminato",
        vacationAllowanceDays: 22,
        roleId: defaultRole.id,
        platformRole: "user"
      };
      const ordered = TEMPLATE_FIELD_IDS.map((id) => row[id] ?? "");
      sheet.addRow(ordered);
    }

    help.addRow([
      "Compila nome e cognome (o email). Gli utenti creati sono associati all’azienda del richiedente della console Synapse."
    ]);
    help.addRow(["Lascia vuoto «ID utente» per righe di creazione; per aggiornamenti incolla l’ID dall’export."]);
    help.addRow([
      `Azienda applicativa (implicita): companyId del richiedente = ${requester.companyId} (non è una colonna del foglio).`
    ]);
    help.addRow([
      "Codice centro di costo: obbligatorio per nuove righe. Team e manager sono opzionali (nome team nel CDC, nome completo manager)."
    ]);

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
          const u = await this.store.createUser(op.payload);
          created += 1;
          log.push(`Riga ${op.row}: creato ${u.fullName} (${u.id}) — ${u.email}`);
        }
      }
      await this.recordApplyEvent(actor, ops.length, created, log);
      return { applied: ops.length, created, updated, log, errors: [] };
    }

    if (!this.dbPool.isConfigured()) {
      throw new BadRequestException(
        "Import transazionale: configurare DATABASE_URL con la connection string PostgreSQL del progetto Supabase (URI, utente postgres, SSL). Senza di essa il batch non può essere applicato in un’unica transazione."
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
        const id = `u-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 10)}`;
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
    const sheet = wb.getWorksheet("Export") ?? wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Foglio Excel vuoto");
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
        "Nessuna colonna riconosciuta: usa le stesse intestazioni dell’export Nexa HR (foglio «Export» o primo foglio)."
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
        const v = row.getCell(col).value;
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && v !== null && "text" in v) {
          return String((v as { text?: string }).text ?? "").trim();
        }
        if (typeof v === "number" && Number.isFinite(v)) {
          return String(v).trim();
        }
        return String(v).trim();
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

      let targetUser: User | undefined;
      if (userIdCell) {
        targetUser = byId.get(userIdCell);
        if (!targetUser) {
          errors.push({ row: rowNumber, field: "ID utente", message: "Utente non trovato o fuori ambito" });
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
    scopeUsers: User[]
  ): Promise<Parameters<HrDataStore["createUser"]>[0]> {
    const firstName = raw.firstName?.trim() ?? "";
    const lastName = raw.lastName?.trim() ?? "";
    if (!firstName || !lastName) {
      throw new BadRequestException(`Riga ${row}: Nome e cognome obbligatori per nuovi utenti`);
    }
    if (!raw.roleId?.trim()) {
      throw new BadRequestException(`Riga ${row}: ID ruolo organizzativo obbligatorio (usa il template o copia dall’anagrafica)`);
    }
    if (!raw.platformRole?.trim()) {
      throw new BadRequestException(`Riga ${row}: Ruolo piattaforma obbligatorio (superuser | user)`);
    }
    let role: AuthRole;
    try {
      role = this.parsePlatformRoleCell(raw.platformRole);
    } catch (e) {
      throw new BadRequestException(`Riga ${row}: ${e instanceof Error ? e.message : "Ruolo piattaforma non valido"}`);
    }
    const roles = await this.store.listRoles();
    if (!roles.some((r) => r.id === raw.roleId.trim())) {
      throw new BadRequestException(`Riga ${row}: ID ruolo organizzativo non valido`);
    }

    const companyId = requester.companyId;
    const costCenterId = await this.resolveCostCenterId(row, companyId, raw.costCenterCode ?? "", raw.costCenterName ?? "");

    const contractType = raw.contractType?.trim() || "Indeterminato";
    const wchRaw = this.readOptionalNumber(raw.weeklyContractHours ?? "");
    const weeklyContractHours = wchRaw ?? 40;
    if (weeklyContractHours < 1 || weeklyContractHours > 80) {
      throw new BadRequestException(`Riga ${row}: ore settimanali 1–80`);
    }

    let managerId: string | undefined;
    if (raw.managerFullName?.trim()) {
      managerId = this.resolveManagerId(row, scopeUsers, raw.managerFullName);
    }

    let teamId: string | null | undefined;
    if (raw.teamName?.trim()) {
      const tid = await this.resolveTeamId(row, costCenterId, raw.teamName);
      teamId = tid;
    }

    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const birthDate = raw.birthDate?.trim();
    const hireDate = raw.hireDate?.trim();
    if (birthDate && !iso.test(birthDate)) {
      throw new BadRequestException(`Riga ${row}: data nascita YYYY-MM-DD`);
    }
    if (hireDate && !iso.test(hireDate)) {
      throw new BadRequestException(`Riga ${row}: data assunzione YYYY-MM-DD`);
    }

    const emailOpt = raw.email?.trim() || undefined;
    if (emailOpt) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(emailOpt)) {
        throw new BadRequestException(`Riga ${row}: email non valida`);
      }
    }

    const payload: Parameters<HrDataStore["createUser"]>[0] = {
      firstName,
      lastName,
      email: emailOpt,
      role,
      companyId,
      roleId: raw.roleId.trim(),
      costCenterId,
      contractType,
      weeklyContractHours,
      managerId,
      teamId: teamId ?? undefined,
      phone: raw.phone?.trim() || undefined,
      birthDate: birthDate && iso.test(birthDate) ? birthDate : undefined,
      hireDate: hireDate && iso.test(hireDate) ? hireDate : undefined,
      fiscalCode: raw.fiscalCode?.trim() || undefined,
      address: raw.address?.trim() || undefined,
      taxMunicipalityIt: raw.taxMunicipalityIt?.trim() || undefined,
      taxRegion: raw.taxRegion?.trim() ? raw.taxRegion.trim().toUpperCase() : undefined,
      vacationAllowanceDays: this.readOptionalNumber(raw.vacationAllowanceDays ?? "") ?? 22
    };

    const base = this.readOptionalNumber(raw.baseSalaryMonthly ?? "");
    if (base !== undefined) payload.baseSalaryMonthly = base;
    const ral = this.readOptionalNumber(raw.annualGrossSalary ?? "");
    if (ral !== undefined) payload.annualGrossSalary = ral;

    return payload;
  }
}
