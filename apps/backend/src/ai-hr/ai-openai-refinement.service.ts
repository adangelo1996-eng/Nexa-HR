import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AI_TOKEN_BODY_RE } from "../ai-privacy/ai-privacy.constants";
import { getNexaHrConversationalAgentSystemPrompt } from "./ai-hr-agent";

const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_MS = 55_000;

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

function tokensPreservedInOutput(pseudonymizedInput: unknown, modelOutput: unknown): boolean {
  const needed = collectTokensFromJson(pseudonymizedInput);
  if (needed.size === 0) return true;
  const out = JSON.stringify(modelOutput);
  for (const t of needed) {
    if (!out.includes(t)) return false;
  }
  return true;
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
          " Schema: {\"envelope\":{\"text\":\"stringa\"}}. L'ingresso contiene envelope.facts con: message, page, snapshot (può includere smartWorkingInsight, smartWorkingMultiScopeSummary, conteggi ferie/spese/cedolini, ecc.), routeHints, platformCapabilities (stesso contenuto percorsi), agent (id/versione), leaveBalance e policySnippets se presenti. " +
          "Produci una sola envelope.text in italiano: applica IDENTITÀ e FONTI DI VERITÀ dell’agente sopra; rispondi prima all’intento della domanda (es. smart working: usa smartWorkingInsight / smartWorkingMultiScopeSummary se presenti); usa il resto dello snapshot per priorità operative; per percorsi usa solo voci da platformCapabilities/routeHints. Non inventare numeri assenti da snapshot o leaveBalance."
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
        " Schema: {\"envelope\":{\"rationale\":\"stringa\"}}. Scrivi envelope.rationale in italiano chiaro per un dipendente, partendo dai campi rationaleSeed, category, priority e suggestedPath del JSON in ingresso; non inventare fatti."
      );
    case "ai_narrative_aggregate_v1":
      return (
        base +
        " Schema: {\"envelope\":{\"title\":\"stringa\",\"bullets\":[\"stringa\"],\"summary\":\"stringa\"}}. " +
        "L'ingresso ha envelope.facts (solo numeri aggregati, nessun nominativo) e envelope.narrativeSeed (bozza in italiano). " +
        "Migliora stile e chiarezza di title, bullets (max 5) e summary in italiano, senza aggiungere cifre o fatti assenti da envelope.facts; " +
        "non introdurre nomi di persone."
      );
    default:
      return base + " Mantieni la stessa struttura JSON del messaggio utente (solo chiavi già presenti).";
  }
}

@Injectable()
export class AiOpenAiRefinementService {
  private readonly logger = new Logger(AiOpenAiRefinementService.name);

  isActive(): boolean {
    const key = process.env.OPENAI_API_KEY?.trim();
    const on = process.env.NEXA_AI_OPENAI_ENABLED === "true";
    return on && !!key;
  }

  /**
   * Invia il JSON pseudonimizzato al modello e ne richiede una variante strutturata.
   * Ritorna null se disattivo, errore, JSON non valido o token persi.
   */
  async refinePseudonymizedJson(
    pseudonymized: unknown,
    schemaVersion: string
  ): Promise<unknown | null> {
    if (!this.isActive()) return null;
    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const model = process.env.NEXA_OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    const client = new OpenAI({ apiKey, timeout: REQUEST_MS, maxRetries: 0 });

    const system = systemPromptForSchema(schemaVersion);
    const userJson = JSON.stringify(pseudonymized);

    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.35,
        max_tokens: 2048,
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
      if (!raw) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        this.logger.warn("OpenAI response not JSON");
        return null;
      }
      if (!tokensPreservedInOutput(pseudonymized, parsed)) {
        this.logger.warn("OpenAI output dropped privacy tokens; falling back");
        return null;
      }
      return parsed;
    } catch (e) {
      this.logger.warn(`OpenAI refine failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
