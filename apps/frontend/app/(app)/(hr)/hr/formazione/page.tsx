"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarClock, Users } from "lucide-react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { Button } from "@/components/ui/button";
import {
  assignTrainingCoursesBatch,
  fetchCompanyTrainingAssignments,
  fetchTrainingCourses,
  fetchUsers,
  type TrainingAssignmentDto,
  type TrainingCourseDto,
  type User
} from "@/lib/api";
import { getSessionUser, getToken, sessionCanAccessHrRecapDashboard } from "@/lib/auth-session";

type TabId = "catalog" | "assign" | "monitor";

function categoryLabel(c: TrainingCourseDto["category"]): string {
  return c === "mandatory" ? "Obbligatorio" : "Facoltativo";
}

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

export default function HrFormazionePage(): React.JSX.Element | null {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("catalog");
  const [courses, setCourses] = useState<TrainingCourseDto[]>([]);
  const [assignments, setAssignments] = useState<TrainingAssignmentDto[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [assignAll, setAssignAll] = useState(false);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const isSuperuser = getSessionUser()?.role === "superuser";

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const sessionUser = getSessionUser();
    if (!sessionCanAccessHrRecapDashboard(sessionUser) && sessionUser?.role !== "superuser") {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [catalog, assigned, people] = await Promise.all([
        fetchTrainingCourses(token),
        fetchCompanyTrainingAssignments(token),
        fetchUsers(token).catch(() => [] as User[])
      ]);
      setCourses(catalog.items);
      setAssignments(assigned.items);
      setUsers(people.filter((u) => u.role !== "superuser"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleUser(id: string): void {
    setAssignAll(false);
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUsers(): void {
    setAssignAll(true);
    setSelectedUserIds(new Set(users.map((u) => u.id)));
  }

  async function onBatchAssign(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const token = getToken();
    if (!token || !courseId || !dueDate) {
      setMsg("Seleziona corso e data obbligo.");
      return;
    }
    const userIds = assignAll ? [] : [...selectedUserIds];
    if (!assignAll && userIds.length === 0) {
      setMsg("Seleziona almeno un dipendente o usa «Tutti i dipendenti».");
      return;
    }
    setAssigning(true);
    setMsg(null);
    setError(null);
    try {
      const result = await assignTrainingCoursesBatch(token, {
        courseIds: [courseId],
        userIds,
        dueDate,
        assignAllEmployees: assignAll
      });
      setMsg(`Assegnazione completata: ${result.assignedCount} record creati/aggiornati.`);
      setSelectedUserIds(new Set());
      setAssignAll(false);
      setCourseId("");
      setTab("monitor");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assegnazione non riuscita");
    } finally {
      setAssigning(false);
    }
  }

  const overdueCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return assignments.filter((a) => a.status !== "completed" && a.dueDate < today).length;
  }, [assignments]);

  return (
    <NexaHrAppPage
      eyebrow="Persone"
      title="Formazione HR"
      subtitle="Catalogo corsi predefiniti, assegnazione batch con scadenza obbligatoria e monitoraggio completamenti."
      headerTrailing={<NexaPageHelpButton pageKey="hr-formazione" />}
    >
      {isSuperuser ? (
        <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-900 dark:text-sky-100">
          Profilo superuser: puoi consultare il catalogo e le anteprime; l&apos;assegnazione batch richiede permessi HR.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-[var(--prom-line)] pb-3">
        {(
          [
            ["catalog", "Catalogo", BookOpen],
            ["assign", "Assegna", Users],
            ["monitor", "Monitoraggio", CalendarClock]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
              tab === id
                ? "bg-[#002D72] text-white dark:bg-sky-600"
                : "bg-[var(--prom-surface)] text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === "monitor" && overdueCount > 0 ? (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">{overdueCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p> : null}

      {!loading && tab === "catalog" ? (
        <section className="grid gap-4 md:grid-cols-2">
          {courses.map((c) => (
            <article
              key={c.id}
              className="flex flex-col rounded-xl border border-[var(--prom-line)] bg-[var(--card-bg)] p-4 shadow-sm transition hover:border-[color-mix(in_srgb,#002D72_35%,var(--prom-line))]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--prom-text)]">{c.title}</p>
                  <p className="mt-1 text-xs text-[var(--prom-muted)]">
                    {categoryLabel(c.category)} · {c.durationMinutes} min
                    {c.courseContent?.length ? ` · ${c.courseContent.length} moduli` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {c.code}
                </span>
              </div>
              {c.description ? <p className="mt-3 flex-1 text-sm text-[var(--prom-muted)]">{c.description}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/hr/formazione/corso/${c.id}` as Route}
                  className="inline-flex items-center justify-center rounded-lg border border-synapse-gold/30 bg-white/70 px-3 py-1 text-xs font-medium text-synapse-text hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
                >
                  Anteprima player
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCourseId(c.id);
                    setTab("assign");
                  }}
                >
                  Assegna…
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {!loading && tab === "assign" ? (
        <section className="rounded-xl border border-[var(--prom-line)] p-4 md:p-6">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Assegna corso con scadenza obbligatoria</h2>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            Scegli il corso, i destinatari (tutti o selezionati) e la data entro cui completarlo.
          </p>
          <form className="mt-5 space-y-5" onSubmit={(ev) => void onBatchAssign(ev)}>
            <label className="block max-w-md text-sm">
              <span className="text-[var(--prom-muted)]">Corso</span>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
              >
                <option value="">Seleziona corso…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({categoryLabel(c.category)})
                  </option>
                ))}
              </select>
            </label>

            <label className="block max-w-xs text-sm">
              <span className="text-[var(--prom-muted)]">Scadenza obbligo</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </label>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--prom-muted)]">Dipendenti</span>
                <Button type="button" size="sm" variant="outline" onClick={selectAllUsers}>
                  Tutti ({users.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAssignAll(false);
                    setSelectedUserIds(new Set());
                  }}
                >
                  Deseleziona
                </Button>
              </div>
              <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--prom-line)] p-2">
                {users.map((u) => (
                  <li key={u.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--prom-surface)]">
                      <input
                        type="checkbox"
                        checked={assignAll || selectedUserIds.has(u.id)}
                        onChange={() => toggleUser(u.id)}
                        disabled={assignAll}
                      />
                      <span>{u.fullName || u.email}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--prom-muted)]">
                {assignAll ? `Assegnazione a tutti i ${users.length} dipendenti attivi.` : `${selectedUserIds.size} selezionati.`}
              </p>
            </div>

            <Button type="submit" disabled={assigning || isSuperuser}>
              {assigning ? "Assegnazione…" : "Assegna corso"}
            </Button>
          </form>
        </section>
      ) : null}

      {!loading && tab === "monitor" ? (
        <section className="rounded-xl border border-[var(--prom-line)] p-4">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Assegnazioni aziendali</h2>
          {assignments.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--prom-muted)]">Nessuna assegnazione registrata.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--prom-line)] text-xs text-[var(--prom-muted)]">
                    <th className="pb-2 pr-3 font-medium">Dipendente</th>
                    <th className="pb-2 pr-3 font-medium">Corso</th>
                    <th className="pb-2 pr-3 font-medium">Scadenza</th>
                    <th className="pb-2 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => {
                    const u = userById.get(a.userId);
                    const today = new Date().toISOString().slice(0, 10);
                    const overdue = a.status !== "completed" && a.dueDate < today;
                    return (
                      <tr key={a.id} className="border-b border-[var(--prom-line)]/60">
                        <td className="py-2 pr-3">{u?.fullName ?? u?.email ?? a.userId}</td>
                        <td className="py-2 pr-3">{a.course?.title ?? "—"}</td>
                        <td className={`py-2 pr-3 ${overdue ? "font-medium text-rose-700 dark:text-rose-300" : ""}`}>
                          {formatDue(a.dueDate)}
                          {overdue ? " · in ritardo" : ""}
                        </td>
                        <td className="py-2">{statusLabel(a.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </NexaHrAppPage>
  );
}
