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
   * Solo permesso `:read` letterale nel ruolo (o `*` già espanso). Non usa la regola write→read:
   * serve per esporre in UI le viste HR (payroll calcolo, budget) senza includere i dipendenti
   * che hanno solo azioni operative es. `nexa.payroll:write` per il cedolino self-service.
   */
  async userHasExplicitReadCatalogKey(userId: string, readKey: string): Promise<boolean> {
    const expanded = await this.getExpandedPermissionsForUserId(userId);
    return expanded.has(readKey);
  }

  /**
   * Chi può aprire l’area /admin nel frontend: JWT admin, superuser Synapse, o almeno una lettura su moduli amministrativi.
   */
  async canAccessNexaAdminUi(userId: string, jwtRole: AuthRole, email: string): Promise<boolean> {
    if (jwtRole === "superuser") {
      return true;
    }
    if (isSynapseSuperuserEmail(email)) {
      return true;
    }
    const expanded = await this.getExpandedPermissionsForUserId(userId);
    const gateKeys = [
      "nexa.admin_users:read",
      "nexa.admin_roles:read",
      "nexa.admin_cost_centers:read",
      "nexa.import:read"
    ] as const;
    return gateKeys.some((k) => this.hasKey(expanded, k));
  }
}
