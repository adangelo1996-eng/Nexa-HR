import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger
} from "@nestjs/common";
import type { User } from "@payday/domain";
import type { AuthContext, AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { COWORK_TOOL_LIST } from "../cowork/cowork-tool-catalog";
import { HrContractsService } from "../hr-contracts/hr-contracts.service";
import {
  buildPartyFromUser,
  employmentBlocksForParty,
  employmentContractTitle,
  remoteWorkingBlocksForParty,
  remoteWorkingContractTitle,
  type ContractBlockPayload,
  type ContractPartyPayload
} from "../hr-contracts/hr-contract-templates";
import { renderSynapseContractPdf } from "../hr-contracts/hr-contract-pdf.renderer";
import { DEFAULT_MAX_REMOTE_DAYS_PER_MONTH, DEFAULT_MAX_REMOTE_DAYS_PER_WEEK } from "../hr-contracts/hr-contract-brand.constants";
import { RecruitCvScreenService } from "../recruiting/recruit-cv-screen.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { AiAuditService } from "./ai-audit.service";
import { assertHebbUserMessageAllowed } from "./ai-hr-message-policy";
import { AiHrService, type AssistantScopePayload } from "./ai-hr.service";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";
import { HEBB_MATE_CAPABILITY_CARDS } from "./hebb-mate-capabilities";
import {
  extractContractKind,
  extractDocumentKind,
  routeHebbMateIntent
} from "./hebb-mate-router";
import type {
  HebbMateAction,
  HebbMateAutomationProposal,
  HebbMateCapabilityId,
  HebbMateChatResponse,
  HebbMateContractGenerateResult,
  HebbMateContractKind,
  HebbMateDocumentEmailResult,
  HebbMateDocumentGenerateResult,
  HebbMateDocumentKind,
  HebbMateReportResult,
  HebbMateSkillSuggestResult,
  HebbMateSkillSuggestion
} from "./hebb-mate.types";

const SCHEMA_MATE_AUTOMATION = "ai_mate_automation_v1";

@Injectable()
export class HebbMateService {
  private readonly log = new Logger(HebbMateService.name);

  constructor(
    private readonly aiHr: AiHrService,
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly audit: AiAuditService,
    private readonly contracts: HrContractsService,
    private readonly cvScreen: RecruitCvScreenService
  ) {}

  listCapabilities(auth: { userId: string; role: AuthRole }): {
    capabilities: typeof HEBB_MATE_CAPABILITY_CARDS;
    llmActive: boolean;
  } {
    return {
      capabilities: HEBB_MATE_CAPABILITY_CARDS,
      llmActive: this.openAi.isActive()
    };
  }

  async chat(
    auth: AuthContext,
    body: {
      message: string;
      capability?: HebbMateCapabilityId;
      scope?: AssistantScopePayload;
      dryRun?: boolean;
      candidateId?: string;
      positionId?: string;
      documentId?: string;
      contractKind?: HebbMateContractKind;
      documentKind?: HebbMateDocumentKind;
    }
  ): Promise<HebbMateChatResponse> {
    const me = await this.store.getUser(auth.userId);
    const companyUsers = (await this.store.listUsers()).filter((u) => u.companyId === me.companyId);
    assertHebbUserMessageAllowed(body.message, companyUsers);

    const intent = routeHebbMateIntent(body.message, body.capability);
    const scope = body.scope ?? { mode: "self" as const };
    const llm = { configured: this.openAi.isActive(), routedBy: "rules" as const };

    if (intent === "general") {
      return {
        capability: "general",
        reply:
          "Sono Hebb AI Mate. Scegli una capability dalla griglia o chiedi: contratti, documenti, screening CV, invio email, report, competenze o automazioni. Per batch lifecycle usa la scheda Cowork.",
        llm
      };
    }

    if (intent === "cowork_batch") {
      return {
        capability: "cowork_batch",
        reply:
          "Per operazioni batch (rinnovi SW, approvazioni multiple) usa la scheda Cowork batch: genera un piano HITL e approva riga per riga.",
        actions: [{ type: "open_cowork", label: "Apri Cowork batch", payload: {} }],
        llm
      };
    }

    const result = await this.executeCapability(auth, intent, {
      message: body.message,
      scope,
      dryRun: body.dryRun,
      candidateId: body.candidateId,
      positionId: body.positionId,
      documentId: body.documentId,
      contractKind: body.contractKind ?? extractContractKind(body.message),
      documentKind: body.documentKind ?? extractDocumentKind(body.message)
    });

    return { ...result, llm };
  }

  private async executeCapability(
    auth: AuthContext,
    capability: HebbMateCapabilityId,
    ctx: {
      message: string;
      scope: AssistantScopePayload;
      dryRun?: boolean;
      candidateId?: string;
      positionId?: string;
      documentId?: string;
      contractKind: HebbMateContractKind;
      documentKind: HebbMateDocumentKind;
    }
  ): Promise<Omit<HebbMateChatResponse, "llm">> {
    switch (capability) {
      case "contract_generation": {
        const result = await this.generateContracts(auth, {
          scope: ctx.scope,
          contractKind: ctx.contractKind,
          dryRun: ctx.dryRun,
          requestSummary: ctx.message
        });
        return {
          capability,
          reply: `Generati ${result.created} contratti (${result.contractKind}), ${result.skipped} già presenti, ${result.errors} errori su ${result.subjectCount} persone.`,
          result,
          actions: result.items
            .filter((i) => i.documentId)
            .slice(0, 5)
            .map((i) => ({
              type: "preview_document" as const,
              label: `Anteprima ${i.fullName}`,
              payload: { documentId: i.documentId, userId: i.userId, contractId: i.contractId }
            }))
        };
      }
      case "document_generation": {
        const result = await this.generateDocuments(auth, {
          scope: ctx.scope,
          documentKind: ctx.documentKind,
          titleHint: ctx.message
        });
        return {
          capability,
          reply: `Creati ${result.created} documenti «${result.title}» nel vault.`,
          result,
          actions: result.items.slice(0, 5).map((i) => ({
            type: "preview_document" as const,
            label: `Apri ${i.fullName}`,
            payload: { documentId: i.documentId, userId: i.userId }
          }))
        };
      }
      case "cv_screening": {
        if (!ctx.candidateId?.trim()) {
          return {
            capability,
            reply:
              "Per lo screening CV indica il candidato (candidateId) e opzionalmente la posizione. Puoi avviarlo anche dalla card Screening CV.",
            result: { needsCandidateId: true }
          };
        }
        const screened = await this.cvScreen.screenCandidateCv(auth, {
          candidateId: ctx.candidateId.trim(),
          positionId: ctx.positionId?.trim()
        });
        return {
          capability,
          reply: `Screening completato: punteggio ${screened.candidateCvScreeningScore}/100. ${screened.screeningSummary.summary}`,
          result: screened,
          actions: [
            {
              type: "view_report",
              label: "Dettaglio screening",
              payload: { candidateId: screened.candidateId, score: screened.candidateCvScreeningScore }
            }
          ]
        };
      }
      case "document_email": {
        if (!ctx.documentId?.trim()) {
          const gen = await this.generateDocuments(auth, {
            scope: ctx.scope,
            documentKind: ctx.documentKind,
            titleHint: ctx.message
          });
          const first = gen.items[0];
          if (!first) {
            throw new BadRequestException("Nessun documento generato per l'invio.");
          }
          const sent = await this.sendDocumentEmail(auth, {
            documentId: first.documentId,
            targetUserId: first.userId,
            subject: gen.title,
            body: ctx.message
          });
          return {
            capability,
            reply: `Documento generato e notifica inviata a ${first.fullName} (${sent.delivery}).`,
            result: { generated: gen, email: sent },
            actions: [
              {
                type: "preview_document",
                label: "Anteprima documento",
                payload: { documentId: first.documentId, userId: first.userId }
              }
            ]
          };
        }
        const scopeResolved = await this.aiHr.resolveAssistantScope(
          { userId: auth.userId, role: auth.role as AuthRole },
          ctx.scope
        );
        const targetUserId = scopeResolved.subjectUserIds[0];
        if (!targetUserId) {
          throw new BadRequestException("Seleziona un destinatario.");
        }
        const sent = await this.sendDocumentEmail(auth, {
          documentId: ctx.documentId.trim(),
          targetUserId,
          subject: "Documento HR Nexa",
          body: ctx.message
        });
        return {
          capability,
          reply: `Notifica documento inviata (${sent.delivery}).`,
          result: sent,
          actions: [
            {
              type: "preview_document",
              label: "Anteprima documento",
              payload: { documentId: sent.documentId, userId: sent.targetUserId }
            }
          ]
        };
      }
      case "reports": {
        const report = await this.generateReport(auth, { scope: ctx.scope, message: ctx.message });
        return {
          capability,
          reply: report.summary,
          result: report,
          actions: [{ type: "view_report", label: "Report completo", payload: { reportType: report.reportType } }]
        };
      }
      case "skill_suggestions": {
        const skills = await this.suggestSkills(auth, { scope: ctx.scope, message: ctx.message });
        return {
          capability,
          reply: `${skills.suggestions.length} competenze suggerite per ${skills.roleName}.`,
          result: skills,
          actions: [
            {
              type: "apply_skills",
              label: "Vedi competenze",
              payload: { roleId: skills.roleId, userId: skills.userId }
            }
          ]
        };
      }
      case "automation_proposals": {
        const proposals = await this.proposeAutomations(auth, { scope: ctx.scope, message: ctx.message });
        return {
          capability,
          reply: `${proposals.length} proposte di automazione per l'area richiesta.`,
          result: { proposals },
          actions: proposals.slice(0, 3).map((p) => ({
            type: "open_cowork" as const,
            label: p.title,
            payload: { toolId: p.toolId, frequency: p.frequency }
          }))
        };
      }
      default:
        return { capability: "general", reply: "Capability non riconosciuta." };
    }
  }

  async generateContracts(
    auth: AuthContext,
    input: {
      scope: AssistantScopePayload;
      contractKind: HebbMateContractKind;
      dryRun?: boolean;
      requestSummary?: string;
      force?: boolean;
    }
  ): Promise<HebbMateContractGenerateResult> {
    await this.assertMateAccess(auth);
    const companyId = auth.tenantId ?? "comp-1";
    const { subjectUserIds, scopeKind } = await this.aiHr.resolveAssistantScope(
      { userId: auth.userId, role: auth.role as AuthRole },
      input.scope
    );
    if (subjectUserIds.length > 50 && !input.dryRun) {
      throw new BadRequestException("Massimo 50 persone per generazione contratti; usa dryRun o restringi il perimetro.");
    }

    const company = await this.store.getCompanySettings(companyId);
    const [roles, costCenters] = await Promise.all([this.store.listRoles(), this.store.listCostCenters()]);
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const ccById = new Map(costCenters.map((c) => [c.id, c]));
    const policyYear = new Date().getFullYear();

    const result: HebbMateContractGenerateResult = {
      dryRun: Boolean(input.dryRun),
      contractKind: input.contractKind,
      scopeKind,
      subjectCount: subjectUserIds.length,
      created: 0,
      skipped: 0,
      errors: 0,
      items: []
    };

    for (const uid of subjectUserIds) {
      let user: User;
      try {
        user = await this.store.getUser(uid);
      } catch {
        result.errors += 1;
        result.items.push({ userId: uid, fullName: uid, status: "error", detail: "Utente non trovato" });
        continue;
      }

      const cc = user.costCenterId ? ccById.get(user.costCenterId) : undefined;
      const roleTitle = user.roleId ? roleById.get(user.roleId)?.name : undefined;

      try {
        const partyBase =
          input.contractKind === "remote_working"
            ? buildPartyFromUser(user, company, {
                roleTitle,
                costCenterCode: cc?.code,
                costCenterName: cc?.name,
                contractKind: "remote_working",
                maxRemoteDaysPerWeek: DEFAULT_MAX_REMOTE_DAYS_PER_WEEK,
                maxRemoteDaysPerMonth: DEFAULT_MAX_REMOTE_DAYS_PER_MONTH,
                policyVersion: String(policyYear)
              })
            : buildPartyFromUser(user, company, {
                roleTitle,
                costCenterCode: cc?.code,
                costCenterName: cc?.name,
                contractKind: "employment"
              });
        const party: ContractPartyPayload = { ...partyBase, generationSource: "hebb_mate_v1" };

        const blocks =
          input.contractKind === "remote_working"
            ? remoteWorkingBlocksForParty(party)
            : employmentBlocksForParty(party);
        const title =
          input.contractKind === "remote_working"
            ? remoteWorkingContractTitle(user, policyYear)
            : employmentContractTitle(user);

        if (input.dryRun) {
          result.created += 1;
          result.items.push({ userId: uid, fullName: user.fullName, status: "created", detail: "Anteprima dry-run" });
          continue;
        }

        const contract = await this.contracts.create({
          companyId,
          title,
          party: party as unknown as Record<string, unknown>,
          blocks: blocks as unknown[],
          createdByUserId: auth.userId
        });

        const documentId = await this.uploadContractPdf({
          contractId: contract.id,
          party,
          blocks,
          documentTitle: title,
          subtitle: input.contractKind === "remote_working" ? "Accordo smart working" : "Contratto di lavoro",
          userId: uid,
          uploadedBy: auth.userId
        });

        result.created += 1;
        result.items.push({
          userId: uid,
          fullName: user.fullName,
          contractId: contract.id,
          documentId,
          status: "created"
        });
      } catch (e) {
        result.errors += 1;
        result.items.push({
          userId: uid,
          fullName: user.fullName,
          status: "error",
          detail: e instanceof Error ? e.message : String(e)
        });
      }
    }

    await this.audit.append({
      companyId,
      userId: auth.userId,
      roleSnapshot: auth.role,
      feature: "hebb_mate_contract_generation",
      inputForFingerprint: {
        contractKind: input.contractKind,
        scopeKind,
        created: result.created,
        errors: result.errors,
        dryRun: result.dryRun
      },
      outcome: "ok"
    });

    return result;
  }

  async generateDocuments(
    auth: AuthContext,
    input: { scope: AssistantScopePayload; documentKind: HebbMateDocumentKind; titleHint?: string }
  ): Promise<HebbMateDocumentGenerateResult> {
    await this.assertMateAccess(auth);
    if (!(await this.permissions.userHasAll(auth.userId, ["nexa.documents:write"]))) {
      throw new ForbiddenException("Permesso nexa.documents:write richiesto.");
    }

    const { subjectUserIds, scopeKind } = await this.aiHr.resolveAssistantScope(
      { userId: auth.userId, role: auth.role as AuthRole },
      input.scope
    );
    const company = await this.store.getCompanySettings(auth.tenantId ?? "comp-1");
    const title = this.documentTitleForKind(input.documentKind, input.titleHint);
    const blocks = this.documentBlocksForKind(input.documentKind, company.companyLegalName ?? "Azienda");

    const items: HebbMateDocumentGenerateResult["items"] = [];
    for (const uid of subjectUserIds.slice(0, 30)) {
      const user = await this.store.getUser(uid);
      const personalizedBlocks = blocks.map((b) => ({
        ...b,
        content: b.content
          .replace("{{employeeFullName}}", user.fullName)
          .replace("{{companyLegalName}}", company.companyLegalName ?? "Azienda")
          .replace("{{today}}", new Date().toLocaleDateString("it-IT"))
      }));

      const buffer = await renderSynapseContractPdf({
        documentTitle: title,
        subtitle: "Documento HR",
        metaLines: [`Destinatario: ${user.fullName}`, `Generato: ${new Date().toLocaleString("it-IT")}`],
        blocks: personalizedBlocks.map((b) => ({ title: b.title, content: b.content, key: b.key })),
        footerNote: "Documento generato da Hebb AI Mate · SYNAPSE"
      });

      const uploaded = await this.store.createEmployeeDocument({
        userId: uid,
        uploadedBy: auth.userId,
        kind: input.documentKind === "smartworking_letter" ? "remote_working" : "other",
        title,
        mimeType: "application/pdf",
        bodyBase64: buffer.toString("base64")
      });

      items.push({ userId: uid, fullName: user.fullName, documentId: uploaded.id, title });
    }

    return {
      scopeKind,
      documentKind: input.documentKind,
      title,
      created: items.length,
      items
    };
  }

  async sendDocumentEmail(
    auth: AuthContext,
    input: { documentId: string; targetUserId: string; subject: string; body: string }
  ): Promise<HebbMateDocumentEmailResult> {
    if (!(await this.permissions.userHasAll(auth.userId, ["nexa.documents:write"]))) {
      throw new ForbiddenException("Permesso nexa.documents:write richiesto.");
    }
    const docs = await this.store.listDocumentsForRequester(auth.userId, auth.role, input.targetUserId);
    const doc = docs.find((d) => d.id === input.documentId);
    if (!doc || doc.userId !== input.targetUserId) {
      throw new BadRequestException("Documento non trovato o non appartiene al destinatario.");
    }

    await this.store.notifyUserInApp({
      userId: input.targetUserId,
      title: input.subject.slice(0, 120) || "Nuovo documento HR",
      body: `È disponibile un documento: ${doc.title}. ${input.body.slice(0, 200)}`,
      kind: "hebb_mate_document_delivery",
      actionPath: "/documents"
    });

    const webhookUrl =
      process.env.MATE_DOCUMENT_EMAIL_WEBHOOK_URL?.trim() || process.env.IMPORT_NOTIFY_WEBHOOK_URL?.trim();
    let webhookAttempted = false;
    let webhookOk = false;
    if (webhookUrl) {
      webhookAttempted = true;
      try {
        const target = await this.store.getUser(input.targetUserId);
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "hebb_mate_document_email",
            to: target.email,
            subject: input.subject,
            body: input.body,
            documentId: input.documentId,
            documentTitle: doc.title,
            actorUserId: auth.userId
          })
        });
        webhookOk = res.ok;
      } catch (e) {
        this.log.warn(`Webhook email Mate: ${e instanceof Error ? e.message : e}`);
      }
    }

    return {
      documentId: input.documentId,
      targetUserId: input.targetUserId,
      delivery: webhookOk ? "both" : "in_app",
      webhookAttempted,
      webhookOk
    };
  }

  async generateReport(
    auth: AuthContext,
    input: { scope: AssistantScopePayload; message?: string }
  ): Promise<HebbMateReportResult> {
    await this.assertMateAccess(auth);
    const companyId = auth.tenantId ?? "comp-1";
    const { subjectUserIds, scopeKind } = await this.aiHr.resolveAssistantScope(
      { userId: auth.userId, role: auth.role as AuthRole },
      input.scope
    );

    const reportType: HebbMateReportResult["reportType"] =
      scopeKind === "cost_center" ? "cost_center" : scopeKind === "team" ? "team" : "employee";

    let scopeLabel = "Profilo personale";
    if (scopeKind === "team" && input.scope?.teamId) {
      const team = await this.store.getWorkTeam(input.scope.teamId);
      scopeLabel = `Team ${team.name}`;
    } else if (scopeKind === "cost_center" && input.scope?.costCenterId) {
      const cc = await this.store.getCostCenterById(input.scope.costCenterId);
      scopeLabel = cc ? `CDC ${cc.code} — ${cc.name}` : "Centro di costo";
    } else if (subjectUserIds.length === 1) {
      const u = await this.store.getUser(subjectUserIds[0]!);
      scopeLabel = u.fullName;
    }

    const year = new Date().getFullYear();
    let pendingLeaves = 0;
    let lowLeaveCount = 0;
    let docCount = 0;
    let trainingPending = 0;

    for (const uid of subjectUserIds) {
      try {
        const leaves = await this.store.listLeave(uid);
        pendingLeaves += leaves.filter((l) => l.status === "pending").length;
        const bal = await this.store.getLeaveBalance(uid, year);
        if (bal.residualDays <= 3) lowLeaveCount += 1;
        const docs = await this.store.listDocumentsForRequester(auth.userId, auth.role, uid);
        docCount += docs.length;
      } catch {
        /* skip subject */
      }
    }

    const skillsGap = await this.store.getSkillsGapReport(companyId).catch(() => []);
    const topGaps = skillsGap.slice(0, 5);

    const sections = [
      {
        title: "Organico e perimetro",
        bullets: [
          `${subjectUserIds.length} persone nel perimetro`,
          `Ambito: ${scopeKind}`,
          reportType === "employee" ? "Report individuale" : "Report aggregato"
        ]
      },
      {
        title: "Assenze e ferie",
        bullets: [
          `${pendingLeaves} richieste ferie/permessi in attesa`,
          `${lowLeaveCount} persone con ferie residue ≤ 3 giorni`
        ]
      },
      {
        title: "Documenti e competenze",
        bullets: [
          `${docCount} documenti in vault nel perimetro`,
          topGaps.length
            ? `Top gap competenze: ${topGaps.map((g) => `${g.roleName}/${g.skillName}`).join(", ")}`
            : "Nessun gap competenze rilevato nel catalogo"
        ]
      }
    ];

    const summary = `${scopeLabel}: ${subjectUserIds.length} persone, ${pendingLeaves} approvazioni pendenti, ${docCount} documenti vault.`;

    return {
      reportType,
      scopeLabel,
      generatedAt: new Date().toISOString(),
      summary,
      sections,
      metrics: {
        headcount: subjectUserIds.length,
        pendingLeaves,
        lowLeaveCount,
        documentCount: docCount,
        skillsGapCount: skillsGap.length
      }
    };
  }

  async suggestSkills(
    auth: AuthContext,
    input: { scope: AssistantScopePayload; message?: string; roleId?: string }
  ): Promise<HebbMateSkillSuggestResult> {
    await this.assertMateAccess(auth);
    const companyId = auth.tenantId ?? "comp-1";
    const { subjectUserIds } = await this.aiHr.resolveAssistantScope(
      { userId: auth.userId, role: auth.role as AuthRole },
      input.scope
    );

    let roleId = input.roleId?.trim();
    let roleName = "Ruolo generico";
    let userId: string | undefined;

    if (!roleId && subjectUserIds.length === 1) {
      userId = subjectUserIds[0];
      const user = await this.store.getUser(userId);
      roleId = user.roleId ?? undefined;
      if (user.roleId) {
        const roles = await this.store.listRoles();
        roleName = roles.find((r) => r.id === user.roleId)?.name ?? roleName;
      }
    } else if (roleId) {
      const roles = await this.store.listRoles();
      roleName = roles.find((r) => r.id === roleId)?.name ?? roleName;
    }

    const suggestions: HebbMateSkillSuggestion[] = [];
    const gapRows = await this.store.getSkillsGapReport(companyId, roleId ?? null);
    for (const g of gapRows.slice(0, 12)) {
      suggestions.push({
        skillCode: g.skillCode,
        skillName: g.skillName,
        suggestedLevel: g.minLevel,
        reason: `Richiesto livello ${g.minLevel} per ${g.roleName}; media attuale ${g.avgUserLevel.toFixed(1)}`,
        source: "gap_analysis"
      });
    }

    if (roleId && suggestions.length === 0) {
      const sb = this.store.getServiceRoleClient();
      const { data: reqs } = await sb
        .from("hr_role_skill_requirements")
        .select("min_level, skill_id, hr_skills ( code, name )")
        .eq("company_id", companyId)
        .eq("role_id", roleId)
        .limit(15);
      for (const row of reqs ?? []) {
        const sk = (row as { hr_skills?: { code?: string; name?: string } | null }).hr_skills;
        if (!sk) continue;
        suggestions.push({
          skillCode: String(sk.code ?? ""),
          skillName: String(sk.name ?? ""),
          suggestedLevel: Number((row as { min_level?: number }).min_level ?? 3),
          reason: "Da fabbisogno competenze del ruolo",
          source: "role_template"
        });
      }
    }

    if (suggestions.length === 0 && this.openAi.isActive() && input.message?.trim()) {
      const llmSug = await this.llmSkillSuggestions(companyId, auth.userId, roleName, input.message);
      suggestions.push(...llmSug);
    }

    if (suggestions.length === 0) {
      suggestions.push(
        {
          skillCode: "COMM",
          skillName: "Comunicazione efficace",
          suggestedLevel: 3,
          reason: "Competenza trasversale tipica HR",
          source: "role_template"
        },
        {
          skillCode: "COLLAB",
          skillName: "Collaborazione di team",
          suggestedLevel: 3,
          reason: "Competenza trasversale tipica HR",
          source: "role_template"
        }
      );
    }

    return { roleId, roleName, userId, suggestions: suggestions.slice(0, 15) };
  }

  async proposeAutomations(
    auth: AuthContext,
    input: { scope: AssistantScopePayload; message?: string; workArea?: string }
  ): Promise<HebbMateAutomationProposal[]> {
    await this.assertMateAccess(auth);
    const allowedTools = COWORK_TOOL_LIST.filter((t) => t.executable);
    const areaHint = (input.workArea ?? input.message ?? "").toLowerCase();

    const filtered = allowedTools.filter((t) => {
      if (!areaHint.trim()) return true;
      return (
        t.areaId.includes(areaHint) ||
        t.domain.includes(areaHint) ||
        t.labelIt.toLowerCase().includes(areaHint) ||
        /smart|ferie|document|formaz|payroll|lifecycle|recruit|calendar/.test(areaHint)
      );
    });

    const base = (filtered.length ? filtered : allowedTools).slice(0, 8);
    const proposals: HebbMateAutomationProposal[] = base.map((tool) => ({
      id: `auto-${tool.id}`,
      title: tool.labelIt,
      description: tool.hintIt,
      workArea: tool.areaId,
      frequency: this.inferFrequency(tool.id),
      scheduleHint: this.scheduleHintFor(tool.id),
      toolId: tool.id,
      permissions: tool.permissions ?? [],
      estimatedImpact: "Riduce lavoro manuale HR nel perimetro selezionato"
    }));

    if (this.openAi.isActive() && input.message?.trim()) {
      const enriched = await this.llmAutomationEnrich(auth, input.message, proposals);
      if (enriched.length) return enriched;
    }

    return proposals;
  }

  private async llmSkillSuggestions(
    companyId: string,
    userId: string,
    roleName: string,
    message: string
  ): Promise<HebbMateSkillSuggestion[]> {
    const { sessionId } = await this.gateway.beginSession(companyId, userId);
    try {
      const payload = { roleName, message, task: "Suggest 5 typical skills with level 1-5 for this HR role." };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, "ai_field_suggest_v1");
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, "ai_field_suggest_v1");
      const raw = refined.ok ? refined.data : pseudo.pseudonymized;
      const parsed = raw as { suggestions?: Array<{ code?: string; name?: string; level?: number; reason?: string }> };
      const list = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
      return list.map((s) => ({
        skillCode: String(s.code ?? "SKILL"),
        skillName: String(s.name ?? "Competenza"),
        suggestedLevel: Number(s.level ?? 3),
        reason: String(s.reason ?? "Suggerimento LLM"),
        source: "llm" as const
      }));
    } catch {
      return [];
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }

  private async llmAutomationEnrich(
    auth: AuthContext,
    message: string,
    seed: HebbMateAutomationProposal[]
  ): Promise<HebbMateAutomationProposal[]> {
    const companyId = auth.tenantId ?? "comp-1";
    const { sessionId } = await this.gateway.beginSession(companyId, auth.userId);
    try {
      const payload = { message, seedTools: seed.map((s) => s.toolId), task: "Rank and refine HR automation proposals" };
      const pseudo = await this.gateway.toModelPayload(sessionId, payload, SCHEMA_MATE_AUTOMATION);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_MATE_AUTOMATION);
      const raw = refined.ok ? refined.data : pseudo.pseudonymized;
      const env = raw as { proposals?: HebbMateAutomationProposal[] };
      if (Array.isArray(env.proposals) && env.proposals.length) {
        return env.proposals.slice(0, 10);
      }
    } catch {
      /* fallback seed */
    } finally {
      await this.gateway.endSession(sessionId);
    }
    return seed;
  }

  private async uploadContractPdf(input: {
    contractId: string;
    party: ContractPartyPayload;
    blocks: ContractBlockPayload[];
    documentTitle: string;
    subtitle: string;
    userId: string;
    uploadedBy: string;
  }): Promise<string> {
    const buffer = await renderSynapseContractPdf({
      documentTitle: input.documentTitle,
      subtitle: input.subtitle,
      metaLines: [`Riferimento contratto: ${input.contractId}`],
      blocks: input.blocks.map((b) => ({ title: b.title, content: b.content, key: b.key })),
      footerNote: "Documento generato da Hebb AI Mate · SYNAPSE"
    });
    const uploaded = await this.store.createEmployeeDocument({
      userId: input.userId,
      uploadedBy: input.uploadedBy,
      kind: "contract",
      title: `${input.documentTitle} (PDF)`,
      mimeType: "application/pdf",
      bodyBase64: buffer.toString("base64")
    });
    return uploaded.id;
  }

  private documentTitleForKind(kind: HebbMateDocumentKind, hint?: string): string {
    const fromHint = hint?.trim().slice(0, 80);
    if (fromHint && fromHint.length > 8 && !/genera|crea|document/i.test(fromHint)) {
      return fromHint;
    }
    const map: Record<HebbMateDocumentKind, string> = {
      certificate_attendance: "Attestato di frequenza",
      certificate_training: "Attestato di formazione",
      smartworking_letter: "Lettera accordo smart working",
      employment_letter: "Lettera di assunzione",
      generic: "Documento HR"
    };
    return map[kind];
  }

  private documentBlocksForKind(
    kind: HebbMateDocumentKind,
    companyName: string
  ): ContractBlockPayload[] {
    const intro = `Il presente documento è rilasciato da ${companyName} in data {{today}} a favore di {{employeeFullName}}.`;
    switch (kind) {
      case "certificate_training":
        return [
          { key: "body", title: "Attestato", content: `${intro}\n\nSi certifica la partecipazione al percorso formativo aziendale con esito positivo.` }
        ];
      case "certificate_attendance":
        return [
          { key: "body", title: "Attestato presenze", content: `${intro}\n\nSi certifica la regolare frequenza nel periodo di riferimento secondo le registrazioni HR.` }
        ];
      case "smartworking_letter":
        return [
          {
            key: "body",
            title: "Accordo agile",
            content: `${intro}\n\nCon la presente si comunica l'attivazione dell'accordo di lavoro agile secondo policy aziendale vigente.`
          }
        ];
      case "employment_letter":
        return [
          { key: "body", title: "Lettera assunzione", content: `${intro}\n\nSi conferma l'inizio del rapporto di lavoro subordinato alle condizioni concordate con HR.` }
        ];
      default:
        return [{ key: "body", title: "Documento", content: `${intro}\n\nDocumento generato su richiesta HR tramite Hebb AI Mate.` }];
    }
  }

  private inferFrequency(toolId: string): HebbMateAutomationProposal["frequency"] {
    if (/publish_payslip|payroll|month/i.test(toolId)) return "monthly";
    if (/renew_agreement|year/i.test(toolId)) return "yearly";
    if (/approve_pending|daily/i.test(toolId)) return "daily";
    if (/training|quarter/i.test(toolId)) return "quarterly";
    if (/week|calendar/i.test(toolId)) return "weekly";
    return "on_demand";
  }

  private scheduleHintFor(toolId: string): string {
    const freq = this.inferFrequency(toolId);
    const map: Record<HebbMateAutomationProposal["frequency"], string> = {
      daily: "Ogni giorno lavorativo alle 08:00",
      weekly: "Ogni lunedì alle 09:00",
      monthly: "Primo giorno lavorativo del mese",
      quarterly: "Primo giorno del trimestre",
      yearly: "Gennaio — allineato ciclo policy",
      on_demand: "Su richiesta HR o trigger evento"
    };
    return map[freq];
  }

  private async assertMateAccess(auth: AuthContext): Promise<void> {
    const ok =
      auth.role === "superuser" ||
      (await this.permissions.userHasAll(auth.userId, ["nexa.lifecycle:read"]));
    if (!ok) {
      throw new ForbiddenException("Permesso nexa.lifecycle:read richiesto per Hebb AI Mate.");
    }
  }
}
