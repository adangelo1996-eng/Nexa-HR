import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { CorporatePoliciesService } from "../corporate-policies/corporate-policies.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { AiAuditService } from "./ai-audit.service";

const SCHEMA_ASSISTANT = "ai_assistant_v1";
const SCHEMA_NL = "ai_nl_query_v1";
const SCHEMA_ANOMALIES = "ai_anomalies_v1";
const SCHEMA_TRIAGE = "ai_triage_v1";

export interface NlQueryCatalogEntry {
  id: string;
  label: string;
  description: string;
  requiredPermissions: string[];
}

@Injectable()
export class AiHrService {
  constructor(
    private readonly store: HrDataStore,
    private readonly policies: CorporatePoliciesService,
    private readonly gateway: AiPrivacyGateway,
    private readonly audit: AiAuditService,
    private readonly permissions: PermissionsService
  ) {}

  nlQueryCatalog(): { queries: NlQueryCatalogEntry[] } {
    return {
      queries: [
        {
          id: "my_leave_balance",
          label: "Saldo ferie (anno corrente)",
          description: "Giorni assegnati, usati e residuo ferie annuali.",
          requiredPermissions: ["nexa.leaves:read"]
        },
        {
          id: "my_pending_leaves",
          label: "Richieste ferie in sospeso",
          description: "Elenco richieste ferie con stato pending.",
          requiredPermissions: ["nexa.leaves:read"]
        },
        {
          id: "my_payslip_headline",
          label: "Ultimo cedolino (lordo / netto)",
          description: "Periodo e importi sintetici dell’ultimo cedolino pubblicato.",
          requiredPermissions: ["nexa.payslips:read"]
        }
      ]
    };
  }

  async assistant(
    auth: { userId: string; role: AuthRole },
    body: { message: string; page?: string | null }
  ): Promise<{ reply: string; sources: string[] }> {
    const me = await this.store.getUser(auth.userId);
    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const sources: string[] = [];
      const facts: Record<string, unknown> = {
        page: body.page ?? null,
        message: body.message
      };
      if (await this.permissions.userHasAll(auth.userId, ["nexa.leaves:read"])) {
        const year = new Date().getFullYear();
        facts.leaveBalance = await this.store.getLeaveBalance(auth.userId, year);
        sources.push("leave_balance");
      }
      const snippets = await this.policies.listSnippetsForAi(me.companyId);
      facts.policySnippets = snippets;
      sources.push("corporate_policies_meta");
      const draft = this.buildAssistantDraft(facts, body.message);
      const wrapped = { envelope: { text: draft } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_ASSISTANT);
      const cleared = (await this.gateway.fromModelResponse(sessionId, pseudo.pseudonymized)) as {
        envelope?: { text?: string };
      };
      const reply = typeof cleared.envelope?.text === "string" ? cleared.envelope.text : draft;
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "assistant",
        schemaVersion: SCHEMA_ASSISTANT,
        sessionId,
        inputForFingerprint: { message: body.message, page: body.page },
        dataSources: sources,
        responseSizeBytes: Buffer.byteLength(reply, "utf8"),
        outcome: "ok"
      });
      return { reply, sources };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private buildAssistantDraft(facts: Record<string, unknown>, message: string): string {
    const m = message.toLowerCase();
    const lines: string[] = [];
    const bal = facts.leaveBalance as { residualDays?: number; usedDays?: number; allocatedDays?: number } | undefined;
    if (bal && (m.includes("ferie") || m.includes("saldo") || m.includes("vacation"))) {
      lines.push(
        `Saldo ferie: residuo ${bal.residualDays ?? 0} giorni (usati ${bal.usedDays ?? 0} su ${bal.allocatedDays ?? 0} assegnati).`
      );
    }
    const pol = facts.policySnippets as { title: string }[] | undefined;
    if (pol?.length) {
      lines.push(`Documenti Corporate Policies disponibili: ${pol.map((p) => p.title).join(", ")}.`);
    }
    if (lines.length === 0) {
      lines.push(
        "Posso aiutarti su ferie e policy aziendali. Chiedi ad esempio del saldo ferie o consulta la sezione Corporate Policies per i documenti."
      );
    }
    lines.push("Per richieste di ferie o malattia usa i moduli dedicati nell’app.");
    return lines.join("\n");
  }

  async nlQueryRun(
    auth: { userId: string; role: AuthRole },
    body: { queryId: string }
  ): Promise<{ queryId: string; table: Record<string, unknown>[]; summary: string }> {
    const catalog = this.nlQueryCatalog().queries;
    const entry = catalog.find((q) => q.id === body.queryId);
    if (!entry) {
      throw new BadRequestException("queryId non nel catalogo");
    }
    for (const p of entry.requiredPermissions) {
      if (!(await this.permissions.userHasAll(auth.userId, [p]))) {
        throw new ForbiddenException(`Permesso richiesto: ${p}`);
      }
    }
    const me = await this.store.getUser(auth.userId);
    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      let table: Record<string, unknown>[] = [];
      const sources: string[] = [body.queryId];
      if (body.queryId === "my_leave_balance") {
        const y = new Date().getFullYear();
        const b = await this.store.getLeaveBalance(auth.userId, y);
        table = [{ year: b.year, allocatedDays: b.allocatedDays, usedDays: b.usedDays, residualDays: b.residualDays }];
      } else if (body.queryId === "my_pending_leaves") {
        const leaves = await this.store.listLeave(auth.userId);
        table = leaves
          .filter((l) => l.status === "pending")
          .map((l) => ({
            id: l.id,
            startDate: l.startDate,
            endDate: l.endDate,
            status: l.status,
            kind: l.kind ?? "annual"
          }));
      } else if (body.queryId === "my_payslip_headline") {
        const slips = await this.store.listPayslips(auth.userId);
        const pub = slips.filter((s) => (s.status ?? "published") === "published").sort((a, b) => b.period.localeCompare(a.period));
        const last = pub[0];
        table = last
          ? [
              {
                period: last.period,
                grossSalary: last.grossSalary,
                netSalary: last.netSalary,
                userId: last.userId
              }
            ]
          : [];
      }
      const summaryDraft = `Risultati per "${entry.label}": ${table.length} riga/e.`;
      const wrapped = { envelope: { summary: summaryDraft, rows: table } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_NL);
      const cleared = (await this.gateway.fromModelResponse(sessionId, pseudo.pseudonymized)) as {
        envelope?: { summary?: string; rows?: Record<string, unknown>[] };
      };
      const summary = cleared.envelope?.summary ?? summaryDraft;
      const rowsOut = Array.isArray(cleared.envelope?.rows) ? cleared.envelope!.rows! : table;
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "nl_query",
        schemaVersion: SCHEMA_NL,
        sessionId,
        inputForFingerprint: { queryId: body.queryId },
        dataSources: sources,
        responseSizeBytes: Buffer.byteLength(JSON.stringify({ summary, rows: rowsOut }), "utf8"),
        outcome: "ok"
      });
      return { queryId: body.queryId, table: rowsOut, summary };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  async nlQuerySaveView(
    auth: { userId: string; role: AuthRole },
    body: { label: string; queryId: string }
  ): Promise<{ ok: boolean; label: string; queryId: string }> {
    const me = await this.store.getUser(auth.userId);
    const catalogIds = new Set(this.nlQueryCatalog().queries.map((q) => q.id));
    if (!catalogIds.has(body.queryId)) {
      throw new BadRequestException("queryId non nel catalogo");
    }
    await this.audit.append({
      companyId: me.companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "nl_query_save_view",
      schemaVersion: SCHEMA_NL,
      inputForFingerprint: { label: body.label, queryId: body.queryId },
      dataSources: ["nl_query_catalog"],
      outcome: "logged_only"
    });
    return { ok: true, label: body.label.trim(), queryId: body.queryId };
  }

  async anomalies(
    auth: { userId: string; role: AuthRole }
  ): Promise<{ items: { code: string; severity: string; message: string }[]; explanation: string }> {
    const me = await this.store.getUser(auth.userId);
    if (!(await this.permissions.userHasAll(auth.userId, ["nexa.leaves:read"]))) {
      throw new ForbiddenException("Anomalie base richiedono visibilità ferie");
    }
    const items: { code: string; severity: string; message: string }[] = [];
    const year = new Date().getFullYear();
    const bal = await this.store.getLeaveBalance(auth.userId, year);
    if (bal.residualDays <= 3) {
      items.push({
        code: "LOW_LEAVE_RESIDUAL",
        severity: "warning",
        message: `Residuo ferie annue basso (${bal.residualDays} giorni).`
      });
    }
    const leaves = await this.store.listLeave(auth.userId);
    const pending = leaves.filter((l) => l.status === "pending").length;
    if (pending >= 3) {
      items.push({
        code: "MANY_PENDING_LEAVE_REQUESTS",
        severity: "info",
        message: `${pending} richieste ferie ancora in attesa di approvazione.`
      });
    }
    if ((await this.permissions.userHasAll(auth.userId, ["nexa.payslips:read"])) && items.length === 0) {
      const slips = await this.store.listPayslips(auth.userId);
      const pub = slips.filter((s) => (s.status ?? "published") === "published").sort((a, b) => b.period.localeCompare(a.period));
      if (pub.length >= 2) {
        const [a, b0] = pub;
        if (a && b0 && b0.netSalary > 0 && a.netSalary < b0.netSalary * 0.9) {
          items.push({
            code: "NET_DROP_MOM",
            severity: "warning",
            message: "Il netto del cedolino più recente risulta sensibilmente inferiore al precedente: verificare trattenute o variabili del mese."
          });
        }
      }
    }
    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const explainDraft = this.buildAnomalyExplanation(items);
      const wrapped = { envelope: { items, explanation: explainDraft } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_ANOMALIES);
      const cleared = (await this.gateway.fromModelResponse(sessionId, pseudo.pseudonymized)) as {
        envelope?: { explanation?: string; items?: typeof items };
      };
      const explanation =
        typeof cleared.envelope?.explanation === "string" ? cleared.envelope.explanation : explainDraft;
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "anomalies",
        schemaVersion: SCHEMA_ANOMALIES,
        sessionId,
        inputForFingerprint: { codes: items.map((i) => i.code) },
        dataSources: ["leave_balance", "leave_requests", "payslips_optional"],
        responseSizeBytes: Buffer.byteLength(JSON.stringify({ items, explanation }), "utf8"),
        outcome: "ok"
      });
      return { items: cleared.envelope?.items ?? items, explanation };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private buildAnomalyExplanation(items: { code: string; severity: string; message: string }[]): string {
    if (items.length === 0) {
      return "Nessuna anomalia rilevata dalle regole attuali su ferie e cedolini.";
    }
    return items.map((i) => `[${i.severity}] ${i.message}`).join(" ");
  }

  async triage(
    auth: { userId: string; role: AuthRole },
    body: { text: string }
  ): Promise<{ category: string; priority: string; rationale: string; suggestedPath: string | null }> {
    const me = await this.store.getUser(auth.userId);
    const { sessionId } = await this.gateway.beginSession(me.companyId, auth.userId);
    try {
      const wrapped = { envelope: { text: body.text.trim() } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA_TRIAGE);
      const clearedText = (await this.gateway.fromModelResponse(sessionId, pseudo.pseudonymized)) as {
        envelope?: { text?: string };
      };
      const text = typeof clearedText.envelope?.text === "string" ? clearedText.envelope.text : body.text;
      const result = this.ruleBasedTriage(text);
      await this.audit.append({
        companyId: me.companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "triage",
        schemaVersion: SCHEMA_TRIAGE,
        sessionId,
        inputForFingerprint: { len: body.text.length },
        dataSources: ["triage_rules"],
        responseSizeBytes: Buffer.byteLength(JSON.stringify(result), "utf8"),
        outcome: "ok"
      });
      return result;
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private ruleBasedTriage(text: string): {
    category: string;
    priority: string;
    rationale: string;
    suggestedPath: string | null;
  } {
    const t = text.toLowerCase();
    if (/urgent|urgente|immediat|bloccante/.test(t)) {
      return {
        category: "urgent",
        priority: "high",
        rationale: "Testo con indicatori di urgenza: instradare a HR entro breve.",
        suggestedPath: "/workflow"
      };
    }
    if (/ferie|permesso|leave/.test(t)) {
      return {
        category: "leave",
        priority: "normal",
        rationale: "Richiesta legata a assenze/ferie.",
        suggestedPath: "/workflow"
      };
    }
    if (/cedolin|paga|stipend|netto|lordo/.test(t)) {
      return {
        category: "payroll",
        priority: "normal",
        rationale: "Richiesta legata a retribuzione o cedolini.",
        suggestedPath: "/payslips"
      };
    }
    if (/malatt|certificat/.test(t)) {
      return {
        category: "sickness",
        priority: "normal",
        rationale: "Richiesta legata a malattia o certificati.",
        suggestedPath: "/workflow"
      };
    }
    return {
      category: "general",
      priority: "low",
      rationale: "Classificazione generica: approfondire con HR se necessario.",
      suggestedPath: "/settings"
    };
  }
}
