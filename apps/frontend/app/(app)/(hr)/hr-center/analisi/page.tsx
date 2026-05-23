"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { GlassCard } from "@/components/glass-card";
import {
  fetchCurrentUser,
  fetchHrCenterMeta,
  fetchUsers,
  postHrCenterAnalytics,
  type HrCenterAnalyticsDataset,
  type HrCenterAnalyticsReportEnvelope,
  type HrCenterAnalyticsRunBody,
  type HrCenterLlmRefineFailure,
  type User
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { filterManagerRows } from "@/lib/work-calendar-prefetch";

function parseReportEnvelope(report: unknown): HrCenterAnalyticsReportEnvelope | null {
  const o = report as { envelope?: HrCenterAnalyticsReportEnvelope };
  const e = o?.envelope;
  if (!e || typeof e.executiveSummary !== "string") {
    return null;
  }
  return e;
}

type AnalyticsFocus = NonNullable<HrCenterAnalyticsRunBody["focus"]>;

function splitExecutiveSummary(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  const paras: string[] = [];
  let acc = "";
  for (const s of sentences) {
    const candidate = acc ? `${acc} ${s}` : s;
    if (candidate.length > 300 && acc) {
      paras.push(acc.trim());
      acc = s;
    } else {
      acc = candidate;
    }
  }
  if (acc.trim()) paras.push(acc.trim());
  return paras.length ? paras : [cleaned];
}

function refineFailureUserMessage(code: HrCenterLlmRefineFailure | undefined): string | null {
  if (!code) return null;
  const map: Record<HrCenterLlmRefineFailure, string> = {
    openai_error:
      "Il backend ha tentato la chiamata al modello ma l’API non è riuscita a completarla (rete, quota, chiave o modello sul server). Controllare le variabili NEXA_AI_OPENAI_ENABLED, OPENAI_API_KEY e i log del servizio.",
    empty_response: "Il modello ha restituito contenuto vuoto: è stata usata la sintesi locale.",
    invalid_json: "Il modello non ha restituito JSON valido per lo schema richiesto: sintesi locale.",
    privacy_tokens:
      "L’output del modello non ha superato i controlli di anonimizzazione Nexa: per sicurezza è stata usata la sintesi locale."
  };
  return map[code] ?? null;
}

export default function HrCenterAnalyticsPage(): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<HrCenterAnalyticsDataset | null>(null);
  const [report, setReport] = useState<unknown>(null);
  const [llm, setLlm] = useState<{
    active: boolean;
    refineApplied: boolean;
    refineFailure?: HrCenterLlmRefineFailure;
  } | null>(null);
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchHrCenterMeta>> | null>(null);
  const [usersForSelect, setUsersForSelect] = useState<User[]>([]);

  const [focus, setFocus] = useState<AnalyticsFocus>("company");
  const [costCenterId, setCostCenterId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [userId, setUserId] = useState("");

  const envelope = useMemo(() => parseReportEnvelope(report), [report]);

  const executiveParagraphs = useMemo(
    () => (envelope?.executiveSummary ? splitExecutiveSummary(envelope.executiveSummary) : []),
    [envelope?.executiveSummary]
  );

  useEffect(() => {
    const t = getToken();
    if (!t) {
      return;
    }
    void (async () => {
      try {
        const [m, me, users] = await Promise.all([
          fetchHrCenterMeta(t),
          fetchCurrentUser(t),
          fetchUsers(t).catch(() => [] as User[])
        ]);
        setMeta(m);
        if (m.scopeMode === "team") {
          const allowed = new Set(filterManagerRows(me, users).map((r) => r.id));
          setUsersForSelect(users.filter((u) => allowed.has(u.id)));
        } else {
          setUsersForSelect(users);
        }
      } catch {
        setMeta({ canAccess: false, llmActive: false });
      }
    })();
  }, []);

  useEffect(() => {
    setCostCenterId("");
    setTeamId("");
    setUserId("");
  }, [focus]);

  const maxGross = useMemo(() => {
    if (!dataset?.byCostCenter?.length) return 0;
    return Math.max(...dataset.byCostCenter.map((r) => r.monthlyGrossSum), 1);
  }, [dataset]);

  const topThreeShare = useMemo(() => {
    if (!dataset?.byCostCenter?.length || !dataset.totals.monthlyGrossSum) {
      return [];
    }
    const sorted = [...dataset.byCostCenter].sort((a, b) => b.monthlyGrossSum - a.monthlyGrossSum).slice(0, 3);
    const tot = dataset.totals.monthlyGrossSum;
    return sorted.map((r) => ({
      id: r.costCenterId,
      label: r.costCenterName?.trim() || r.costCenterId,
      pct: tot > 0 ? Math.round((r.monthlyGrossSum / tot) * 1000) / 10 : 0
    }));
  }, [dataset]);

  const runBody = useCallback((): HrCenterAnalyticsRunBody => {
    const body: HrCenterAnalyticsRunBody = { focus };
    if (focus === "cost_center" && costCenterId.trim()) {
      body.costCenterId = costCenterId.trim();
    }
    if (focus === "team" && teamId.trim()) {
      body.teamId = teamId.trim();
    }
    if (focus === "employee" && userId.trim()) {
      body.userId = userId.trim();
    }
    return body;
  }, [focus, costCenterId, teamId, userId]);

  const run = useCallback(
    async (opts?: { deepDive?: HrCenterAnalyticsRunBody["deepDive"] }): Promise<void> => {
      const token = getToken();
      if (!token) return;
      setError(null);
      if (focus === "cost_center" && !costCenterId.trim()) {
        setError("Seleziona un centro di costo.");
        return;
      }
      if (focus === "team" && !teamId.trim()) {
        setError("Seleziona un team / reparto.");
        return;
      }
      if (focus === "employee" && !userId.trim()) {
        setError("Seleziona un dipendente.");
        return;
      }
      setLoading(true);
      try {
        const body = runBody();
        if (opts?.deepDive && opts.deepDive !== "none") {
          body.deepDive = opts.deepDive;
        }
        const r = await postHrCenterAnalytics(token, body);
        setDataset(r.dataset);
        setReport(r.report);
        setLlm(r.llm);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Errore esecuzione analisi");
      } finally {
        setLoading(false);
      }
    },
    [runBody, focus, costCenterId, teamId, userId]
  );

  const ccLabel = useCallback(
    (id: string) => dataset?.byCostCenter.find((r) => r.costCenterId === id)?.costCenterName?.trim() || id,
    [dataset]
  );

  const layoutNarrow = dataset?.analysisFocus === "employee" || dataset?.analysisFocus === "team";

  if (meta && !meta.canAccess) {
    return (
      <p className="text-sm text-[var(--prom-muted)]">Non hai accesso all&apos;analisi Centro HR.</p>
    );
  }

  return (
    <div className={layoutNarrow ? "mx-auto max-w-3xl space-y-4" : "space-y-4"}>
      <GlassCard
        title="Analisi personale e costi"
        description="Scegli il perimetro, poi genera l’analisi. I dati aggregati alimentano grafici e tabelle; l’interpretazione è prodotta dal modello linguistico quando attivo, altrimenti da sintesi locale sullo stesso schema."
      >
        <LlmUsageStatusBanner
          idle={!llm}
          llm={
            llm
              ? {
                  active: llm.active,
                  refineApplied: llm.refineApplied,
                  refineFailure: llm.refineFailure
                }
              : null
          }
        />

        <div className="space-y-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_88%,transparent)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            Perimetro analisi
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-[var(--prom-muted)]">
              Ambito
              <select
                className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
                value={focus}
                onChange={(e) => setFocus(e.target.value as AnalyticsFocus)}
              >
                <option value="company">Azienda (perimetro consentito)</option>
                <option value="cost_center">Centro di costo</option>
                <option value="team">Team / reparto</option>
                <option value="employee">Singolo dipendente</option>
              </select>
            </label>
            {focus === "cost_center" ? (
              <label className="block text-xs text-[var(--prom-muted)]">
                Centro di costo
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
                  value={costCenterId}
                  onChange={(e) => setCostCenterId(e.target.value)}
                >
                  <option value="">Seleziona…</option>
                  {(meta?.costCenterOptions ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {focus === "team" ? (
              <label className="block text-xs text-[var(--prom-muted)] sm:col-span-2">
                Team
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">Seleziona…</option>
                  {(meta?.teamOptions ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {focus === "employee" ? (
              <label className="block text-xs text-[var(--prom-muted)] sm:col-span-2">
                Dipendente
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">Seleziona…</option>
                  {usersForSelect.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <HebbAiPageHelpButton pageKey="hr-center-analisi" />
          <LoadingButton type="button" size="sm" loading={loading} onClick={() => void run()}>
            Genera analisi
          </LoadingButton>
        </div>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {llm?.refineApplied ? (
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--prom-muted)]">
            Nota: la sintesi testuale è stata generata o raffinata con un <strong>modello linguistico (LLM)</strong>.
            Verificare sempre numeri e decisioni operative sulle fonti ufficiali (HR, payroll, contratti).
          </p>
        ) : llm?.active === false ? (
          <p className="mt-2 text-[10px] text-[var(--prom-muted)]">
            LLM non attivo sul server: viene usata la sintesi strutturata locale (stesso schema del percorso con
            modello).
          </p>
        ) : llm?.active && !llm.refineApplied && llm.refineFailure ? (
          <p className="mt-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200/90">
            {refineFailureUserMessage(llm.refineFailure)}
          </p>
        ) : llm?.active && !llm.refineApplied ? (
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--prom-muted)]">
            LLM abilitato ma nessun dettaglio errore dal server: in genere risposta non valida o controlli privacy. Ripeti
            l’analisi o verifica i log backend.
          </p>
        ) : null}

        {!dataset ? (
          <p className="mt-3 text-xs text-[var(--prom-muted)]">
            Imposta il perimetro e premi «Genera analisi»: invio del blocco dati pseudonimizzato al perimetro AI, poi
            ricezione del report strutturato per HR.
          </p>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Indicatori (da dataset aggregato)
              </h4>
              <p className="mt-1 text-xs text-[var(--prom-text)]">{dataset.analysisLabel}</p>
              {dataset.analysisDeepDive ? (
                <p className="mt-1 text-[10px] text-[var(--prom-gold-soft)]">
                  Approfondimento:{" "}
                  {dataset.analysisDeepDive === "master_data"
                    ? "qualità dati anagrafici / CDC"
                    : "budget, organico e turnover (senza numeri inventati)"}
                </p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_85%,transparent)] p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Headcount</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    {dataset.totals.headcount}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--prom-muted)]">Vista permessi: {dataset.scope}</p>
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

            {topThreeShare.length > 0 ? (
              <section className="rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  Concentrazione costo (top 3 centri)
                </h4>
                <p className="mt-1 text-[10px] text-[var(--prom-muted)]">
                  Quota sul totale competenze mensili indicative del campione.
                </p>
                <div className="mt-3 flex h-8 w-full overflow-hidden rounded-lg border border-[var(--prom-line)]">
                  {topThreeShare.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-center px-1 text-[9px] font-medium text-white"
                      style={{
                        width: `${Math.min(100, s.pct)}%`,
                        backgroundColor: i === 0 ? "#002D72" : i === 1 ? "#1a4d8c" : "#3b6cb5"
                      }}
                      title={`${s.label}: ${s.pct}%`}
                    >
                      {s.pct >= 8 ? `${s.pct}%` : ""}
                    </div>
                  ))}
                </div>
                <ul className="mt-2 space-y-1 text-[10px] text-[var(--prom-muted)]">
                  {topThreeShare.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium text-[var(--prom-text)]">{s.label}</span> — {s.pct}%
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Peso per centro di costo (competenze mensili indicative)
              </h4>
              <div className="space-y-2">
                {dataset.byCostCenter.map((row) => {
                  const w = Math.round((row.monthlyGrossSum / maxGross) * 100);
                  const disp = row.costCenterName?.trim() || row.costCenterId;
                  return (
                    <div
                      key={row.costCenterId}
                      className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-[var(--prom-text)]">{disp}</span>
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
                      <td className="px-3 py-2 font-medium text-[var(--prom-text)]">
                        {row.costCenterName?.trim() || row.costCenterId}
                      </td>
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
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-gold)]">
                      Sintesi esecutiva (LLM / HR)
                    </h4>
                    {llm ? (
                      <span className="rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                        {llm.refineApplied ? "Fonte: LLM" : llm.active ? "Fonte: fallback locale" : "Fonte: offline"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {executiveParagraphs.map((para, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-[color-mix(in_srgb,#002D72_22%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)] p-4"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-300/90">
                          Punto {i + 1}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--prom-text)]">{para}</p>
                      </div>
                    ))}
                  </div>
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
                          {ccLabel(c.costCenterId)}
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={loading}
                        onClick={() => void run({ deepDive: "master_data" })}
                      >
                        Approfondisci con AI (dati anagrafici / CDC)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={loading}
                        onClick={() => void run({ deepDive: "budget_turnover" })}
                      >
                        Approfondisci con AI (budget / turnover)
                      </Button>
                      <Link
                        href="/personnel-budget"
                        className="inline-flex h-8 items-center rounded-md border border-transparent px-2 text-xs font-medium text-[var(--prom-text)] underline-offset-4 hover:underline"
                      >
                        Apri budget personale
                      </Link>
                    </div>
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
