import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabasePoolService } from "../platform/database-pool.service";

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

@Injectable()
export class ThirdPartyLicensesService {
  constructor(private readonly dbPool: DatabasePoolService) {}

  private async q<T = unknown>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    return this.dbPool.withTransaction(async (client: PoolClient) => {
      const out = await client.query(sql, params);
      return { rows: out.rows as T[] };
    });
  }

  private async assertUserInCompany(userId: string, companyId: string): Promise<void> {
    const { rows } = await this.q<{ cid: string }>(
      `select "companyId" as cid from public.users where id = $1 limit 1`,
      [userId]
    );
    const u = rows[0];
    if (!u) throw new NotFoundException("Utente non trovato");
    if (u.cid !== companyId) {
      throw new ForbiddenException("Utente non appartiene all'azienda indicata");
    }
  }

  async listLicenses(companyId: string): Promise<ThirdPartyLicenseRow[]> {
    const { rows } = await this.q<ThirdPartyLicenseRow>(
      `select
        l.id::text,
        l.company_id,
        l.tool_name,
        l.license_plan,
        l.seats_purchased,
        l.cost_amount_cents::text,
        l.cost_frequency,
        l.cost_center_id,
        l.renewal_date::text,
        l.notes,
        l.created_at::text,
        l.updated_at::text,
        coalesce((
          select count(*)::int
          from public.user_third_party_license_assignments a
          where a.license_id = l.id and a.status = 'active'
        ), 0) as active_seats_count
       from public.third_party_licenses l
       where l.company_id = $1
       order by l.tool_name asc, l.license_plan asc`,
      [companyId]
    );
    return rows;
  }

  async getLicense(companyId: string, id: string): Promise<ThirdPartyLicenseRow> {
    const { rows } = await this.q<ThirdPartyLicenseRow>(
      `select
        l.id::text,
        l.company_id,
        l.tool_name,
        l.license_plan,
        l.seats_purchased,
        l.cost_amount_cents::text,
        l.cost_frequency,
        l.cost_center_id,
        l.renewal_date::text,
        l.notes,
        l.created_at::text,
        l.updated_at::text,
        coalesce((
          select count(*)::int
          from public.user_third_party_license_assignments a
          where a.license_id = l.id and a.status = 'active'
        ), 0) as active_seats_count
       from public.third_party_licenses l
       where l.id = $1::uuid and l.company_id = $2
       limit 1`,
      [id, companyId]
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("Licenza non trovata");
    return row;
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
    const { rows } = await this.q<{ id: string }>(
      `insert into public.third_party_licenses (
        company_id, tool_name, license_plan, seats_purchased,
        cost_amount_cents, cost_frequency, cost_center_id, renewal_date, notes, created_by_user_id
      ) values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10)
      returning id::text`,
      [
        input.companyId,
        input.toolName,
        input.licensePlan,
        input.seatsPurchased,
        input.costAmountCents,
        input.costFrequency,
        input.costCenterId ?? null,
        input.renewalDate ?? null,
        input.notes ?? "",
        input.createdByUserId
      ]
    );
    const id = rows[0]?.id;
    if (!id) throw new BadRequestException("Creazione licenza fallita");
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
    const renewalDate =
      patch.renewalDate !== undefined ? patch.renewalDate : cur.renewal_date;
    const notes = patch.notes !== undefined ? patch.notes : cur.notes;

    await this.q(
      `update public.third_party_licenses
       set
         tool_name = $3,
         license_plan = $4,
         seats_purchased = $5,
         cost_amount_cents = $6,
         cost_frequency = $7,
         cost_center_id = $8,
         renewal_date = $9::date,
         notes = $10,
         updated_at = now()
       where id = $1::uuid and company_id = $2`,
      [
        id,
        companyId,
        toolName,
        licensePlan,
        seatsPurchased,
        costAmountCents,
        costFrequency,
        costCenterId,
        renewalDate,
        notes
      ]
    );
    return this.getLicense(companyId, id);
  }

  async deleteLicense(companyId: string, id: string): Promise<void> {
    await this.getLicense(companyId, id);
    await this.q(`delete from public.third_party_licenses where id = $1::uuid and company_id = $2`, [
      id,
      companyId
    ]);
  }

  async listAssignments(companyId: string): Promise<ThirdPartyLicenseAssignmentRow[]> {
    const { rows } = await this.q<ThirdPartyLicenseAssignmentRow>(
      `select
        a.id::text,
        a.company_id,
        a.user_id,
        a.license_id::text,
        a.status,
        a.assigned_at::text,
        a.revoked_at::text,
        a.notes,
        coalesce(
          nullif(trim(coalesce(u."firstName", '') || ' ' || coalesce(u."lastName", '')), ''),
          u."fullName"
        ) as user_full_name,
        l.tool_name,
        l.license_plan
       from public.user_third_party_license_assignments a
       join public.users u on u.id = a.user_id
       join public.third_party_licenses l on l.id = a.license_id
       where a.company_id = $1
       order by l.tool_name, user_full_name`,
      [companyId]
    );
    return rows;
  }

  async listAssignmentsForUser(companyId: string, userId: string): Promise<ThirdPartyLicenseAssignmentRow[]> {
    await this.assertUserInCompany(userId, companyId);
    const { rows } = await this.q<ThirdPartyLicenseAssignmentRow>(
      `select
        a.id::text,
        a.company_id,
        a.user_id,
        a.license_id::text,
        a.status,
        a.assigned_at::text,
        a.revoked_at::text,
        a.notes,
        coalesce(
          nullif(trim(coalesce(u."firstName", '') || ' ' || coalesce(u."lastName", '')), ''),
          u."fullName"
        ) as user_full_name,
        l.tool_name,
        l.license_plan
       from public.user_third_party_license_assignments a
       join public.users u on u.id = a.user_id
       join public.third_party_licenses l on l.id = a.license_id
       where a.company_id = $1 and a.user_id = $2
       order by l.tool_name`,
      [companyId, userId]
    );
    return rows;
  }

  /**
   * Sostituisce tutte le assegnazioni per l'utente con il payload (0..N licenze da catalogo).
   */
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

    const licenseIds = [...new Set(items.map((i) => i.licenseId))];
    for (const lid of licenseIds) {
      const { rows } = await this.q<{ c: string }>(
        `select company_id as c from public.third_party_licenses where id = $1::uuid limit 1`,
        [lid]
      );
      if (!rows[0] || rows[0].c !== companyId) {
        throw new BadRequestException(`Licenza non valida o non appartenente all'azienda: ${lid}`);
      }
    }

    const deduped = [...new Map(items.map((it) => [it.licenseId, it])).values()];

    return this.dbPool.withTransaction(async (client: PoolClient) => {
      await client.query(
        `delete from public.user_third_party_license_assignments where user_id = $1 and company_id = $2`,
        [userId, companyId]
      );
      for (const it of deduped) {
        await client.query(
          `insert into public.user_third_party_license_assignments
            (company_id, user_id, license_id, status, assigned_at, notes)
           values ($1, $2, $3::uuid, $4, $5::date, $6)`,
          [
            companyId,
            userId,
            it.licenseId,
            it.status,
            it.assignedAt ?? null,
            it.notes ?? ""
          ]
        );
      }
      const out = await client.query<ThirdPartyLicenseAssignmentRow>(
        `select
          a.id::text,
          a.company_id,
          a.user_id,
          a.license_id::text,
          a.status,
          a.assigned_at::text,
          a.revoked_at::text,
          a.notes,
          coalesce(
            nullif(trim(coalesce(u."firstName", '') || ' ' || coalesce(u."lastName", '')), ''),
            u."fullName"
          ) as user_full_name,
          l.tool_name,
          l.license_plan
         from public.user_third_party_license_assignments a
         join public.users u on u.id = a.user_id
         join public.third_party_licenses l on l.id = a.license_id
         where a.company_id = $1 and a.user_id = $2
         order by l.tool_name`,
        [companyId, userId]
      );
      return out.rows;
    });
  }
}
