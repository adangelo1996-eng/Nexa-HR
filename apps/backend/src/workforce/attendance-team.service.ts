import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { TimeEntry, User } from "@payday/domain";
import type { AttendanceDayBoardResponse } from "../platform/hr-data.store";
import { HrDataStore } from "../platform/hr-data.store";
import { isSynapseSuperuserEmail } from "../platform/synapse-superuser";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Codici centro di costo (es. HR) abilitati alla gestione timbrature di squadra. */
function teamManageCostCenterCodes(): Set<string> {
  const raw = process.env.NEXA_HR_TEAM_ATTENDANCE_COST_CENTER_CODES?.trim() || "HR";
  return new Set(raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean));
}

@Injectable()
export class AttendanceTeamService {
  constructor(private readonly store: HrDataStore) {}

  static assertValidMonth(month: string): void {
    if (!MONTH_RE.test(month)) {
      throw new BadRequestException("Parametro month atteso nel formato YYYY-MM");
    }
  }

  static assertValidDay(day: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException("Parametro date atteso nel formato YYYY-MM-DD");
    }
  }

  async getDayAttendanceBoard(viewerId: string, day: string): Promise<AttendanceDayBoardResponse> {
    await this.assertCanManageTeam(viewerId);
    AttendanceTeamService.assertValidDay(day.slice(0, 10));
    const pick = await this.listPickerUsers(viewerId);
    return this.store.buildAttendanceDayBoard(
      pick.map((p) => p.id),
      day.slice(0, 10)
    );
  }

  async canManageTeamAttendance(userId: string): Promise<boolean> {
    const user = await this.store.getUser(userId);
    if (user.role === "superuser") {
      return true;
    }
    if (isSynapseSuperuserEmail(user.email)) {
      return true;
    }
    return this.costCenterIsHrTeam(user.costCenterId);
  }

  private async costCenterIsHrTeam(costCenterId: string | undefined): Promise<boolean> {
    if (!costCenterId) {
      return false;
    }
    const center = await this.store.getCostCenterById(costCenterId);
    if (!center) {
      return false;
    }
    const codes = teamManageCostCenterCodes();
    if (codes.has(center.code.trim().toUpperCase())) {
      return true;
    }
    const name = center.name.trim().toLowerCase();
    return name.includes("risorse umane");
  }

  async assertCanManageTeam(viewerId: string): Promise<void> {
    const ok = await this.canManageTeamAttendance(viewerId);
    if (!ok) {
      throw new ForbiddenException("Operazione riservata ad amministratori o al centro di costo HR");
    }
  }

  async assertCanViewUserAttendance(viewerId: string, targetUserId: string): Promise<void> {
    if (viewerId === targetUserId) {
      return;
    }
    const ok = await this.canManageTeamAttendance(viewerId);
    if (!ok) {
      throw new ForbiddenException("Non puoi consultare le timbrature di questo utente");
    }
    const viewer = await this.store.getUser(viewerId);
    const target = await this.store.getUser(targetUserId);
    if (viewer.role !== "superuser" && !isSynapseSuperuserEmail(viewer.email)) {
      if (viewer.companyId !== target.companyId) {
        throw new ForbiddenException("Utente non nella stessa azienda");
      }
    }
  }

  async listPickerUsers(viewerId: string): Promise<Array<{ id: string; fullName: string; email: string }>> {
    await this.assertCanManageTeam(viewerId);
    const viewer = await this.store.getUser(viewerId);
    const all = await this.store.listUsers();
    const wide =
      viewer.role === "superuser" || isSynapseSuperuserEmail(viewer.email)
        ? all
        : all.filter((u) => u.companyId === viewer.companyId);
    return wide
      .map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }

  async buildMonthExportXlsx(month: string): Promise<Buffer> {
    AttendanceTeamService.assertValidMonth(month);
    const entries = await this.store.listAllTimeEntriesInMonth(month);
    const users = await this.store.listUsers();
    const byId = new Map(users.map((u) => [u.id, u] as const));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Timbrature", {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    sheet.columns = [
      { header: "Cognome e nome", key: "fullName", width: 28 },
      { header: "Email", key: "email", width: 32 },
      { header: "Data", key: "day", width: 12 },
      { header: "Ora (locale)", key: "timeLocal", width: 14 },
      { header: "Tipo", key: "typeLabel", width: 12 },
      { header: "Timestamp ISO", key: "at", width: 28 },
      { header: "Id utente", key: "userId", width: 14 },
      { header: "Id timbratura", key: "id", width: 22 }
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const e of entries) {
      const u: User | undefined = byId.get(e.userId);
      const d = new Date(e.at);
      sheet.addRow({
        fullName: u?.fullName ?? e.userId,
        email: u?.email ?? "",
        day: e.at.slice(0, 10),
        timeLocal: d.toLocaleString("it-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        typeLabel: e.type === "clock_in" ? "Entrata" : "Uscita",
        at: e.at,
        userId: e.userId,
        id: e.id
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
