import type { HrDataStore } from "./hr-data.store";
import { isSynapseSuperuserEmail } from "./synapse-superuser";

/** Codici centro di costo (es. HR) abilitati alla gestione timbrature di squadra. */
function teamManageCostCenterCodes(): Set<string> {
  const raw = process.env.NEXA_HR_TEAM_ATTENDANCE_COST_CENTER_CODES?.trim() || "HR";
  return new Set(raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean));
}

async function costCenterIsHrTeam(store: HrDataStore, costCenterId: string | undefined): Promise<boolean> {
  if (!costCenterId?.trim()) {
    return false;
  }
  const center = await store.getCostCenterById(costCenterId.trim());
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

/**
 * Export mensile presenze, board giornaliera, modifica timbrature altrui: superuser, Synapse admin, centro HR.
 * Condiviso tra AuthService (login) e AttendanceTeamService.
 */
export async function userCanManageTeamAttendance(store: HrDataStore, userId: string): Promise<boolean> {
  const user = await store.getUser(userId);
  if (user.role === "superuser") {
    return true;
  }
  if (isSynapseSuperuserEmail(user.email)) {
    return true;
  }
  return costCenterIsHrTeam(store, user.costCenterId);
}
