"use client";

export type LlmUsageBannerModel = {
  /** LLM configurato sul backend (OpenAI attiva). */
  active: boolean;
  /** Ultima elaborazione passata dal modello (refine) con successo. */
  refineApplied: boolean;
  refineFailure?: string;
};

function refineFailureUserMessage(code: string | undefined): string {
  switch (code) {
    case "inactive":
      return "LLM non attivo sul server.";
    case "invalid_json":
      return "Il modello ha restituito un formato non valido: è stata usata la sintesi locale.";
    case "schema_mismatch":
      return "Risposta del modello non conforme allo schema atteso.";
    case "timeout":
      return "Timeout verso il provider LLM.";
    default:
      return code ? `Errore elaborazione LLM (${code}).` : "Errore elaborazione LLM.";
  }
}

type Props = {
  llm: LlmUsageBannerModel | null | undefined;
  /** Se non è ancora stata eseguita un’azione che imposta `llm`. */
  idle?: boolean;
  className?: string;
};

export function LlmUsageStatusBanner(props: Props): React.JSX.Element {
  const { llm, idle, className } = props;
  const boxClass = `mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2 ${className ?? ""}`;

  if (idle || !llm) {
    return (
      <div className={boxClass}>
        <span
          className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
          style={{ backgroundColor: "var(--prom-muted)" }}
          title="Esegui un’operazione per aggiornare lo stato LLM"
        />
        <div className="min-w-0 flex-1 text-xs text-[var(--prom-muted)]">
          <span className="font-medium text-[var(--prom-text)]">Stato AI</span>
          {" — "}
          {idle ? "genera un’analisi o una richiesta per aggiornare lo stato." : "in attesa di esecuzione."}
        </div>
      </div>
    );
  }

  const dotColor = !llm.active
    ? "var(--prom-muted)"
    : llm.refineApplied
      ? "#22c55e"
      : "#f59e0b";

  return (
    <div className={boxClass}>
      <span
        className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]"
        style={{
          backgroundColor: dotColor,
          boxShadow: llm.refineApplied ? "0 0 12px rgba(34,197,94,0.45)" : undefined
        }}
        title={
          !llm.active
            ? "LLM non abilitato sul server"
            : llm.refineApplied
              ? "Ultimo output elaborato dal modello linguistico"
              : "LLM abilitato ma ultima esecuzione in fallback locale o non raffinata"
        }
      />
      <div className="min-w-0 flex-1 text-xs text-[var(--prom-muted)]">
        <span className="font-medium text-[var(--prom-text)]">Stato AI</span>
        {": "}
        {!llm.active
          ? "percorso LLM non attivo sul server (variabili NEXA_AI_OPENAI_ENABLED / OPENAI_API_KEY)."
          : llm.refineApplied
            ? "ultima risposta testuale elaborata dal modello linguistico tramite API."
            : "LLM configurato sul server, ma l’ultima esecuzione ha usato la sintesi locale o non è stata raffinata."}
        {llm.active && !llm.refineApplied && llm.refineFailure ? (
          <span className="mt-1 block text-amber-800 dark:text-amber-200/90">
            {refineFailureUserMessage(llm.refineFailure)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
