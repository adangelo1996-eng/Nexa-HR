"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  Bell,
  Clock3,
  LogIn,
  LogOut,
  Palmtree,
  Receipt,
  Timer,
  X
} from "lucide-react";
import {
  clock,
  deleteAllUserNotifications,
  deleteUserNotification,
  fetchApprovals,
  fetchAttendanceEntries,
  fetchAttendanceOvertimeAggregates,
  fetchAttendanceStatus,
  fetchAttendanceSummary,
  fetchCurrentUser,
  fetchLeaveBalance,
  fetchLeavePlans,
  fetchUserCalendar,
  fetchUserNotifications,
  type ApprovalItem,
  type AttendanceOvertimeAggregates,
  type AttendanceStatus,
  type LeaveBalance,
  type LeavePlan,
  type TimeEntry,
  type UserNotificationDto,
  type WorkdaySummary
} from "@/lib/api";
import {
  clearSession,
  getToken,
  getSessionUser,
  sessionCanSeeApprovalsAndHrExtras,
  type SessionUser as LocalSessionUser
} from "@/lib/auth-session";
import { WorkedDaySummaryCards } from "@/components/worked-day-summary-cards";
import { Button } from "@/components/ui/button";

type PeriodTab = "today" | "week" | "month";

function isoWeekRange(d: Date): { start: string; end: string } {
  const day = (d.getDay() + 6) % 7;
  const thu = new Date(d);
  thu.setDate(d.getDate() - day + 3);
  const monday = new Date(thu);
  monday.setDate(thu.getDate() - ((thu.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  return { start: f(monday), end: f(sunday) };
}

function formatHmCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function formatWorkedHm(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function punchTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-CH", { hour: "2-digit", minute: "2-digit" });
}

function segmentDurationLabel(prevIso: string, nextIso: string): string | null {
  const ms = new Date(nextIso).getTime() - new Date(prevIso).getTime();
  if (ms < 0 || ms > 48 * 3600 * 1000) return null;
  const totalMin = Math.round(ms / 60_000);
  if (totalMin <= 0) return "< 1 min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function HomePage(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<LocalSessionUser | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<WorkdaySummary[]>([]);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [aggregates, setAggregates] = useState<AttendanceOvertimeAggregates | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [leavePlans, setLeavePlans] = useState<LeavePlan[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [notifications, setNotifications] = useState<UserNotificationDto[]>([]);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [attendanceStatusFailed, setAttendanceStatusFailed] = useState(false);
  const [clockLoading, setClockLoading] = useState<"clock_in" | "clock_out" | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [liveWorkedSeconds, setLiveWorkedSeconds] = useState(0);
  const [periodTab, setPeriodTab] = useState<PeriodTab>("today");
  const [travelDates, setTravelDates] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) {
      window.location.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    const cachedUser = getSessionUser();
    if (cachedUser) {
      setUser(cachedUser);
    }
    setToken(tokenValue);

    async function load(): Promise<void> {
      let me: LocalSessionUser;
      try {
        me = await fetchCurrentUser(tokenValue);
      } catch {
        const fallback = getSessionUser();
        if (!fallback) {
          clearSession();
          window.location.assign("/login");
          return;
        }
        me = fallback as LocalSessionUser;
      }

      setUser(me);

      const todayDate = new Date().toISOString().slice(0, 10);
      try {
        const [
          todayEntries,
          todaySummary,
          statusResult,
          overtimeAggregates,
          yearBalance,
          myLeaves,
          workflowApprovals,
          notificationItems
        ] = await Promise.all([
          fetchAttendanceEntries(tokenValue).catch(() => [] as TimeEntry[]),
          fetchAttendanceSummary(tokenValue).catch(() => [] as WorkdaySummary[]),
          fetchAttendanceStatus(tokenValue, todayDate)
            .then((s) => ({ ok: true as const, s }))
            .catch(() => ({ ok: false as const, s: null as AttendanceStatus | null })),
          fetchAttendanceOvertimeAggregates(tokenValue, todayDate).catch(
            () => null as AttendanceOvertimeAggregates | null
          ),
          fetchLeaveBalance(tokenValue, Number(todayDate.slice(0, 4))).catch(() => null as LeaveBalance | null),
          fetchLeavePlans(tokenValue).catch(() => [] as LeavePlan[]),
          me && sessionCanSeeApprovalsAndHrExtras(me)
            ? fetchApprovals(tokenValue, "pending").catch(() => [] as ApprovalItem[])
            : Promise.resolve([] as ApprovalItem[]),
          fetchUserNotifications(tokenValue, 40).catch(() => [] as UserNotificationDto[])
        ]);

        setAttendanceStatusFailed(!statusResult.ok);
        const todayStatus = statusResult.s;

        setEntries(todayEntries);
        setSummary(todaySummary);
        setStatus(todayStatus);
        setAggregates(overtimeAggregates);
        setRemainingSeconds(todayStatus?.remainingSeconds ?? 0);
        setLeaveBalance(yearBalance);
        setLeavePlans(myLeaves);
        setApprovals(workflowApprovals);
        setNotifications(notificationItems);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Caricamento parziale");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    const tick = window.setInterval(() => {
      const todayDate = new Date().toISOString().slice(0, 10);
      void (async (): Promise<void> => {
        try {
          const [
            entriesList,
            summaryList,
            statusValue,
            overtimeAggregates,
            yearBalance,
            myLeaves,
            workflowApprovals,
            notificationItems
          ] = await Promise.all([
            fetchAttendanceEntries(token).catch(() => [] as TimeEntry[]),
            fetchAttendanceSummary(token).catch(() => [] as WorkdaySummary[]),
            fetchAttendanceStatus(token, todayDate).catch(() => null as AttendanceStatus | null),
            fetchAttendanceOvertimeAggregates(token, todayDate).catch(
              () => null as AttendanceOvertimeAggregates | null
            ),
            fetchLeaveBalance(token, Number(todayDate.slice(0, 4))).catch(() => null as LeaveBalance | null),
            fetchLeavePlans(token).catch(() => [] as LeavePlan[]),
            user && sessionCanSeeApprovalsAndHrExtras(user)
              ? fetchApprovals(token, "pending").catch(() => [] as ApprovalItem[])
              : Promise.resolve([] as ApprovalItem[]),
            fetchUserNotifications(token, 40).catch(() => [] as UserNotificationDto[])
          ]);
          setEntries(entriesList);
          setSummary(summaryList);
          if (statusValue) {
            setStatus(statusValue);
            setRemainingSeconds(statusValue.remainingSeconds);
          }
          if (overtimeAggregates) {
            setAggregates(overtimeAggregates);
          }
          if (yearBalance) {
            setLeaveBalance(yearBalance);
          }
          setLeavePlans(myLeaves);
          setApprovals(workflowApprovals);
          setNotifications(notificationItems);
        } catch {
          /* ignore */
        }
      })();
    }, 30_000);
    return () => window.clearInterval(tick);
  }, [token, user]);

  useEffect(() => {
    if (!status) {
      return;
    }
    setRemainingSeconds(status.remainingSeconds);
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => (status.isRunning && current > 0 ? current - 1 : current));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!status) {
      setLiveWorkedSeconds(0);
      return;
    }
    if (!status.isRunning) {
      setLiveWorkedSeconds(status.workedSeconds);
      return;
    }
    const base = status.workedSeconds;
    const t0 = Date.now();
    setLiveWorkedSeconds(base);
    const id = window.setInterval(() => {
      setLiveWorkedSeconds(base + Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [status?.date, status?.isRunning, status?.workedSeconds]);

  const today = new Date().toISOString().slice(0, 10);
  const todayEntriesDesc = useMemo(
    () =>
      entries
        .filter((item) => item.at.slice(0, 10) === today)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [entries, today]
  );
  const todayEntriesChronological = useMemo(
    () => [...todayEntriesDesc].reverse(),
    [todayEntriesDesc]
  );
  const todaySummaryRow = summary.find((item) => item.date === today);
  const canClockIn = status?.nextType === "clock_in" && clockLoading === null;
  const canClockOut = status?.nextType === "clock_out" && clockLoading === null;
  const lastPunch = todayEntriesDesc[0];
  const workedDisplaySeconds =
    status?.isRunning === true
      ? liveWorkedSeconds
      : status != null
        ? status.workedSeconds
        : Math.round((todaySummaryRow?.minutesWorked ?? 0) * 60);
  const hoursTodayLabel = formatWorkedHm(workedDisplaySeconds);

  const periodSummaries = useMemo(() => {
    const now = new Date();
    if (periodTab === "today") {
      return summary.filter((s) => s.date === today);
    }
    if (periodTab === "week") {
      const { start, end } = isoWeekRange(now);
      return summary.filter((s) => s.date >= start && s.date <= end).sort((a, b) => a.date.localeCompare(b.date));
    }
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return summary.filter((s) => s.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
  }, [periodTab, summary, today]);

  useEffect(() => {
    if (!token || periodSummaries.length === 0) {
      setTravelDates(new Set());
      return;
    }
    const dates = periodSummaries.map((s) => s.date.slice(0, 10)).sort();
    const from = dates[0]!;
    const to = dates[dates.length - 1]!;
    let cancelled = false;
    void fetchUserCalendar(token, from, to)
      .then((events) => {
        if (cancelled) {
          return;
        }
        const tr = new Set<string>();
        for (const e of events) {
          if (e.kind !== "travel") {
            continue;
          }
          if (String(e.meta?.status ?? "") === "rejected") {
            continue;
          }
          tr.add(e.start.slice(0, 10));
        }
        setTravelDates(tr);
      })
      .catch(() => {
        if (!cancelled) {
          setTravelDates(new Set());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, periodSummaries]);

  const formattedCountdown = useMemo(() => formatHmCountdown(remainingSeconds), [remainingSeconds]);

  /** Ora locale in cui si chiude l’obiettivo giornaliero se si resta timbrati (allineato al countdown «Residuo»). */
  const expectedExitTimeLabel = useMemo(() => {
    if (status?.isRunning !== true) {
      return null;
    }
    const ms = Date.now() + Math.max(0, remainingSeconds) * 1000;
    return new Date(ms).toLocaleTimeString("it-CH", { hour: "2-digit", minute: "2-digit" });
  }, [status?.isRunning, remainingSeconds]);

  async function onClock(type: "clock_in" | "clock_out"): Promise<void> {
    if (!token) {
      return;
    }
    setClockError(null);
    setClockLoading(type);
    try {
      const newEntry = await clock(token, type, { source: "web" });
      setEntries((prev) => [...prev.filter((e) => e.id !== newEntry.id), newEntry]);
      const [entriesList, summaryList, statusValue, overtimeAggregates] = await Promise.all([
        fetchAttendanceEntries(token),
        fetchAttendanceSummary(token),
        fetchAttendanceStatus(token, today),
        fetchAttendanceOvertimeAggregates(token, today)
      ]);
      setEntries(entriesList);
      setSummary(summaryList);
      setStatus(statusValue);
      setAggregates(overtimeAggregates);
      setRemainingSeconds(statusValue.remainingSeconds);
    } catch (submitError) {
      setClockError(submitError instanceof Error ? submitError.message : "Errore timbratura");
    } finally {
      setClockLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-synapse-gold border-t-transparent dark:border-synapse-gold-bright"
          aria-hidden
        />
        <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
      </div>
    );
  }

  if (!user) {
    return <p className="text-rose-600 dark:text-rose-300">{error ?? "Sessione non valida"}</p>;
  }

  async function removeNotification(id: string): Promise<void> {
    const t = getToken();
    if (!t) {
      return;
    }
    setNotificationsBusy(true);
    try {
      await deleteUserNotification(t, id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setNotificationsBusy(false);
    }
  }

  async function clearAllNotifications(): Promise<void> {
    if (!window.confirm("Eliminare tutte le notifiche?")) {
      return;
    }
    const t = getToken();
    if (!t) {
      return;
    }
    setNotificationsBusy(true);
    try {
      await deleteAllUserNotifications(t);
      setNotifications([]);
    } finally {
      setNotificationsBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--prom-text)]">{user.fullName}</h1>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">Dashboard</p>
        </div>
        {sessionCanSeeApprovalsAndHrExtras(user) && approvals.length > 0 ? (
          <Link
            href="/workflow/approvals"
            className="text-sm font-medium text-[var(--prom-gold)] underline-offset-2 hover:underline"
          >
            {approvals.length} in approvazione
          </Link>
        ) : null}
      </header>

      {error ? <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p> : null}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--prom-line)] pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[var(--prom-gold)] opacity-90" aria-hidden />
            <h2 className="text-lg font-semibold text-[var(--prom-text)]">Notifiche</h2>
          </div>
          {notifications.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={notificationsBusy}
              onClick={() => void clearAllNotifications()}
            >
              Elimina tutte
            </Button>
          ) : null}
        </div>
        {notifications.length === 0 ? (
          <p className="py-2 text-sm text-[var(--prom-muted)]">Nessuna notifica da mostrare.</p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`relative rounded-xl border border-[var(--prom-line)] p-4 pr-12 ${
                  n.read
                    ? "bg-[color-mix(in_srgb,var(--prom-surface-soft)_40%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--prom-gold)_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_8%,transparent)]"
                }`}
              >
                <button
                  type="button"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[var(--prom-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] hover:text-[var(--prom-text)]"
                  aria-label="Elimina notifica"
                  disabled={notificationsBusy}
                  onClick={() => void removeNotification(n.id)}
                >
                  <X className="h-4 w-4" />
                </button>
                {n.actionPath ? (
                  <Link
                    href={n.actionPath as Route}
                    className="block text-[var(--prom-text)] hover:opacity-90"
                  >
                    <p className="pr-6 text-base font-medium leading-snug">{n.title}</p>
                    {n.body ? (
                      <p className="mt-2 text-sm leading-relaxed text-[var(--prom-muted)]">{n.body}</p>
                    ) : null}
                  </Link>
                ) : (
                  <>
                    <p className="pr-6 text-base font-medium leading-snug text-[var(--prom-text)]">{n.title}</p>
                    {n.body ? (
                      <p className="mt-2 text-sm leading-relaxed text-[var(--prom-muted)]">{n.body}</p>
                    ) : null}
                  </>
                )}
                <p className="mt-2 text-xs text-[var(--prom-muted)]">
                  {new Date(n.createdAt).toLocaleString("it-CH", { dateStyle: "medium", timeStyle: "short" })}
                  {!n.read ? (
                    <span className="ml-2 font-medium text-[var(--prom-gold)]">· Non letta</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="sr-only">Azioni rapide</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <button
                type="button"
                disabled={!canClockIn}
                onClick={() => void onClock("clock_in")}
                className="dashboard-quick-action flex min-h-[6rem] flex-col items-center justify-center gap-1.5 text-center text-sm font-medium leading-none text-[var(--prom-text)]"
                title="Timbra entrata"
              >
                <LogIn className="h-6 w-6 shrink-0 opacity-80" aria-hidden />
                <span className="px-1">Entrata</span>
              </button>
              <div
                className="flex min-h-[2.5rem] flex-col items-center justify-center text-balance text-center text-[10px] leading-tight text-[var(--prom-muted)]"
                aria-hidden={!expectedExitTimeLabel}
              >
                {/* Spazio riservato per allineare l’altezza con la colonna Uscita */}
                {!expectedExitTimeLabel ? <span className="invisible">·</span> : null}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <button
                type="button"
                disabled={!canClockOut}
                onClick={() => void onClock("clock_out")}
                className="dashboard-quick-action flex min-h-[6rem] flex-col items-center justify-center gap-1.5 text-center text-sm font-medium leading-none text-[var(--prom-text)]"
                title="Timbra uscita"
              >
                <LogOut className="h-6 w-6 shrink-0 opacity-80" aria-hidden />
                <span className="px-1">Uscita</span>
              </button>
              <div className="flex min-h-[2.5rem] flex-col items-center justify-center text-balance text-center text-[10px] leading-tight text-[var(--prom-muted)]">
                {expectedExitTimeLabel ? (
                  <>
                    <span>Uscita prevista</span>
                    <span className="mt-0.5 font-mono text-xs font-medium tabular-nums text-[var(--prom-text)]">
                      {expectedExitTimeLabel}
                    </span>
                  </>
                ) : (
                  <span className="invisible">·</span>
                )}
              </div>
            </div>
            <Link
              href="/workflow"
              prefetch
              className="dashboard-quick-action flex min-h-[6rem] flex-col items-center justify-center gap-1.5 text-center text-sm font-medium leading-none text-[var(--prom-text)]"
            >
              <Palmtree className="h-6 w-6 shrink-0 opacity-80" aria-hidden />
              <span className="px-1">Ferie</span>
            </Link>
            <Link
              href="/expenses"
              prefetch
              className="dashboard-quick-action flex min-h-[6rem] flex-col items-center justify-center gap-1.5 text-center text-sm font-medium leading-none text-[var(--prom-text)]"
            >
              <Receipt className="h-6 w-6 shrink-0 opacity-80" aria-hidden />
              <span className="px-1">Spese</span>
            </Link>
          </div>
          {attendanceStatusFailed ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Stato timbratura non disponibile (permessi o rete).
            </p>
          ) : null}
          {!attendanceStatusFailed && status ? (
            <p className="text-center text-xs text-[var(--prom-muted)]" title="Tempo residuo giornata">
              Residuo ·{" "}
              <span className="font-mono text-[var(--prom-text)]">{formattedCountdown}</span>
            </p>
          ) : null}
          {clockError ? <p className="text-xs text-rose-600 dark:text-rose-300">{clockError}</p> : null}
          {clockLoading ? <p className="text-xs text-[var(--prom-muted)]">Timbratura…</p> : null}
        </section>

        <section className="card grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--prom-line)] p-4">
            <Timer className="mb-2 h-5 w-5 opacity-70" aria-hidden />
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--prom-text)]">
              {hoursTodayLabel}
            </p>
            <p className="text-xs text-[var(--prom-muted)]">Ore oggi</p>
          </div>
          <div className="rounded-xl border border-[var(--prom-line)] p-4">
            <Palmtree className="mb-2 h-5 w-5 opacity-70" aria-hidden />
            <p className="text-3xl font-semibold tabular-nums text-[var(--prom-text)]">
              {leaveBalance?.residualDays ?? 0}
            </p>
            <p className="text-xs text-[var(--prom-muted)]">Saldo ferie (gg)</p>
          </div>
          <div className="rounded-xl border border-[var(--prom-line)] p-4">
            <Clock3 className="mb-2 h-5 w-5 opacity-70" aria-hidden />
            <p className="text-lg font-semibold leading-tight text-[var(--prom-text)]">—</p>
            <p className="text-xs text-[var(--prom-muted)]">Prossimo turno</p>
          </div>
          <div className="rounded-xl border border-[var(--prom-line)] p-4">
            <LogIn className="mb-2 h-5 w-5 opacity-70" aria-hidden />
            <p className="text-lg font-semibold leading-tight text-[var(--prom-text)]">
              {lastPunch ? punchTimeLabel(lastPunch.at) : "—"}
            </p>
            <p className="text-xs text-[var(--prom-muted)]">Ultima timbratura</p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="flex gap-2 border-b border-[var(--prom-line)] pb-3">
          {(
            [
              ["today", "Oggi"],
              ["week", "Settimana"],
              ["month", "Mese"]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriodTab(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-[opacity,background] ${
                periodTab === key
                  ? "bg-[color-mix(in_srgb,var(--prom-gold)_16%,transparent)] text-[var(--prom-text)]"
                  : "text-[var(--prom-muted)] hover:opacity-80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {periodTab === "today" && todayEntriesChronological.length > 0 ? (
          <div className="mt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              Timbrature di oggi
            </h3>
            <ul className="space-y-0">
              {todayEntriesChronological.map((entry, index) => {
                const next = todayEntriesChronological[index + 1];
                const gap = next ? segmentDurationLabel(entry.at, next.at) : null;
                const isIn = entry.type === "clock_in";
                return (
                  <li key={entry.id}>
                    <div
                      className={[
                        "flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-sm",
                        "border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_55%,transparent)]",
                        isIn
                          ? "shadow-[0_2px_12px_-4px_rgba(58,84,102,0.2)]"
                          : "shadow-[0_2px_12px_-4px_rgba(26,31,24,0.08)]"
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
                          isIn
                            ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                            : "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-muted)_12%,transparent)] text-[var(--prom-muted)]"
                        ].join(" ")}
                      >
                        {isIn ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--prom-text)]">
                          {isIn ? "Entrata" : "Uscita"}
                        </p>
                        <p className="text-xs text-[var(--prom-muted)]">
                          {entry.source && entry.source !== "web"
                            ? `Origine: ${entry.source}`
                            : "Timbratura registrata"}
                        </p>
                      </div>
                      <span className="shrink-0 text-lg font-semibold tabular-nums text-[var(--prom-text)]">
                        {punchTimeLabel(entry.at)}
                      </span>
                    </div>
                    {gap ? (
                      <div className="flex items-center justify-center gap-1 py-1.5 text-[11px] text-[var(--prom-muted)]">
                        <ArrowDown className="h-3 w-3 opacity-70" aria-hidden />
                        <span className="tabular-nums">{gap}</span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div
          className={`text-sm ${periodTab === "today" && todayEntriesChronological.length > 0 ? "mt-6 border-t border-[var(--prom-line)] pt-5" : "mt-4"}`}
        >
          <WorkedDaySummaryCards rows={periodSummaries} user={user} travelDates={travelDates} />
        </div>
        {aggregates ? (
          <p className="mt-4 text-xs text-[var(--prom-muted)]">
            Straord.: sett. {aggregates.week.overtimeHours.toFixed(1)}h · mese {aggregates.month.overtimeHours.toFixed(1)}h
          </p>
        ) : null}
      </section>
    </div>
  );
}
