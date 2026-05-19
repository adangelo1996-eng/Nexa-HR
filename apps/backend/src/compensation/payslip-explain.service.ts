import { BadRequestException, Injectable } from "@nestjs/common";
import type { Payslip, User } from "@payday/domain";
import type { AuthContext } from "../platform/auth";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
const SCHEMA = "ai_payslip_explain_v1";

@Injectable()
export class PayslipExplainService {
  constructor(
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly audit: AiAuditService
  ) {}

  /**
   * Spiegazione LLM per un cedolino (stesso `Payslip` già reso visibile al requester).
   * Controlli accesso eseguiti dal `PayrollController` prima di chiamare.
   */
  async explainForPayslip(
    auth: AuthContext,
    payslip: Payslip,
    employee: User
  ): Promise<{
    period: string;
    residenceSummary: string;
    addizionaliFromLines: Array<{ code: string; description: string; amount: number }>;
    envelope: Record<string, unknown> | null;
    llm: { active: boolean; refineApplied: boolean };
  }> {
    const comune = (employee.taxMunicipalityIt || "").trim();
    const regione = (employee.taxRegion || "").trim();
    const domUguale = employee.taxDomicileSameAsResidence !== false;
    const domCom = (employee.taxDomicileMunicipalityIt || "").trim();
    const residenceSummary = [
      comune || regione
        ? `Residenza fiscale (comune/area): ${[comune, regione].filter(Boolean).join(" · ")}`
        : "Residenza fiscale: non indicata in anagrafica",
      !domUguale && domCom
        ? `Domicilio fiscale dichiarato: ${domCom} (diverso dalla residenza).`
        : domUguale
          ? "Domicilio fiscale: allineato alla residenza (in base a impostazione profilo)."
          : null
    ]
      .filter(Boolean)
      .join(" ");

    const addizRe = /addiz|add\.|irpef.*reg|irpef.*com|reg\.|municip|regione|comunale|provinc|add_i/i;
    const addizionaliFromLines = (payslip.lines || []).filter(
      (line) => addizRe.test(line.code) || addizRe.test(line.description)
    );

    const companyId = (employee.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new BadRequestException("Azienda non disponibile");
    }

    const sessionId = (await this.gateway.beginSession(companyId, auth.userId)).sessionId;
    let refineApplied = false;
    const lineSummary = (payslip.lines || [])
      .slice(0, 40)
      .map((l) => `${l.code}: ${l.description} = ${l.amount}`)
      .join("; ");
    const facts = {
      period: payslip.period,
      grossSalary: payslip.grossSalary,
      netSalary: payslip.netSalary,
      lines: (payslip.lines || []).slice(0, 40).map((l) => ({
        code: l.code,
        description: l.description,
        amount: l.amount
      })),
      itProfile: {
        residenceLine: residenceSummary,
        ccnlCode: employee.ccnlCode ?? null,
        ccnlLevel: employee.ccnlLevel ?? null
      },
      parsedLinesDigest: lineSummary,
      disclaimer:
        "Spiegazione semplice a scopo informativo: non è consulenza fiscale. Per dettagli ufficiali usare modelli, CUD e commercialista."
    };
    const seed =
      "Spiega in italiano chiaro e completo il cedolino del periodo indicato. " +
      "1) Perché ci sono queste trattenute (IRPEF, INPS, addizionali, altre voci) in relazione a lordo/netto. " +
      "2) Come leggere il cedolino: cosa guardare per primi, differenza competenze/trattenute, netto in busta. " +
      "3) Analisi dettagliata delle righe parse fornite in facts.lines (codice, descrizione, importo) senza inventare voci. " +
      "Collega residenza/domicilio fiscale alle addizionali solo se plausibile; altrimenti invita a verificare in CUD. " +
      "Tono rassicurante, non consulenza legale.";

    const wrapped = { envelope: { seed, facts } };
    let envelope: Record<string, unknown> | null = null;
    try {
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
      if (env && typeof env === "object") {
        envelope = env as Record<string, unknown>;
      }
      await this.audit.append({
        companyId,
        userId: auth.userId,
        roleSnapshot: auth.role,
        feature: "payslip_explain",
        schemaVersion: SCHEMA,
        sessionId,
        inputForFingerprint: { payslipId: payslip.id, period: payslip.period },
        dataSources: ["payslips", "user_payroll_profile"],
        responseSizeBytes: Buffer.byteLength(JSON.stringify(cleared), "utf8"),
        outcome: "ok"
      });
    } finally {
      await this.gateway.endSession(sessionId);
    }

    return {
      period: payslip.period,
      residenceSummary,
      addizionaliFromLines: addizionaliFromLines.map((l) => ({
        code: l.code,
        description: l.description,
        amount: l.amount
      })),
      envelope,
      llm: { active: this.openAi.isActive(), refineApplied }
    };
  }
}
