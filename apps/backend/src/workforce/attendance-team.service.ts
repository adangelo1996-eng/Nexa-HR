import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { TimeEntry, User } from "@payday/domain";
import type { AuthRole } from "../platform/auth";
import type { AttendanceDayBoardResponse } from "../platform/hr-data.store";
import { userCanManageTeamAttendance } from "../platform/hr-attendance-access.util";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { isSynapseSuperuserEmail } from "../platform/synapse-superuser";

const MONTH_RE = /^\d{4}-\d{2}$/;

@Injectable()
export class AttendanceTeamService {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

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

  /**
   * Lettura/export vista giornaliera e export mensile: centro HR oppure HR esteso (`nexa.admin_users:read` / Synapse).
   * La modifica timbrature altrui resta solo su {@link assertCanManageTeam}.
   */
  async assertHrOrNexaAdminForAttendanceExports(
    viewerId: string,
    jwtRole: AuthRole
  ): Promise<void> {
    if (await this.canManageTeamAttendance(viewerId)) {
      return;
    }
    const user = await this.store.getUser(viewerId);
    const ok = await this.permissions.canAccessHrExtendedConsole(viewerId, jwtRole, user.email);
    if (!ok) {
      throw new ForbiddenException(
        "Operazione riservata agli amministratori Nexa o al centro di costo HR"
      );
    }
  }

  private async listUserIdsVisibleOnDayBoard(viewerId: string): Promise<string[]> {
    const viewer = await this.store.getUser(viewerId);
    const all = await this.store.listUsers();
    const wide = viewer.role === "superuser" || isSynapseSuperuserEmail(viewer.email);
    const pool = wide ? all : all.filter((u) => u.companyId === viewer.companyId);
    return pool.map((u) => u.id);
  }

  async getDayAttendanceBoard(
    viewerId: string,
    day: string,
    costCenterIds: string[] | null | undefined,
    jwtRole: AuthRole
  ): Promise<AttendanceDayBoardResponse> {
    await this.assertHrOrNexaAdminForAttendanceExports(viewerId, jwtRole);
    AttendanceTeamService.assertValidDay(day.slice(0, 10));
    const ids = await this.listUserIdsVisibleOnDayBoard(viewerId);
    return this.store.buildAttendanceDayBoard(ids, day.slice(0, 10), costCenterIds);
  }

  /** Centri di costo presenti tra i dipendenti visibili al viewer (per filtri board). */
  async listDayBoardCostCenterFilters(
    viewerId: string,
    jwtRole: AuthRole
  ): Promise<Array<{ id: string; label: string }>> {
    await this.assertHrOrNexaAdminForAttendanceExports(viewerId, jwtRole);
    const ids = await this.listUserIdsVisibleOnDayBoard(viewerId);
    const idSet = new Set(ids);
    const users = (await this.store.listUsers()).filter((u) => idSet.has(u.id));
    const ccKeys = new Set<string>();
    for (const u of users) {
      ccKeys.add(u.costCenterId?.trim() || "__none__");
    }
    const out: Array<{ id: string; label: string }> = [];
    for (const ccId of ccKeys) {
      if (ccId === "__none__") {
        out.push({ id: "__none__", label: "Senza centro di costo" });
        continue;
      }
      const cc = await this.store.getCostCenterById(ccId);
      const label = cc ? [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name : ccId;
      out.push({ id: ccId, label });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "it"));
  }

  async buildDayBoardExportXlsx(
    viewerId: string,
    day: string,
    costCenterIds: string[] | null | undefined,
    jwtRole: AuthRole
  ): Promise<Buffer> {
    AttendanceTeamService.assertValidDay(day.slice(0, 10));
    const board = await this.getDayAttendanceBoard(viewerId, day, costCenterIds, jwtRole);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Presenze giornaliere", {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    sheet.columns = [
      { header: "Data", key: "day", width: 12 },
      { header: "Centro di costo", key: "cc", width: 30 },
      { header: "Team", key: "team", width: 22 },
      { header: "Cognome e nome", key: "fullName", width: 28 },
      { header: "Email", key: "email", width: 32 },
      { header: "Entrata", key: "clockIn", width: 10 },
      { header: "Uscita", key: "clockOut", width: 10 },
      { header: "Modalità presenze", key: "mode", width: 16 },
      { header: "Stato calendario", key: "status", width: 40 },
      { header: "Avvisi", key: "alerts", width: 48 }
    ];
    sheet.getRow(1).font = { bold: true };

    for (const cc of board.costCenters) {
      for (const tm of cc.teams) {
        for (const r of tm.rows) {
          sheet.addRow({
            day: board.day,
            cc: cc.label,
            team: tm.label,
            fullName: r.fullName,
            email: r.email,
            clockIn: r.firstClockIn ?? "",
            clockOut: r.lastClockOut ?? "",
            mode:
              r.workdayMode === "smartworking"
                ? "Remote working"
                : r.workdayMode === "office"
                  ? "Sede"
                  : "",
            status: r.statusLabels.join("; "),
            alerts: r.alerts.join("; ")
          });
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async canManageTeamAttendance(userId: string): Promise<boolean> {
    return userCanManageTeamAttendance(this.store, userId);
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
