import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { HrDataStore } from "../platform/hr-data.store";

export type ThirdPartyCostFrequency = "monthly" | "annual" | "one_time" | "other";
export type AssignmentStatus = "active" | "inactive";

export interface ThirdPartyLicenseRow {
  id: string;
  company_id: string;
  tool_name: string;
  license_plan: string;
  seats_purchased: number;
  cost_amount_cents: string;
  cost_frequency: ThirdPartyCostFrequency;
  cost_center_id: string | null;
  renewal_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  active_seats_count: number;
}

export interface ThirdPartyLicenseAssignmentRow {
  id: string;
  company_id: string;
  user_id: string;
  license_id: string;
  status: AssignmentStatus;
  assigned_at: string | null;
  revoked_at: string | null;
  notes: string;
  user_full_name: string;
  tool_name: string;
  license_plan: string;
}

function userFullName(u: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): string {
  const fn = (u.firstName ?? "").trim();
  const ln = (u.lastName ?? "").trim();
  const combo = `${fn} ${ln}`.trim();
  if (combo.length > 0) return combo;
  return (u.fullName ?? "").trim();
}

@Injectable()
export class ThirdPartyLicensesService {
  constructor(private readonly store: HrDataStore) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private async assertUserInCompany(userId: string, companyId: string): Promise<void> {
    const sb = this.sb();
    const { data, error } = await sb.from("users").select("companyId").eq("id", userId).maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Utente non trovato");
    }
    const row = data as { companyId?: string | null };
    if (row.companyId !== companyId) {
      throw new ForbiddenException("Utente non appartiene all'azienda indicata");
    }
  }

  private async activeCountsForLicenses(companyId: string, licenseIds: string[]): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    if (licenseIds.length === 0) return m;
    const sb = this.sb();
    const { data, error } = await sb
      .from("user_third_party_license_assignments")
      .select("license_id")
      .eq("company_id", companyId)
      .eq("status", "active")
      .in("license_id", licenseIds);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    for (const r of data ?? []) {
      const lid = String((r as { license_id: string }).license_id);
      m.set(lid, (m.get(lid) ?? 0) + 1);
    }
    return m;
  }

  private mapLicenseRecord(r: Record<string, unknown>, activeCount: number): ThirdPartyLicenseRow {
    return {
      id: String(r.id),
      company_id: String(r.company_id),
      tool_name: String(r.tool_name),
      license_plan: String(r.license_plan ?? ""),
      seats_purchased: Number(r.seats_purchased ?? 0),
      cost_amount_cents: String(r.cost_amount_cents ?? 0),
      cost_frequency: r.cost_frequency as ThirdPartyCostFrequency,
      cost_center_id: (r.cost_center_id as string | null) ?? null,
      renewal_date: r.renewal_date != null ? String(r.renewal_date) : null,
      notes: String(r.notes ?? ""),
      created_at: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at as string).toISOString(),
      updated_at: typeof r.updated_at === "string" ? r.updated_at : new Date(r.updated_at as string).toISOString(),
      active_seats_count: activeCount
    };
  }

  async listLicenses(companyId: string): Promise<ThirdPartyLicenseRow[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("third_party_licenses")
      .select("*")
      .eq("company_id", companyId)
      .order("tool_name", { ascending: true })
      .order("license_plan", { ascending: true });
    if (error) {
      throw new InternalServerErrorException(`Licenze: ${error.message}`);
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id));
    const counts = await this.activeCountsForLicenses(companyId, ids);
    return rows.map((r) => this.mapLicenseRecord(r, counts.get(String(r.id)) ?? 0));
  }

  async getLicense(companyId: string, id: string): Promise<ThirdPartyLicenseRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("third_party_licenses")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Licenza non trovata");
    }
    const r = data as Record<string, unknown>;
    const counts = await this.activeCountsForLicenses(companyId, [String(r.id)]);
    return this.mapLicenseRecord(r, counts.get(String(r.id)) ?? 0);
  }

  async createLicense(input: {
    companyId: string;
    toolName: string;
    licensePlan: string;
    seatsPurchased: number;
    costAmountCents: number;
    costFrequency: ThirdPartyCostFrequency;
    costCenterId?: string | null;
    renewalDate?: string | null;
    notes?: string;
    createdByUserId: string;
  }): Promise<ThirdPartyLicenseRow> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("third_party_licenses")
      .insert({
        company_id: input.companyId,
        tool_name: input.toolName,
        license_plan: input.licensePlan,
        seats_purchased: input.seatsPurchased,
        cost_amount_cents: input.costAmountCents,
        cost_frequency: input.costFrequency,
        cost_center_id: input.costCenterId ?? null,
        renewal_date: input.renewalDate ?? null,
        notes: input.notes ?? "",
        created_by_user_id: input.createdByUserId
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new BadRequestException(`Creazione licenza fallita: ${error?.message ?? ""}`);
    }
    const id = String((data as { id: string }).id);
    return this.getLicense(input.companyId, id);
  }

  async updateLicense(
    companyId: string,
    id: string,
    patch: Partial<{
      toolName: string;
      licensePlan: string;
      seatsPurchased: number;
      costAmountCents: number;
      costFrequency: ThirdPartyCostFrequency;
      costCenterId: string | null;
      renewalDate: string | null;
      notes: string;
    }>
  ): Promise<ThirdPartyLicenseRow> {
    const cur = await this.getLicense(companyId, id);
    const toolName = patch.toolName ?? cur.tool_name;
    const licensePlan = patch.licensePlan ?? cur.license_plan;
    const seatsPurchased = patch.seatsPurchased ?? cur.seats_purchased;
    const costAmountCents = patch.costAmountCents ?? Number(cur.cost_amount_cents);
    const costFrequency = patch.costFrequency ?? cur.cost_frequency;
    const costCenterId = patch.costCenterId !== undefined ? patch.costCenterId : cur.cost_center_id;
    const renewalDate = patch.renewalDate !== undefined ? patch.renewalDate : cur.renewal_date;
    const notes = patch.notes !== undefined ? patch.notes : cur.notes;

    const sb = this.sb();
    const { error } = await sb
      .from("third_party_licenses")
      .update({
        tool_name: toolName,
        license_plan: licensePlan,
        seats_purchased: seatsPurchased,
        cost_amount_cents: costAmountCents,
        cost_frequency: costFrequency,
        cost_center_id: costCenterId,
        renewal_date: renewalDate,
        notes,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return this.getLicense(companyId, id);
  }

  async deleteLicense(companyId: string, id: string): Promise<void> {
    await this.getLicense(companyId, id);
    const sb = this.sb();
    const { error } = await sb.from("third_party_licenses").delete().eq("id", id).eq("company_id", companyId);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async assignmentRowsFromAssigns(
    assigns: Array<Record<string, unknown>>,
    companyId: string
  ): Promise<ThirdPartyLicenseAssignmentRow[]> {
    if (assigns.length === 0) return [];
    const userIds = [...new Set(assigns.map((a) => String(a.user_id)))];
    const licenseIds = [...new Set(assigns.map((a) => String(a.license_id)))];
    const sb = this.sb();
    const [{ data: usersData, error: uErr }, { data: licData, error: lErr }] = await Promise.all([
      sb.from("users").select("id, firstName, lastName, fullName").in("id", userIds),
      sb.from("third_party_licenses").select("id, tool_name, license_plan").in("id", licenseIds)
    ]);
    if (uErr) throw new InternalServerErrorException(uErr.message);
    if (lErr) throw new InternalServerErrorException(lErr.message);
    const users = (usersData ?? []) as Array<Record<string, unknown>>;
    const userMap = new Map<string, { firstName?: string | null; lastName?: string | null; fullName?: string | null }>();
    for (const u of users) {
      userMap.set(String(u.id), {
        firstName: u.firstName as string | null | undefined,
        lastName: u.lastName as string | null | undefined,
        fullName: u.fullName as string | null | undefined
      });
    }
    const licMap = new Map<string, { tool_name: string; license_plan: string }>();
    for (const l of (licData ?? []) as Array<Record<string, unknown>>) {
      licMap.set(String(l.id), { tool_name: String(l.tool_name), license_plan: String(l.license_plan ?? "") });
    }
    return assigns.map((a) => {
      const uid = String(a.user_id);
      const lid = String(a.license_id);
      const u = userMap.get(uid) ?? {};
      const lic = licMap.get(lid) ?? { tool_name: "", license_plan: "" };
      return {
        id: String(a.id),
        company_id: companyId,
        user_id: uid,
        license_id: lid,
        status: a.status as AssignmentStatus,
        assigned_at: a.assigned_at != null ? String(a.assigned_at) : null,
        revoked_at: a.revoked_at != null ? String(a.revoked_at) : null,
        notes: String(a.notes ?? ""),
        user_full_name: userFullName(u),
        tool_name: lic.tool_name,
        license_plan: lic.license_plan
      };
    });
  }

  async listAssignments(companyId: string): Promise<ThirdPartyLicenseAssignmentRow[]> {
    const sb = this.sb();
    const { data, error } = await sb
      .from("user_third_party_license_assignments")
      .select("id, company_id, user_id, license_id, status, assigned_at, revoked_at, notes")
      .eq("company_id", companyId);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    const assigns = (data ?? []) as Array<Record<string, unknown>>;
    const withNames = await this.assignmentRowsFromAssigns(assigns, companyId);
    withNames.sort((x, y) => x.tool_name.localeCompare(y.tool_name) || x.user_full_name.localeCompare(y.user_full_name));
    return withNames;
  }

  async listAssignmentsForUser(companyId: string, userId: string): Promise<ThirdPartyLicenseAssignmentRow[]> {
    await this.assertUserInCompany(userId, companyId);
    const sb = this.sb();
    const { data, error } = await sb
      .from("user_third_party_license_assignments")
      .select("id, company_id, user_id, license_id, status, assigned_at, revoked_at, notes")
      .eq("company_id", companyId)
      .eq("user_id", userId);
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    const assigns = (data ?? []) as Array<Record<string, unknown>>;
    const rows = await this.assignmentRowsFromAssigns(assigns, companyId);
    rows.sort((x, y) => x.tool_name.localeCompare(y.tool_name));
    return rows;
  }

  async syncUserAssignments(
    companyId: string,
    userId: string,
    items: Array<{
      licenseId: string;
      status: AssignmentStatus;
      assignedAt?: string | null;
      notes?: string;
    }>
  ): Promise<ThirdPartyLicenseAssignmentRow[]> {
    await this.assertUserInCompany(userId, companyId);

    const deduped = [...new Map(items.map((it) => [it.licenseId, it])).values()];
    const licenseIds = [...new Set(deduped.map((i) => i.licenseId))];
    const sb = this.sb();
    for (const lid of licenseIds) {
      const { data, error } = await sb
        .from("third_party_licenses")
        .select("company_id")
        .eq("id", lid)
        .maybeSingle();
      if (error) {
        throw new InternalServerErrorException(error.message);
      }
      const row = data as { company_id?: string } | null;
      if (!row || row.company_id !== companyId) {
        throw new BadRequestException(`Licenza non valida o non appartenente all'azienda: ${lid}`);
      }
    }

    const { error: delErr } = await sb
      .from("user_third_party_license_assignments")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", companyId);
    if (delErr) {
      throw new InternalServerErrorException(delErr.message);
    }

    if (deduped.length > 0) {
      const insertRows = deduped.map((it) => ({
        company_id: companyId,
        user_id: userId,
        license_id: it.licenseId,
        status: it.status,
        assigned_at: it.assignedAt ?? null,
        notes: it.notes ?? ""
      }));
      const { error: insErr } = await sb.from("user_third_party_license_assignments").insert(insertRows);
      if (insErr) {
        throw new InternalServerErrorException(insErr.message);
      }
    }

    return this.listAssignmentsForUser(companyId, userId);
  }
}
