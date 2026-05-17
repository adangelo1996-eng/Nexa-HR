"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { Button } from "@/components/ui/button";
import {
  fetchMyTrainingAssignments,
  patchTrainingAssignmentStatus,
  type TrainingAssignmentDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function statusLabel(s: TrainingAssignmentDto["status"]): string {
  if (s === "completed") return "Completato";
  if (s === "in_progress") return "In corso";
  return "Da iniziare";
}

function formatDue(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function FormazionePage(): React.JSX.Element {
  const [items, setItems] = useState<TrainingAssignmentDto[]>([]);
  const [progress, setProgress] = useState({ total: 0, completed: 0, inProgress: 0, overdue: 0, percentComplete: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const mandatory = useMemo(() => items.filter((a) => a.course?.category === "mandatory"), [items]);
  const optional = useMemo(() => items.filter((a) => a.course?.category === "optional"), [items]);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchMyTrainingAssignments(token);
      setItems(body.items);
      setProgress(body.progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento formazione");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onStatus(assignment: TrainingAssignmentDto, status: TrainingAssignmentDto["status"]): Promise<void> {
    const token = getToken();
    if (!token) return;
    setBusyId(assignment.id);
    setError(null);
    try {
      await patchTrainingAssignmentStatus(token, assignment.id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aggiornamento non riuscito");
    } finally {
      setBusyId(null);
    }
  }

  function renderList(list: TrainingAssignmentDto[], empty: string): React.JSX.Element {
    if (list.length === 0) {
      return <p className="text-sm text-[var(--prom-muted)]">{empty}</p>;
    }
    const today = new Date().toISOString().slice(0, 10);
    return (
      <ul className="space-y-3">
        {list.map((a) => {
          const overdue = a.status !== "completed" && a.dueDate < today;
          return (
            <li
              key={a.id}
              className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--prom-text)]">{a.course?.title ?? "Corso"}</p>
                  <p className="mt-1 text-xs text-[var(--prom-muted)]">
                    Scadenza: {formatDue(a.dueDate)}
                    {overdue ? " · in ritardo" : ""}
                  </p>
                  {a.course?.description ? (
                    <p className="mt-2 text-sm text-[var(--prom-muted)]">{a.course.description}</p>
                  ) : null}
                  {a.course?.hasQuizPlaceholder ? (
                    <p className="mt-1 text-xs italic text-[var(--prom-muted)]">Quiz in arrivo (placeholder)</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.status === "completed"
                        ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
                        : overdue
                          ? "bg-rose-600/15 text-rose-800 dark:text-rose-200"
                          : "bg-sky-600/15 text-sky-900 dark:text-sky-200"
                    }`}
                  >
                    {statusLabel(a.status)}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {a.status === "not_started" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === a.id}
                        onClick={() => void onStatus(a, "in_progress")}
                      >
                        Inizia
                      </Button>
                    ) : null}
                    {a.status !== "completed" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === a.id}
                        onClick={() => void onStatus(a, "completed")}
                      >
                        Segna completato
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <NexaHrAppPage
      eyebrow="Percorso"
      title="Formazione"
      subtitle="Corsi obbligatori e facoltativi assegnati da HR. Tieni sotto controllo scadenze e completamento."
    >
      <p className="mb-4 text-sm">
        <Link href={"/percorso" as Route} className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200">
          ← Torna al percorso
        </Link>
      </p>

      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {!loading ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-[var(--prom-line)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--prom-muted)]">Avanzamento complessivo</p>
            <p className="mt-1 text-2xl font-semibold text-[#002D72] dark:text-white">{progress.percentComplete}%</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-[#002D72] dark:bg-sky-500"
                style={{ width: `${progress.percentComplete}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--prom-muted)]">
              {progress.completed} completati su {progress.total}
              {progress.overdue > 0 ? ` · ${progress.overdue} in ritardo` : ""}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[var(--prom-text)]">Obbligatori</h2>
            {renderList(mandatory, "Nessun corso obbligatorio assegnato.")}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-[var(--prom-text)]">Facoltativi</h2>
            {renderList(optional, "Nessun corso facoltativo assegnato.")}
          </section>
        </div>
      ) : null}
    </NexaHrAppPage>
  );
}
