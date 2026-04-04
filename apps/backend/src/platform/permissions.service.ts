import { Injectable } from "@nestjs/common";
import type { AuthRole } from "./auth";
import { ALL_CATALOG_PERMISSION_IDS, LEGACY_TO_NEW_KEYS } from "./permission-catalog";
import { HrDataStore } from "./hr-data.store";
import { isSynapseSuperuserEmail } from "./synapse-superuser";

@Injectable()
export class PermissionsService {
  constructor(private readonly store: HrDataStore) {}

  expandRolePermissions(raw: string[]): Set<string> {
    const out = new Set<string>();
    for (const p of raw) {
      if (p === "*") {
        for (const id of ALL_CATALOG_PERMISSION_IDS) {
          out.add(id);
        }
        continue;
      }
      out.add(p);
      const mapped = LEGACY_TO_NEW_KEYS[p];
      if (mapped) {
        for (const id of mapped) {
          out.add(id);
        }
      }
    }
    return out;
  }

  async getExpandedPermissionsForUserId(userId: string): Promise<Set<string>> {
    const user = await this.store.getUser(userId);
    if (!user.roleId) {
      return new Set<string>();
    }
    const role = await this.store.getRoleById(user.roleId);
    if (!role) {
      return new Set<string>();
    }
    return this.expandRolePermissions(role.permissions ?? []);
  }

  hasKey(expanded: Set<string>, key: string): boolean {
    if (expanded.has(key)) {
      return true;
    }
    if (key.endsWith(":read")) {
      const w = key.replace(/:read$/, ":write");
      if (expanded.has(w)) {
        return true;
      }
    }
    return false;
  }

  async userHasAll(userId: string, required: string[]): Promise<boolean> {
    if (required.length === 0) {
      return true;
    }
    const expanded = await this.getExpandedPermissionsForUserId(userId);
    for (const key of required) {
      if (!this.hasKey(expanded, key)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Solo permesso `:read` letterale nel ruolo (o `*` già espanso). Non usa la regola write→read.
   * Usato p.es. per `nexa.personnel_budget:read` e altri flag espliciti sul catalogo.
   */
  async userHasExplicitReadCatalogKey(userId: string, readKey: string): Promise<boolean> {
    const expanded = await this.getExpandedPermissionsForUserId(userId);
    return expanded.has(readKey);
  }

  /**
   * Console `/admin` (utenti, ruoli, centri di costo): solo email in `SYNAPSE_SUPERUSER_EMAILS`
   * (default `admin@synapse.com`). Il permesso catalogo `nexa.admin_users:read` non apre più quest’area.
   */
  async canAccessNexaAdminUi(_userId: string, _jwtRole: AuthRole, email: string): Promise<boolean> {
    return isSynapseSuperuserEmail(email);
  }

  /**
   * Strumenti HR «estesi» (calcolo cedolino, budget personale, export presenze oltre centro HR):
   * superuser JWT, email Synapse allowlist, oppure `nexa.admin_users:read` sul ruolo catalogo.
   */
  async canAccessHrExtendedConsole(userId: string, jwtRole: AuthRole, email: string): Promise<boolean> {
    if (jwtRole === "superuser") {
      return true;
    }
    if (isSynapseSuperuserEmail(email)) {
      return true;
    }
    const expanded = await this.getExpandedPermissionsForUserId(userId);
    return this.hasKey(expanded, "nexa.admin_users:read");
  }

  /**
   * Vista calendario lavoro / workflow con privilegi team (oltre al solo dipendente).
   */
  async canAccessHrWorkflowExtras(
    userId: string,
    jwtRole: AuthRole,
    email: string,
    isTeamResponsible: boolean
  ): Promise<boolean> {
    if (await this.canAccessHrExtendedConsole(userId, jwtRole, email)) {
      return true;
    }
    if (isTeamResponsible) {
      return true;
    }
    const expanded = await this.getExpandedPermissionsForUserId(userId);
    return (
      this.hasKey(expanded, "nexa.approvals:read") || this.hasKey(expanded, "nexa.approvals:write")
    );
  }

  /** Pagina report presenze / export: centro HR, console HR estesa, o permesso report HR. */
  async canExportAttendanceReports(
    userId: string,
    jwtRole: AuthRole,
    email: string,
    canManageTeamAttendance: boolean
  ): Promise<boolean> {
    if (canManageTeamAttendance) {
      return true;
    }
    if (await this.canAccessHrExtendedConsole(userId, jwtRole, email)) {
      return true;
    }
    const expanded = await this.getExpandedPermissionsForUserId(userId);
    return this.hasKey(expanded, "nexa.reports_hr:read");
  }
}
