import { BadRequestException, Injectable } from "@nestjs/common";
import {
  applyActivityTemplate,
  defaultTenantPack,
  getActivityTemplate,
  getTenantPackCatalog,
  isCapabilityEnabled,
  type ActivityTemplateId,
  type TenantPack,
  type TenantPackApplyInput
} from "@payday/domain";
import { TenantPackStore, type TenantPackRow } from "./tenant-pack.store";

const CACHE_MS = 15_000;

@Injectable()
export class TenantPackService {
  private readonly cache = new Map<string, { at: number; row: TenantPackRow }>();

  constructor(private readonly store: TenantPackStore) {}

  catalog(): ReturnType<typeof getTenantPackCatalog> {
    return getTenantPackCatalog();
  }

  async getEffective(companyId: string): Promise<TenantPack> {
    const row = await this.getRow(companyId);
    return row.pack;
  }

  async getRow(companyId: string): Promise<TenantPackRow> {
    const id = companyId.trim();
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return hit.row;
    }
    const stored = await this.store.get(id);
    const pack =
      stored?.pack?.templateId && getActivityTemplate(stored.pack.templateId)
        ? applyActivityTemplate({
            templateId: stored.pack.templateId as ActivityTemplateId,
            overlay: stored.pack
          })
        : defaultTenantPack();
    const row: TenantPackRow = stored
      ? { ...stored, pack, persisted: true }
      : {
          companyId: id,
          pack,
          appliedAt: new Date().toISOString(),
          appliedByUserId: null,
          persisted: false
        };
    this.cache.set(id, { at: Date.now(), row });
    return row;
  }

  isEnabled(pack: TenantPack, capabilityId: string): boolean {
    return isCapabilityEnabled(pack, capabilityId);
  }

  async apply(companyId: string, actorUserId: string, input: TenantPackApplyInput): Promise<TenantPackRow> {
    if (!getActivityTemplate(input.templateId)) {
      throw new BadRequestException("Template di attività non supportato");
    }
    const pack = applyActivityTemplate(input);
    const row: TenantPackRow = {
      companyId,
      pack,
      appliedAt: new Date().toISOString(),
      appliedByUserId: actorUserId,
      persisted: true
    };
    const saved = await this.store.upsert(row);
    this.cache.set(companyId, { at: Date.now(), row: saved });
    return saved;
  }
}
