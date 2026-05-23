import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { User } from "@payday/domain";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { assertHebbUserMessageAllowed } from "../ai-hr/ai-hr-message-policy";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { COWORK_MAX_ROWS, COWORK_PLAN_TTL_MS, SCHEMA_COWORK_PLAN } from "./cowork.constants";
import { CoworkPlansStore } from "./cowork-plans.store";
import { CoworkExecutorRegistry } from "./executors/cowork-executor.registry";
import type {
  CoworkApplyRequest,
  CoworkApplyResult,
  CoworkDomain,
  CoworkPlanDto,
  CoworkPlanRequest,
  CoworkPlanRow
} from "./cowork.types";

type ScopeUser = Pick<User, "id" | "fullName" | "costCenterId" | "teamId">;

@Injectable()
export class CoworkOrchestratorService {
  constructor(
    private readonly store: HrDataStore,
    private readonly plans: CoworkPlansStore,
    private readonly gateway: AiPrivacyGateway,
    private readonly audit: AiAuditService,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly executors: CoworkExecutorRegistry
  ) {}

  async plan(auth: AuthContext, body: CoworkPlanRequest): Promise<CoworkPlanDto> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId || auth.tenantId || "comp-1";
    const message = body.message?.trim();
    if (!message) {
      throw new BadRequestException("Messaggio richiesto");
    }

    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === companyId);
    assertHebbUserMessageAllowed(message, companyUsers);

    const domain = this.classifyDomain(message);
    if (domain === "training" || domain === "unknown") {
      throw new BadRequestException(
        domain === "training"
          ? "Dominio formazione batch in arrivo. Prova accordi SW, richieste o contratti."
          : "Intento non riconosciuto. Esempi: rinnova accordi SW, estendi richieste approvate, clausola contratto."
      );
    }

    const scopeUsers = this.filterScopeUsers(companyUsers, body.costCenterId, body.teamId);
    if (scopeUsers.length === 0) {
      throw new BadRequestException("Nessun dipendente nel perimetro selezionato");
    }

    const aggregates = await this.buildAggregates(domain, companyId, scopeUsers);
    let summary = this.templateSummary(domain, scopeUsers.length, message);
    let llmApplied = false;
    let tokenCount = 0;

    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const envelope = {
        envelope: {
          facts: {
            domain,
            message,
            scopeCount: scopeUsers.length,
            filters: {
              costCenterId: body.costCenterId ?? null,
              teamId: body.teamId ?? null
            },
            aggregates
          },
          planSeed: { summary }
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, envelope, SCHEMA_COWORK_PLAN);
      tokenCount = pseudo.tokenCount;

      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_COWORK_PLAN);
        if (refined.ok && refined.data && typeof refined.data === "object") {
          const env = (refined.data as { envelope?: { summary?: string; cohortHints?: unknown } }).envelope;
          if (typeof env?.summary === "string" && env.summary.trim()) {
            summary = env.summary.trim();
            llmApplied = true;
          }
        }
      }
    } finally {
      await this.gateway.endSession(sessionId);
    }

    const rows = await this.buildRows(domain, companyId, scopeUsers, message);
    const capped = rows.slice(0, COWORK_MAX_ROWS);

    const saved = await this.plans.save({
      planId: randomUUID(),
      companyId,
      actorUserId: auth.userId,
      domain,
      summary,
      rows: capped,
      llmApplied,
      privacy: { pseudonymizedTokenCount: tokenCount, schemaVersion: SCHEMA_COWORK_PLAN }
    });

    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "cowork_plan",
      schemaVersion: SCHEMA_COWORK_PLAN,
      inputForFingerprint: { message, domain, scopeCount: scopeUsers.length },
      dataSources: ["cowork_aggregates", domain],
      outcome: "ok"
    });

    return saved;
  }

  async getPlan(auth: AuthContext, planId: string): Promise<CoworkPlanDto> {
    const me = await this.store.getUser(auth.userId);
    const stored = await this.plans.get(planId, me.companyId);
    if (stored.status === "expired") {
      throw new BadRequestException("Piano scaduto: genera un nuovo piano");
    }
    return this.plans.toDto(stored);
  }

  async apply(auth: AuthContext, body: CoworkApplyRequest): Promise<CoworkApplyResult> {
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId;
    const stored = await this.plans.get(body.planId, companyId);

    if (stored.status === "expired") {
      throw new BadRequestException("Piano scaduto");
    }
    if (stored.status === "applied") {
      throw new BadRequestException("Piano già applicato completamente");
    }

    const selected = new Set(body.selectedRowIds ?? []);
    if (selected.size === 0) {
      throw new BadRequestException("Seleziona almeno una riga");
    }

    const ctx = { auth, companyId };
    const nextRows: CoworkPlanRow[] = [];

    for (const row of stored.rows) {
      if (!selected.has(row.id)) {
        nextRows.push(row);
        continue;
      }
      if (row.status === "applied") {
        nextRows.push(row);
        continue;
      }
      const result = await this.executors.executeRow(ctx, stored.domain, row);
      nextRows.push(result);
    }

    const appliedCount = nextRows.filter((r) => selected.has(r.id) && r.status === "applied").length;
    const errorCount = nextRows.filter((r) => selected.has(r.id) && r.status === "error").length;
    const allSelectedDone = nextRows
      .filter((r) => selected.has(r.id))
      .every((r) => r.status === "applied" || r.status === "skipped");

    const status = allSelectedDone && errorCount === 0 ? "applied" : errorCount > 0 ? "partial" : "partial";
    const updated = await this.plans.updateRows(
      body.planId,
      companyId,
      nextRows,
      status,
      appliedCount > 0 ? new Date().toISOString() : stored.appliedAt
    );

    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "cowork_apply",
      inputForFingerprint: { planId: body.planId, selectedCount: selected.size },
      outcome: errorCount > 0 ? "partial" : "ok"
    });

    return {
      planId: updated.planId,
      rows: nextRows,
      appliedCount,
      errorCount
    };
  }

  /** Priorità: accordi > richieste > contratti (decisione utente). */
  classifyDomain(message: string): CoworkDomain {
    const m = message.toLowerCase();
    const agreement = /\baccord|policy|polic|annuale\b/.test(m);
    const requests = /\brichiest|estend|period|approv|remot|endday\b/.test(m);
    const contracts = /\bcontratt|clausol|firm|ccnl\b/.test(m);
    const training = /\bformazion|cors|training\b/.test(m);

    if (training && !agreement && !requests && !contracts) {
      return "training";
    }
    if (agreement) {
      return "smartworking_agreements";
    }
    if (requests) {
      return "smartworking_requests";
    }
    if (contracts) {
      return "employment_contracts";
    }
    if (training) {
      return "training";
    }
    return "unknown";
  }

  private filterScopeUsers(users: User[], costCenterId?: string, teamId?: string): ScopeUser[] {
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

  private templateSummary(domain: CoworkDomain, count: number, message: string): string {
    const labels: Record<CoworkDomain, string> = {
      smartworking_agreements: "accordi smart working",
      smartworking_requests: "estensioni richieste smart working",
      employment_contracts: "aggiornamenti contrattuali con clausola SW",
      training: "assegnazioni formazione",
      unknown: "operazioni"
    };
    return `Piano ${labels[domain]} per ${count} dipendenti nel perimetro. Richiesta: «${message.slice(0, 120)}». Conferma le righe da applicare.`;
  }

  private parseYear(message: string): number {
    const m = message.match(/\b(20\d{2})\b/);
    if (m) {
      return Number(m[1]);
    }
    return new Date().getFullYear();
  }

  private parseEndDate(message: string, year: number): string {
    const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) {
      return iso[1]!;
    }
    if (/\b31\/12\b|\bfine anno\b|\b31-12\b/.test(message.toLowerCase())) {
      return `${year}-12-31`;
    }
    return `${year}-12-31`;
  }

  private async buildAggregates(
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
    return { scopeHeadcount: users.length };
  }

  private async buildRows(
    domain: CoworkDomain,
    companyId: string,
    users: ScopeUser[],
    message: string
  ): Promise<CoworkPlanRow[]> {
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
}

export { COWORK_PLAN_TTL_MS, ForbiddenException };
