import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { User } from "@payday/domain";
import { HrDataStore } from "../platform/hr-data.store";
import { COWORK_DOMAIN_LABELS } from "./cowork.constants";
import type {
  CoworkDomain,
  CoworkPlanRow,
  CoworkPlanSection,
  CoworkPlannerSectionSpec
} from "./cowork.types";

export type ScopeUser = Pick<User, "id" | "fullName" | "costCenterId" | "teamId">;

@Injectable()
export class CoworkPlanHydrationService {
  constructor(private readonly store: HrDataStore) {}

  filterScopeUsers(users: User[], costCenterId?: string, teamId?: string): ScopeUser[] {
    let list = users.filter((u) => u.role !== "superuser" || users.length === 1);
    if (costCenterId?.trim()) {
      list = list.filter((u) => u.costCenterId === costCenterId.trim());
    }
    if (teamId?.trim()) {
      list = list.filter((u) => u.teamId === teamId.trim());
    }
    return list.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      costCenterId: u.costCenterId,
      teamId: u.teamId
    }));
  }

  sectionTitleForDomain(domain: CoworkDomain, custom?: string): string {
    if (custom?.trim()) {
      return custom.trim();
    }
    return COWORK_DOMAIN_LABELS[domain] ?? domain;
  }

  buildSectionsFromSpecs(
    specs: CoworkPlannerSectionSpec[],
    rowsByDomain: Map<CoworkDomain, CoworkPlanRow[]>
  ): { sections: CoworkPlanSection[]; rows: CoworkPlanRow[] } {
    const sections: CoworkPlanSection[] = [];
    const allRows: CoworkPlanRow[] = [];

    for (const spec of specs) {
      const sectionId = randomUUID();
      const domainRows = (rowsByDomain.get(spec.domain) ?? []).map((row) => ({
        ...row,
        sectionId,
        domain: spec.domain
      }));
      sections.push({
        sectionId,
        domain: spec.domain,
        title: spec.title,
        rows: domainRows
      });
      allRows.push(...domainRows);
    }

    return { sections, rows: allRows };
  }

  groupRowsIntoSections(rows: CoworkPlanRow[], sectionMeta?: CoworkPlanSectionMeta[]): CoworkPlanSection[] {
    const titleBySection = new Map(
      (sectionMeta ?? []).map((m) => [m.sectionId, m.title] as const)
    );
    const domainBySection = new Map(
      (sectionMeta ?? []).map((m) => [m.sectionId, m.domain] as const)
    );
    const order: string[] = [];
    const bySection = new Map<string, CoworkPlanRow[]>();

    for (const row of rows) {
      if (!bySection.has(row.sectionId)) {
        order.push(row.sectionId);
        bySection.set(row.sectionId, []);
      }
      bySection.get(row.sectionId)!.push(row);
    }

    return order.map((sectionId) => {
      const sectionRows = bySection.get(sectionId) ?? [];
      const domain = domainBySection.get(sectionId) ?? sectionRows[0]?.domain ?? "unknown";
      return {
        sectionId,
        domain,
        title: titleBySection.get(sectionId) ?? this.sectionTitleForDomain(domain),
        rows: sectionRows
      };
    });
  }

  templateSummary(domain: CoworkDomain, count: number, message: string): string {
    const labels: Record<CoworkDomain, string> = {
      smartworking_agreements: "accordi smart working",
      smartworking_requests: "estensioni richieste smart working",
      employment_contracts: "aggiornamenti contrattuali con clausola SW",
      training: "assegnazioni formazione",
      unknown: "operazioni"
    };
    return `Piano ${labels[domain]} per ${count} dipendenti nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`;
  }

  multiSectionSummary(sectionCount: number, rowCount: number, message: string): string {
    return `Piano con ${sectionCount} area/e operative e ${rowCount} righe nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`;
  }

  parseYear(message: string): number {
    const m = message.match(/\b(20\d{2})\b/);
    if (m) {
      return Number(m[1]);
    }
    return new Date().getFullYear();
  }

  parseEndDate(message: string, year: number): string {
    const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) {
      return iso[1]!;
    }
    if (/\b31\/12\b|\bfine anno\b|\b31-12\b/.test(message.toLowerCase())) {
      return `${year}-12-31`;
    }
    return `${year}-12-31`;
  }

  async buildAggregates(
    domain: CoworkDomain,
    companyId: string,
    users: ScopeUser[]
  ): Promise<Record<string, unknown>> {
    const sb = this.store.getServiceRoleClient();
    if (domain === "smartworking_agreements") {
      const { data } = await sb
        .from("smartworking_agreements")
        .select("user_id, valid_to, status")
        .eq("company_id", companyId)
        .eq("status", "active");
      const activeByUser = new Set((data ?? []).map((r) => String((r as { user_id: string }).user_id)));
      const withoutAgreement = users.filter((u) => !activeByUser.has(u.id)).length;
      return {
        scopeHeadcount: users.length,
        withoutActiveAgreement: withoutAgreement,
        withActiveAgreement: users.length - withoutAgreement
      };
    }
    if (domain === "smartworking_requests") {
      const { data } = await sb.from("smartworking_requests").select("userId, status, day, endDay").eq("status", "approved");
      const approved = (data ?? []) as Array<{ userId: string; day: string; endDay?: string | null }>;
      const scopeIds = new Set(users.map((u) => u.id));
      const inScope = approved.filter((r) => scopeIds.has(r.userId));
      return {
        scopeHeadcount: users.length,
        approvedRequestsInScope: inScope.length
      };
    }
    if (domain === "employment_contracts") {
      const { data } = await sb
        .from("hr_standard_contracts")
        .select("id, party, signed_by_user_id")
        .eq("company_id", companyId);
      const scopeIds = new Set(users.map((u) => u.id));
      let withContract = 0;
      for (const row of data ?? []) {
        const party = (row as { party?: Record<string, unknown> }).party ?? {};
        const signedBy = (row as { signed_by_user_id?: string | null }).signed_by_user_id;
        const empId = party.employeeUserId ?? signedBy;
        if (empId && scopeIds.has(String(empId))) {
          withContract += 1;
        }
      }
      return {
        scopeHeadcount: users.length,
        withStandardContract: withContract,
        withoutStandardContract: users.length - withContract
      };
    }
    if (domain === "training") {
      return { scopeHeadcount: users.length, trainingBatchAvailable: false };
    }
    return { scopeHeadcount: users.length };
  }

  async buildRows(
    domain: CoworkDomain,
    companyId: string,
    users: ScopeUser[],
    message: string,
    sectionId?: string
  ): Promise<CoworkPlanRow[]> {
    const sid = sectionId ?? randomUUID();
    const year = this.parseYear(message);
    const validFrom = `${year}-01-01`;
    const validTo = this.parseEndDate(message, year);
    const sb = this.store.getServiceRoleClient();

    if (domain === "smartworking_agreements") {
      const { data } = await sb
        .from("smartworking_agreements")
        .select("id, user_id, valid_to, policy_version")
        .eq("company_id", companyId)
        .eq("status", "active");
      const byUser = new Map<string, { id: string; validTo: string; policyVersion: string }>();
      for (const row of data ?? []) {
        const r = row as { id: string; user_id: string; valid_to: string; policy_version: string };
        byUser.set(r.user_id, { id: r.id, validTo: r.valid_to, policyVersion: r.policy_version });
      }

      return users.map((u) => {
        const existing = byUser.get(u.id);
        const action = existing ? "renew_agreement" : "create_agreement";
        const detail = existing
          ? `Rinnovo ${existing.validTo.slice(0, 10)} → ${validTo} (${year})`
          : `Nuovo accordo ${validFrom} → ${validTo} (${year})`;
        return {
          id: randomUUID(),
          sectionId: sid,
          domain,
          userId: u.id,
          fullName: u.fullName,
          action,
          detail,
          rationale: "Allineamento annuale policy smart working",
          status: "proposed" as const,
          payload: {
            userId: u.id,
            agreementId: existing?.id ?? null,
            validFrom,
            validTo,
            policyVersion: String(year)
          }
        };
      });
    }

    if (domain === "smartworking_requests") {
      const { data } = await sb.from("smartworking_requests").select("*").eq("status", "approved");
      const scopeIds = new Set(users.map((u) => u.id));
      const rows: CoworkPlanRow[] = [];
      for (const raw of data ?? []) {
        const r = raw as {
          id: string;
          userId: string;
          day: string;
          endDay?: string | null;
          note?: string | null;
        };
        if (!scopeIds.has(r.userId)) {
          continue;
        }
        const user = users.find((u) => u.id === r.userId);
        const currentEnd = (r.endDay ?? r.day).slice(0, 10);
        if (currentEnd >= validTo) {
          continue;
        }
        rows.push({
          id: randomUUID(),
          sectionId: sid,
          domain,
          userId: r.userId,
          fullName: user?.fullName ?? r.userId,
          action: "extend_request",
          detail: `${r.day.slice(0, 10)}–${currentEnd} → fine ${validTo}`,
          rationale: "Estensione periodo approvato",
          status: "proposed",
          payload: {
            requestId: r.id,
            day: r.day,
            newEndDay: validTo,
            note: r.note
          }
        });
      }
      return rows;
    }

    if (domain === "employment_contracts") {
      const { data } = await sb
        .from("hr_standard_contracts")
        .select("id, title, party, signed_by_user_id, status")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });

      const bestByUser = new Map<string, { id: string; title: string; status: string }>();
      for (const raw of data ?? []) {
        const row = raw as {
          id: string;
          title: string;
          party: Record<string, unknown>;
          signed_by_user_id?: string | null;
          status: string;
        };
        const empId = row.party?.employeeUserId ?? row.signed_by_user_id;
        if (!empId) {
          continue;
        }
        const uid = String(empId);
        if (!bestByUser.has(uid)) {
          bestByUser.set(uid, { id: row.id, title: row.title, status: row.status });
        }
      }

      return users.map((u) => {
        const contract = bestByUser.get(u.id);
        if (contract) {
          return {
            id: randomUUID(),
            sectionId: sid,
            domain,
            userId: u.id,
            fullName: u.fullName,
            action: "update_contract_sw_clause",
            detail: `${contract.title} (${contract.status}) → clausola SW ${year}`,
            rationale: "Rinnovo clausola agile su contratto esistente",
            status: "proposed" as const,
            payload: {
              userId: u.id,
              contractId: contract.id,
              policyYear: year
            }
          };
        }
        return {
          id: randomUUID(),
          sectionId: sid,
          domain,
          userId: u.id,
          fullName: u.fullName,
          action: "create_contract_draft",
          detail: `Nuova bozza contratto con clausola SW ${year}`,
          rationale: "Nessun contratto standard collegato",
          status: "proposed" as const,
          payload: {
            userId: u.id,
            policyYear: year,
            title: `Contratto SW ${year} — ${u.fullName}`
          }
        };
      });
    }

    return [];
  }

  primaryDomainFromSections(sections: CoworkPlanSection[]): CoworkDomain {
    const executable = sections.find((s) => s.domain !== "training" && s.domain !== "unknown");
    return executable?.domain ?? sections[0]?.domain ?? "unknown";
  }
}

export type CoworkPlanSectionMeta = {
  sectionId: string;
  domain: CoworkDomain;
  title: string;
};
