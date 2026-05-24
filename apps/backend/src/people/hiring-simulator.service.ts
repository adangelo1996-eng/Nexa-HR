import { BadRequestException, Injectable } from "@nestjs/common";
import { calculateItalyCompanyCost, type CostCalculatorInput, type CostCalculatorResult } from "@payday/domain";
import type { AuthContext } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { HrDataStore } from "../platform/hr-data.store";
import type {
  HiringSimulatorAdviseDto,
  HiringSimulatorInputDto,
  HiringSimulatorSaveScenarioDto
} from "./hiring-simulator.dto";

const SCHEMA = "ai_hiring_simulator_advise_v1";

export type HiringSimulatorAdviseEnvelope = {
  advisorMessage: string;
  suggestedChips: string[];
  agevolazioniVerificate: Array<{
    code: string;
    label: string;
    applicable: boolean;
    rationale: string;
  }>;
  benefitSuggestions: Array<{
    key: string;
    label: string;
    monthlyEurosEstimate: number | null;
    rationale: string;
  }>;
  validationOk: boolean;
  validationNotes: string[];
};

@Injectable()
export class HiringSimulatorService {
  constructor(
    private readonly store: HrDataStore,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly audit: AiAuditService
  ) {}

  private async companyIdFor(auth: AuthContext): Promise<string> {
    const me = await this.store.getUser(auth.userId);
    const companyId = (me.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new BadRequestException("Azienda non disponibile");
    }
    return companyId;
  }

  private toDomainInput(dto: HiringSimulatorInputDto): CostCalculatorInput {
    const contractType = dto.contractType?.trim().toLowerCase() ?? "";
    return {
      mode: dto.mode,
      weeklyContractHours: dto.weeklyContractHours,
      weeklyFullTimeHours: dto.weeklyFullTimeHours,
      payMonthsPerYear: dto.payMonthsPerYear,
      annualGrossSalaryEuros: dto.annualGrossSalaryEuros,
      targetNetMonthlyEuros: dto.targetNetMonthlyEuros,
      agevolazioni: dto.agevolazioni,
      benefits: dto.benefits,
      ccnlCode: dto.ccnlCode?.trim() || undefined,
      ccnlLevel: dto.ccnlLevel?.trim() || undefined,
      contractFixedTerm: contractType.includes("determinato")
    };
  }

  compute(dto: HiringSimulatorInputDto): CostCalculatorResult {
    return calculateItalyCompanyCost(this.toDomainInput(dto));
  }

  private offlineAdvise(
    dto: HiringSimulatorAdviseDto,
    result: CostCalculatorResult
  ): HiringSimulatorAdviseEnvelope {
    const chips: string[] = [];
    if (dto.phase === "criteria") {
      chips.push("Verifica agevolazioni", "Aggiungi buoni pasto", "Valida costo annuo");
      if (!dto.ccnlCode?.trim()) {
        chips.push("Indica CCNL");
      }
      return {
        advisorMessage:
          "Completa CCNL, livello e mensilità prima di firmare. La stima usa aliquote indicative 2026: incrocia sempre con il consulente del lavoro.",
        suggestedChips: chips,
        agevolazioniVerificate: [],
        benefitSuggestions: [],
        validationOk: true,
        validationNotes: []
      };
    }
    if (dto.phase === "agevolazioni") {
      const checks = [
        {
          code: "female",
          label: "Donna",
          applicable: Boolean(dto.agevolazioni?.female),
          rationale: "Verificare requisiti de minimis e cumulo con altre agevolazioni."
        },
        {
          code: "under36",
          label: "Under 36",
          applicable: Boolean(dto.agevolazioni?.under36),
          rationale: "Controllare prima occupazione e massimali annuali."
        },
        {
          code: "south",
          label: "Mezzogiorno / ZES",
          applicable: Boolean(dto.agevolazioni?.southZes),
          rationale: "Sede effettiva e codici incentivi regionali."
        },
        {
          code: "naspi",
          label: "Percettore NASpI",
          applicable: Boolean(dto.agevolazioni?.naspi),
          rationale: "Compatibilità con decontribuzione e durata."
        },
        {
          code: "protected",
          label: "Categorie protette",
          applicable: Boolean(dto.agevolazioni?.protectedCategories),
          rationale: "Quota e convenzione con enti competenti."
        }
      ];
      return {
        advisorMessage:
          "Agevolazioni selezionate: conferma requisiti normativi e documentazione prima dell'assunzione. LLM non attivo: elenco indicativo offline.",
        suggestedChips: ["Applica welfare", "Rivedi RAL", "Valida simulazione"],
        agevolazioniVerificate: checks,
        benefitSuggestions: [],
        validationOk: true,
        validationNotes: []
      };
    }
    if (dto.phase === "benefits") {
      return {
        advisorMessage:
          "I benefit aumentano il costo azienda senza sempre impattare il netto in busta. Valuta tetto fringe benefit e policy interna.",
        suggestedChips: ["€ 150 buoni pasto", "€ 500 welfare annuo", "Smart working € 50/mese"],
        agevolazioniVerificate: [],
        benefitSuggestions: [
          {
            key: "meal_vouchers",
            label: "Buoni pasto",
            monthlyEurosEstimate: 150,
            rationale: "Voce esente entro limiti; costo datore spesso superiore al valore facciale."
          },
          {
            key: "welfare",
            label: "Welfare aziendale",
            monthlyEurosEstimate: 42,
            rationale: "Da piano welfare e budget annuo."
          }
        ],
        validationOk: true,
        validationNotes: []
      };
    }
    const costOk = result.monthly.companyCostEuros > 0 && result.monthly.netEuros > 0;
    return {
      advisorMessage: costOk
        ? `Costo azienda stimato ${result.monthly.companyCostEuros.toFixed(0)} €/mese (netto ~${result.monthly.netEuros.toFixed(0)} €). Validazione offline: confronta con policy retributiva.`
        : "Input incompleti: imposta RAL o netto target.",
      suggestedChips: ["Salva scenario", "Esporta per HR", "Ricalcola con part-time"],
      agevolazioniVerificate: [],
      benefitSuggestions: [],
      validationOk: costOk,
      validationNotes: result.warnings.slice(0, 6)
    };
  }

  async advise(
    auth: AuthContext,
    dto: HiringSimulatorAdviseDto
  ): Promise<{
    advise: HiringSimulatorAdviseEnvelope;
    compute: CostCalculatorResult;
    llm: { active: boolean; refineApplied: boolean };
  }> {
    const companyId = await this.companyIdFor(auth);
    const compute = this.compute(dto);
    const facts = {
      phase: dto.phase,
      contract: {
        mode: dto.mode,
        payMonthsPerYear: dto.payMonthsPerYear,
        weeklyContractHours: dto.weeklyContractHours,
        weeklyFullTimeHours: dto.weeklyFullTimeHours ?? 40,
        ccnlCode: dto.ccnlCode?.trim() || null,
        ccnlLevel: dto.ccnlLevel?.trim() || null,
        contractType: dto.contractType?.trim() || null,
        roleTitle: dto.roleTitle?.trim() || null,
        location: dto.location?.trim() || null
      },
      agevolazioni: dto.agevolazioni ?? {},
      benefits: dto.benefits ?? {},
      resultSummary: {
        netMonthly: compute.monthly.netEuros,
        grossMonthly: compute.monthly.grossEuros,
        companyCostMonthly: compute.monthly.companyCostEuros,
        companyCostAnnual: compute.annual.companyCostEuros,
        ralAnnual: compute.annual.ralEuros
      },
      warnings: compute.warnings,
      disclaimer:
        "Simulazione indicativa Nexa HR. Non è parere legale né consulenza del lavoro vincolante. Verificare CCNL, INPS, detrazioni e de minimis."
    };
    const seed =
      dto.userQuestion?.trim() ||
      `Fase consulente: ${dto.phase}. Guida HR su criteri assunzione, agevolazioni e benefit in Italia.`;

    const sessionId = (await this.gateway.beginSession(companyId, auth.userId)).sessionId;
    let refineApplied = false;
    try {
      const wrapped = { envelope: { seed, facts } };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, SCHEMA);
      let modelJson: unknown = pseudo.pseudonymized;
      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA);
        if (refined.ok) {
          modelJson = refined.data;
          refineApplied = true;
        }
      }
      const cleared = await this.gateway.fromModelResponse(sessionId, modelJson);
      const env = (cleared as { envelope?: Record<string, unknown> })?.envelope;
      const str = (k: string): string => (typeof env?.[k] === "string" ? String(env[k]) : "");
      const strArr = (k: string): string[] =>
        Array.isArray(env?.[k]) ? (env![k] as unknown[]).map((x) => String(x)).filter(Boolean) : [];
      const agevolazioniVerificate = Array.isArray(env?.agevolazioniVerificate)
        ? (env!.agevolazioniVerificate as unknown[])
            .map((row) => {
              const o = row as Record<string, unknown>;
              return {
                code: String(o.code ?? ""),
                label: String(o.label ?? ""),
                applicable: Boolean(o.applicable),
                rationale: String(o.rationale ?? "")
              };
            })
            .filter((r) => r.code && r.label)
        : [];
      const benefitSuggestions = Array.isArray(env?.benefitSuggestions)
        ? (env!.benefitSuggestions as unknown[])
            .map((row) => {
              const o = row as Record<string, unknown>;
              const est = o.monthlyEurosEstimate;
              return {
                key: String(o.key ?? ""),
                label: String(o.label ?? ""),
                monthlyEurosEstimate:
                  typeof est === "number" && Number.isFinite(est) ? Math.round(est) : null,
                rationale: String(o.rationale ?? "")
              };
            })
            .filter((r) => r.key && r.label)
        : [];

      const advisorMessage = str("advisorMessage");
      if (advisorMessage) {
        const advise: HiringSimulatorAdviseEnvelope = {
          advisorMessage,
          suggestedChips: strArr("suggestedChips").slice(0, 8),
          agevolazioniVerificate,
          benefitSuggestions,
          validationOk: env?.validationOk !== false,
          validationNotes: strArr("validationNotes").slice(0, 8)
        };
        await this.audit.append({
          companyId,
          userId: auth.userId,
          roleSnapshot: auth.role,
          feature: "hiring_simulator_advise",
          schemaVersion: SCHEMA,
          sessionId,
          inputForFingerprint: { phase: dto.phase },
          dataSources: ["hiring_simulator"],
          responseSizeBytes: Buffer.byteLength(JSON.stringify(cleared), "utf8"),
          outcome: "ok"
        });
        return {
          advise,
          compute,
          llm: { active: this.openAi.isActive(), refineApplied }
        };
      }
    } finally {
      await this.gateway.endSession(sessionId);
    }

    return {
      advise: this.offlineAdvise(dto, compute),
      compute,
      llm: { active: this.openAi.isActive(), refineApplied: false }
    };
  }

  async listScenarios(auth: AuthContext) {
    const companyId = await this.companyIdFor(auth);
    return this.store.listHiringSimulationScenarios(companyId);
  }

  async saveScenario(auth: AuthContext, dto: HiringSimulatorSaveScenarioDto) {
    const companyId = await this.companyIdFor(auth);
    const { id, ...input } = dto;
    return this.store.saveHiringSimulationScenario(companyId, auth.userId, {
      id,
      name: dto.name,
      payloadJson: input as unknown as Record<string, unknown>
    });
  }

  async deleteScenario(auth: AuthContext, scenarioId: string): Promise<void> {
    const companyId = await this.companyIdFor(auth);
    await this.store.deleteHiringSimulationScenario(companyId, scenarioId);
  }
}
