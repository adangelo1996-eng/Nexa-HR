"use client";

import { useCallback, useMemo, useState } from "react";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import {
  postHrCenterAnalytics,
  type HrCenterAnalyticsDataset,
  type HrCenterAnalyticsReportEnvelope
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function parseReportEnvelope(report: unknown): HrCenterAnalyticsReportEnvelope | null {
  const o = report as { envelope?: HrCenterAnalyticsReportEnvelope };
  const e = o?.envelope;
  if (!e || typeof e.executiveSummary !== "string") {
    return null;
  }
  return e;
}

export default function HrCenterAnalyticsPage(): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<HrCenterAnalyticsDataset | null>(null);
  const [report, setReport] = useState<unknown>(null);
  const [llm, setLlm] = useState<{ active: boolean; refineApplied: boolean } | null>(null);

  const envelope = useMemo(() => parseReportEnvelope(report), [report]);

  const maxGross = useMemo(() => {
    if (!dataset?.byCostCenter?.length) return 0;
    return Math.max(...dataset.byCostCenter.map((r) => r.monthlyGrossSum), 1);
  }, [dataset]);

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await postHrCenterAnalytics(token);
      setDataset(r.dataset);
      setReport(r.report);
      setLlm(r.llm);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore esecuzione analisi");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <GlassCard
        title="Analisi personale e costi"
        description="I dati aggregati alimentano grafici e tabelle; l’interpretazione è generata dal modello linguistico (o da sintesi locale se il LLM non è attivo). Nessun payload JSON grezzo viene mostrato in interfaccia."
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HebbAiPageHelpButton pageKey="hr-center-analisi" />
          <Button type="button" size="sm" disabled={loading} onClick={() => void run()}>
            {loading ? "Generazione in corso…" : "Genera analisi"}
          </Button>
        </div>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {llm ? (
          <p className="text-[10px] text-[var(--prom-muted)]">
            Modello linguistico: {llm.active ? "attivo" : "disattivo"}
            {llm.refineApplied ? " · analisi approfondita generata" : " · sintesi strutturata locale (stesso schema)"}
          </p>
        ) : null}

        {!dataset ? (
          <p className="text-xs text-[var(--prom-muted)]">
            Premi «Genera analisi»: invio del blocco dati pseudonimizzato al perimetro AI, poi ricezione del report
            strutturato per HR.
          </p>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Indicatori (da dataset aggregato)
              </h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_85%,transparent)] p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Headcount</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    {dataset.totals.headcount}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--prom-muted)]">Perimetro: {dataset.scope}</p>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_85%,transparent)] p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">
                    Competenze mensili (indicative)
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    €{dataset.totals.monthlyGrossSum.toLocaleString("it-IT")}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_85%,transparent)] p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Ore sett. medie</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    {dataset.totals.avgWeeklyContractHours}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Peso per centro di costo (competenze mensili indicative)
              </h4>
              <div className="space-y-2">
                {dataset.byCostCenter.map((row) => {
                  const w = Math.round((row.monthlyGrossSum / maxGross) * 100);
                  return (
                    <div
                      key={row.costCenterId}
                      className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-[var(--prom-text)]">{row.costCenterId}</span>
                        <span className="tabular-nums text-[var(--prom-muted)]">
                          {row.headcount} persone · €{row.monthlyGrossSum.toLocaleString("it-IT")}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--prom-surface)_70%,transparent)]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#002D72] to-[#1a4d8c]"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="overflow-x-auto rounded-2xl border border-[var(--prom-line)]">
              <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_95%,transparent)] text-xs uppercase text-[var(--prom-muted)]">
                    <th className="px-3 py-2 font-semibold">Centro di costo</th>
                    <th className="px-3 py-2 font-semibold">Persone</th>
                    <th className="px-3 py-2 font-semibold">€ / mese (indicativo)</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.byCostCenter.map((row) => (
                    <tr key={row.costCenterId} className="border-b border-[var(--prom-line)] last:border-0">
                      <td className="px-3 py-2 font-medium text-[var(--prom-text)]">{row.costCenterId}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--prom-muted)]">{row.headcount}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--prom-text)]">
                        €{row.monthlyGrossSum.toLocaleString("it-IT")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {envelope ? (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_82%,transparent)] p-4 shadow-[var(--glass-shadow)] backdrop-blur-md">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-gold)]">
                    Sintesi esecutiva (LLM / HR)
                  </h4>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--prom-text)]">{envelope.executiveSummary}</p>
                </section>

                {envelope.strategicInsights?.length ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                      Insight strategici
                    </h4>
                    <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-[var(--prom-muted)]">
                      {envelope.strategicInsights.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {envelope.costCenterNarratives?.length ? (
                  <section className="grid gap-3 md:grid-cols-2">
                    {envelope.costCenterNarratives.map((c) => (
                      <div
                        key={c.costCenterId}
                        className="rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-4"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                          {c.costCenterId}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--prom-text)]">{c.headline}</p>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--prom-muted)]">{c.analysis}</p>
                        <p className="mt-2 text-xs font-medium text-[var(--prom-gold-soft)]">{c.suggestion}</p>
                      </div>
                    ))}
                  </section>
                ) : null}

                {envelope.priorities?.length ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                      Priorità e passi successivi
                    </h4>
                    <ol className="space-y-3">
                      {envelope.priorities.map((p, i) => (
                        <li
                          key={`${p.title}-${i}`}
                          className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_88%,transparent)] p-3"
                        >
                          <p className="text-sm font-semibold text-[var(--prom-text)]">
                            {i + 1}. {p.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--prom-muted)]">{p.rationale}</p>
                          <p className="mt-2 text-xs font-medium text-[var(--prom-text)]">→ {p.nextStep}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                <section className="rounded-xl border border-dashed border-[var(--prom-line)] p-4 text-sm text-[var(--prom-muted)]">
                  <p className="font-medium text-[var(--prom-text)]">Nota conclusiva</p>
                  <p className="mt-2 leading-relaxed">{envelope.expertClosingNote}</p>
                  <p className="mt-3 text-xs leading-relaxed opacity-90">{envelope.methodologyNote}</p>
                  <p className="mt-2 text-xs leading-relaxed opacity-90">{dataset.disclaimer}</p>
                </section>
              </div>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Report in formato non riconosciuto. Rigenera l’analisi o verifica la configurazione del modello.
              </p>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
