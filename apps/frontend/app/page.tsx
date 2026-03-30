"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  fetchLeavePlans,
  fetchOrgChart,
  fetchPayslips,
  rejectApproval,
  type ApprovalItem,
  type AttendanceOvertimeAggregates,
  type AttendanceStatus,
  type LeaveBalance,
  type LeavePlan,
  type TimeEntry,
  type WorkdaySummary,
  type OrgChartResponse,
  type Payslip
} from "@/lib/api";
import {
  clearSession,
  getToken,
  getSessionUser,
  sessionCanNexaAdmin,
  type SessionUser
} from "@/lib/auth-session";

export default function HomePage(): React.JSX.Element {
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
  const [leavePlans, setLeavePlans] = useState<LeavePlan[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [attendanceStatusFailed, setAttendanceStatusFailed] = useState(false);
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
      let me: SessionUser;
      try {
        me = await fetchCurrentUser(tokenValue);
      } catch {
        const fallback = getSessionUser();
        if (!fallback) {
          clearSession();
          window.location.assign("/login");
          return;
        }
        me = fallback;
      }

      setUser(me);

      const todayDate = new Date().toISOString().slice(0, 10);
      try {
        const [
          payslipsList,
          orgChart,
          todayEntries,
          todaySummary,
          statusResult,
          overtimeAggregates,
          yearBalance,
          myLeaves,
          workflowApprovals
        ] = await Promise.all([
          fetchPayslips(tokenValue).catch(() => [] as Payslip[]),
          fetchOrgChart(tokenValue).catch(() => ({ nodes: [], edges: [] }) as OrgChartResponse),
          fetchAttendanceEntries(tokenValue).catch(() => [] as TimeEntry[]),
          fetchAttendanceSummary(tokenValue).catch(() => [] as WorkdaySummary[]),
          fetchAttendanceStatus(tokenValue, todayDate)
            .then((s) => ({ ok: true as const, s }))
            .catch(() => ({ ok: false as const, s: null as AttendanceStatus | null })),
          fetchAttendanceOvertimeAggregates(tokenValue, todayDate).catch(() => null as AttendanceOvertimeAggregates | null),
          fetchLeaveBalance(tokenValue, Number(todayDate.slice(0, 4))).catch(() => null as LeaveBalance | null),
          fetchLeavePlans(tokenValue).catch(() => [] as LeavePlan[]),
          me.role === "employee"
            ? Promise.resolve([] as ApprovalItem[])
            : fetchApprovals(tokenValue, "pending").catch(() => [] as ApprovalItem[])
        ]);

        setAttendanceStatusFailed(!statusResult.ok);
        const todayStatus = statusResult.s;

        setPayslips(payslipsList);
        setOrgData(orgChart);
        setEntries(todayEntries);
        setSummary(todaySummary);
        setStatus(todayStatus);
        setAggregates(overtimeAggregates);
        setRemainingSeconds(todayStatus?.remainingSeconds ?? 0);
        setLeaveBalance(yearBalance);
        setLeavePlans(myLeaves);
        setApprovals(workflowApprovals);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Alcuni dati non sono stati caricati");
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
              fetchAttendanceOvertimeAggregates(token, todayDate).catch(() => null as AttendanceOvertimeAggregates | null),
              fetchLeaveBalance(token, Number(todayDate.slice(0, 4))).catch(() => null as LeaveBalance | null),
              fetchLeavePlans(token).catch(() => [] as LeavePlan[]),
              user && user.role !== "employee"
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
          /* realtime leggero: ignora errori di rete */
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
  const olderEntries = [...entries]
    .filter((item) => item.at.slice(0, 10) !== today)
    .sort((a, b) => b.at.localeCompare(a.at));
  const todaySummary = summary.find((item) => item.date === today);
  const canClockIn = status?.nextType === "clock_in" && clockLoading === null;
  const canClockOut = status?.nextType === "clock_out" && clockLoading === null;
  const pendingWorkflowCount = approvals.length;

  const leavePendingPlans = leavePlans.filter((p) => p.status === "pending" || p.status === "draft");
  const leaveHistoryPlans = leavePlans.filter((p) => p.status === "approved" || p.status === "rejected");

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

  async function onSubmitLeave(): Promise<void> {
    if (!token) {
      return;
    }
    setLeaveError(null);
    setLeaveSubmitting(true);
    try {
      await createLeavePlan(token, { startDate: leaveStart, endDate: leaveEnd });
      const [balance, plans] = await Promise.all([
        fetchLeaveBalance(token, Number(today.slice(0, 4))),
        fetchLeavePlans(token)
      ]);
      setLeaveBalance(balance);
      setLeavePlans(plans);
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
      const refreshed = await fetchApprovals(token, "pending");
      setApprovals(refreshed);
    } catch (actionError) {
      setClockError(actionError instanceof Error ? actionError.message : "Errore aggiornamento workflow");
    }
  }

  function onLogout(): void {
    clearSession();
    window.location.assign("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-synapse-gold border-t-transparent dark:border-synapse-gold-bright"
          role="presentation"
          aria-hidden
        />
        <p className="text-center text-slate-800 dark:text-slate-200">Caricamento dashboard in corso…</p>
        <p className="max-w-md text-center text-sm text-slate-600 dark:text-slate-500">
          Recupero timbrature, organigramma e altri dati dal server. Il primo avvio può richiedere qualche
          secondo.
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-rose-600 dark:text-rose-300">{error ?? "Utente non disponibile"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl">
            <span
              className="font-synapse font-semibold tracking-tight text-slate-900 dark:text-slate-50"
              style={{ fontSynthesis: "none" }}
            >
              Nexa HR
            </span>
          </h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Benvenuto {user.fullName}. Timbratura, ferie, malattia, approvazioni e payroll integrato.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link
              href="/attendance"
              className="rounded-lg border border-slate-300 px-3 py-1 text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Vai a Timbrature
            </Link>
            <Link
              href="/workflow"
              className="rounded-lg border border-slate-300 px-3 py-1 text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Workflow approvazioni
            </Link>
            {user.role !== "employee" ? (
              <Link
                href="/payroll-calc"
                className="rounded-lg border border-slate-300 px-3 py-1 text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Calcolo cedolino
              </Link>
            ) : null}
            {sessionCanNexaAdmin(user) ? (
              <Link
                href="/admin"
                className="rounded-lg border border-slate-300 px-3 py-1 text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              >
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
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Tempo residuo a fine giornata:{" "}
            <span className="font-semibold text-synapse-gold dark:text-synapse-gold-bright">{formattedCountdown}</span>
          </p>
        </div>
        {attendanceStatusFailed ? (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Impossibile caricare lo stato timbratura (permessi o rete). Se i pulsanti restano disattivati, verifica che il
            ruolo includa la timbratura o ricarica la pagina.
          </p>
        ) : null}
        {!attendanceStatusFailed && status === null ? (
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Stato timbratura non disponibile: attendi il caricamento o controlla la connessione.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-4">
          <Button
            onClick={() => void onClock("clock_in")}
            disabled={!canClockIn}
            size="xl"
            className="min-w-64 border-2 border-emerald-700/80 bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-500/90 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {clockLoading === "clock_in" ? "Timbrando..." : "Timbratura entrata"}
          </Button>
          <Button
            onClick={() => void onClock("clock_out")}
            disabled={!canClockOut}
            size="xl"
            className="min-w-64 border-2 border-red-800/80 bg-red-600 font-semibold text-white shadow-md shadow-red-900/25 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-red-500/90 dark:bg-red-600 dark:hover:bg-red-500"
          >
            {clockLoading === "clock_out" ? "Timbrando..." : "Timbratura uscita"}
          </Button>
        </div>
        {clockError ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{clockError}</p> : null}
        <div className="mt-4 text-sm text-slate-700 dark:text-slate-300">
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
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Storico timbrature di oggi</h2>
        <div className="mt-4 space-y-2 text-sm">
          {todayEntries.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-400">Nessuna timbratura registrata oggi.</p>
          ) : null}
          {todayEntries.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                item.type === "clock_in"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
              }`}
            >
              <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
              <span>{new Date(item.at).toLocaleString("it-CH")}</span>
            </div>
          ))}
        </div>
        <details className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-300">
            Timbrature dei giorni precedenti
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            {olderEntries.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400">Nessuna timbratura precedente.</p>
            ) : (
              olderEntries.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                >
                  <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
                  <span className="text-slate-600 dark:text-slate-400">{new Date(item.at).toLocaleString("it-CH")}</span>
                </div>
              ))
            )}
          </div>
        </details>
      </section>

      <section className="card mt-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Ferie</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Residuo disponibile:{" "}
          <span className="font-semibold text-synapse-gold dark:text-synapse-gold-bright">
            {leaveBalance?.residualDays ?? 0} giorni
          </span>
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-800 dark:text-slate-200">
            Dal
            <input
              type="date"
              value={leaveStart}
              onChange={(event) => setLeaveStart(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-800 dark:text-slate-200">
            Al
            <input
              type="date"
              value={leaveEnd}
              onChange={(event) => setLeaveEnd(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => void onSubmitLeave()}
            disabled={leaveSubmitting}
            className="bg-synapse-gold text-white hover:brightness-110 dark:bg-synapse-gold-bright dark:text-white dark:hover:brightness-110"
          >
            {leaveSubmitting ? "Invio richiesta..." : "Richiedi ferie"}
          </Button>
        </div>
        {leaveError ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{leaveError}</p> : null}

        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Richieste in corso</h3>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Dopo l&apos;approvazione escono da qui e restano solo nello storico.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {leavePendingPlans.length === 0 ? (
              <li className="text-slate-600 dark:text-slate-400">Nessuna richiesta aperta.</li>
            ) : (
              leavePendingPlans.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                >
                  <span>
                    {p.startDate} → {p.endDate}
                  </span>
                  <span className="rounded bg-[#2a3f4d]/70 px-2 py-0.5 text-xs text-[#c5dde8]">{p.status}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Storico ferie (calendario)</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {leaveHistoryPlans.length === 0 ? (
              <li className="text-slate-600 dark:text-slate-400">Nessun periodo approvato o rifiutato.</li>
            ) : (
              [...leaveHistoryPlans]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                  >
                    <span>
                      {p.startDate} → {p.endDate}
                    </span>
                    <span
                      className={
                        p.status === "approved"
                          ? "rounded bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-200"
                          : "rounded bg-rose-900/50 px-2 py-0.5 text-xs text-rose-200"
                      }
                    >
                      {p.status}
                    </span>
                  </li>
                ))
            )}
          </ul>
        </div>
      </section>

      {user.role !== "employee" ? (
        <section className="card mt-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Workflow team</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Solo richieste in attesa di azione. Per lo storico completo usa Workflow approvazioni.
          </p>
          <div className="mt-4 space-y-2 text-sm">
            {approvals.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400">Nessuna autorizzazione visibile.</p>
            ) : null}
            {approvals.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
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
                          : "bg-[#2a3f4d]/70 text-[#c5dde8]"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Richiesta il {new Date(item.at).toLocaleString("it-CH")}
                </p>
                {item.startDate && item.endDate ? (
                  <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
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
