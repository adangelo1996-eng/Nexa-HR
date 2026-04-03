"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  LogIn,
  LogOut,
  Palmtree,
  Receipt,
  Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries
    .filter((item) => item.at.slice(0, 10) === today)
    .sort((a, b) => b.at.localeCompare(a.at));
  const todaySummaryRow = summary.find((item) => item.date === today);
  const canClockIn = status?.nextType === "clock_in" && clockLoading === null;
  const canClockOut = status?.nextType === "clock_out" && clockLoading === null;
  const lastPunch = todayEntries[0];
  const hoursToday = ((todaySummaryRow?.minutesWorked ?? status?.minutesWorked ?? 0) / 60).toFixed(1);

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

  const formattedCountdown = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }, [remainingSeconds]);

  async function onClock(type: "clock_in" | "clock_out"): Promise<void> {
    if (!token) {
      return;
    }
    setClockError(null);
    setClockLoading(type);
    try {
      const geo =
        typeof navigator !== "undefined" && navigator.geolocation
          ? await new Promise<{ lat: number; lon: number; accuracyM?: number } | undefined>((resolve) => {
              navigator.geolocation.getCurrentPosition(
                (pos) =>
                  resolve({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracyM: pos.coords.accuracy
                  }),
                () => resolve(undefined),
                { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
              );
            })
          : undefined;
      await clock(token, type, geo ? { source: "web", geo } : { source: "web" });
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
            <Button
              type="button"
              size="lg"
              disabled={!canClockIn}
              onClick={() => void onClock("clock_in")}
              className="flex h-24 flex-col gap-1 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] font-medium text-[var(--prom-text)] hover:opacity-90 disabled:opacity-40"
              title="Timbra entrata"
            >
              <LogIn className="mx-auto h-6 w-6 opacity-80" />
              <span>Entrata</span>
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={!canClockOut}
              onClick={() => void onClock("clock_out")}
              className="flex h-24 flex-col gap-1 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] font-medium text-[var(--prom-text)] hover:opacity-90 disabled:opacity-40"
              title="Timbra uscita"
            >
              <LogOut className="mx-auto h-6 w-6 opacity-80" />
              <span>Uscita</span>
            </Button>
            <Link href="/workflow" className="block">
              <span className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-sm font-medium text-[var(--prom-text)] transition-opacity hover:opacity-90">
                <Palmtree className="h-6 w-6 opacity-80" />
                Ferie
              </span>
            </Link>
            <Link href="/expenses" className="block">
              <span className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-sm font-medium text-[var(--prom-text)] transition-opacity hover:opacity-90">
                <Receipt className="h-6 w-6 opacity-80" />
                Spese
              </span>
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
            <p className="text-3xl font-semibold tabular-nums text-[var(--prom-text)]">{hoursToday}</p>
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
              {lastPunch ? new Date(lastPunch.at).toLocaleTimeString("it-CH", { hour: "2-digit", minute: "2-digit" }) : "—"}
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
        <ul className="mt-4 space-y-2 text-sm">
          {periodSummaries.length === 0 ? (
            <li className="text-[var(--prom-muted)]">Nessun dato nel periodo.</li>
          ) : (
            periodSummaries.map((row) => (
              <li
                key={row.date}
                className="flex items-center justify-between rounded-lg border border-[var(--prom-line)] px-3 py-2"
              >
                <span className="text-[var(--prom-text)]">{row.date}</span>
                <span className="text-[var(--prom-muted)]">
                  {(row.minutesWorked / 60).toFixed(1)} h · {row.mode}
                </span>
              </li>
            ))
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
