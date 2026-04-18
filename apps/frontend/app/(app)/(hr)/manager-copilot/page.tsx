"use client";

import type { Route } from "next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchManagerCopilot } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

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

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
      </div>
    );
  }

  const typeLabel = (t: string): string => {
    if (t === "leave") {
      return "Ferie / permessi";
    }
    if (t === "sickness") {
      return "Malattia";
    }
    if (t === "smartworking") {
      return "Smart working";
    }
    if (t === "travel") {
      return "Missioni";
    }
    return t;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Pannello manager</h1>
        <p className="mt-1 text-sm text-[var(--prom-muted)]">
          Riepilogo operativo sul tuo scope (approvazioni visibili, team diretto, smart working del team). Il punteggio
          turnover medio del team richiede anche il permesso report HR e snapshot aggiornati in{" "}
          <Link href="/insights" className="font-medium text-[#002D72] underline">
            Turnover e retention
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <p className="text-xs font-medium text-[var(--prom-muted)]">Approvazioni in sospeso (tuo ambito)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.pendingTotal}</p>
          <Link
            href={data.routes.approvals as Route}
            className="mt-2 inline-block text-sm font-medium text-[#002D72] underline"
          >
            Vai alle approvazioni
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <p className="text-xs font-medium text-[var(--prom-muted)]">Riporti diretti</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.teamHeadcount}</p>
        </div>
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <p className="text-xs font-medium text-[var(--prom-muted)]">Smart working in attesa (team)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.teamSmartworkingPending}</p>
          <Link
            href={data.routes.smartworking as Route}
            className="mt-2 inline-block text-sm font-medium text-[#002D72] underline"
          >
            Smart working
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <p className="text-xs font-medium text-[var(--prom-muted)]">Score turnover medio team</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
            {data.teamTurnoverAvgScore != null ? data.teamTurnoverAvgScore : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            {data.teamTurnoverAvgScore == null
              ? "Richiede permesso report HR e dati turnover."
              : "Da ultimo snapshot aziendale, solo riporti diretti."}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--prom-line)] p-4">
        <h2 className="text-sm font-semibold text-[var(--prom-text)]">Conteggi per tipo</h2>
        <ul className="mt-2 space-y-1 text-sm text-[var(--prom-muted)]">
          {(["leave", "sickness", "smartworking", "travel"] as const).map((k) => (
            <li key={k} className="flex justify-between gap-2">
              <span>{typeLabel(k)}</span>
              <span className="tabular-nums text-[var(--prom-text)]">{data.pendingByType[k] ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      {data.topPendingPreview.length > 0 ? (
        <div className="rounded-xl border border-[var(--prom-line)] p-4">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Prime in coda</h2>
          <ul className="mt-2 divide-y divide-[var(--prom-line)] text-sm">
            {data.topPendingPreview.map((row, i) => (
              <li key={`${row.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-[var(--prom-text)]">{typeLabel(row.type)}</span>
                <span className="text-xs text-[var(--prom-muted)]">{row.requesterName ?? "—"}</span>
                <span className="text-xs tabular-nums text-[var(--prom-muted)]">
                  {new Date(row.at).toLocaleString("it-IT")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={data.routes.workforcePlanning as Route} className="font-medium text-[#002D72] underline">
          Workforce planning
        </Link>
        <Link href={data.routes.insights as Route} className="font-medium text-[#002D72] underline">
          Turnover e retention
        </Link>
      </div>
    </div>
  );
}
