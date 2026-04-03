"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createLeavePlan,
  createSmartworkingRequest,
  fetchCurrentUser,
  fetchHrWorkCalendar,
  fetchMeTeamWorkCalendar,
  fetchUsers,
  reportSickness,
  type CalendarEventDto,
  type User
} from "@/lib/api";
import { clearSession, getToken, shouldClearSessionOnUnauthorizedApiError, type SessionUser } from "@/lib/auth-session";

type RowUser = { id: string; fullName: string };

function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(last)}`
  };
}

function kindStyle(kind: CalendarEventDto["kind"]): string {
  switch (kind) {
    case "shift":
      return "border-blue-500/50 bg-blue-500/15 text-blue-900 dark:text-blue-100";
    case "smartworking":
      return "border-violet-500/50 bg-violet-500/15 text-violet-900 dark:text-violet-100";
    case "leave":
      return "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100";
    case "rol":
      return "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100";
    case "holiday":
      return "border-rose-500/50 bg-rose-500/15 text-rose-900 dark:text-rose-100";
    case "sickness":
      return "border-orange-500/50 bg-orange-500/15 text-orange-900 dark:text-orange-100";
    default:
      return "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]";
  }
}

function eventTouchesDay(ev: CalendarEventDto, dayIso: string): boolean {
  const d = dayIso.slice(0, 10);
  const s = ev.start.slice(0, 10);
  const e = (ev.end ?? ev.start).slice(0, 10);
  return d >= s && d <= e;
}

function eventsForCell(events: CalendarEventDto[], userId: string, dayIso: string): CalendarEventDto[] {
  const list: CalendarEventDto[] = [];
  for (const ev of events) {
    if (!eventTouchesDay(ev, dayIso)) continue;
    if (ev.kind === "holiday") {
      list.push(ev);
      continue;
    }
    if (ev.userId === userId) list.push(ev);
  }
  return list;
}

function holidayTitleForDay(events: CalendarEventDto[], dayIso: string): string | null {
  const h = events.find((ev) => ev.kind === "holiday" && eventTouchesDay(ev, dayIso));
  return h?.title ?? null;
}

function filterManagerRows(me: SessionUser, allUsers: User[]): RowUser[] {
  if (me.role === "admin") {
    return allUsers.map((u) => ({ id: u.id, fullName: u.fullName })).sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }
  return allUsers
    .filter((u) => u.id === me.id || u.managerId === me.id)
    .map((u) => ({ id: u.id, fullName: u.fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
}

const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export default function WorkCalendarPage(): React.JSX.Element {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [rowUsers, setRowUsers] = useState<RowUser[]>([]);
  const [allUsersForSelect, setAllUsersForSelect] = useState<User[]>([]);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string>("");
  const [modal, setModal] = useState<{ day: string; row: RowUser } | null>(null);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveKind, setLeaveKind] = useState<"annual" | "rol">("annual");
  const [swNote, setSwNote] = useState("");
  const [sickFrom, setSickFrom] = useState("");
  const [sickTo, setSickTo] = useState("");
  const [sickFile, setSickFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const current = await fetchCurrentUser(t);
      setMe(current);
      const { from, to } = monthRange(year, month);

      if (current.role === "employee") {
        const { users: rows, events: ev } = await fetchMeTeamWorkCalendar(t, from, to);
        setRowUsers(rows);
        setAllUsersForSelect([]);
        setEvents(ev);
      } else {
        const usersList = await fetchUsers(t);
        setAllUsersForSelect(usersList);
        let rows = filterManagerRows(current, usersList);
        const fid = userFilter.trim();
        if (fid) {
          rows = rows.filter((r) => r.id === fid);
        }
        setRowUsers(rows);
        const ids = fid ? [fid] : undefined;
        const ev = await fetchHrWorkCalendar(t, { from, to, userIds: ids });
        setEvents(ev);
      }
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Errore caricamento calendario");
    } finally {
      setLoading(false);
    }
  }, [router, year, month, userFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => {
      const d = i + 1;
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      return { iso, dow };
    });
  }, [year, month]);

  const monthLabel = useMemo(
    () =>
      new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    [year, month]
  );

  const openModal = (day: string, row: RowUser): void => {
    setModal({ day, row });
    setLeaveStart(day);
    setLeaveEnd(day);
    setLeaveKind("annual");
    setSwNote("");
    setSickFrom(day);
    setSickTo(day);
    setSickFile(null);
  };

  const closeModal = (): void => {
    setModal(null);
    setSubmitting(null);
  };

  const onPrevMonth = (): void => {
    if (month <= 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const onNextMonth = (): void => {
    if (month >= 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const isOwnRow = modal && me && modal.row.id === me.id;
  const cellEventsModal = modal ? eventsForCell(events, modal.row.id, modal.day) : [];

  const submitLeave = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal) return;
    setSubmitting("leave");
    setError(null);
    try {
      await createLeavePlan(t, {
        startDate: leaveStart,
        endDate: leaveEnd,
        kind: leaveKind
      });
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio ferie");
    } finally {
      setSubmitting(null);
    }
  };

  const submitSw = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal) return;
    setSubmitting("sw");
    setError(null);
    try {
      await createSmartworkingRequest(t, { day: modal.day, note: swNote.trim() || undefined });
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore smart working");
    } finally {
      setSubmitting(null);
    }
  };

  const submitSick = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal) return;
    setSubmitting("sick");
    setError(null);
    try {
      await reportSickness(t, { fromDate: sickFrom, toDate: sickTo }, sickFile);
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore malattia");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading && events.length === 0 && !error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--prom-muted)]">
        Caricamento calendario…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[min(100%,1600px)] space-y-5 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Calendario lavoro</h1>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            Griglia mensile — team per centro di costo (dipendenti) o team diretto (manager). Festività sulle colonne.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-1 py-0.5 shadow-[var(--glass-shadow)] backdrop-blur-sm"
            style={{ boxShadow: "var(--glass-shadow)" }}
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Mese precedente"
              onClick={onPrevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] px-2 text-center text-sm font-medium capitalize text-[var(--prom-text)]">
              {monthLabel}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Mese successivo"
              onClick={onNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {me && me.role !== "employee" ? (
            <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
              <span>Dipendente</span>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="max-w-[200px] rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-2 py-1 text-[var(--prom-text)] backdrop-blur-sm"
              >
                <option value="">Tutto il team visibile</option>
                {allUsersForSelect.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
            Aggiorna
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5">Turno</span>
        <span className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5">Smart working</span>
        <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5">Ferie</span>
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5">ROL</span>
        <span className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5">Festività</span>
        <span className="rounded border border-orange-500/40 bg-orange-500/10 px-2 py-0.5">Malattia</span>
      </div>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div
        className="overflow-x-auto rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_82%,transparent)] shadow-[var(--card-shadow)] backdrop-blur-md"
        style={{
          background: "var(--glass-bg)",
          borderColor: "var(--glass-border)",
          boxShadow: "var(--card-shadow)"
        }}
      >
        <table className="w-max min-w-full border-collapse text-left text-[11px]">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-20 min-w-[140px] border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_95%,transparent)] px-2 py-2 text-[var(--prom-text)] backdrop-blur-md"
                style={{ background: "var(--glass-bg)" }}
              >
                Dipendente
              </th>
              {days.map(({ iso, dow }) => {
                const hol = holidayTitleForDay(events, iso);
                const weekend = dow === 0 || dow === 6;
                return (
                  <th
                    key={iso}
                    title={hol ?? undefined}
                    className={[
                      "min-w-[52px] border border-[var(--prom-line)] px-0.5 py-2 text-center font-normal",
                      weekend ? "bg-[color-mix(in_srgb,var(--prom-muted)_12%,transparent)]" : "",
                      hol ? "text-rose-700 dark:text-rose-300" : "text-[var(--prom-muted)]"
                    ].join(" ")}
                  >
                    <div className="leading-tight">{WEEKDAY_SHORT[dow]}</div>
                    <div className="font-medium text-[var(--prom-text)]">{iso.slice(8)}</div>
                    {hol ? <div className="mt-0.5 truncate text-[9px] text-rose-600/90">{hol}</div> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rowUsers.map((row) => (
              <tr key={row.id}>
                <td
                  className="sticky left-0 z-10 border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-2 py-1 font-medium text-[var(--prom-text)] backdrop-blur-md"
                  style={{ background: "var(--glass-bg)" }}
                >
                  {row.fullName}
                  {me?.id === row.id ? (
                    <span className="ml-1 text-[10px] font-normal text-[var(--prom-muted)]">(tu)</span>
                  ) : null}
                </td>
                {days.map(({ iso, dow }) => {
                  const list = eventsForCell(events, row.id, iso);
                  const weekend = dow === 0 || dow === 6;
                  return (
                    <td
                      key={`${row.id}-${iso}`}
                      className={[
                        "cursor-pointer align-top border border-[var(--prom-line)] p-0.5 transition-colors hover:bg-[color-mix(in_srgb,var(--prom-gold)_8%,transparent)]",
                        weekend ? "bg-[color-mix(in_srgb,var(--prom-muted)_8%,transparent)]" : ""
                      ].join(" ")}
                      onClick={() => openModal(iso, row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openModal(iso, row);
                        }
                      }}
                      role="gridcell"
                      tabIndex={0}
                    >
                      <div className="flex min-h-[48px] flex-col gap-0.5">
                        {list.map((ev) => (
                          <div
                            key={`${ev.id}-${ev.kind}-${ev.start}`}
                            className={["truncate rounded border px-1 py-0.5 leading-tight", kindStyle(ev.kind)].join(" ")}
                            title={ev.title}
                          >
                            {ev.kind === "shift" && ev.end ? (
                              <span>
                                {ev.start.slice(11, 16)}–{ev.end.slice(11, 16)}
                              </span>
                            ) : (
                              <span className="truncate">{ev.title}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rowUsers.length === 0 ? (
        <p className="text-sm text-[var(--prom-muted)]">Nessun dipendente in questa vista.</p>
      ) : null}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="presentation"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-modal-title"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--glass-border)] p-5 shadow-[var(--glass-shadow)]"
            style={{
              background: "var(--glass-bg)",
              boxShadow: "var(--glass-shadow)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cal-modal-title" className="text-base font-semibold text-[var(--prom-text)]">
              {modal.day} · {modal.row.fullName}
            </h2>

            <div className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] p-3">
              <p className="text-[11px] font-medium text-[var(--prom-muted)]">Eventi in questo giorno</p>
              {cellEventsModal.length === 0 ? (
                <p className="text-xs text-[var(--prom-muted)]">Nessun evento.</p>
              ) : (
                <ul className="space-y-2">
                  {cellEventsModal.map((ev) => (
                    <li
                      key={`${ev.id}-${ev.kind}-${ev.userId ?? ""}`}
                      className={["rounded-lg border px-3 py-2 text-xs", kindStyle(ev.kind)].join(" ")}
                    >
                      <span className="font-medium">{ev.title}</span>
                      {ev.kind === "shift" && ev.end ? (
                        <span className="ml-2 text-[10px] opacity-80">
                          {ev.start.slice(11, 16)} – {ev.end.slice(11, 16)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isOwnRow ? (
              <div className="mt-4 space-y-4 border-t border-[var(--prom-line)] pt-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--prom-text)]">Richiesta ferie / ROL</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-[11px] text-[var(--prom-muted)]">
                      Inizio
                      <input
                        type="date"
                        value={leaveStart}
                        onChange={(e) => setLeaveStart(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                      />
                    </label>
                    <label className="block text-[11px] text-[var(--prom-muted)]">
                      Fine
                      <input
                        type="date"
                        value={leaveEnd}
                        onChange={(e) => setLeaveEnd(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                      />
                    </label>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--prom-muted)]">
                    Tipo
                    <select
                      value={leaveKind}
                      onChange={(e) => setLeaveKind(e.target.value === "rol" ? "rol" : "annual")}
                      className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1 text-[var(--prom-text)]"
                    >
                      <option value="annual">Ferie</option>
                      <option value="rol">ROL</option>
                    </select>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    disabled={submitting !== null}
                    onClick={() => void submitLeave()}
                  >
                    {submitting === "leave" ? "Invio…" : "Invia richiesta ferie/ROL"}
                  </Button>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--prom-text)]">Smart working (giorno selezionato)</p>
                  <label className="block text-[11px] text-[var(--prom-muted)]">
                    Nota (opzionale)
                    <input
                      type="text"
                      value={swNote}
                      onChange={(e) => setSwNote(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    disabled={submitting !== null}
                    onClick={() => void submitSw()}
                  >
                    {submitting === "sw" ? "Invio…" : "Richiedi smart working"}
                  </Button>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--prom-text)]">Comunicazione malattia</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-[11px] text-[var(--prom-muted)]">
                      Da
                      <input
                        type="date"
                        value={sickFrom}
                        onChange={(e) => setSickFrom(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                      />
                    </label>
                    <label className="block text-[11px] text-[var(--prom-muted)]">
                      A
                      <input
                        type="date"
                        value={sickTo}
                        onChange={(e) => setSickTo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                      />
                    </label>
                  </div>
                  <label className="mt-2 block text-[11px] text-[var(--prom-muted)]">
                    Certificato (opzionale, pdf/jpg)
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg"
                      className="mt-1 block w-full text-xs text-[var(--prom-muted)]"
                      onChange={(e) => setSickFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    disabled={submitting !== null}
                    onClick={() => void submitSick()}
                  >
                    {submitting === "sick" ? "Invio…" : "Invia comunicazione"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-[var(--prom-muted)]">
                Solo il dipendente interessato può creare richieste da qui. Turni restano gestiti dalla pianificazione.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                Chiudi
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
