"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRecruitOnboardingBoard, type RecruitOnboardingRowDto } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function stageStatusLabel(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "in_progress") {
    return "In corso";
  }
  if (s === "passed") {
    return "Fase superata";
  }
  if (s === "failed") {
    return "Non superata";
  }
  return status;
}

export default function RecruitingOnboardingPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<RecruitOnboardingRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...items].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
    [items]
  );

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    void fetchRecruitOnboardingBoard(t)
      .then((body) => setItems(body.items ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/recruiting"
            className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
          >
            ← Colloqui e selezione
          </Link>
        </div>
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Onboarding assunzioni</h1>
        <p className="max-w-3xl text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Dopo le fasi di colloquio, i candidati presi in carico entrano nella colonna dedicata della pipeline. Qui
          trovi tutti i profili attualmente in fase di onboarding documentale e contrattuale, prima dell&apos;ingresso
          operativo in azienda.
        </p>
      </header>

      <Card className="border-[var(--card-border)]">
        <CardHeader>
          <CardTitle className="text-lg">Percorso consigliato</CardTitle>
          <CardDescription>Allinea il team HR su attività e responsabilità tipiche.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-4 md:grid-cols-2">
            <li className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4 dark:bg-[#052642]/80">
              <span className="text-xs font-semibold text-[#002D72] dark:text-sky-200">1 · Documentazione</span>
              <p className="mt-2 text-sm text-synapse-text dark:text-white">
                CV, consensi privacy, allegati e verifiche preliminari; archivia in scheda candidato.
              </p>
            </li>
            <li className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4 dark:bg-[#052642]/80">
              <span className="text-xs font-semibold text-[#002D72] dark:text-sky-200">2 · Contratto</span>
              <p className="mt-2 text-sm text-synapse-text dark:text-white">
                Genera o importa il contratto standard, invia per firma e monitora lo stato fino alla chiusura.
              </p>
            </li>
            <li className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4 dark:bg-[#052642]/80">
              <span className="text-xs font-semibold text-[#002D72] dark:text-sky-200">3 · Anagrafica</span>
              <p className="mt-2 text-sm text-synapse-text dark:text-white">
                Crea o aggiorna l&apos;utenza dipendente, imposta lo stato occupazionale su onboarding HR fino al
                day-one.
              </p>
            </li>
            <li className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4 dark:bg-[#052642]/80">
              <span className="text-xs font-semibold text-[#002D72] dark:text-sky-200">4 · Day one</span>
              <p className="mt-2 text-sm text-synapse-text dark:text-white">
                Sposta in &quot;assunto&quot; o attiva il dipendente quando inizia l&apos;attività; tieni traccia su{" "}
                <Link href="/hr-recap" className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200">
                  Recap HR
                </Link>
                .
              </p>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card className="border-[var(--card-border)]">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Candidati in colonna onboarding</CardTitle>
            <CardDescription>Stato riferito alla fase corrente nella pipeline della posizione.</CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!token}
            onClick={() => {
              if (!token) {
                return;
              }
              setLoading(true);
              void fetchRecruitOnboardingBoard(token)
                .then((body) => setItems(body.items ?? []))
                .catch((e) => setError(e instanceof Error ? e.message : "Errore"))
                .finally(() => setLoading(false));
            }}
          >
            Aggiorna
          </Button>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
              Nessun candidato in onboarding. Quando una posizione ha la colonna &quot;Onboarding assunzione&quot; e
              sposti un candidato lì dopo i colloqui, apparirà in questa lista.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] text-left text-xs text-synapse-muted dark:text-[#b4c9dc]">
                    <th className="py-2 pr-3 font-medium">Candidato</th>
                    <th className="py-2 pr-3 font-medium">Posizione</th>
                    <th className="py-2 pr-3 font-medium">Stato fase</th>
                    <th className="py-2 pr-3 font-medium">Aggiornato</th>
                    <th className="py-2 font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const name = `${row.candidate.first_name} ${row.candidate.last_name}`.trim();
                    return (
                      <tr key={row.state_id} className="border-b border-[var(--card-border)]/80">
                        <td className="py-2 pr-3 align-top font-medium text-synapse-text dark:text-white">{name}</td>
                        <td className="py-2 pr-3 align-top text-synapse-text dark:text-white">{row.position_title}</td>
                        <td className="py-2 pr-3 align-top text-synapse-text dark:text-white">
                          {stageStatusLabel(row.status)}
                        </td>
                        <td className="py-2 pr-3 align-top text-synapse-muted dark:text-[#b4c9dc]">
                          {formatUpdated(row.updated_at)}
                        </td>
                        <td className="py-2 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/recruiting/candidates/${encodeURIComponent(row.candidate.id)}`}
                              className="inline-flex items-center justify-center rounded-lg border border-synapse-gold/30 bg-white/70 px-3 py-1 text-xs font-medium text-synapse-text transition-colors hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
                            >
                              Scheda
                            </Link>
                            <Link
                              href={`/recruiting/pipelines/${encodeURIComponent(row.position_id)}`}
                              className="inline-flex items-center justify-center rounded-lg border border-synapse-gold/30 bg-white/70 px-3 py-1 text-xs font-medium text-synapse-text transition-colors hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
                            >
                              Pipeline
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
