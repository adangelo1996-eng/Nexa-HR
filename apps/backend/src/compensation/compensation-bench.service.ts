import { BadRequestException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { HrDataStore } from "../platform/hr-data.store";
import { RecruitingService } from "../recruiting/recruiting.service";
import type { CompensationBenchEstimateDto } from "./compensation-bench.dto";

const SCHEMA = "ai_compensation_benchmark_v1";

@Injectable()
export class CompensationBenchService {
  constructor(
    private readonly store: HrDataStore,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly audit: AiAuditService,
    private readonly recruiting: RecruitingService
  ) {}

  private heuristicRalAnnual(dto: CompensationBenchEstimateDto): { low: number; med: number; high: number; notes: string } {
    let med = 38_000 + Math.min(dto.seniorityYears, 20) * 1_800;
    const loc = dto.location.toLowerCase();
    if (/milano|roma|torino|bologna|genova|firenze|padova|monza|varese/i.test(loc)) {
      med += 6_000;
    }
    return {
      low: Math.round(med * 0.88),
      med: Math.round(med),
      high: Math.round(med * 1.15),
      notes:
        "Stima offline (LLM non attivo o non disponibile): fascia generica Italia su ruolo e anzianità dichiarati, senza fonti di mercato verificate."
    };
  }

  async estimate(
    auth: AuthContext,
    dto: CompensationBenchEstimateDto
  ): Promise<{
    ralLowEur: number;
    ralMedianEur: number;
    ralHighEur: number;
    notesIt: string;
    roleResolved: string;
    llm: { active: boolean; refineApplied: boolean };
  }> {
    const me = await this.store.getUser(auth.userId);
    const companyId = (me.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new BadRequestException("Azienda non disponibile");
    }
    let roleTitle = dto.roleTitleManual?.trim() || "";
    if (dto.roleSource === "recruit") {
      const pid = dto.recruitPositionId?.trim();
      if (!pid) {
        throw new BadRequestException("Selezionare una posizione aperta.");
      }
      const rows = await this.recruiting.listPositions(companyId);
      const hit = rows.find((r) => r.id === pid);
      if (!hit) {
        throw new BadRequestException("Posizione recruiting non trovata.");
      }
      roleTitle = hit.title?.trim() || "Ruolo da selezione";
    } else if (dto.roleSource === "org") {
      if (!me.roleId) {
        throw new BadRequestException("Nessun ruolo organizzativo associato al profilo.");
      }
      const roles = await this.store.listRoles();
      const r = roles.find((x) => x.id === me.roleId);
      roleTitle = r?.name?.trim() || "Ruolo organizzativo";
    }
    if (!roleTitle) {
      throw new BadRequestException("Indicare il ruolo (manuale, da selezione o da organigramma).");
    }

    const facts = {
      roleTitle,
      location: dto.location.trim(),
      seniorityYears: dto.seniorityYears,
      roleSource: dto.roleSource,
      disclaimer:
        "Benchmark orientativo: non è consulenza retributiva né offerta vincolante. Confrontare con policy interne e contrattualistica."
    };
    const seed = `RAL annua di mercato stimata in Italia per ${roleTitle}, area ${dto.location}, anzianità professionale indicativa ${dto.seniorityYears} anni. Fornire fascia bassa/mediana/alta in EUR interi e una breve nota metodologica.`;

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
      const num = (k: string): number | null => {
        const v = env?.[k];
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? Math.round(n) : null;
      };
      const low = num("ralLowEur");
      const med = num("ralMedianEur");
      const high = num("ralHighEur");
      const notesIt = typeof env?.notesIt === "string" ? env.notesIt : "";
      await this.audit.append({
        companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "compensation_benchmark",
        schemaVersion: SCHEMA,
        sessionId,
        inputForFingerprint: { roleSource: dto.roleSource, location: dto.location, seniorityYears: dto.seniorityYears },
        dataSources: ["compensation_bench"],
        responseSizeBytes: Buffer.byteLength(JSON.stringify(cleared), "utf8"),
        outcome: "ok"
      });
      if (low != null && med != null && high != null && med >= low && high >= med) {
        return {
          ralLowEur: low,
          ralMedianEur: med,
          ralHighEur: high,
          notesIt: notesIt || "Output modello strutturato.",
          roleResolved: roleTitle,
          llm: { active: this.openAi.isActive(), refineApplied }
        };
      }
    } finally {
      await this.gateway.endSession(sessionId);
    }
    const h = this.heuristicRalAnnual(dto);
    return {
      ralLowEur: h.low,
      ralMedianEur: h.med,
      ralHighEur: h.high,
      notesIt: `${h.notes} Ruolo considerato: ${roleTitle}.`,
      roleResolved: roleTitle,
      llm: { active: this.openAi.isActive(), refineApplied: false }
    };
  }
}
