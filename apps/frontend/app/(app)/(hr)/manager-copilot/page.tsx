"use client";

import type { Route } from "next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchManagerCopilot } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile,
  hebbAiLinkClassName
} from "@/components/hebb-ai-experience-shell";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";

export default function ManagerCopilotPage(): React.JSX.Element {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchManagerCopilot>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      return;
    }
    void (async (): Promise<void> => {
      try {
        const r = await fetchManagerCopilot(t);
        setData(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore caricamento");
      }
    })();
  }, []);

  const typeLabel = (t: string): string => {
    if (t === "leave") {
      return "Ferie / permessi";
    }
    if (t === "sickness") {
      return "Malattia";
    }
    if (t === "smartworking") {
      return "Remote working";
    }
    if (t === "travel") {
      return "Missioni";
    }
    return t;
  };

  const linkCn = hebbAiLinkClassName();

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Pannello manager"
      subtitle={
        <>
          Riepilogo operativo sul tuo scope: approvazioni visibili, team diretto, remote working del team. Il punteggio
          turnover medio richiede permesso report HR e snapshot in{" "}
          <Link href="/analytics/advanced/retention" scroll={false} className={linkCn}>
            Retention e flight risk
          </Link>
          .
        </>
      }
      headerTrailing={<NexaPageHelpButton pageKey="manager-copilot" />}
    >
      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {!data && !error ? (
        <HebbAiGlassPanel className="py-16 text-center">
          <p className="text-sm text-[var(--prom-muted)]">Caricamento cockpit manager…</p>
        </HebbAiGlassPanel>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <HebbAiGlassTile>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Approvazioni in sospeso
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--prom-text)]">{data.pendingTotal}</p>
              <Link href={data.routes.approvals as Route} scroll={false} className={`mt-3 inline-block text-sm ${linkCn}`}>
                Vai alle approvazioni
              </Link>
            </HebbAiGlassTile>
            <HebbAiGlassTile>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Riporti diretti</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--prom-text)]">{data.teamHeadcount}</p>
            </HebbAiGlassTile>
            <HebbAiGlassTile>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Remote working in attesa (team)
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--prom-text)]">
                {data.teamSmartworkingPending}
              </p>
              <Link href={data.routes.smartworking as Route} scroll={false} className={`mt-3 inline-block text-sm ${linkCn}`}>
                Remote working
              </Link>
            </HebbAiGlassTile>
            <HebbAiGlassTile>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Score turnover medio team
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--prom-text)]">
                {data.teamTurnoverAvgScore != null ? data.teamTurnoverAvgScore : "—"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--prom-muted)]">
                {data.teamTurnoverAvgScore == null
                  ? "Richiede permesso report HR e dati turnover."
                  : "Da ultimo snapshot aziendale, solo riporti diretti."}
              </p>
            </HebbAiGlassTile>
          </div>

          <HebbAiGlassPanel>
            <h2 className="text-lg font-semibold text-[var(--prom-text)]">Conteggi per tipo</h2>
            <ul className="mt-4 space-y-2 text-sm text-[var(--prom-muted)]">
              {(["leave", "sickness", "smartworking", "travel"] as const).map((k) => (
                <li
                  key={k}
                  className="flex justify-between gap-2 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2"
                >
                  <span>{typeLabel(k)}</span>
                  <span className="tabular-nums font-semibold text-[var(--prom-text)]">{data.pendingByType[k] ?? 0}</span>
                </li>
              ))}
            </ul>
          </HebbAiGlassPanel>

          {data.topPendingPreview.length > 0 ? (
            <HebbAiGlassPanel>
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Prime in coda</h2>
              <ul className="mt-4 divide-y divide-[var(--prom-line)] text-sm">
                {data.topPendingPreview.map((row, i) => (
                  <li key={`${row.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="font-medium text-[var(--prom-text)]">{typeLabel(row.type)}</span>
                    <span className="text-xs text-[var(--prom-muted)]">{row.requesterName ?? "—"}</span>
                    <span className="text-xs tabular-nums text-[var(--prom-muted)]">
                      {new Date(row.at).toLocaleString("it-IT")}
                    </span>
                  </li>
                ))}
              </ul>
            </HebbAiGlassPanel>
          ) : null}

          <div className="flex flex-wrap justify-center gap-6 text-sm font-medium">
            <Link href={data.routes.workforcePlanning as Route} scroll={false} className={linkCn}>
              Workforce planning
            </Link>
            <Link href={data.routes.insights as Route} scroll={false} className={linkCn}>
              Turnover e retention
            </Link>
          </div>
        </>
      ) : null}
    </HebbAiExperienceShell>
  );
}
