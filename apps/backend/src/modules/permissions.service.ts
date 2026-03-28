import { Injectable } from "@nestjs/common";
import { ALL_CATALOG_PERMISSION_IDS, LEGACY_TO_NEW_KEYS } from "./permission-catalog";
import { HrDataStore } from "./hr-data.store";

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
    const roles = await this.store.listRoles();
    const role = roles.find((r) => r.id === user.roleId);
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
}
