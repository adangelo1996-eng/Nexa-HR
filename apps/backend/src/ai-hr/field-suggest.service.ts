import { BadRequestException, Injectable } from "@nestjs/common";
import type { AuthRole } from "../platform/auth";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { HrDataStore } from "../platform/hr-data.store";
import { TrainingService } from "../training/training.service";
import { isHebbFieldSensitive, stripSensitiveFromPartialForm } from "./hebb-field-sensitivity";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";

const SCHEMA_FIELD_SUGGEST = "ai_field_suggest_v1";

export type FieldSuggestBody = {
  fieldKey: string;
  formId: string;
  context?: Record<string, unknown>;
  partialForm?: Record<string, unknown>;
};

export type FieldSuggestResult = {
  value: string | number | boolean | null;
  confidence: number;
  reason: string;
  source: "blocked" | "rules" | "llm";
};

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class FieldSuggestService {
  constructor(
    private readonly store: HrDataStore,
    private readonly training: TrainingService,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService
  ) {}

  async suggest(
    auth: { userId: string; role: AuthRole },
    body: FieldSuggestBody
  ): Promise<FieldSuggestResult> {
    const fieldKey = String(body.fieldKey ?? "").trim();
    const formId = String(body.formId ?? "").trim();
    if (!fieldKey || !formId) {
      throw new BadRequestException("fieldKey e formId sono obbligatori.");
    }

    if (isHebbFieldSensitive(fieldKey)) {
      return {
        value: null,
        confidence: 0,
        reason:
          "Campo sensibile: autofill Hebb disabilitato per conformità GDPR (nessun dato inviato al modello).",
        source: "blocked"
      };
    }

    const me = await this.store.getUser(auth.userId);
    const safePartial = stripSensitiveFromPartialForm(body.partialForm);
    const context = stripSensitiveFromPartialForm(
      body.context && typeof body.context === "object"
        ? (body.context as Record<string, unknown>)
        : undefined
    );

    const ruled = await this.tryRules(me, fieldKey, formId, safePartial, context);
    if (ruled) return { ...ruled, source: "rules" };

    if (!this.openAi.isActive()) {
      return {
        value: null,
        confidence: 0,
        reason: "Nessuna regola deterministica per questo campo; assistenza LLM non configurata.",
        source: "rules"
      };
    }

    const llm = await this.tryLlm(me.companyId, auth.userId, fieldKey, formId, safePartial, context);
    if (llm) return { ...llm, source: "llm" };

    return {
      value: null,
      confidence: 0,
      reason: "Nessun suggerimento disponibile con i dati aggregati attuali.",
      source: "rules"
    };
  }

  private async tryRules(
    me: Awaited<ReturnType<HrDataStore["getUser"]>>,
    fieldKey: string,
    formId: string,
    partial: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<Omit<FieldSuggestResult, "source"> | null> {
    const fk = fieldKey.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const costCenter =
      me.costCenterId != null ? await this.store.getCostCenterById(me.costCenterId) : null;
    const ccName = costCenter?.name?.trim() ?? "il tuo centro di costo";

    if (formId === "hr.formazione.assign" && fk === "duedate") {
      const days = context.suggestDueDays === 14 ? 14 : 14;
      return {
        value: addDaysIso(Number(days)),
        confidence: 0.92,
        reason: `Scadenza suggerita a ${days} giorni dalla data odierna (policy formazione standard).`
      };
    }

    if (formId === "hr.formazione.assign" && fk === "courseid") {
      const courses = await this.training.listCourses(me.companyId);
      const mandatory = courses.filter((c) => c.category === "mandatory");
      const pick = mandatory[0] ?? courses[0];
      if (pick?.id) {
        return {
          value: pick.id,
          confidence: mandatory.length ? 0.75 : 0.55,
          reason: mandatory.length
            ? "Primo corso obbligatorio del catalogo aziendale."
            : "Primo corso attivo del catalogo."
        };
      }
    }

    if (formId === "sale-riunioni.booking" && (fk === "title" || fk === "meetingtitle")) {
      const roomName = typeof context.roomName === "string" ? context.roomName.trim() : "";
      const slotLabel = typeof context.slotLabel === "string" ? context.slotLabel.trim() : "";
      const base = roomName ? `Riunione — ${roomName}` : `Riunione team ${ccName}`;
      const value = slotLabel ? `${base} (${slotLabel})` : base;
      return {
        value: value.slice(0, 120),
        confidence: 0.88,
        reason: "Titolo generato da sala e contesto organizzativo (senza dati personali)."
      };
    }

    if (formId === "sale-riunioni.booking" && (fk === "duration" || fk === "durationminutes")) {
      return {
        value: "30",
        confidence: 0.95,
        reason: "Durata standard fascia prenotazione (30 minuti)."
      };
    }

    if (formId === "expenses.claim" && fk === "expensetype") {
      const ocrType = partial.ocrSuggestedType;
      if (typeof ocrType === "string" && ocrType.trim()) {
        return {
          value: ocrType.trim(),
          confidence: 0.7,
          reason: "Categoria dedotta dal tipo spesa in bozza (senza importo)."
        };
      }
      return {
        value: "ristorante",
        confidence: 0.5,
        reason: "Categoria predefinita più frequente nelle note spese."
      };
    }

    if (formId === "expenses.claim" && fk === "expensedate") {
      return {
        value: todayIso(),
        confidence: 0.9,
        reason: "Data odierna (regola standard nota spese)."
      };
    }

    if (formId === "expenses.claim" && fk === "description") {
      const typeId = String(partial.expenseType ?? "altro");
      const labels: Record<string, string> = {
        ristorante: "Pasto di lavoro",
        autostrada: "Pedaggio autostrada",
        hotel: "Pernottamento servizio",
        carburante: "Rifornimento carburante",
        trasporti: "Trasporto missione",
        parcheggio: "Parcheggio",
        materiale: "Materiale ufficio",
        altro: "Spesa professionale"
      };
      return {
        value: `Nota spese — ${labels[typeId] ?? "Spesa professionale"}`.slice(0, 200),
        confidence: 0.85,
        reason: "Descrizione template da categoria (senza importo né PII)."
      };
    }

    if (formId === "recruiting.candidate" && fk === "privacynoticeversion") {
      return {
        value: "v2026-04",
        confidence: 0.8,
        reason: "Versione informativa privacy di esempio in uso sul tenant."
      };
    }

    if (formId === "recruiting.candidate" && fk === "notes" && !partial.notes) {
      return {
        value: "Candidato inserito da selezione interna; verificare CV e colloquio iniziale.",
        confidence: 0.6,
        reason: "Testo operativo standard per note recruiting (nessun dato personale)."
      };
    }

    if (formId.startsWith("hr.onboarding.wizard") && fk === "contracttype") {
      return {
        value: "Tempo indeterminato",
        confidence: 0.78,
        reason: "Tipologia contratto più comune in onboarding HR."
      };
    }

    if (formId.startsWith("hr.onboarding.wizard") && fk === "hiredate") {
      return {
        value: todayIso(),
        confidence: 0.72,
        reason: "Data odierna come assunzione indicativa (verificare con HR)."
      };
    }

    if (formId.startsWith("hr.onboarding.wizard") && fk === "trainingduedate") {
      return {
        value: addDaysIso(14),
        confidence: 0.9,
        reason: "Scadenza corsi onboarding a 14 giorni."
      };
    }

    if (formId.startsWith("hr.onboarding.wizard") && fk === "firstdaytime") {
      return {
        value: "09:00",
        confidence: 0.85,
        reason: "Orario ingresso standard sede."
      };
    }

    if (formId.startsWith("hr.onboarding.wizard") && fk === "siteaccess") {
      return {
        value: "Ingresso principale — reception",
        confidence: 0.65,
        reason: "Punto di ritrovo generico primo giorno."
      };
    }

    if (formId.startsWith("hr.onboarding.wizard") && fk === "equipmentnotes") {
      return {
        value: "Portatile, monitor, cuffie, adattatore dock",
        confidence: 0.7,
        reason: "Kit attrezzature standard ufficio."
      };
    }

    if (
      (formId === "settings.profile" || formId === "admin.user.organizzazione") &&
      fk === "contracttype"
    ) {
      return {
        value: "Tempo indeterminato",
        confidence: 0.75,
        reason: "Tipologia contratto predefinita anagrafica."
      };
    }

    if (
      (formId === "settings.profile" || formId === "admin.user.organizzazione") &&
      fk === "costcenterid" &&
      me.costCenterId
    ) {
      return {
        value: me.costCenterId,
        confidence: 0.82,
        reason: `Centro di costo del profilo operatore (${ccName}).`
      };
    }

    if (
      (formId === "settings.profile" || formId === "admin.user.organizzazione") &&
      fk === "teamid" &&
      me.teamId
    ) {
      return {
        value: me.teamId,
        confidence: 0.8,
        reason: "Team del profilo operatore (aggregato organizzativo)."
      };
    }

    if (formId === "hr.cowork.documents" && fk === "title") {
      const existing = typeof partial.title === "string" ? partial.title.trim() : "";
      const kind = typeof partial.kind === "string" ? partial.kind : "other";
      const kindLabels: Record<string, string> = {
        contract: "Contratto",
        payslip: "Cedolino",
        personal: "Personale",
        other: "Documento"
      };
      const prefix = kindLabels[kind] ?? "Documento";
      if (existing.length >= 3) {
        return {
          value: existing.startsWith(prefix) ? existing : `${prefix} — ${existing}`.slice(0, 120),
          confidence: 0.72,
          reason: "Titolo normalizzato con prefisso da tipologia documento."
        };
      }
      return {
        value: `${prefix} — revisione ${todayIso()}`.slice(0, 120),
        confidence: 0.68,
        reason: "Titolo operativo standard per nuova versione in vault."
      };
    }

    if (formId === "hr.cowork.documents" && fk === "kind") {
      const existing = typeof partial.kind === "string" ? partial.kind : "";
      if (existing === "contract" || existing === "payslip" || existing === "personal") {
        return { value: existing, confidence: 0.9, reason: "Tipologia invariata rispetto al documento di origine." };
      }
      return { value: "other", confidence: 0.75, reason: "Tipologia generica per documenti non classificati." };
    }

    if (formId === "settings.profile" && (fk === "jobtitle" || fk === "department")) {
      const role =
        me.roleId != null
          ? (await this.store.listRoles()).find((r) => r.id === me.roleId)
          : null;
      if (fk === "jobtitle" && role?.name) {
        return {
          value: role.name,
          confidence: 0.7,
          reason: "Ruolo organizzativo associato al profilo (senza nominativi)."
        };
      }
      if (fk === "department" && ccName) {
        return {
          value: ccName,
          confidence: 0.85,
          reason: "Dipartimento / centro di costo dal profilo operatore."
        };
      }
    }

    return null;
  }

  private async tryLlm(
    companyId: string,
    actorUserId: string,
    fieldKey: string,
    formId: string,
    partial: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<Omit<FieldSuggestResult, "source"> | null> {
    const { sessionId } = await this.gateway.beginSession(companyId, actorUserId);
    try {
      const envelope = {
        fieldKey,
        formId,
        partialForm: partial,
        context,
        hint: "Suggerisci un solo valore testuale breve per il campo indicato, usando solo aggregati organizzativi."
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, { envelope }, SCHEMA_FIELD_SUGGEST);
      const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, SCHEMA_FIELD_SUGGEST);
      const modelJson = refined.ok ? refined.data : pseudo.pseudonymized;
      const restored = (await this.gateway.fromModelResponse(sessionId, modelJson)) as {
        envelope?: { value?: unknown; confidence?: unknown; reason?: unknown };
      };
      const env = restored?.envelope;
      const rawVal = env?.value;
      if (rawVal === undefined || rawVal === null || rawVal === "") return null;
      const value =
        typeof rawVal === "string" || typeof rawVal === "number" || typeof rawVal === "boolean"
          ? rawVal
          : String(rawVal);
      const confidence =
        typeof env?.confidence === "number" && env.confidence >= 0 && env.confidence <= 1
          ? env.confidence
          : 0.55;
      const reason =
        typeof env?.reason === "string" && env.reason.trim()
          ? env.reason.trim()
          : "Suggerimento da contesto HR aggregato (pseudonimizzato).";
      return { value, confidence, reason };
    } finally {
      await this.gateway.endSession(sessionId);
    }
  }
}
