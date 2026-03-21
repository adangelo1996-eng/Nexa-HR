"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  clock,
  fetchAttendanceEntries,
  fetchAttendanceOvertimeAggregates,
  fetchAttendanceStatus,
  fetchAttendanceSummary,
  fetchCurrentUser,
  type AttendanceOvertimeAggregates,
  type AttendanceStatus,
  type TimeEntry,
  type WorkdaySummary
} from "@/lib/api";
import { clearSession, getToken, type SessionUser } from "@/lib/auth-session";

export default function AttendancePage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<WorkdaySummary[]>([]);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [aggregates, setAggregates] = useState<AttendanceOvertimeAggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState<"clock_in" | "clock_out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const todayDate = new Date().toISOString().slice(0, 10);
        const [currentUser, list, daySummary, dayStatus, overtimeAggregates] = await Promise.all([
          fetchCurrentUser(tokenValue),
          fetchAttendanceEntries(tokenValue),
          fetchAttendanceSummary(tokenValue),
          fetchAttendanceStatus(tokenValue, todayDate),
          fetchAttendanceOvertimeAggregates(tokenValue, todayDate)
        ]);
        setUser(currentUser);
        setEntries(list);
        setSummary(daySummary);
        setStatus(dayStatus);
        setAggregates(overtimeAggregates);
        setRemainingSeconds(dayStatus.remainingSeconds);
      } catch (loadError) {
        clearSession();
        router.replace("/login");
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento timbrature");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

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

  const grouped = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const item of [...entries].sort((a, b) => b.at.localeCompare(a.at))) {
      const day = item.at.slice(0, 10);
      const current = map.get(day) ?? [];
      current.push(item);
      map.set(day, current);
    }
    return [...map.entries()];
  }, [entries]);
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = grouped.find(([day]) => day === today)?.[1] ?? [];
  const olderDays = grouped.filter(([day]) => day !== today);
  const canClockIn = status?.nextType === "clock_in" && submitLoading === null;
  const canClockOut = status?.nextType === "clock_out" && submitLoading === null;
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
    setError(null);
    setSubmitLoading(type);
    try {
      await clock(token, type);
      const [list, daySummary, dayStatus, overtimeAggregates] = await Promise.all([
        fetchAttendanceEntries(token),
        fetchAttendanceSummary(token),
        fetchAttendanceStatus(token, today),
        fetchAttendanceOvertimeAggregates(token, today)
      ]);
      setEntries(list);
      setSummary(daySummary);
      setStatus(dayStatus);
      setAggregates(overtimeAggregates);
      setRemainingSeconds(dayStatus.remainingSeconds);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore timbratura");
    } finally {
      setSubmitLoading(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-slate-300">Caricamento timbrature...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Timbrature</h1>
          <p className="text-sm text-slate-400">Storico giornaliero e giorni passati per {user?.fullName}.</p>
          {user?.role !== "employee" ? (
            <Link
              href="/payroll-calc"
              className="mt-2 inline-block rounded-lg border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
            >
              Vai a Calcolo Cedolino
            </Link>
          ) : null}
        </div>
        <Link href="/" className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">
          Torna alla dashboard
        </Link>
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold">Azioni rapide</h2>
        <p className="mt-2 text-sm text-slate-400">
          Tempo residuo giornata: <span className="font-semibold text-cyan-300">{formattedCountdown}</span>
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Straordinario oggi:{" "}
          <span className="font-semibold text-amber-300">{((status?.overtimeSeconds ?? 0) / 3600).toFixed(2)} h</span>
          {" · "}
          Stato: <span className="font-semibold text-slate-200">{status?.isRunning ? "in corso" : "in pausa"}</span>
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Straordinario settimana/mese/anno:{" "}
          <span className="font-semibold text-slate-200">
            {aggregates ? `${aggregates.week.overtimeHours.toFixed(2)}h / ${aggregates.month.overtimeHours.toFixed(2)}h / ${aggregates.year.overtimeHours.toFixed(2)}h` : "-"}
          </span>
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          <Button
            onClick={() => void onClock("clock_in")}
            disabled={!canClockIn}
            size="xl"
            className="min-w-64 bg-emerald-400 font-semibold text-slate-900 hover:bg-emerald-300"
          >
            {submitLoading === "clock_in" ? "Timbrando..." : "Timbratura entrata"}
          </Button>
          <Button
            onClick={() => void onClock("clock_out")}
            disabled={!canClockOut}
            size="xl"
            className="min-w-64 bg-rose-300 font-semibold text-slate-900 hover:bg-rose-200"
          >
            {submitLoading === "clock_out" ? "Timbrando..." : "Timbratura uscita"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold">Riepilogo giorni lavorati</h2>
        <div className="mt-3 space-y-2 text-sm">
          {summary.length === 0 ? <p className="text-slate-400">Nessun riepilogo disponibile.</p> : null}
          {[...summary]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((item) => (
              <div key={`${item.userId}-${item.date}`} className="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2">
                <span>{item.date}</span>
                <span className="text-slate-300">
                  {item.minutesWorked} min - {item.mode}
                </span>
              </div>
            ))}
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold">Storico timbrature di oggi</h2>
        <div className="mt-3 space-y-4">
          {todayEntries.length === 0 ? <p className="text-slate-400">Nessuna timbratura registrata oggi.</p> : null}
          {todayEntries.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                item.type === "clock_in"
                  ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                  : "border-rose-700 bg-rose-950/40 text-rose-200"
              }`}
            >
              <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
              <span>{new Date(item.at).toLocaleTimeString("it-CH")}</span>
            </div>
          ))}
          <details className="rounded-lg border border-slate-700 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">Giorni precedenti</summary>
            <div className="mt-3 space-y-3">
              {olderDays.length === 0 ? <p className="text-sm text-slate-400">Nessun giorno precedente.</p> : null}
              {olderDays.map(([day, dayEntries]) => (
                <article key={day} className="rounded-lg border border-slate-700 p-3">
                  <h3 className="text-sm font-semibold text-cyan-300">{day}</h3>
                  <div className="mt-2 space-y-2">
                    {dayEntries.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
                        <span className="text-slate-400">{new Date(item.at).toLocaleTimeString("it-CH")}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
