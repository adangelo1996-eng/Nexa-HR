"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { Button } from "@/components/ui/button";
import {
  assignTrainingCourses,
  fetchCompanyTrainingAssignments,
  fetchTrainingCourses,
  fetchUsers,
  type TrainingAssignmentDto,
  type TrainingCourseDto,
  type User
} from "@/lib/api";
import { getSessionUser, getToken, sessionCanAccessHrRecapDashboard } from "@/lib/auth-session";

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
  const [courses, setCourses] = useState<TrainingCourseDto[]>([]);
  const [assignments, setAssignments] = useState<TrainingAssignmentDto[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [userId, setUserId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    if (!sessionCanAccessHrRecapDashboard(getSessionUser())) {
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

  async function onAssign(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const token = getToken();
    if (!token || !userId || !courseId || !dueDate) {
      setMsg("Compila dipendente, corso e scadenza.");
      return;
    }
    setAssigning(true);
    setMsg(null);
    setError(null);
    try {
      await assignTrainingCourses(token, { userId, courseIds: [courseId], dueDate });
      setMsg("Corso assegnato correttamente.");
      setCourseId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assegnazione non riuscita");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <NexaHrAppPage
      eyebrow="Persone"
      title="Formazione"
      subtitle="Catalogo corsi, assegnazioni ai dipendenti e monitoraggio scadenze."
    >
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p> : null}

      {!loading ? (
        <div className="space-y-8">
          <section className="rounded-xl border border-[var(--prom-line)] p-4">
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Catalogo corsi</h2>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              {courses.length} corsi attivi per l&apos;azienda
            </p>
            <ul className="mt-4 divide-y divide-[var(--prom-line)]">
              {courses.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0">
                  <div>
                    <p className="font-medium text-[var(--prom-text)]">{c.title}</p>
                    <p className="mt-1 text-xs text-[var(--prom-muted)]">
                      {categoryLabel(c.category)} · {c.durationMinutes} min
                      {c.courseContent?.length ? ` · ${c.courseContent.length} moduli` : ""}
                    </p>
                    {c.description ? (
                      <p className="mt-2 max-w-2xl text-sm text-[var(--prom-muted)]">{c.description}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {c.code}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--prom-line)] p-4">
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Assegna corso</h2>
            <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={(ev) => void onAssign(ev)}>
              <label className="block text-sm">
                <span className="text-[var(--prom-muted)]">Dipendente</span>
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                >
                  <option value="">Seleziona…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--prom-muted)]">Corso</span>
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  required
                >
                  <option value="">Seleziona…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--prom-muted)]">Scadenza</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </label>
              <div className="md:col-span-3">
                <Button type="submit" disabled={assigning}>
                  {assigning ? "Assegnazione…" : "Assegna corso"}
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-[var(--prom-line)] p-4">
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Assegnazioni</h2>
            {assignments.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--prom-muted)]">Nessuna assegnazione registrata.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
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
                          <td className="py-2 pr-3">
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
        </div>
      ) : null}
    </NexaHrAppPage>
  );
}
