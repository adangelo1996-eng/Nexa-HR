"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import {
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
  const [roleSource, setRoleSource] = useState<"recruit" | "org" | "manual">("manual");
  const [recruitPositionId, setRecruitPositionId] = useState("");
  const [roleTitleManual, setRoleTitleManual] = useState("");
  const [location, setLocation] = useState("Milano");
  const [seniorityYears, setSeniorityYears] = useState(5);
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
        location: location.trim(),
        seniorityYears: Math.min(45, Math.max(0, Number(seniorityYears) || 0))
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }, [location, recruitPositionId, roleSource, roleTitleManual, seniorityYears]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Benchmark retribuzione</h1>
      <p className="max-w-3xl text-sm text-[var(--prom-muted)]">
        Stima RAL annua lorda di mercato (Italia) in base a ruolo, località e anzianità. Output strutturato con LLM se
        abilitato; altrimenti fascia euristica. Non sostituisce consulenza retributiva né policy interne.
      </p>

      <GlassCard title="Parametri" description="Scegli l’origine del titolo di ruolo e compila i campi.">
        <div className="mt-4 space-y-4">
          <label className="block text-xs text-[var(--prom-muted)]">
            Ruolo da
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-2 text-sm"
              value={roleSource}
              onChange={(e) => setRoleSource(e.target.value as typeof roleSource)}
            >
              <option value="manual">Titolo inserito manualmente</option>
              <option value="org">Ruolo organizzativo del mio profilo</option>
              <option value="recruit">Posizione aperta (recruiting)</option>
            </select>
          </label>
          {roleSource === "recruit" ? (
            <label className="block text-xs text-[var(--prom-muted)]">
              Posizione aperta
              <select
                className="mt-1 w-full max-w-md rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-2 text-sm"
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
              {positions.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-200/90">
                  Nessuna posizione aperta caricata (servono permessi recruiting o nessuna posizione).
                </p>
              ) : null}
            </label>
          ) : null}
          {roleSource === "manual" ? (
            <label className="block text-xs text-[var(--prom-muted)]">
              Titolo ruolo
              <Input
                className="mt-1 max-w-md"
                value={roleTitleManual}
                onChange={(e) => setRoleTitleManual(e.target.value)}
                placeholder="es. Software engineer"
              />
            </label>
          ) : null}
          {roleSource === "org" ? (
            <p className="text-xs text-[var(--prom-muted)]">
              Verrà usato il ruolo organizzativo associato al tuo utente
              {viewer?.roleId ? " (da anagrafica)." : " — se manca, usa manuale o recruiting."}
            </p>
          ) : null}
          <label className="block text-xs text-[var(--prom-muted)]">
            Località (comune, provincia o area)
            <Input className="mt-1 max-w-md" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="block text-xs text-[var(--prom-muted)]">
            Anzianità (anni)
            <Input
              type="number"
              min={0}
              max={45}
              className="mt-1 max-w-xs"
              value={seniorityYears}
              onChange={(e) => setSeniorityYears(Number(e.target.value))}
            />
          </label>
          <Button type="button" disabled={busy} onClick={() => void run()}>
            {busy ? "Calcolo…" : "Calcola benchmark RAL"}
          </Button>
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        </div>
      </GlassCard>

      {result ? (
        <GlassCard title="Esito" description={`Ruolo considerato: ${result.roleResolved}`}>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--prom-line)] p-3">
              <dt className="text-xs uppercase text-[var(--prom-muted)]">Min</dt>
              <dd className="text-lg font-semibold text-[var(--prom-text)]">{fmtEur(result.ralLowEur)}</dd>
            </div>
            <div className="rounded-xl border border-[var(--prom-line)] p-3">
              <dt className="text-xs uppercase text-[var(--prom-muted)]">Mediana</dt>
              <dd className="text-lg font-semibold text-[#002D72] dark:text-sky-200">{fmtEur(result.ralMedianEur)}</dd>
            </div>
            <div className="rounded-xl border border-[var(--prom-line)] p-3">
              <dt className="text-xs uppercase text-[var(--prom-muted)]">Max</dt>
              <dd className="text-lg font-semibold text-[var(--prom-text)]">{fmtEur(result.ralHighEur)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-[var(--prom-muted)]">{result.notesIt}</p>
          <p className="mt-2 text-xs text-[var(--prom-muted)]">
            LLM: {result.llm.active ? "attivo" : "non attivo"} · raffinamento: {result.llm.refineApplied ? "sì" : "no"}.
          </p>
        </GlassCard>
      ) : null}
    </div>
  );
}
