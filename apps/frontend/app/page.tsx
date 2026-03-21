"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dashboard } from "@/components/dashboard";
import { OrgChart } from "@/components/org-chart";
import { PayslipArea } from "@/components/payslip-area";
import {
  approveApproval,
  clock,
  createLeavePlan,
  downloadPayslipPdf,
  fetchApprovals,
  fetchAttendanceEntries,
  fetchAttendanceOvertimeAggregates,
  fetchAttendanceStatus,
  fetchAttendanceSummary,
  fetchCurrentUser,
  fetchLeaveBalance,
  fetchOrgChart,
  fetchPayslips,
  rejectApproval,
  type ApprovalItem,
  type AttendanceOvertimeAggregates,
  type AttendanceStatus,
  type LeaveBalance,
  type TimeEntry,
  type WorkdaySummary,
  type OrgChartResponse,
  type Payslip
} from "@/lib/api";
import { clearSession, getToken, getSessionUser, type SessionUser } from "@/lib/auth-session";

export default function HomePage(): React.JSX.Element {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [orgData, setOrgData] = useState<OrgChartResponse>({ nodes: [], edges: [] });
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<WorkdaySummary[]>([]);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [aggregates, setAggregates] = useState<AttendanceOvertimeAggregates | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [clockLoading, setClockLoading] = useState<"clock_in" | "clock_out" | null>(null);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [clockError, setClockError] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveStart, setLeaveStart] = useState(new Date().toISOString().slice(0, 10));
  const [leaveEnd, setLeaveEnd] = useState(new Date().toISOString().slice(0, 10));
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    const cachedUser = getSessionUser();
    if (cachedUser) {
      setUser(cachedUser);
    }
    setToken(tokenValue);

    async function load(): Promise<void> {
      let me: SessionUser;
      try {
        me = await fetchCurrentUser(tokenValue);
      } catch {
        const fallback = getSessionUser();
        if (!fallback) {
          clearSession();
          router.replace("/login");
          setLoading(false);
          return;
        }
        me = fallback;
      }

      setUser(me);

      const todayDate = new Date().toISOString().slice(0, 10);
      try {
        const [payslipsList, orgChart, todayEntries, todaySummary, todayStatus, overtimeAggregates, yearBalance, workflowApprovals] =
          await Promise.all([
            fetchPayslips(tokenValue).catch(() => [] as Payslip[]),
            fetchOrgChart(tokenValue).catch(() => ({ nodes: [], edges: [] }) as OrgChartResponse),
            fetchAttendanceEntries(tokenValue).catch(() => [] as TimeEntry[]),
            fetchAttendanceSummary(tokenValue).catch(() => [] as WorkdaySummary[]),
            fetchAttendanceStatus(tokenValue, todayDate).catch(() => null as AttendanceStatus | null),
            fetchAttendanceOvertimeAggregates(tokenValue, todayDate).catch(() => null as AttendanceOvertimeAggregates | null),
            fetchLeaveBalance(tokenValue, Number(todayDate.slice(0, 4))).catch(() => null as LeaveBalance | null),
            me.role === "employee"
              ? Promise.resolve([] as ApprovalItem[])
              : fetchApprovals(tokenValue).catch(() => [] as ApprovalItem[])
          ]);

        setPayslips(payslipsList);
        setOrgData(orgChart);
        setEntries(todayEntries);
        setSummary(todaySummary);
        setStatus(todayStatus);
        setAggregates(overtimeAggregates);
        setRemainingSeconds(todayStatus?.remainingSeconds ?? 0);
        setLeaveBalance(yearBalance);
        setApprovals(workflowApprovals);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Alcuni dati non sono stati caricati");
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

  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries
    .filter((item) => item.at.slice(0, 10) === today)
    .sort((a, b) => b.at.localeCompare(a.at));
  const olderEntries = [...entries]
    .filter((item) => item.at.slice(0, 10) !== today)
    .sort((a, b) => b.at.localeCompare(a.at));
  const todaySummary = summary.find((item) => item.date === today);
  const canClockIn = status?.nextType === "clock_in" && clockLoading === null;
  const canClockOut = status?.nextType === "clock_out" && clockLoading === null;
  const pendingWorkflowCount = approvals.filter((item) => item.status === "pending").length;

  const formattedCountdown = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }, [remainingSeconds]);

  async function onExportPdf(userId: string, period: string): Promise<void> {
    if (!token) {
      return;
    }
    await downloadPayslipPdf(token, userId, period);
  }

  async function onClock(type: "clock_in" | "clock_out"): Promise<void> {
    if (!token) {
      return;
    }
    setClockError(null);
    setClockLoading(type);
    try {
      await clock(token, type);
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

  async function onSubmitLeave(): Promise<void> {
    if (!token) {
      return;
    }
    setLeaveError(null);
    setLeaveSubmitting(true);
    try {
      await createLeavePlan(token, { startDate: leaveStart, endDate: leaveEnd });
      const balance = await fetchLeaveBalance(token, Number(today.slice(0, 4)));
      setLeaveBalance(balance);
    } catch (submitError) {
      setLeaveError(submitError instanceof Error ? submitError.message : "Errore richiesta ferie");
    } finally {
      setLeaveSubmitting(false);
    }
  }

  async function onApprovalAction(id: string, action: "approve" | "reject"): Promise<void> {
    if (!token) {
      return;
    }
    setClockError(null);
    try {
      if (action === "approve") {
        await approveApproval(token, id);
      } else {
        await rejectApproval(token, id);
      }
      const refreshed = await fetchApprovals(token);
      setApprovals(refreshed);
    } catch (actionError) {
      setClockError(actionError instanceof Error ? actionError.message : "Errore aggiornamento workflow");
    }
  }

  function onLogout(): void {
    clearSession();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-sky-400 border-t-transparent"
          role="presentation"
          aria-hidden
        />
        <p className="text-center text-slate-200">Caricamento dashboard in corso…</p>
        <p className="max-w-md text-center text-sm text-slate-500">
          Recupero timbrature, organigramma e altri dati dal server. Il primo avvio può richiedere qualche
          secondo.
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-rose-300">{error ?? "Utente non disponibile"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl">
            <span className="font-synapse font-semibold tracking-tight text-slate-50" style={{ fontSynthesis: "none" }}>
              Nexa HR
            </span>
            <span className="font-sans font-bold text-slate-500"> — Cloud Enterprise</span>
          </h1>
          <p className="mt-1 text-slate-400">
            Benvenuto {user.fullName}. Timbratura, ferie, malattia, approvazioni e payroll svizzero
            integrato.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/attendance" className="rounded-lg border border-slate-600 px-3 py-1 hover:bg-slate-800">
              Vai a Timbrature
            </Link>
            <Link href="/workflow" className="rounded-lg border border-slate-600 px-3 py-1 hover:bg-slate-800">
              Workflow approvazioni
            </Link>
            {user.role !== "employee" ? (
              <Link
                href="/payroll-calc"
                className="rounded-lg border border-slate-600 px-3 py-1 hover:bg-slate-800"
              >
                Calcolo cedolino
              </Link>
            ) : null}
            {user.role === "admin" ? (
              <Link href="/admin" className="rounded-lg border border-slate-600 px-3 py-1 hover:bg-slate-800">
                Amministrazione utenti
              </Link>
            ) : null}
          </div>
        </div>
        <Button
          onClick={onLogout}
          className="rounded-xl px-4 py-2 font-semibold"
        >
          Esci
        </Button>
      </header>

      <Dashboard
        todayEntriesCount={todayEntries.length}
        leaveResidualDays={leaveBalance?.residualDays ?? 0}
        pendingWorkflowCount={pendingWorkflowCount}
      />

      <section className="card mt-6">
        <h2 className="text-xl font-semibold">Timbrature rapide</h2>
        <p className="mt-1 text-sm text-slate-400">
          Pulsanti principali centrali: puoi timbrare solo l&apos;azione valida in questo momento.
        </p>
        <div className="mt-2 text-center">
          <p className="text-sm text-slate-300">
            Tempo residuo a fine giornata: <span className="font-semibold text-cyan-300">{formattedCountdown}</span>
          </p>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-4">
          <Button
            onClick={() => void onClock("clock_in")}
            disabled={!canClockIn}
            size="xl"
            className="min-w-64 bg-emerald-400 font-semibold text-slate-900 hover:bg-emerald-300"
          >
            {clockLoading === "clock_in" ? "Timbrando..." : "Timbratura entrata"}
          </Button>
          <Button
            onClick={() => void onClock("clock_out")}
            disabled={!canClockOut}
            size="xl"
            className="min-w-64 bg-rose-300 font-semibold text-slate-900 hover:bg-rose-200"
          >
            {clockLoading === "clock_out" ? "Timbrando..." : "Timbratura uscita"}
          </Button>
        </div>
        {clockError ? <p className="mt-3 text-sm text-rose-300">{clockError}</p> : null}
        <div className="mt-4 text-sm text-slate-300">
          <p>Timbrature oggi: {todayEntries.length}</p>
          <p>
            Minuti lavorati oggi: {todaySummary?.minutesWorked ?? 0} ({todaySummary?.mode ?? "office"})
          </p>
          <p>Straordinario oggi: {((status?.overtimeSeconds ?? 0) / 3600).toFixed(2)} h</p>
          <p>
            Straordinario settimana/mese/anno:{" "}
            {aggregates
              ? `${aggregates.week.overtimeHours.toFixed(2)}h / ${aggregates.month.overtimeHours.toFixed(2)}h / ${aggregates.year.overtimeHours.toFixed(2)}h`
              : "-"}
          </p>
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="text-xl font-semibold">Storico timbrature di oggi</h2>
        <div className="mt-4 space-y-2 text-sm">
          {todayEntries.length === 0 ? <p className="text-slate-400">Nessuna timbratura registrata oggi.</p> : null}
          {todayEntries.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                item.type === "clock_in"
                  ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                  : "border-rose-700 bg-rose-950/40 text-rose-200"
              }`}
            >
              <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
              <span>{new Date(item.at).toLocaleString("it-CH")}</span>
            </div>
          ))}
        </div>
        <details className="mt-4 rounded-lg border border-slate-700 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">
            Timbrature dei giorni precedenti
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            {olderEntries.length === 0 ? (
              <p className="text-slate-400">Nessuna timbratura precedente.</p>
            ) : (
              olderEntries.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2">
                  <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
                  <span className="text-slate-400">{new Date(item.at).toLocaleString("it-CH")}</span>
                </div>
              ))
            )}
          </div>
        </details>
      </section>

      <section className="card mt-6">
        <h2 className="text-xl font-semibold">Ferie</h2>
        <p className="mt-1 text-sm text-slate-400">
          Residuo disponibile: <span className="font-semibold text-cyan-300">{leaveBalance?.residualDays ?? 0} giorni</span>
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Dal
            <input
              type="date"
              value={leaveStart}
              onChange={(event) => setLeaveStart(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Al
            <input
              type="date"
              value={leaveEnd}
              onChange={(event) => setLeaveEnd(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => void onSubmitLeave()}
            disabled={leaveSubmitting}
            className="bg-cyan-400 text-slate-900 hover:bg-cyan-300"
          >
            {leaveSubmitting ? "Invio richiesta..." : "Richiedi ferie"}
          </Button>
        </div>
        {leaveError ? <p className="mt-3 text-sm text-rose-300">{leaveError}</p> : null}
      </section>

      {user.role !== "employee" ? (
        <section className="card mt-6">
          <h2 className="text-xl font-semibold">Workflow team</h2>
          <p className="mt-1 text-sm text-slate-400">
            Per ogni richiesta di ferie visualizzi chiaramente il periodo richiesto e lo stato.
          </p>
          <div className="mt-4 space-y-2 text-sm">
            {approvals.length === 0 ? <p className="text-slate-400">Nessuna autorizzazione visibile.</p> : null}
            {approvals.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {item.type === "leave" ? "Ferie" : "Malattia"} · {item.requesterName ?? item.requestedBy}
                  </span>
                  <span
                    className={`rounded px-2 py-1 text-xs ${
                      item.status === "approved"
                        ? "bg-emerald-900/60 text-emerald-200"
                        : item.status === "rejected"
                          ? "bg-rose-900/60 text-rose-200"
                          : "bg-amber-900/60 text-amber-200"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Richiesta il {new Date(item.at).toLocaleString("it-CH")}
                </p>
                {item.startDate && item.endDate ? (
                  <p className="mt-1 text-xs text-slate-300">
                    Periodo: <span className="font-medium">{item.startDate}</span> →{" "}
                    <span className="font-medium">{item.endDate}</span>
                  </p>
                ) : null}
                {item.status === "pending" ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void onApprovalAction(item.id, "approve")}
                      className="bg-emerald-400 text-slate-900 hover:bg-emerald-300"
                    >
                      Approva
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void onApprovalAction(item.id, "reject")}
                      className="bg-rose-300 text-slate-900 hover:bg-rose-200"
                    >
                      Nega
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <PayslipArea
        role={user.role}
        currentUserId={user.id}
        currentUserName={user.fullName}
        payslips={payslips}
        onExportPdf={onExportPdf}
      />
      <OrgChart nodes={orgData.nodes} edges={orgData.edges} />
    </main>
  );
}
