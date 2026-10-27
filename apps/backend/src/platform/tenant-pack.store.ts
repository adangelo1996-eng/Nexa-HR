import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { defaultTenantPack, type TenantPack } from "@payday/domain";
import { HrDataStore } from "./hr-data.store";

export interface TenantPackRow {
  companyId: string;
  pack: TenantPack;
  appliedAt: string;
  appliedByUserId: string | null;
  /** false = riga assente, pack sintetico. I tenant già salvati contano come questionario fatto. */
  persisted: boolean;
}

@Injectable()
export class TenantPackStore {
  private readonly mem = new Map<string, TenantPackRow>();

  constructor(private readonly hr: HrDataStore) {}

  async get(companyId: string): Promise<TenantPackRow | null> {
    const id = companyId.trim();
    if (!id) {
      return null;
    }
    if (!this.hr.usesDatabase()) {
      return this.mem.get(id) ?? null;
    }
    const { data, error } = await this.hr
      .getServiceRoleClient()
      .from("tenant_packs")
      .select("company_id, pack, applied_at, applied_by_user_id")
      .eq("company_id", id)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(`Lettura pacchetto tenant: ${error.message}`);
    }
    if (!data) {
      return null;
    }
    return {
      companyId: String(data.company_id),
      pack: (data.pack as TenantPack) ?? defaultTenantPack(),
      appliedAt: String(data.applied_at),
      appliedByUserId: data.applied_by_user_id ? String(data.applied_by_user_id) : null,
      persisted: true
    };
  }

  async upsert(row: TenantPackRow): Promise<TenantPackRow> {
    const saved = { ...row, persisted: true };
    if (!this.hr.usesDatabase()) {
      this.mem.set(row.companyId, saved);
      return saved;
    }
    const { error } = await this.hr.getServiceRoleClient().from("tenant_packs").upsert(
      {
        company_id: row.companyId,
        template_id: row.pack.templateId,
        pack: row.pack,
        applied_at: row.appliedAt,
        applied_by_user_id: row.appliedByUserId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "company_id" }
    );
    if (error) {
      throw new InternalServerErrorException(`Salvataggio pacchetto tenant: ${error.message}`);
    }
    return saved;
  }
}
