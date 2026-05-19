"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, MapPin, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexaCompensationRangeChart } from "@/components/nexa-charts";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { Input } from "@/components/ui/input";
import {
  fetchCompensationBenchOrgRoles,
  fetchCurrentUser,
  fetchRecruitPositions,
  postCompensationBenchEstimate,
  type RecruitPositionDto
} from "@/lib/api";
import { getToken, type SessionUser } from "@/lib/auth-session";

function fmtEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default function CompensationBenchPage(): JSX.Element {
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const [positions, setPositions] = useState<RecruitPositionDto[]>([]);
  const [roleSource, setRoleSource] = useState<"recruit" | "org" | "org_select" | "manual">("manual");
  const [orgRoles, setOrgRoles] = useState<{ id: string; name: string }[]>([]);
  const [orgRoleId, setOrgRoleId] = useState("");
  const [ccnlCode, setCcnlCode] = useState("");
  const [recruitPositionId, setRecruitPositionId] = useState("");
  const [roleTitleManual, setRoleTitleManual] = useState("");
  const [location, setLocation] = useState("Milano");
  const [seniorityYears, setSeniorityYears] = useState(5);
  const [showParams, setShowParams] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof postCompensationBenchEstimate>> | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    void fetchCurrentUser(t).then(setViewer).catch(() => undefined);
    void fetchRecruitPositions(t)
      .then((items) => setPositions(items.filter((p) => p.status === "open")))
      .catch(() => setPositions([]));
    void fetchCompensationBenchOrgRoles(t)
      .then((items) => setOrgRoles(items))
      .catch(() => setOrgRoles([]));
  }, []);

  const run = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await postCompensationBenchEstimate(t, {
        roleSource,
        recruitPositionId: roleSource === "recruit" ? recruitPositionId || undefined : undefined,
        roleTitleManual: roleSource === "manual" ? roleTitleManual || undefined : undefined,
        orgRoleId: roleSource === "org_select" ? orgRoleId || undefined : undefined,
        ccnlCode: ccnlCode.trim() || undefined,
        location: location.trim(),
        seniorityYears: Math.min(45, Math.max(0, Number(seniorityYears) || 0))
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }, [ccnlCode, location, orgRoleId, recruitPositionId, roleSource, roleTitleManual, seniorityYears]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[var(--prom-line)] bg-gradient-to-br from-[color-mix(in_srgb,#002D72_10%,transparent)] to-[var(--prom-surface)]/50 p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#002D72] dark:text-sky-300">
            Compensation
          </p>
          <h1 className="mt-1 font-synapse text-2xl font-semibold text-[var(--prom-text)]">Benchmark retribuzione</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--prom-muted)]">
            Stima fascia RAL di mercato (Italia) per ruolo, area e anzianità. Output indicativo — non sostituisce policy HR o
            consulenza retributiva.
          </p>
        </div>
        <NexaPageHelpButton pageKey="compensation-bench" />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border border-[var(--prom-line)] bg-[var(--card-bg)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--prom-text)]">
              <UserRound className="h-4 w-4 text-[#002D72] dark:text-sky-400" />
              Parametri
            </h2>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowParams((v) => !v)}>
              {showParams ? "Chiudi" : "Configura"}
            </Button>
          </div>
          {!showParams ? (
            <p className="mt-3 text-xs text-[var(--prom-muted)]">
              Apri «Configura» per scegliere ruolo, località e anzianità prima del calcolo.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <label className="block text-xs text-[var(--prom-muted)]">
                Ruolo da
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-2 text-sm"
                  value={roleSource}
                  onChange={(e) => setRoleSource(e.target.value as typeof roleSource)}
                >
                  <option value="manual">Titolo manuale</option>
                  <option value="org">Ruolo del mio profilo</option>
                  <option value="org_select">Ruolo da organico</option>
                  <option value="recruit">Posizione recruiting</option>
                </select>
              </label>
              {roleSource === "org_select" ? (
                <label className="block text-xs text-[var(--prom-muted)]">
                  Ruolo organico
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-2 text-sm"
                    value={orgRoleId}
                    onChange={(e) => setOrgRoleId(e.target.value)}
                  >
                    <option value="">Seleziona…</option>
                    {orgRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {roleSource === "recruit" ? (
                <label className="block text-xs text-[var(--prom-muted)]">
                  Posizione aperta
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-2 text-sm"
                    value={recruitPositionId}
                    onChange={(e) => setRecruitPositionId(e.target.value)}
                  >
                    <option value="">Seleziona…</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {roleSource === "manual" ? (
                <label className="block text-xs text-[var(--prom-muted)]">
                  Titolo ruolo
                  <Input className="mt-1" value={roleTitleManual} onChange={(e) => setRoleTitleManual(e.target.value)} placeholder="es. HR Business Partner" />
                </label>
              ) : null}
              {roleSource === "org" ? (
                <p className="text-xs text-[var(--prom-muted)]">
                  Usa il ruolo organizzativo del profilo
                  {viewer?.roleId ? "." : " — se manca, usa manuale o recruiting."}
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                Località
                <Input className="mt-0 flex-1" value={location} onChange={(e) => setLocation(e.target.value)} />
              </label>
              <label className="block text-xs text-[var(--prom-muted)]">
                CCNL (opz.)
                <Input className="mt-1" value={ccnlCode} onChange={(e) => setCcnlCode(e.target.value)} placeholder="Commercio, Metalmeccanico…" />
              </label>
              <label className="block text-xs text-[var(--prom-muted)]">
                Anzianità (anni)
                <Input type="number" min={0} max={45} className="mt-1 max-w-[8rem]" value={seniorityYears} onChange={(e) => setSeniorityYears(Number(e.target.value))} />
              </label>
              <Button type="button" disabled={busy} className="w-full gap-2" onClick={() => void run()}>
                <BarChart3 className="h-4 w-4" />
                {busy ? "Calcolo…" : "Calcola benchmark RAL"}
              </Button>
              {err ? <p className="text-sm text-rose-600">{err}</p> : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--prom-line)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--prom-text)]">
            <Sparkles className="h-4 w-4 text-[#002D72] dark:text-sky-400" />
            Esito benchmark
          </h2>
          {!result ? (
            <p className="mt-6 text-sm text-[var(--prom-muted)]">
              Configura i parametri e avvia il calcolo per vedere minimo, mediana e massimo RAL.
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs text-[var(--prom-muted)]">Ruolo: {result.roleResolved}</p>
              <NexaCompensationRangeChart
                className="mt-5"
                low={result.ralLowEur}
                median={result.ralMedianEur}
                high={result.ralHighEur}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <p className="rounded-lg border border-[var(--prom-line)] px-3 py-2 text-center text-xs text-[var(--prom-muted)]">
                  Min <span className="block text-base font-semibold text-[var(--prom-text)]">{fmtEur(result.ralLowEur)}</span>
                </p>
                <p className="rounded-lg border border-[#002D72]/35 px-3 py-2 text-center text-xs text-[#002D72] dark:text-sky-300">
                  Mediana <span className="block text-base font-semibold">{fmtEur(result.ralMedianEur)}</span>
                </p>
                <p className="rounded-lg border border-[var(--prom-line)] px-3 py-2 text-center text-xs text-[var(--prom-muted)]">
                  Max <span className="block text-base font-semibold text-[var(--prom-text)]">{fmtEur(result.ralHighEur)}</span>
                </p>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[var(--prom-muted)]">{result.notesIt}</p>
              <p className="mt-2 text-[10px] text-[var(--prom-muted)]">
                LLM {result.llm.active ? "attivo" : "non attivo"} · raffinamento {result.llm.refineApplied ? "sì" : "no"}.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
