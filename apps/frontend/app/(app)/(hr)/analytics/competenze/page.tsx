"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import {
  fetchSkillsGap,
  postAnalyticsHubRun,
  type AnalyticsHubRunResult
} from "@/lib/api";
import { getToken, getSessionUser, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";

type GapRow = Awaited<ReturnType<typeof fetchSkillsGap>>["items"][number];

function NarrativeBlock(props: { narrative: AnalyticsHubRunResult["narrative"] }): React.JSX.Element {
  const { narrative } = props;
  return (
    <div className="mt-6 space-y-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-[var(--prom-text)]">{narrative.title}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            narrative.llmApplied
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-[var(--prom-line)] text-[var(--prom-muted)]"
          }`}
        >
          {narrative.llmApplied ? "Sintesi AI" : "Template locale"}
        </span>
      </div>
      {narrative.bullets.length > 0 ? (
        <ul className="list-inside list-disc space-y-1.5 text-[var(--prom-text)]">
          {narrative.bullets.map((b, i) => (
            <li key={i} className="leading-relaxed">
              {b}
            </li>
          ))}
        </ul>
      ) : null}
      {narrative.summary ? (
        <p className="border-t border-[var(--prom-line)] pt-3 leading-relaxed text-[var(--prom-muted)]">
          {narrative.summary}
        </p>
      ) : null}
    </div>
  );
}

export default function AnalyticsCompetenzePage(): React.JSX.Element {
  const [items, setItems] = useState<GapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [useLlm, setUseLlm] = useState(true);
  const [result, setResult] = useState<AnalyticsHubRunResult | null>(null);
  const sessionUser = getSessionUser();
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(sessionUser ?? undefined);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetchSkillsGap(token);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento gap competenze");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topGaps = useMemo(
    () =>
      [...items]
        .filter((r) => r.gap > 0)
        .sort((a, b) => b.gap - a.gap || a.roleName.localeCompare(b.roleName, "it"))
        .slice(0, 24),
    [items]
  );

  const runAnalysis = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await postAnalyticsHubRun(token, "a3", { useLlm: useLlm && llmAllowed });
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Esecuzione analisi non riuscita");
    } finally {
      setBusy(false);
    }
  }, [useLlm, llmAllowed]);

  return (
    <NexaHrAppPage
      eyebrow="Analytics & Intelligence"
      title="Gap competenze vs fabbisogno"
      subtitle="Confronto tra competenze mappate e requisiti per ruolo. La narrativa AI usa solo aggregati pseudonimizzati."
    >
      <div className="mb-6">
        <Link
          href={"/analytics" as Route}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Torna all&apos;hub Analytics
        </Link>
      </div>

      <LlmUsageStatusBanner
        className="mb-6"
        idle={!result}
        llm={{
          active: sessionUser?.nexaAiOpenAiEnabled === true,
          refineApplied: result?.narrative.llmApplied === true
        }}
      />

      {llmAllowed ? (
        <label className="mb-6 flex cursor-pointer items-center gap-2 text-sm text-[var(--prom-muted)]">
          <input
            type="checkbox"
            checked={useLlm}
            onChange={(e) => setUseLlm(e.target.checked)}
            className="rounded border-[var(--prom-line)]"
          />
          Usa OpenAI per la narrativa (dati sempre pseudonimizzati)
        </label>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || loading} onClick={() => void runAnalysis()}>
          {busy ? "Analisi in corso…" : "Esegui analisi AI"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento report gap…</p>
      ) : topGaps.length === 0 ? (
        <p className="text-sm text-[var(--prom-muted)]">
          Nessun gap rilevato sui requisiti competenze configurati. Verifica ruoli e mappature in anagrafica.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]" style={{ background: "var(--card-bg)" }}>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--prom-line)] text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
              <tr>
                <th className="px-4 py-3">Ruolo</th>
                <th className="px-4 py-3">Competenza</th>
                <th className="px-4 py-3">Livello richiesto</th>
                <th className="px-4 py-3">Media ruolo</th>
                <th className="px-4 py-3">Gap</th>
                <th className="px-4 py-3">Headcount</th>
              </tr>
            </thead>
            <tbody>
              {topGaps.map((row) => (
                <tr key={`${row.roleId}-${row.skillId}`} className="border-b border-[var(--prom-line)] last:border-0">
                  <td className="px-4 py-2.5 text-[var(--prom-text)]">{row.roleName}</td>
                  <td className="px-4 py-2.5 text-[var(--prom-muted)]">
                    {row.skillName}
                    <span className="ml-1 text-[10px] text-[var(--prom-muted)]">({row.skillCode})</span>
                  </td>
                  <td className="px-4 py-2.5">{row.minLevel}</td>
                  <td className="px-4 py-2.5">{row.avgUserLevel}</td>
                  <td className="px-4 py-2.5 font-medium text-[var(--prom-text)]">{row.gap}</td>
                  <td className="px-4 py-2.5">{row.headcountInRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result ? <NarrativeBlock narrative={result.narrative} /> : null}
    </NexaHrAppPage>
  );
}
