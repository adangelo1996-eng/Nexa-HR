/**
 * Criterio unico per LLM OpenAI (Centro AI HR, narrative opzionale, ecc.):
 * `NEXA_AI_OPENAI_ENABLED=true` e `OPENAI_API_KEY` valorizzata.
 * Allineato a `AiOpenAiRefinementService.isActive()`.
 */
export function isNexaAiOpenAiLlmEnabled(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  const on = process.env.NEXA_AI_OPENAI_ENABLED === "true";
  return on && Boolean(key);
}
