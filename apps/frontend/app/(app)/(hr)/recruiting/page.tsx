"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, ChevronDown, Users } from "lucide-react";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
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
  const [showCreateForm, setShowCreateForm] = useState(false);

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
      setShowCreateForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore creazione posizione");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Colloqui e selezione</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-synapse-muted dark:text-[#b4c9dc]">
            Gestisci le posizioni aperte, sposta i candidati tra le fasi della pipeline e passa all&apos;onboarding quando
            l&apos;offerta è accettata. Tutto in autonomia, senza passaggi nascosti.
          </p>
        </div>
        <NexaPageHelpButton pageKey="recruiting" />
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/recruiting/candidates"
          className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--prom-surface)] p-4 transition hover:border-[color-mix(in_srgb,#002D72_30%,var(--card-border))]"
        >
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-[#002D72] dark:text-sky-200" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-synapse-text dark:text-white">Anagrafica candidati</span>
            <span className="mt-1 block text-xs text-synapse-muted dark:text-[#b4c9dc]">
              Cerca, filtra e apri le schede con CV e note.
            </span>
          </span>
        </Link>
        <Link
          href="/recruiting/onboarding"
          className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--prom-surface)] p-4 transition hover:border-[color-mix(in_srgb,#002D72_30%,var(--card-border))]"
        >
          <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-[#002D72] dark:text-sky-200" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-synapse-text dark:text-white">Onboarding assunzioni</span>
            <span className="mt-1 block text-xs text-synapse-muted dark:text-[#b4c9dc]">
              Candidati in colonna onboarding: wizard HR e contratto.
            </span>
          </span>
        </Link>
        <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white/40 p-4 dark:bg-[#052642]/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-200">Come funziona</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-synapse-muted dark:text-[#b4c9dc]">
            <li>Crea o apri una posizione</li>
            <li>Sposta i candidati in pipeline</li>
            <li>Onboarding dopo l&apos;offerta</li>
          </ol>
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle>Posizioni aperte</CardTitle>
            <CardDescription>
              Ogni posizione ha una pipeline a colonne: colloquio, valutazione, offerta, onboarding.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!token || loading}
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
            <Button type="button" size="sm" onClick={() => setShowCreateForm((v) => !v)}>
              {showCreateForm ? "Chiudi form" : "Nuova posizione"}
              <ChevronDown
                className={`ml-1 h-4 w-4 transition ${showCreateForm ? "rotate-180" : ""}`}
                aria-hidden
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {showCreateForm ? (
            <form
              className="rounded-xl border border-[var(--card-border)] bg-white/60 p-4 dark:bg-[#052642]/80"
              onSubmit={(e) => {
                e.preventDefault();
                void onCreatePosition();
              }}
            >
              <p className="text-sm font-medium text-synapse-text dark:text-white">Crea una nuova posizione</p>
              <p className="mt-1 text-xs text-synapse-muted dark:text-[#b4c9dc]">
                Titolo e job description sono obbligatori; la scadenza aiuta il team a prioritizzare.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Titolo *</span>
                  <Input
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    minLength={1}
                    autoComplete="off"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Scadenza candidatura</span>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Job description *</span>
                  <textarea
                    name="jobDescription"
                    className="min-h-[120px] w-full resize-y rounded-lg border border-slate-300/90 bg-white/90 p-3 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    required
                    minLength={1}
                  />
                </label>
                <Button type="submit" disabled={!canCreate}>
                  Crea posizione
                </Button>
              </div>
            </form>
          ) : null}

          {loading ? <p className="text-sm text-synapse-muted">Caricamento…</p> : null}
          {!loading && openPositions.length === 0 ? (
            <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
              Nessuna posizione aperta. Usa «Nuova posizione» per iniziare un processo di selezione.
            </p>
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
                      scroll={false}
                      className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
                    >
                      Apri pipeline
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
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
