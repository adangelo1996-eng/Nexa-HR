"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BookOpen, CalendarClock, ShieldAlert, Users } from "lucide-react";
import { HebbFieldAssistButton, HebbFieldAssistProvider } from "@/components/hebb-field-assist";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { Button } from "@/components/ui/button";
import {
  assignTrainingCoursesBatch,
  fetchCompanyTrainingAssignments,
  fetchTrainingCourses,
  fetchTrainingValidityAlerts,
  fetchUsers,
  postTrainingAssignmentReminder,
  postTrainingValidityRenewal,
  type TrainingAssignmentDto,
  type TrainingCourseDto,
  type TrainingValidityAlertDto,
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

function assignmentProgressPercent(status: TrainingAssignmentDto["status"]): number {
  if (status === "completed") return 100;
  if (status === "in_progress") return 55;
  return 8;
}

function formatDue(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function formatValidityMonths(months: number | null | undefined): string {
  if (!months) return "Senza scadenza copertura";
  if (months % 12 === 0 && months >= 12) {
    const years = months / 12;
    return years === 1 ? "Validità 1 anno" : `Validità ${years} anni`;
  }
  return `Validità ${months} mesi`;
}

function validityAlertLabel(alert: TrainingValidityAlertDto): string {
  if (alert.status === "expired") {
    const days = Math.abs(alert.daysUntilExpiry);
    return days === 0 ? "Copertura scaduta oggi" : `Copertura scaduta da ${days} giorni`;
  }
  if (alert.daysUntilExpiry === 0) return "Copertura in scadenza oggi";
  if (alert.daysUntilExpiry === 1) return "Copertura in scadenza domani";
  return `Copertura in scadenza tra ${alert.daysUntilExpiry} giorni`;
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
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);
  const [renewBusyId, setRenewBusyId] = useState<string | null>(null);
  const [validityAlerts, setValidityAlerts] = useState<TrainingValidityAlertDto[]>([]);
  const [validityThresholdDays, setValidityThresholdDays] = useState(30);
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
      const [catalog, assigned, people, validity] = await Promise.all([
        fetchTrainingCourses(token),
        fetchCompanyTrainingAssignments(token),
        fetchUsers(token).catch(() => [] as User[]),
        fetchTrainingValidityAlerts(token, validityThresholdDays).catch(() => ({
          items: [] as TrainingValidityAlertDto[],
          thresholdDays: validityThresholdDays
        }))
      ]);
      setCourses(catalog.items);
      setAssignments(assigned.items);
      setUsers(people.filter((u) => u.role !== "superuser"));
      setValidityAlerts(validity.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router, validityThresholdDays]);

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

  const assignmentsByEmployee = useMemo(() => {
    const map = new Map<string, TrainingAssignmentDto[]>();
    for (const a of assignments) {
      const list = map.get(a.userId) ?? [];
      list.push(a);
      map.set(a.userId, list);
    }
    const today = new Date().toISOString().slice(0, 10);
    return [...map.entries()]
      .map(([userId, rows]) => {
        const u = userById.get(userId);
        const name = u?.fullName ?? u?.email ?? userId;
        const sorted = [...rows].sort((x, y) => x.dueDate.localeCompare(y.dueDate));
        const completed = sorted.filter((r) => r.status === "completed").length;
        const overdue = sorted.filter((r) => r.status !== "completed" && r.dueDate < today).length;
        return { userId, name, rows: sorted, completed, overdue, total: sorted.length };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [assignments, userById]);

  async function sendFriendlyReminder(assignmentId: string): Promise<void> {
    const token = getToken();
    if (!token || isSuperuser) return;
    setReminderBusyId(assignmentId);
    setError(null);
    try {
      await postTrainingAssignmentReminder(token, assignmentId);
      setMsg("Promemoria inviato al dipendente (notifica in app).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promemoria non inviato");
    } finally {
      setReminderBusyId(null);
    }
  }

  async function sendRenewalAssignment(assignmentId: string): Promise<void> {
    const token = getToken();
    if (!token || isSuperuser) return;
    setRenewBusyId(assignmentId);
    setError(null);
    try {
      await postTrainingValidityRenewal(token, assignmentId);
      setMsg("Corso rinnovato e notifica inviata al dipendente (in app).");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rinnovo non inviato");
    } finally {
      setRenewBusyId(null);
    }
  }

  const expiredValidityCount = useMemo(
    () => validityAlerts.filter((a) => a.status === "expired").length,
    [validityAlerts]
  );

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

      {!loading && validityAlerts.length > 0 ? (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--prom-text)]">
                  Validità corsi in scadenza
                  {expiredValidityCount > 0 ? (
                    <span className="ml-2 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {expiredValidityCount} scadute
                    </span>
                  ) : null}
                </h2>
                <p className="mt-1 text-xs text-[var(--prom-muted)]">
                  Copertura normativa in esaurimento entro {validityThresholdDays} giorni. Invia il rinnovo al
                  dipendente con assegnazione e notifica in app.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
              Soglia alert
              <select
                className="rounded-lg border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm"
                value={validityThresholdDays}
                onChange={(e) => setValidityThresholdDays(Number(e.target.value))}
              >
                {[15, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} giorni
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="mt-4 space-y-2">
            {validityAlerts.map((alert) => {
              const employee = userById.get(alert.userId);
              const employeeName = employee?.fullName ?? employee?.email ?? alert.userId;
              return (
                <li
                  key={alert.assignmentId}
                  className="flex flex-col gap-2 rounded-lg border border-amber-500/25 bg-[var(--card-bg)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--prom-text)]">
                      {employeeName} · {alert.courseTitle}
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${alert.status === "expired" ? "font-semibold text-rose-700 dark:text-rose-300" : "text-amber-800 dark:text-amber-200"}`}
                    >
                      {validityAlertLabel(alert)} · Fine copertura {formatDue(alert.coverageEndDate)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5 border-amber-600/40"
                    disabled={renewBusyId === alert.assignmentId || isSuperuser}
                    onClick={() => void sendRenewalAssignment(alert.assignmentId)}
                  >
                    <Bell className="h-3.5 w-3.5" />
                    {renewBusyId === alert.assignmentId ? "Invio…" : "Invia rinnovo corso"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
                    {c.validityMonths != null ? ` · ${formatValidityMonths(c.validityMonths)}` : ""}
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
          <HebbFieldAssistProvider
            formId="hr.formazione.assign"
            partialForm={{ courseId, dueDate, assignAll }}
            context={{ suggestDueDays: 14 }}
          >
          <form className="mt-5 space-y-5" onSubmit={(ev) => void onBatchAssign(ev)}>
            <label className="block max-w-md text-sm">
              <span className="flex items-center justify-between gap-2 text-[var(--prom-muted)]">
                Corso
                <HebbFieldAssistButton
                  fieldKey="courseId"
                  onSuggest={(res) => setCourseId(String(res.value ?? ""))}
                />
              </span>
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
              <span className="flex items-center justify-between gap-2 text-[var(--prom-muted)]">
                Scadenza obbligo
                <HebbFieldAssistButton
                  fieldKey="dueDate"
                  onSuggest={(res) => setDueDate(String(res.value ?? dueDate))}
                />
              </span>
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
          </HebbFieldAssistProvider>
        </section>
      ) : null}

      {!loading && tab === "monitor" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--card-bg)] p-4">
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Monitoraggio per dipendente</h2>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Avanzamento corsi, scadenze e promemoria gentile (notifica in app).
            </p>
          </div>
          {assignments.length === 0 ? (
            <p className="text-sm text-[var(--prom-muted)]">Nessuna assegnazione registrata.</p>
          ) : (
            <ul className="space-y-4">
              {assignmentsByEmployee.map((group) => (
                <li
                  key={group.userId}
                  className="rounded-xl border border-[var(--prom-line)] bg-[var(--card-bg)] shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--prom-line)] px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--prom-text)]">{group.name}</p>
                      <p className="text-xs text-[var(--prom-muted)]">
                        {group.completed}/{group.total} completati
                        {group.overdue > 0 ? (
                          <span className="ml-2 font-medium text-rose-700 dark:text-rose-300">
                            · {group.overdue} in ritardo
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-[var(--prom-line)]">
                      <div
                        className="h-full rounded-full bg-[#002D72] transition-all dark:bg-sky-600"
                        style={{
                          width: `${group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0}%`
                        }}
                      />
                    </div>
                  </div>
                  <ul className="divide-y divide-[var(--prom-line)]/70">
                    {group.rows.map((a) => {
                      const today = new Date().toISOString().slice(0, 10);
                      const overdue = a.status !== "completed" && a.dueDate < today;
                      const pct = assignmentProgressPercent(a.status);
                      return (
                        <li
                          key={a.id}
                          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--prom-text)]">{a.course?.title ?? "—"}</p>
                            <p
                              className={`mt-0.5 text-xs ${overdue ? "font-semibold text-rose-700 dark:text-rose-300" : "text-[var(--prom-muted)]"}`}
                            >
                              Scadenza {formatDue(a.dueDate)}
                              {overdue ? " · Scaduto" : ""} · {statusLabel(a.status)}
                              {a.status === "completed" && a.completedAt && a.course?.validityMonths ? (
                                <span>
                                  {" "}
                                  · Copertura fino al{" "}
                                  {formatDue(
                                    (() => {
                                      const base = new Date(a.completedAt);
                                      base.setMonth(base.getMonth() + (a.course?.validityMonths ?? 0));
                                      return base.toISOString().slice(0, 10);
                                    })()
                                  )}
                                </span>
                              ) : null}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--prom-line)]">
                                <div
                                  className={`h-full rounded-full ${overdue ? "bg-rose-600" : "bg-[#002D72] dark:bg-sky-600"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] tabular-nums text-[var(--prom-muted)]">{pct}%</span>
                            </div>
                          </div>
                          {a.status !== "completed" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="shrink-0 gap-1.5"
                              disabled={reminderBusyId === a.id || isSuperuser}
                              onClick={() => void sendFriendlyReminder(a.id)}
                            >
                              <Bell className="h-3.5 w-3.5" />
                              {reminderBusyId === a.id ? "Invio…" : "Invia promemoria"}
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </NexaHrAppPage>
  );
}
