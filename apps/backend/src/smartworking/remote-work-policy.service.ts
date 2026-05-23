import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import type { HrStandardContractDto } from "../hr-contracts/hr-contracts.service";
import { HrDataStore } from "../platform/hr-data.store";
import {
  extractPdfTextForRemotePolicy,
  parseRemoteWorkLimitsFromBlocks,
  parseRemoteWorkLimitsFromParty,
  parseRemoteWorkLimitsFromText,
  resolveRemoteWorkLimits,
  type ParsedRemoteWorkLimits
} from "./remote-work-limits.parse";

export interface EffectiveRemoteWorkLimits {
  allowedRemoteDaysPerWeek: number;
  allowedRemoteDaysPerMonth: number;
  allowedRemoteDaysPerYear: number | null;
  policyYear: number;
  source: "contract" | "vault" | "default";
  sourceContractId?: string;
  parsedFromDocumentAt?: string;
}

interface PolicyRow {
  max_remote_days_per_week: number | null;
  max_remote_days_per_month: number | null;
  policy_year: number;
  source_contract_id: string | null;
  parsed_from_document_at: string | null;
}

const DEFAULT_WEEK = 2;
const DEFAULT_MONTH = 8;

@Injectable()
export class RemoteWorkPolicyService {
  private readonly log = new Logger(RemoteWorkPolicyService.name);

  constructor(
    @Inject(forwardRef(() => HrDataStore))
    private readonly store: HrDataStore
  ) {}

  private sb() {
    return this.store.getServiceRoleClient();
  }

  private currentPolicyYear(): number {
    return new Date().getFullYear();
  }

  private partyUserId(party: Record<string, unknown>): string | null {
    const id = party.employeeUserId ?? party.userId ?? party.employeeId;
    return id != null && String(id).trim() ? String(id).trim() : null;
  }

  private policyYearFromParty(party: Record<string, unknown>): number {
    const y = party.smartWorkingRenewalYear ?? party.policyYear;
    const n = typeof y === "number" ? y : Number.parseInt(String(y ?? ""), 10);
    return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : this.currentPolicyYear();
  }

  /** Limiti effettivi per validazione richieste SW (fallback costanti legacy). */
  async getEffectiveLimitsForUser(userId: string, monthIso?: string): Promise<EffectiveRemoteWorkLimits> {
    const year =
      monthIso && monthIso.length >= 4
        ? Number.parseInt(monthIso.slice(0, 4), 10)
        : this.currentPolicyYear();
    const user = await this.store.getUser(userId);
    const sb = this.sb();
    const { data } = await sb
      .from("hr_remote_work_policy")
      .select(
        "max_remote_days_per_week, max_remote_days_per_month, policy_year, source_contract_id, parsed_from_document_at"
      )
      .eq("company_id", user.companyId)
      .eq("user_id", userId)
      .eq("policy_year", year)
      .maybeSingle();

    if (data) {
      const row = data as PolicyRow;
      return {
        allowedRemoteDaysPerWeek: row.max_remote_days_per_week ?? DEFAULT_WEEK,
        allowedRemoteDaysPerMonth: row.max_remote_days_per_month ?? DEFAULT_MONTH,
        allowedRemoteDaysPerYear: null,
        policyYear: row.policy_year,
        source: row.source_contract_id ? "contract" : "vault",
        sourceContractId: row.source_contract_id ?? undefined,
        parsedFromDocumentAt: row.parsed_from_document_at ?? undefined
      };
    }

    return {
      allowedRemoteDaysPerWeek: DEFAULT_WEEK,
      allowedRemoteDaysPerMonth: DEFAULT_MONTH,
      allowedRemoteDaysPerYear: null,
      policyYear: year,
      source: "default"
    };
  }

  async upsertFromParsed(
    companyId: string,
    userId: string,
    policyYear: number,
    parsed: ParsedRemoteWorkLimits,
    meta: {
      sourceContractId?: string | null;
      parsedFromDocumentAt?: string | null;
      vaultDocumentId?: string | null;
    }
  ): Promise<void> {
    const { week, month } = resolveRemoteWorkLimits(parsed);
    const now = new Date().toISOString();
    const sb = this.sb();
    const { error } = await sb.from("hr_remote_work_policy").upsert(
      {
        company_id: companyId,
        user_id: userId,
        policy_year: policyYear,
        max_remote_days_per_week: week,
        max_remote_days_per_month: month,
        source_contract_id: meta.sourceContractId ?? null,
        parsed_from_document_at: meta.parsedFromDocumentAt ?? now,
        updated_at: now
      },
      { onConflict: "company_id,user_id,policy_year" }
    );
    if (error) {
      this.log.warn(`hr_remote_work_policy upsert failed: ${error.message}`);
      return;
    }

    await this.mirrorLimitsToActiveAgreement(companyId, userId, week, month);
  }

  /** Dopo create/update contratto o rigenerazione batch. */
  async syncFromContract(companyId: string, contract: HrStandardContractDto): Promise<void> {
    const userId = this.partyUserId(contract.party);
    if (!userId) {
      return;
    }
    const blocks = Array.isArray(contract.blocks) ? contract.blocks : [];
    const fromBlocks = parseRemoteWorkLimitsFromBlocks(blocks);
    const fromParty = parseRemoteWorkLimitsFromParty(contract.party);
    const parsed: ParsedRemoteWorkLimits = {
      maxRemoteDaysPerWeek: fromBlocks.maxRemoteDaysPerWeek ?? fromParty.maxRemoteDaysPerWeek ?? null,
      maxRemoteDaysPerMonth: fromBlocks.maxRemoteDaysPerMonth ?? fromParty.maxRemoteDaysPerMonth ?? null,
      maxRemoteDaysPerYear: fromBlocks.maxRemoteDaysPerYear ?? fromParty.maxRemoteDaysPerYear ?? null,
      extract: { ...fromBlocks.extract, party: fromParty }
    };
    const policyYear = this.policyYearFromParty(contract.party);
    await this.upsertFromParsed(companyId, userId, policyYear, parsed, {
      sourceContractId: contract.id,
      parsedFromDocumentAt: new Date().toISOString()
    });
  }

  /** Upload vault `remote_working` o PDF allegato accordo. */
  async syncFromVaultDocument(
    companyId: string,
    userId: string,
    input: { bodyBase64?: string; mimeType?: string; title?: string; contractId?: string }
  ): Promise<void> {
    let parsed: ParsedRemoteWorkLimits = {
      maxRemoteDaysPerWeek: null,
      maxRemoteDaysPerMonth: null,
      extract: { vaultTitle: input.title ?? null }
    };

    if (input.bodyBase64?.trim()) {
      const buf = Buffer.from(input.bodyBase64, "base64");
      const mime = (input.mimeType ?? "").toLowerCase();
      if (mime.includes("pdf") || input.title?.toLowerCase().endsWith(".pdf")) {
        const text = await extractPdfTextForRemotePolicy(buf);
        const fromText = parseRemoteWorkLimitsFromText(text);
        parsed = {
          maxRemoteDaysPerWeek: fromText.maxRemoteDaysPerWeek ?? null,
          maxRemoteDaysPerMonth: fromText.maxRemoteDaysPerMonth ?? null,
          maxRemoteDaysPerYear: fromText.maxRemoteDaysPerYear ?? null,
          extract: { ...parsed.extract, pdfTextLength: text.length }
        };
      }
    }

    if (input.contractId) {
      try {
        const sb = this.sb();
        const { data } = await sb
          .from("hr_standard_contracts")
          .select("blocks, party")
          .eq("id", input.contractId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (data) {
          const blocks = Array.isArray((data as { blocks?: unknown }).blocks)
            ? ((data as { blocks: unknown[] }).blocks as unknown[])
            : [];
          const fromBlocks = parseRemoteWorkLimitsFromBlocks(blocks);
          parsed = {
            maxRemoteDaysPerWeek: fromBlocks.maxRemoteDaysPerWeek ?? parsed.maxRemoteDaysPerWeek,
            maxRemoteDaysPerMonth: fromBlocks.maxRemoteDaysPerMonth ?? parsed.maxRemoteDaysPerMonth,
            extract: { ...parsed.extract, ...fromBlocks.extract }
          };
        }
      } catch {
        /* best effort */
      }
    }

    const policyYear = this.currentPolicyYear();
    await this.upsertFromParsed(companyId, userId, policyYear, parsed, {
      sourceContractId: input.contractId ?? null,
      parsedFromDocumentAt: new Date().toISOString()
    });
  }

  /** Propaga limiti su accordo annuale (colonne opzionali se presenti in DB). */
  async mirrorLimitsToActiveAgreement(
    companyId: string,
    userId: string,
    week: number,
    month: number
  ): Promise<void> {
    const sb = this.sb();
    const { data } = await sb
      .from("smartworking_agreements")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("valid_to", { ascending: false })
      .limit(1);
    const agreementId = (data?.[0] as { id?: string } | undefined)?.id;
    if (!agreementId) return;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    patch.allowed_days_per_week = week;
    patch.allowed_days_per_month = month;

    const { error } = await sb.from("smartworking_agreements").update(patch).eq("id", agreementId);
    if (error && !error.message.includes("column")) {
      this.log.debug(`smartworking_agreements mirror skipped: ${error.message}`);
    }
  }
}
