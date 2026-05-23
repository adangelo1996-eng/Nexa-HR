import { randomUUID } from "node:crypto";
import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger
} from "@nestjs/common";
import type { User } from "@payday/domain";
import { HrDataStore } from "../platform/hr-data.store";
import {
  DEFAULT_MAX_REMOTE_DAYS_PER_MONTH,
  DEFAULT_MAX_REMOTE_DAYS_PER_WEEK
} from "./hr-contract-brand.constants";
import { renderSynapseContractPdf } from "./hr-contract-pdf.renderer";
import {
  batchKeyFor,
  buildPartyFromUser,
  employmentBlocksForParty,
  employmentContractTitle,
  remoteWorkingBlocksForParty,
  remoteWorkingContractTitle,
  type ContractBlockPayload,
  type ContractPartyPayload
} from "./hr-contract-templates";
import { RemoteWorkPolicyService } from "../smartworking/remote-work-policy.service";
import { HrContractsService, type HrStandardContractDto } from "./hr-contracts.service";

export type GenerateAllContractsInput = {
  companyId: string;
  actorUserId: string;
  dryRun?: boolean;
  force?: boolean;
  maxRemoteDaysPerWeek?: number;
  maxRemoteDaysPerMonth?: number;
  policyVersion?: string;
  /** Se true, ignora il guard produzione (solo env esplicito lato chiamante). */
  allowProduction?: boolean;
};

export type GenerateAllContractsResult = {
  companyId: string;
  dryRun: boolean;
  policyYear: number;
  maxRemoteDaysPerWeek: number;
  maxRemoteDaysPerMonth: number;
  employeesConsidered: number;
  employment: { created: number; skipped: number; errors: number };
  remoteWorking: { created: number; skipped: number; errors: number };
  samples: Array<{
    userId: string;
    fullName: string;
    employmentContractId?: string;
    employmentDocumentId?: string;
    remoteContractId?: string;
    remoteDocumentId?: string;
    smartworkingAgreementId?: string;
  }>;
  errorDetails: string[];
};

interface GeneratedRegistryRow {
  id: string;
  batch_key: string;
  hr_standard_contract_id: string | null;
  smartworking_agreement_id: string | null;
  document_id: string | null;
}

@Injectable()
export class HrContractsBatchService {
  private readonly log = new Logger(HrContractsBatchService.name);

  constructor(
    private readonly store: HrDataStore,
    private readonly contracts: HrContractsService,
    private readonly remoteWorkPolicy: RemoteWorkPolicyService
  ) {}

  assertProductionGuard(allowProduction?: boolean): void {
    const isProd =
      process.env.NODE_ENV === "production" ||
      String(process.env.RENDER ?? "").toLowerCase() === "true" ||
      String(process.env.NEXA_DEPLOY_ENV ?? "").toLowerCase() === "production";
    if (isProd && allowProduction !== true && process.env.HR_CONTRACTS_BATCH_ALLOW_PROD !== "1") {
      throw new ForbiddenException(
        "Generazione batch contratti bloccata in produzione. Impostare HR_CONTRACTS_BATCH_ALLOW_PROD=1 solo dopo verifica esplicita."
      );
    }
  }

  async generateAll(input: GenerateAllContractsInput): Promise<GenerateAllContractsResult> {
    this.assertProductionGuard(input.allowProduction);
    const policyYear = new Date().getFullYear();
    const maxRemoteDaysPerWeek = input.maxRemoteDaysPerWeek ?? DEFAULT_MAX_REMOTE_DAYS_PER_WEEK;
    const maxRemoteDaysPerMonth = input.maxRemoteDaysPerMonth ?? DEFAULT_MAX_REMOTE_DAYS_PER_MONTH;
    const policyVersion = input.policyVersion ?? String(policyYear);

    const allUsers = await this.store.listUsers();
    const employees = allUsers.filter(
      (u) =>
        u.companyId === input.companyId &&
        u.role !== "superuser" &&
        (u.employmentState == null || u.employmentState === "active" || u.employmentState === "hr_onboarding")
    );

    const company = await this.store.getCompanySettings(input.companyId);
    const [roles, costCenters] = await Promise.all([this.store.listRoles(), this.store.listCostCenters()]);
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const ccById = new Map(costCenters.map((c) => [c.id, c]));

    const result: GenerateAllContractsResult = {
      companyId: input.companyId,
      dryRun: Boolean(input.dryRun),
      policyYear,
      maxRemoteDaysPerWeek,
      maxRemoteDaysPerMonth,
      employeesConsidered: employees.length,
      employment: { created: 0, skipped: 0, errors: 0 },
      remoteWorking: { created: 0, skipped: 0, errors: 0 },
      samples: [],
      errorDetails: []
    };

    this.log.log(
      `[generate-all] company=${input.companyId} employees=${employees.length} dryRun=${result.dryRun} force=${Boolean(input.force)}`
    );

    for (const user of employees) {
      const cc = user.costCenterId ? ccById.get(user.costCenterId) : undefined;
      const roleTitle = user.roleId ? roleById.get(user.roleId)?.name : undefined;
      const sample: GenerateAllContractsResult["samples"][0] = {
        userId: user.id,
        fullName: user.fullName
      };

      try {
        const emp = await this.ensureEmploymentContract(input, user, company, {
          roleTitle,
          costCenterCode: cc?.code,
          costCenterName: cc?.name,
          dryRun: result.dryRun,
          force: input.force
        });
        if (emp.skipped) {
          result.employment.skipped += 1;
        } else if (emp.created) {
          result.employment.created += 1;
        }
        sample.employmentContractId = emp.contractId;
        sample.employmentDocumentId = emp.documentId;
      } catch (e) {
        result.employment.errors += 1;
        const msg = `employment ${user.id}: ${e instanceof Error ? e.message : String(e)}`;
        result.errorDetails.push(msg);
        this.log.warn(msg);
      }

      try {
        const rem = await this.ensureRemoteWorkingContract(input, user, company, {
          roleTitle,
          costCenterCode: cc?.code,
          costCenterName: cc?.name,
          policyYear,
          policyVersion,
          maxRemoteDaysPerWeek,
          maxRemoteDaysPerMonth,
          dryRun: result.dryRun,
          force: input.force
        });
        if (rem.skipped) {
          result.remoteWorking.skipped += 1;
        } else if (rem.created) {
          result.remoteWorking.created += 1;
        }
        sample.remoteContractId = rem.contractId;
        sample.remoteDocumentId = rem.documentId;
        sample.smartworkingAgreementId = rem.agreementId;
      } catch (e) {
        result.remoteWorking.errors += 1;
        const msg = `remote ${user.id}: ${e instanceof Error ? e.message : String(e)}`;
        result.errorDetails.push(msg);
        this.log.warn(msg);
      }

      if (result.samples.length < 5) {
        result.samples.push(sample);
      }
    }

    this.log.log(
      `[generate-all] done employment +${result.employment.created} ~${result.employment.skipped} !${result.employment.errors} remote +${result.remoteWorking.created} ~${result.remoteWorking.skipped} !${result.remoteWorking.errors}`
    );

    return result;
  }

  private async ensureEmploymentContract(
    input: GenerateAllContractsInput,
    user: User,
    company: Awaited<ReturnType<HrDataStore["getCompanySettings"]>>,
    ctx: {
      roleTitle?: string;
      costCenterCode?: string;
      costCenterName?: string;
      dryRun: boolean;
      force?: boolean;
    }
  ): Promise<{ created: boolean; skipped: boolean; contractId?: string; documentId?: string }> {
    const batchKey = batchKeyFor(user.id, "employment");
    const existing = await this.findRegistryRow(input.companyId, batchKey);
    if (existing && !input.force) {
      return {
        created: false,
        skipped: true,
        contractId: existing.hr_standard_contract_id ?? undefined,
        documentId: existing.document_id ?? undefined
      };
    }

    const party = buildPartyFromUser(user, company, {
      roleTitle: ctx.roleTitle,
      costCenterCode: ctx.costCenterCode,
      costCenterName: ctx.costCenterName,
      contractKind: "employment"
    });
    const blocks = employmentBlocksForParty(party);
    const title = employmentContractTitle(user);

    if (ctx.dryRun) {
      return { created: true, skipped: false };
    }

    const contract = await this.contracts.create({
      companyId: input.companyId,
      title,
      party: party as unknown as Record<string, unknown>,
      blocks: blocks as unknown[],
      createdByUserId: input.actorUserId
    });

    const documentId = await this.uploadContractPdf({
      contract,
      party,
      blocks,
      documentTitle: title,
      subtitle: "Contratto di lavoro",
      userId: user.id,
      uploadedBy: input.actorUserId
    });

    const updated = await this.contracts.update(input.companyId, contract.id, {
      status: "exported",
      lastExportedDocumentId: documentId
    });

    await this.upsertRegistry({
      companyId: input.companyId,
      userId: user.id,
      contractKind: "employment",
      batchKey,
      hrStandardContractId: updated.id,
      documentId,
      metadata: { title, templateKey: "indeterminato" }
    });

    return { created: true, skipped: false, contractId: updated.id, documentId };
  }

  private async ensureRemoteWorkingContract(
    input: GenerateAllContractsInput,
    user: User,
    company: Awaited<ReturnType<HrDataStore["getCompanySettings"]>>,
    ctx: {
      roleTitle?: string;
      costCenterCode?: string;
      costCenterName?: string;
      policyYear: number;
      policyVersion: string;
      maxRemoteDaysPerWeek: number;
      maxRemoteDaysPerMonth: number;
      dryRun: boolean;
      force?: boolean;
    }
  ): Promise<{
    created: boolean;
    skipped: boolean;
    contractId?: string;
    documentId?: string;
    agreementId?: string;
  }> {
    const batchKey = batchKeyFor(user.id, "remote_working", ctx.policyYear);
    const existing = await this.findRegistryRow(input.companyId, batchKey);
    if (existing && !input.force) {
      return {
        created: false,
        skipped: true,
        contractId: existing.hr_standard_contract_id ?? undefined,
        documentId: existing.document_id ?? undefined,
        agreementId: existing.smartworking_agreement_id ?? undefined
      };
    }

    const party = buildPartyFromUser(user, company, {
      roleTitle: ctx.roleTitle,
      costCenterCode: ctx.costCenterCode,
      costCenterName: ctx.costCenterName,
      contractKind: "remote_working",
      maxRemoteDaysPerWeek: ctx.maxRemoteDaysPerWeek,
      maxRemoteDaysPerMonth: ctx.maxRemoteDaysPerMonth,
      policyVersion: ctx.policyVersion
    });
    const blocks = remoteWorkingBlocksForParty(party);
    const title = remoteWorkingContractTitle(user, ctx.policyYear);

    if (ctx.dryRun) {
      return { created: true, skipped: false };
    }

    const contract = await this.contracts.create({
      companyId: input.companyId,
      title,
      party: party as unknown as Record<string, unknown>,
      blocks: blocks as unknown[],
      createdByUserId: input.actorUserId
    });

    const documentId = await this.uploadContractPdf({
      contract,
      party,
      blocks,
      documentTitle: title,
      subtitle: "Accordo lavoro agile",
      userId: user.id,
      uploadedBy: input.actorUserId,
      metaExtra: [
        `Giorni max/settimana: ${ctx.maxRemoteDaysPerWeek}`,
        `Giorni max/mese: ${ctx.maxRemoteDaysPerMonth}`,
        `Policy: ${ctx.policyVersion}`
      ]
    });

    const updated = await this.contracts.update(input.companyId, contract.id, {
      status: "exported",
      lastExportedDocumentId: documentId
    });

    const agreementId = await this.upsertSmartworkingAgreement({
      companyId: input.companyId,
      userId: user.id,
      actorUserId: input.actorUserId,
      policyVersion: ctx.policyVersion,
      policyYear: ctx.policyYear,
      documentId,
      maxRemoteDaysPerWeek: ctx.maxRemoteDaysPerWeek,
      maxRemoteDaysPerMonth: ctx.maxRemoteDaysPerMonth
    });

    await this.upsertRegistry({
      companyId: input.companyId,
      userId: user.id,
      contractKind: "remote_working",
      batchKey,
      hrStandardContractId: updated.id,
      documentId,
      smartworkingAgreementId: agreementId,
      metadata: {
        maxRemoteDaysPerWeek: ctx.maxRemoteDaysPerWeek,
        maxRemoteDaysPerMonth: ctx.maxRemoteDaysPerMonth,
        policyVersion: ctx.policyVersion,
        policyYear: ctx.policyYear
      }
    });

    await this.remoteWorkPolicy.syncFromContract(input.companyId, updated);

    return {
      created: true,
      skipped: false,
      contractId: updated.id,
      documentId,
      agreementId
    };
  }

  private async uploadContractPdf(input: {
    contract: HrStandardContractDto;
    party: ContractPartyPayload;
    blocks: ContractBlockPayload[];
    documentTitle: string;
    subtitle: string;
    userId: string;
    uploadedBy: string;
    metaExtra?: string[];
  }): Promise<string> {
    const metaLines = [
      `Riferimento contratto: ${input.contract.id}`,
      input.party.fiscalCode ? `CF: ${input.party.fiscalCode}` : "",
      input.party.costCenterCode || input.party.costCenterName
        ? `CDC: ${[input.party.costCenterCode, input.party.costCenterName].filter(Boolean).join(" — ")}`
        : "",
      ...(input.metaExtra ?? [])
    ].filter(Boolean);

    const buffer = await renderSynapseContractPdf({
      documentTitle: input.documentTitle,
      subtitle: input.subtitle,
      metaLines,
      blocks: input.blocks.map((b) => ({ title: b.title, content: b.content, key: b.key })),
      footerNote: "Documento generato da Nexa HR · SYNAPSE"
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

  private async findRegistryRow(companyId: string, batchKey: string): Promise<GeneratedRegistryRow | null> {
    const sb = this.store.getServiceRoleClient();
    const { data, error } = await sb
      .from("hr_generated_contracts")
      .select("id, batch_key, hr_standard_contract_id, smartworking_agreement_id, document_id")
      .eq("company_id", companyId)
      .eq("batch_key", batchKey)
      .maybeSingle();

    if (error) {
      if (this.isMissingRegistryTable(error)) {
        return this.findLegacyRegistry(companyId, batchKey);
      }
      throw new InternalServerErrorException(`Registry contratti: ${error.message}`);
    }
    return data ? (data as GeneratedRegistryRow) : null;
  }

  private async findLegacyRegistry(companyId: string, batchKey: string): Promise<GeneratedRegistryRow | null> {
    const kind = batchKey.includes(":remote_working:") ? "remote_working" : "employment";
    const userId = batchKey.split(":")[0];
    const sb = this.store.getServiceRoleClient();
    const { data, error } = await sb
      .from("hr_standard_contracts")
      .select("id, last_exported_document_id, party")
      .eq("company_id", companyId)
      .contains("party", { employeeUserId: userId, contractKind: kind, generationSource: "batch_generate_v1" })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    const row = data as { id: string; last_exported_document_id: string | null };
    return {
      id: row.id,
      batch_key: batchKey,
      hr_standard_contract_id: row.id,
      smartworking_agreement_id: null,
      document_id: row.last_exported_document_id
    };
  }

  private isMissingRegistryTable(error: { message?: string; code?: string }): boolean {
    const m = String(error.message ?? "").toLowerCase();
    return (
      error.code === "42P01" ||
      m.includes("hr_generated_contracts") ||
      m.includes("does not exist") ||
      m.includes("schema cache")
    );
  }

  private async upsertRegistry(input: {
    companyId: string;
    userId: string;
    contractKind: "employment" | "remote_working";
    batchKey: string;
    hrStandardContractId: string;
    documentId: string;
    smartworkingAgreementId?: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const sb = this.store.getServiceRoleClient();
    const now = new Date().toISOString();
    const row = {
      company_id: input.companyId,
      user_id: input.userId,
      contract_kind: input.contractKind,
      batch_key: input.batchKey,
      hr_standard_contract_id: input.hrStandardContractId,
      smartworking_agreement_id: input.smartworkingAgreementId ?? null,
      document_id: input.documentId,
      metadata: input.metadata,
      updated_at: now
    };
    const { error } = await sb.from("hr_generated_contracts").upsert(row, { onConflict: "company_id,batch_key" });
    if (error && !this.isMissingRegistryTable(error)) {
      throw new InternalServerErrorException(`Salvataggio registry: ${error.message}`);
    }
  }

  private async upsertSmartworkingAgreement(input: {
    companyId: string;
    userId: string;
    actorUserId: string;
    policyVersion: string;
    policyYear: number;
    documentId: string;
    maxRemoteDaysPerWeek: number;
    maxRemoteDaysPerMonth: number;
  }): Promise<string> {
    const sb = this.store.getServiceRoleClient();
    const validFrom = `${input.policyYear}-01-01`;
    const validTo = `${input.policyYear}-12-31`;
    const now = new Date().toISOString();
    const note = JSON.stringify({
      maxRemoteDaysPerWeek: input.maxRemoteDaysPerWeek,
      maxRemoteDaysPerMonth: input.maxRemoteDaysPerMonth,
      source: "batch_generate_v1"
    });

    const { data: existing } = await sb
      .from("smartworking_agreements")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("user_id", input.userId)
      .eq("valid_from", validFrom)
      .eq("valid_to", validTo)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await sb
        .from("smartworking_agreements")
        .update({
          policy_version: input.policyVersion,
          document_id: input.documentId,
          note,
          status: "active",
          allowed_days_per_week: input.maxRemoteDaysPerWeek,
          allowed_days_per_month: input.maxRemoteDaysPerMonth,
          updated_at: now
        })
        .eq("id", String(existing.id));
      if (error) {
        throw new InternalServerErrorException(`Aggiornamento accordo SW: ${error.message}`);
      }
      return String(existing.id);
    }

    const id = randomUUID();
    const { error } = await sb.from("smartworking_agreements").insert({
      id,
      company_id: input.companyId,
      user_id: input.userId,
      policy_version: input.policyVersion,
      valid_from: validFrom,
      valid_to: validTo,
      status: "active",
      document_id: input.documentId,
      note,
      allowed_days_per_week: input.maxRemoteDaysPerWeek,
      allowed_days_per_month: input.maxRemoteDaysPerMonth,
      created_by_user_id: input.actorUserId,
      created_at: now,
      updated_at: now
    });
    if (error) {
      throw new InternalServerErrorException(`Creazione accordo SW: ${error.message}`);
    }
    return id;
  }
}
