"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

function RetentionScoreLegend(): React.JSX.Element {
  return (
    <section className="mb-8 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-5">
      <h2 className="text-sm font-semibold text-[var(--prom-text)]">Come si calcola il punteggio (rule-v1)</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--prom-muted)]">
        Il flight risk score è un indice <strong className="text-[var(--prom-text)]">0–100</strong> calcolato lato
        piattaforma su segnali aggregati (assenze, anzianità, pattern approvazioni). Non sostituisce valutazioni
        manageriali né procedure disciplinari.
      </p>
      <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-[var(--prom-muted)]">
        <li>
          <span className="text-emerald-800 dark:text-emerald-200">0–33 · Basso</span> — profilo stabile rispetto ai
          segnali osservati.
        </li>
        <li>
          <span className="text-amber-800 dark:text-amber-200">34–66 · Medio</span> — monitoraggio e colloquio
          preventivo consigliati.
        </li>
        <li>
          <span className="text-rose-800 dark:text-rose-200">67–100 · Alto</span> — priorità retention; verificare
          carico, percorso e retribuzione con HR.
        </li>
      </ul>
    </section>
  );
}

export default function AnalyticsRetentionPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="retention"
      title="Retention e flight risk"
      subtitle="Segnali turnover, assenze e tenure su fasce e centri di costo. Playbook retention senza esporre nominativi al modello linguistico."
      pageHelpKey="analytics-retention"
    >
      <RetentionScoreLegend />
    </AdvancedAnalyticsPage>
  );
}
