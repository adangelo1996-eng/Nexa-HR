"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getToken } from "@/lib/auth-session";
import {
  createRecruitPosition,
  deleteRecruitPosition,
  fetchRecruitPositions,
  type RecruitPositionDto
} from "@/lib/api";

export default function RecruitingHomePage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [positions, setPositions] = useState<RecruitPositionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const canCreate = title.trim().length > 0 && jd.trim().length > 0;

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    void fetchRecruitPositions(t)
      .then(setPositions)
      .catch((e) => setError(e instanceof Error ? e.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, [router]);

  const openPositions = useMemo(() => positions.filter((p) => p.status === "open"), [positions]);

  async function onCreatePosition(): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      const created = await createRecruitPosition(token, {
        title: title.trim(),
        jobDescription: jd.trim(),
        dueDate: dueDate.trim() ? dueDate.trim() : null
      });
      setPositions((prev) => [created, ...prev]);
      setTitle("");
      setJd("");
      setDueDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore creazione posizione");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Colloqui e selezione</h1>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Hub recruiting: posizioni aperte, candidati e pipeline a fasi.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/recruiting/candidates"
            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
          >
            Vai a candidati
          </Link>
          <Link
            href="/recruiting/onboarding"
            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
          >
            Onboarding assunzioni
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nuova posizione</CardTitle>
          <CardDescription>Definisci titolo, job description, scadenza e crea un Job ID progressivo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Titolo</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Scadenza (entro quando serve il candidato)</span>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Job description</span>
              <textarea
                className="min-h-[140px] w-full resize-y rounded-lg border border-slate-300/90 bg-white/90 p-3 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button type="button" disabled={!canCreate} onClick={() => void onCreatePosition()}>
                Crea posizione
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!token) return;
                  setLoading(true);
                  void fetchRecruitPositions(token)
                    .then(setPositions)
                    .catch((e) => setError(e instanceof Error ? e.message : "Errore"))
                    .finally(() => setLoading(false));
                }}
              >
                Aggiorna
              </Button>
            </div>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posizioni aperte</CardTitle>
          <CardDescription>Apri la pipeline per spostare i candidati tra le fasi.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-synapse-muted">Caricamento…</p> : null}
          {!loading && openPositions.length === 0 ? (
            <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Nessuna posizione aperta.</p>
          ) : (
            <ul className="space-y-2">
              {openPositions.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-synapse-text dark:text-white">{p.title}</p>
                    <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">
                      Job ID: {p.job_code || "—"}
                      {p.due_date ? ` • scadenza ${String(p.due_date).slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/recruiting/pipelines/${encodeURIComponent(p.id)}`}
                      className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
                    >
                      Apri pipeline
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!token) return;
                        if (!window.confirm("Eliminare la posizione aperta?")) return;
                        void deleteRecruitPosition(token, p.id)
                          .then(() => setPositions((prev) => prev.filter((x) => x.id !== p.id)))
                          .catch((e) => setError(e instanceof Error ? e.message : "Errore eliminazione"));
                      }}
                    >
                      Elimina
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

