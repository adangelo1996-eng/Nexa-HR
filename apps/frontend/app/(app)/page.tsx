"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  LogIn,
  LogOut,
  Palmtree,
  Receipt,
  Timer,
  ArrowDown
} from "lucide-react";
import {
  clock,
  fetchApprovals,
  fetchAttendanceEntries,
  fetchAttendanceOvertimeAggregates,
  fetchAttendanceStatus,
  fetchAttendanceSummary,
  fetchCurrentUser,
  fetchLeaveBalance,
  fetchLeavePlans,
  type ApprovalItem,
  type AttendanceOvertimeAggregates,
  type AttendanceStatus,
  type LeaveBalance,
  type LeavePlan,
  type TimeEntry,
  type WorkdaySummary
} from "@/lib/api";
import {
  clearSession,
  getToken,
  getSessionUser,
  sessionCanSeeApprovalsAndHrExtras,
  type SessionUser as LocalSessionUser
} from "@/lib/auth-session";

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
  const [attendanceStatusFailed, setAttendanceStatusFailed] = useState(false);
  const [clockLoading, setClockLoading] = useState<"clock_in" | "clock_out" | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [liveWorkedSeconds, setLiveWorkedSeconds] = useState(0);
  const [periodTab, setPeriodTab] = useState<PeriodTab>("today");

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
          workflowApprovals
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
            : Promise.resolve([] as ApprovalItem[])
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
          const [entriesList, summaryList, statusValue, overtimeAggregates, yearBalance, myLeaves, workflowApprovals] =
            await Promise.all([
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
                : Promise.resolve([] as ApprovalItem[])
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

  const formattedCountdown = useMemo(() => formatHmCountdown(remainingSeconds), [remainingSeconds]);

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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="sr-only">Azioni rapide</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!canClockIn}
              onClick={() => void onClock("clock_in")}
              className="dashboard-quick-action flex h-24 flex-col gap-1 font-medium text-[var(--prom-text)]"
              title="Timbra entrata"
            >
              <LogIn className="mx-auto h-6 w-6 opacity-80" />
              <span>Entrata</span>
            </button>
            <button
              type="button"
              disabled={!canClockOut}
              onClick={() => void onClock("clock_out")}
              className="dashboard-quick-action flex h-24 flex-col gap-1 font-medium text-[var(--prom-text)]"
              title="Timbra uscita"
            >
              <LogOut className="mx-auto h-6 w-6 opacity-80" />
              <span>Uscita</span>
            </button>
            <Link
              href="/workflow"
              className="dashboard-quick-action flex h-24 flex-col items-center justify-center gap-1 text-sm font-medium text-[var(--prom-text)]"
            >
              <Palmtree className="h-6 w-6 opacity-80" />
              Ferie
            </Link>
            <Link
              href="/expenses"
              className="dashboard-quick-action flex h-24 flex-col items-center justify-center gap-1 text-sm font-medium text-[var(--prom-text)]"
            >
              <Receipt className="h-6 w-6 opacity-80" />
              Spese
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

        <ul className={`space-y-2 text-sm ${periodTab === "today" && todayEntriesChronological.length > 0 ? "mt-6 border-t border-[var(--prom-line)] pt-5" : "mt-4"}`}>
          {periodSummaries.length === 0 ? (
            <li className="text-[var(--prom-muted)]">Nessun dato nel periodo.</li>
          ) : (
            periodSummaries.map((row) => {
              const hm = formatWorkedHm(Math.round(row.minutesWorked * 60));
              return (
                <li
                  key={row.date}
                  className="flex items-center justify-between rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_45%,transparent)] px-4 py-3"
                >
                  <span className="font-medium text-[var(--prom-text)]">{row.date}</span>
                  <span className="tabular-nums text-[var(--prom-muted)]">
                    {hm} · {row.mode}
                  </span>
                </li>
              );
            })
          )}
        </ul>
        {aggregates ? (
          <p className="mt-4 text-xs text-[var(--prom-muted)]">
            Straord.: sett. {aggregates.week.overtimeHours.toFixed(1)}h · mese {aggregates.month.overtimeHours.toFixed(1)}h
          </p>
        ) : null}
      </section>
    </div>
  );
}
