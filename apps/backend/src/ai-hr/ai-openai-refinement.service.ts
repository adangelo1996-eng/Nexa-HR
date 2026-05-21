import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AI_TOKEN_BODY_RE } from "../ai-privacy/ai-privacy.constants";
import { isNexaAiOpenAiLlmEnabled } from "../platform/nexa-ai-llm-env";
import { getNexaHrConversationalAgentSystemPrompt } from "./ai-hr-agent";
import { HEBB_PAGE_CONTEXT_PROMPT_HINT } from "./hebb-page-context";

const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_MS = 55_000;

/** Esito refine: `inactive` = feature disattivata in env; altri = tentativo fallito pur con LLM abilitato. */
export type OpenAiRefineFailure =
  | "inactive"
  | "openai_error"
  | "empty_response"
  | "invalid_json"
  | "privacy_tokens";

export type OpenAiRefineResult =
  | { ok: true; data: unknown }
  | { ok: false; failure: OpenAiRefineFailure };

function collectTokensFromJson(value: unknown): Set<string> {
  const found = new Set<string>();
  const json = JSON.stringify(value);
  const re = new RegExp(AI_TOKEN_BODY_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    found.add(m[0]);
  }
  return found;
}

function collectTokensFromString(s: string): Set<string> {
  const found = new Set<string>();
  const re = new RegExp(AI_TOKEN_BODY_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    found.add(m[0]);
  }
  return found;
}

/**
 * Token da preservare nel JSON di output del modello.
 * Per schemi dove il modello riscrive solo una stringa (es. `envelope.text`), i token in `facts`
 * non devono comparire nell'output: richiederli causava sempre fallback.
 */
function tokensModelMustPreserve(schemaVersion: string, pseudonymizedInput: unknown): Set<string> {
  if (schemaVersion === "ai_assistant_v1") {
    const env = (pseudonymizedInput as { envelope?: { text?: unknown } })?.envelope;
    return typeof env?.text === "string" ? collectTokensFromString(env.text) : new Set();
  }
  if (schemaVersion === "ai_triage_rationale_v1") {
    const env = (pseudonymizedInput as { envelope?: { rationaleSeed?: unknown } })?.envelope;
    return typeof env?.rationaleSeed === "string" ? collectTokensFromString(env.rationaleSeed) : new Set();
  }
  if (schemaVersion === "ai_hitl_draft_v1") {
    const intent = (pseudonymizedInput as { envelope?: { facts?: { intent?: unknown } } })?.envelope?.facts?.intent;
    return typeof intent === "string" ? collectTokensFromString(intent) : new Set();
  }
  if (schemaVersion === "ai_hr_center_analytics_v1") {
    // Il modello produce testo analitico strutturato: vincoli token troppo stretti causano fallback continui.
    return new Set();
  }
  if (schemaVersion === "ai_payslip_explain_v1" || schemaVersion === "ai_field_suggest_v1") {
    return new Set();
  }
  return collectTokensFromJson(pseudonymizedInput);
}

function tokensPreservedInOutput(
  schemaVersion: string,
  pseudonymizedInput: unknown,
  modelOutput: unknown
): boolean {
  const needed = tokensModelMustPreserve(schemaVersion, pseudonymizedInput);
  if (needed.size === 0) return true;
  const out = JSON.stringify(modelOutput);
  for (const t of needed) {
    if (!out.includes(t)) return false;
  }
  return true;
}

function stripMarkdownJsonFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    s = s.replace(/\s*```$/i, "");
  }
  return s.trim();
}

function systemPromptForSchema(schemaVersion: string): string {
  const base =
    "Sei l'assistente HR di Nexa in italiano. Usa un linguaggio chiaro, calmo e non tecnico: niente jargon informatico, niente acronimi non spiegati. " +
    "Rispondi SOLO con un oggetto JSON valido UTF-8, senza markdown, senza testo prima o dopo il JSON. " +
    "Ogni stringa che contiene il prefisso __nexa_ref: (token di anonimizzazione) va copiata IDENTICA ovunque compaia: non modificarle, non spezzarle, non riformattarle.";

  switch (schemaVersion) {
    case "ai_assistant_v1":
      return (
        getNexaHrConversationalAgentSystemPrompt() +
          "\n\n" +
          base +
          " Schema: {\"envelope\":{\"text\":\"stringa\"}}. L'ingresso contiene envelope.text (bozza in italiano) e envelope.facts (message, pageContext, page, snapshot, routeHints, platformCapabilities, agent, leaveBalance, policySnippets, ecc.): usa i facts solo come contesto, non ripeterli nel JSON di output. " +
          HEBB_PAGE_CONTEXT_PROMPT_HINT +
          " " +
          "Se envelope.text contiene token __nexa_ref:...__, copiali IDENTICI nella tua envelope.text. " +
          "Produci una sola envelope.text in italiano: applica IDENTITÀ e FONTI DI VERITÀ dell’agente sopra; rispondi prima all’intento della domanda (es. remote working: usa smartWorkingInsight / smartWorkingMultiScopeSummary se presenti); usa il resto dello snapshot per priorità operative; per percorsi usa solo voci da platformCapabilities/routeHints; quando suggerisci dove andare nell’app, includi link Markdown [etichetta](/path) con path esatti dalla lista. Non inventare numeri assenti da snapshot o leaveBalance."
      );
    case "ai_nl_query_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"summary\":\"stringa\",\"rows\":array}}. Modifica SOLO envelope.summary (italiano semplice, 2-4 frasi). L'array envelope.rows deve restare IDENTICO al JSON in ingresso (stesso ordine, stessi campi, stessi valori inclusi eventuali token __nexa_ref:)."
      );
    case "ai_anomalies_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"explanation\":\"stringa\",\"items\":array}}. Modifica SOLO envelope.explanation in italiano semplice e rassicurante. L'array envelope.items deve restare IDENTICO al JSON in ingresso."
      );
    case "ai_triage_rationale_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"rationale\":\"stringa\"}}. Scrivi envelope.rationale in italiano chiaro per un dipendente, partendo dai campi rationaleSeed, category, priority e suggestedPath del JSON in ingresso; non inventare fatti. " +
        "Se rationaleSeed contiene token __nexa_ref:...__, copiali IDENTICI in envelope.rationale."
      );
    case "ai_narrative_aggregate_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"title\":\"stringa\",\"bullets\":[\"stringa\"],\"summary\":\"stringa\"}}. " +
        "L'ingresso ha envelope.facts (solo numeri aggregati, nessun nominativo) e envelope.narrativeSeed (bozza in italiano). " +
        "Migliora title, bullets (max 6) e summary in italiano professionale: ogni bullet deve citare almeno un dato numerico presente in envelope.facts (totali, varianze, confronti tra periodi) con unità EUR o percentuali coerenti; " +
        "non inventare cifre assenti da envelope.facts; non introdurre nomi di persone."
      );
    case "ai_hitl_draft_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"kind\":\"stringa\",\"title\":\"stringa\",\"rationale\":\"stringa\",\"checklist\":[\"stringa\"]}}. " +
        "L'ingresso ha envelope.facts.intent (testo HR in italiano), envelope.facts.allowedKinds (array di codici ammessi) e envelope.facts.catalog (id, labelIt, hintIt). " +
        "Scegli envelope.kind uguale ESATTAMENTE a uno dei valori in allowedKinds (preferisci il più aderente all'intento). " +
        "Scrivi envelope.title breve per revisori HR, envelope.rationale in italiano chiaro (cosa succede dopo approvazione, limiti, nessuna promessa legale), envelope.checklist max 4 voci operative. " +
        "Non inventare codici kind fuori da allowedKinds. Se intent contiene token __nexa_ref:...__, copiali identici in rationale o title solo se necessario al senso."
      );
    case "ai_turnover_insights_deep_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"title\":\"stringa\",\"bullets\":[\"stringa\"],\"summary\":\"stringa\"}}. " +
        "L'ingresso ha envelope.facts con SOLO aggregati (conteggi, medie, trend, distribuzioni per fasce di score, per centro di costo senza nominativi). " +
        "Produci analisi in italiano: title accattivante, bullets (max 6) con priorità e rischi operativi, summary con azioni consigliate; " +
        "non aggiungere nomi di persone né ID; non affermare cause legali/mediche."
      );
    case "ai_advanced_analytics_v1":
      return (
        base +
        " Ruolo: consulente HR / HR controller senior (Italia). " +
        " Schema: {\"envelope\":{\"title\":\"stringa\",\"situazione\":\"stringa (4-6 frasi)\",\"correlazioni\":[\"stringa\"],\"rischi\":[\"stringa\"],\"azioni7giorni\":[\"stringa\"],\"raccomandazioniHr\":[\"stringa\"]}}. " +
        " L'ingresso ha envelope.analysisId, envelope.topic, envelope.facts (solo aggregati) e envelope.insightSeed (bozza). " +
        " Migliora in italiano professionale: situazione con numeri da facts; correlazioni max 5 (legami tra budget, turnover, gap, operatività); " +
        " rischi max 5 (operativi, non legali vincolanti); azioni7giorni esattamente 5 passi concreti per HR/controller; " +
        " raccomandazioniHr esattamente 3-4 voci per HR controller (policy, governance dati, allineamento CdA/HRBP). " +
        " Non inventare cifre assenti da facts; nessun nominativo. " +
        HEBB_PAGE_CONTEXT_PROMPT_HINT
      );
    case "ai_advanced_analytics_chat_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"reply\":\"stringa\"}}. " +
        " Sei l'analista AI scoped a una singola analisi Nexa HR (envelope.analysisId, envelope.topic). " +
        HEBB_PAGE_CONTEXT_PROMPT_HINT +
        " " +
        " Rispondi in italiano alla envelope.message usando SOLO envelope.facts, envelope.pageContext e envelope.history; " +
        " se i dati non bastano, dillo e indica cosa verificare in app. Max 12 righe. Nessun nominativo. " +
        " Migliora envelope.replySeed mantenendo coerenza con i fatti."
      );
    case "ai_platform_agent_v1":
      return (
        getNexaHrConversationalAgentSystemPrompt() +
          "\n\n" +
          base +
          " Schema obbligatorio: {\"envelope\":{\"reply\":\"stringa (1-2 frasi intro, specifica sul caso)\",\"sections\":[{\"title\":\"stringa\",\"bullets\":[{\"text\":\"stringa\",\"action\":{\"label\":\"stringa\",\"href\":\"/path\"}}]}]}}. " +
          " sections: 2-4 blocchi; title tra: Cosa fare, Dove andare, Come funziona il calcolo (se domanda su metriche/score/varianza/straordinari/formazione/sale), Consiglio per te, Passi successivi; " +
          " bullets: 2-6 voci ciascuna, text conciso e legato a envelope.message, envelope.pageContext e envelope.page (niente boilerplate generico); " +
          HEBB_PAGE_CONTEXT_PROMPT_HINT +
          " " +
          " almeno un action con href da routeHints/platformCapabilities quando c'è un passo utile; href path esatto (es. /analytics/retention, /sale-riunioni); " +
          " se knowledgeExcerpt descrive formule (turnover, budget, overtime, training %, meeting rooms), riassumile fedelmente in «Come funziona il calcolo»; " +
          " «Consiglio per te»: azioni HR contestuali (manager vs dipendente vs HR) senza nominativi; reply breve; multi-turno: history, message, replySeed; " +
          " non inventare permessi assenti da permissionsSummary né numeri non presenti in facts/snapshot."
      );
    case "ai_hr_center_analytics_v1":
      return (
        base +
        " Ruolo: sei un consulente HR senior e un economista del lavoro (Italia), con tono professionale, empatico e operativo. " +
        " Schema obbligatorio: {\"envelope\":{" +
        "\"executiveSummary\":\"stringa (4-7 frasi, quadro d'insieme per il CdA/HR)\"," +
        "\"strategicInsights\":[\"stringa\"], " +
        "\"costCenterNarratives\":[{\"costCenterId\":\"stringa (stesso id o token dell'ingresso)\",\"headline\":\"stringa\",\"analysis\":\"stringa\",\"suggestion\":\"stringa\"}], " +
        "\"priorities\":[{\"title\":\"stringa\",\"rationale\":\"stringa\",\"nextStep\":\"stringa\"}], " +
        "\"expertClosingNote\":\"stringa (2-4 frasi)\"," +
        "\"methodologyNote\":\"stringa (limiti dell'analisi, fonte dati, niente consulenza legale vincolante)\"}}. " +
        " Regole: usa SOLO numeri e relazioni presenti in envelope.facts; non inventare cifre, fatturati, margini o clausole contrattuali; " +
        "non citare nomi di persone; per ogni centro di costo in envelope.facts.byCostCenter produci una voce in costCenterNarratives (stesso ordine o ordinato per impatto); " +
        "Se envelope.facts.analysisFocus, analysisLabel o analysisDeepDive sono presenti, adatta tono e priorità al perimetro (singolo dipendente = micro-analisi sul suo CDC; master_data = qualità dati; budget_turnover = organico vs budget senza numeri inventati). " +
        "strategicInsights: 5-8 voci, ciascuna concreta (costo, organico, rischi operativi, retention, compliance soft); " +
        "priorities: 4-6 voci prioritarie con nextStep misurabile; " +
        "se compaiono token __nexa_ref:...__, copiali identici in costCenterId dove servono."
      );
    case "ai_process_bottlenecks_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"title\":\"stringa\",\"bullets\":[\"stringa\"],\"summary\":\"stringa\"}}. " +
        "L'ingresso ha envelope.facts con metriche di ciclo processo (campione, mediane, note) e eventi aggregati (id tecnico + descrizione già in italiano). " +
        "Individua colli di bottiglia plausibili e vie d'azione prioritarie in italiano semplice; max 6 bullets; non inventare cifre assenti da facts."
      );
    case "ai_compensation_benchmark_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"ralLowEur\":number,\"ralMedianEur\":number,\"ralHighEur\":number,\"notesIt\":\"stringa\"}}. " +
        "L'ingresso ha envelope.facts con roleTitle (testo), location (area geografica), seniorityYears (0-45), disclaimer, opzionale ccnlCode. " +
        " envelope.seed descrive la richiesta. Stima RAL annua lorda di mercato in Italia per ruolo e seniority: " +
        "ralLowEur < ralMedianEur < ralHighEur, valori interi EUR realistici; notesIt in italiano (2-5 frasi) con limiti del benchmark e assenza di fonti primarie; " +
        "se ccnlCode è presente, cita in notesIt in modo sintetico che la fascia va contestualizzata al contratto collettivo indicato; " +
        "non citare aziende reali né persone."
      );
    case "ai_field_suggest_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"value\":\"stringa o numero\",\"confidence\":number,\"reason\":\"stringa\"}}. " +
        " L'ingresso ha envelope.fieldKey, envelope.formId, envelope.partialForm e envelope.context (solo aggregati organizzativi, nessun nominativo). " +
        " Suggerisci UN solo valore appropriato per fieldKey; confidence tra 0 e 1; reason in italiano breve (max 2 frasi). " +
        " Non inventare email, IBAN, codici fiscali, indirizzi, stipendi o importi; non citare persone."
      );
    case "ai_payslip_explain_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"plainSummary\":\"stringa\",\"residenceDomicileNote\":\"stringa\",\"addizionaliNote\":\"stringa\"," +
        "\"lineHighlights\":[" +
        "{\"lineRef\":\"stringa (codice o descrizione sintetica)\",\"signal\":\"ok|verify|info\",\"comment\":\"stringa\"}" +
        "],\"closingTip\":\"stringa (max 2 frasi)\"}}. " +
        "L'ingresso ha envelope.facts con period, importi lordo/netto, elenco linee (code, description, amount), itProfile (residenceLine, ccnl), disclaimer. " +
        "plainSummary: 3-6 frasi semplici per un dipendente. residenceDomicileNote: lega residenza/domicilio alle addizionali solo se plausibile dai dati, altrimenti 'verificare in CUD'. " +
        "addizionaliNote: se ci sono o meno voci riconducibili ad addizionali. lineHighlights: 3-8 voci su righe interessanti o trattenute; " +
        "non inventare codici o importi non presenti in facts.lines."
      );
    default:
      return base + " Mantieni la stessa struttura JSON del messaggio utente (solo chiavi già presenti).";
  }
}

@Injectable()
export class AiOpenAiRefinementService {
  private readonly logger = new Logger(AiOpenAiRefinementService.name);

  isActive(): boolean {
    return isNexaAiOpenAiLlmEnabled();
  }

  /**
   * Invia il JSON pseudonimizzato al modello e ne richiede una variante strutturata.
   */
  async refinePseudonymizedJson(pseudonymized: unknown, schemaVersion: string): Promise<OpenAiRefineResult> {
    if (!this.isActive()) {
      return { ok: false, failure: "inactive" };
    }
    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const model = process.env.NEXA_OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    const client = new OpenAI({ apiKey, timeout: REQUEST_MS, maxRetries: 0 });

    const system = systemPromptForSchema(schemaVersion);
    const userJson = JSON.stringify(pseudonymized);
    const maxTokens =
      schemaVersion === "ai_assistant_v1"
        ? 4096
        : schemaVersion === "ai_hr_center_analytics_v1"
          ? 4096
          : schemaVersion === "ai_hitl_draft_v1" ||
              schemaVersion === "ai_turnover_insights_deep_v1" ||
              schemaVersion === "ai_compensation_benchmark_v1" ||
              schemaVersion === "ai_payslip_explain_v1"
            ? 2048
            : 2048;

    try {
      const temperature = schemaVersion === "ai_hr_center_analytics_v1" ? 0.28 : 0.35;
      const completion = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              "Ingresso JSON (pseudonimizzato). Applica le istruzioni di sistema e restituisci solo il JSON di output.\n\n" +
              userJson
          }
        ]
      });
      const raw = completion.choices[0]?.message?.content?.trim();
      if (!raw) {
        return { ok: false, failure: "empty_response" };
      }
      const forParse = stripMarkdownJsonFence(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(forParse) as unknown;
      } catch {
        this.logger.warn("OpenAI response not JSON");
        return { ok: false, failure: "invalid_json" };
      }
      if (!tokensPreservedInOutput(schemaVersion, pseudonymized, parsed)) {
        this.logger.warn("OpenAI output dropped privacy tokens; falling back");
        return { ok: false, failure: "privacy_tokens" };
      }
      return { ok: true, data: parsed };
    } catch (e) {
      this.logger.warn(`OpenAI refine failed: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, failure: "openai_error" };
    }
  }
}
