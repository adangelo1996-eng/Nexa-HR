"use client";

import type React from "react";

/**
 * Stampa il risultato da LLM/AI in forma leggibile: titolo, elenco, paragrafo.
 * Evita di mostrare JSON come primario; se manca envelpe, prova a estrarre testo o mostra messaggio breve.
 */
export function AiNarrativeDisplay(props: { narrative: unknown }): React.JSX.Element {
  const { narrative } = props;
  if (narrative == null) {
    return <p className="text-sm text-[var(--prom-muted)]">Nessun risultato.</p>;
  }
  const o = narrative as {
    envelope?: { title?: string; bullets?: string[]; summary?: string };
  };
  const e = o?.envelope;
  if (e && (e.title || e.bullets?.length || e.summary)) {
    return (
      <div className="space-y-4 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-4 text-sm">
        {e.title ? <h3 className="text-base font-semibold text-[var(--prom-text)]">{e.title}</h3> : null}
        {e.bullets?.length ? (
          <ul className="list-inside list-disc space-y-2 text-[var(--prom-text)]">
            {e.bullets.map((b, i) => (
              <li key={i} className="leading-relaxed">
                {b}
              </li>
            ))}
          </ul>
        ) : null}
        {e.summary ? (
          <p className="whitespace-pre-wrap border-t border-[var(--prom-line)] pt-3 leading-relaxed text-[var(--prom-muted)]">
            {e.summary}
          </p>
        ) : null}
      </div>
    );
  }
  if (typeof narrative === "string" && narrative.trim()) {
    return (
      <p className="whitespace-pre-wrap rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-4 text-sm leading-relaxed text-[var(--prom-text)]">
        {narrative}
      </p>
    );
  }
  if (typeof narrative === "object" && narrative !== null) {
    const maybeText = (narrative as { text?: string; content?: string }).text ?? (narrative as { content?: string }).content;
    if (typeof maybeText === "string" && maybeText.trim()) {
      return (
        <p className="whitespace-pre-wrap rounded-xl border border-[var(--prom-line)] p-4 text-sm leading-relaxed text-[var(--prom-text)]">
          {maybeText}
        </p>
      );
    }
  }
  return (
    <p className="text-sm text-[var(--prom-muted)]">
      Il modello non ha restituito un formato noto. Riprova o restringi i filtri. (Dettaglio tecnico disattivato in
      UI.)
    </p>
  );
}
