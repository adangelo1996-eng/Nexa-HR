"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  clock,
  clockNfcPublic,
  createTeamTimeEntry,
  deleteTimeEntry,
  downloadAttendanceMonthExport,
  fetchAttendanceEntries,
  fetchAttendanceOvertimeAggregates,
  fetchAttendanceStatus,
  fetchAttendanceSummary,
  fetchAttendanceDayBoard,
  fetchAttendanceTeamUsers,
  fetchCurrentUser,
  nexaUsesSupabaseAttendance,
  patchTimeEntry,
  type AttendanceOvertimeAggregates,
  type AttendanceStatus,
  type TeamAttendanceUserPicker,
  type TimeEntry,
  type WorkdaySummary,
  type AttendanceDayBoardResponse
} from "@/lib/api";
import { clearSession, getToken, sessionCanSeeApprovalsAndHrExtras, type SessionUser } from "@/lib/auth-session";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

function defaultMonthInput(): string {
  return new Date().toISOString().slice(0, 7);
}

type EntryDraft = { atLocal: string; type: "clock_in" | "clock_out" };

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

  const [exportMonth, setExportMonth] = useState(defaultMonthInput);
  const [exportLoading, setExportLoading] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamAttendanceUserPicker[]>([]);
  const [hrUserSearch, setHrUserSearch] = useState("");
  const [hrSelectedUserId, setHrSelectedUserId] = useState("");
  const [hrEditMonth, setHrEditMonth] = useState(defaultMonthInput);
  const [hrEntries, setHrEntries] = useState<TimeEntry[]>([]);
  const [hrLoading, setHrLoading] = useState(false);
  const [hrManageError, setHrManageError] = useState<string | null>(null);
  const [entryDrafts, setEntryDrafts] = useState<Record<string, EntryDraft>>({});
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [newEntryType, setNewEntryType] = useState<"clock_in" | "clock_out">("clock_in");
  const [newEntryAtLocal, setNewEntryAtLocal] = useState(`${defaultMonthInput()}-01T09:00`);
  const [addLoading, setAddLoading] = useState(false);
  const [nfcToken, setNfcToken] = useState("");
  const [nfcMsg, setNfcMsg] = useState<string | null>(null);
  const [hrBoardDate, setHrBoardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hrBoard, setHrBoard] = useState<AttendanceDayBoardResponse | null>(null);
  const [hrBoardLoading, setHrBoardLoading] = useState(false);
  const [hrBoardError, setHrBoardError] = useState<string | null>(null);

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
    if (!token || !user?.canManageTeamAttendance || nexaUsesSupabaseAttendance()) {
      return;
    }
    let cancelled = false;
    void fetchAttendanceTeamUsers(token)
      .then((list) => {
        if (!cancelled) {
          setTeamUsers(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeamUsers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.canManageTeamAttendance]);

  useEffect(() => {
    if (!token || !user?.canManageTeamAttendance || nexaUsesSupabaseAttendance()) {
      setHrBoard(null);
      return;
    }
    let cancelled = false;
    setHrBoardLoading(true);
    setHrBoardError(null);
    void fetchAttendanceDayBoard(token, hrBoardDate)
      .then((b) => {
        if (!cancelled) {
          setHrBoard(b);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHrBoardError(err instanceof Error ? err.message : "Errore caricamento vista giornaliera");
          setHrBoard(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHrBoardLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.canManageTeamAttendance, hrBoardDate]);

  useEffect(() => {
    setNewEntryAtLocal(`${hrEditMonth}-01T09:00`);
  }, [hrEditMonth]);

  useEffect(() => {
    if (!token || !hrSelectedUserId || !hrEditMonth) {
      setHrEntries([]);
      return;
    }
    let cancelled = false;
    setHrLoading(true);
    setHrManageError(null);
    void fetchAttendanceEntries(token, { userId: hrSelectedUserId, month: hrEditMonth })
      .then((list) => {
        if (!cancelled) {
          setHrEntries(list);
          setEntryDrafts({});
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHrManageError(err instanceof Error ? err.message : "Errore caricamento timbrature");
          setHrEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHrLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, hrSelectedUserId, hrEditMonth]);

  const filteredTeamUsers = useMemo(() => {
    const q = hrUserSearch.trim().toLowerCase();
    if (!q) {
      return teamUsers;
    }
    return teamUsers.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [teamUsers, hrUserSearch]);

  function getDraft(entry: TimeEntry): EntryDraft {
    const d = entryDrafts[entry.id];
    if (d) {
      return d;
    }
    return { atLocal: toDatetimeLocalValue(entry.at), type: entry.type };
  }

  async function onExportMonthXlsx(): Promise<void> {
    if (!token) {
      return;
    }
    setHrManageError(null);
    setExportLoading(true);
    try {
      await downloadAttendanceMonthExport(token, exportMonth);
    } catch (exportErr) {
      setHrManageError(exportErr instanceof Error ? exportErr.message : "Export non riuscito");
    } finally {
      setExportLoading(false);
    }
  }

  async function onSaveHrEntry(entry: TimeEntry): Promise<void> {
    if (!token) {
      return;
    }
    const d = getDraft(entry);
    setHrManageError(null);
    setRowBusyId(entry.id);
    try {
      await patchTimeEntry(token, entry.id, {
        type: d.type,
        at: fromDatetimeLocalValue(d.atLocal)
      });
      const list = await fetchAttendanceEntries(token, {
        userId: hrSelectedUserId,
        month: hrEditMonth
      });
      setHrEntries(list);
      setEntryDrafts((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
    } catch (saveErr) {
      setHrManageError(saveErr instanceof Error ? saveErr.message : "Salvataggio non riuscito");
    } finally {
      setRowBusyId(null);
    }
  }

  async function onDeleteHrEntry(entryId: string): Promise<void> {
    if (!token) {
      return;
    }
    if (!window.confirm("Eliminare questa timbratura?")) {
      return;
    }
    setHrManageError(null);
    setRowBusyId(entryId);
    try {
      await deleteTimeEntry(token, entryId);
      const list = await fetchAttendanceEntries(token, {
        userId: hrSelectedUserId,
        month: hrEditMonth
      });
      setHrEntries(list);
      setEntryDrafts((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
    } catch (delErr) {
      setHrManageError(delErr instanceof Error ? delErr.message : "Eliminazione non riuscita");
    } finally {
      setRowBusyId(null);
    }
  }

  async function onAddHrEntry(): Promise<void> {
    if (!token || !hrSelectedUserId) {
      return;
    }
    setHrManageError(null);
    setAddLoading(true);
    try {
      await createTeamTimeEntry(token, {
        userId: hrSelectedUserId,
        type: newEntryType,
        at: fromDatetimeLocalValue(newEntryAtLocal)
      });
      const list = await fetchAttendanceEntries(token, {
        userId: hrSelectedUserId,
        month: hrEditMonth
      });
      setHrEntries(list);
    } catch (addErr) {
      setHrManageError(addErr instanceof Error ? addErr.message : "Inserimento non riuscito");
    } finally {
      setAddLoading(false);
    }
  }

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
        <p className="text-slate-700 dark:text-slate-300">Caricamento timbrature...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Timbrature</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Storico giornaliero e giorni passati per {user?.fullName}.</p>
          {user && sessionCanSeeApprovalsAndHrExtras(user) ? (
            <Link href="/payroll-calc" className="synapse-nav-link-compact mt-2 inline-block">
              Vai a Calcolo Cedolino
            </Link>
          ) : null}
        </div>
        <Link href="/" className="synapse-nav-link">
          Torna alla dashboard
        </Link>
      </header>

      <section className="card mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">NFC / QR</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Avvicina il badge NFC al telefono (se supportato) oppure simula con token 16 caratteri.
        </p>
        <input
          value={nfcToken}
          onChange={(e) => setNfcToken(e.target.value)}
          maxLength={16}
          placeholder="Token 16 char"
          className="mt-3 w-full max-w-xs rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void (async (): Promise<void> => {
                setNfcMsg(null);
                try {
                  await clockNfcPublic({ token: nfcToken.trim(), type: "clock_in" });
                  setNfcMsg("Entrata registrata.");
                  router.refresh();
                } catch (ex) {
                  setNfcMsg(ex instanceof Error ? ex.message : "Errore NFC");
                }
              })();
            }}
          >
            Simula entrata NFC
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              void (async (): Promise<void> => {
                setNfcMsg(null);
                try {
                  await clockNfcPublic({ token: nfcToken.trim(), type: "clock_out" });
                  setNfcMsg("Uscita registrata.");
                  router.refresh();
                } catch (ex) {
                  setNfcMsg(ex instanceof Error ? ex.message : "Errore NFC");
                }
              })();
            }}
          >
            Simula uscita NFC
          </Button>
        </div>
        {nfcMsg ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{nfcMsg}</p> : null}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Azioni rapide</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Tempo residuo giornata:{" "}
          <span className="font-semibold text-synapse-gold dark:text-synapse-gold-bright">{formattedCountdown}</span>
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Straordinario oggi:{" "}
          <span className="font-semibold text-[#3a5466] dark:text-[#8aa3b3]">
            {((status?.overtimeSeconds ?? 0) / 3600).toFixed(2)} h
          </span>
          {" · "}
          Stato:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {status?.isRunning ? "in corso" : "in pausa"}
          </span>
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Straordinario settimana/mese/anno:{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {aggregates ? `${aggregates.week.overtimeHours.toFixed(2)}h / ${aggregates.month.overtimeHours.toFixed(2)}h / ${aggregates.year.overtimeHours.toFixed(2)}h` : "-"}
          </span>
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          <Button
            onClick={() => void onClock("clock_in")}
            disabled={!canClockIn}
            size="xl"
            className="min-w-64 border-2 border-emerald-700/80 bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-500/90 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {submitLoading === "clock_in" ? "Timbrando..." : "Timbratura entrata"}
          </Button>
          <Button
            onClick={() => void onClock("clock_out")}
            disabled={!canClockOut}
            size="xl"
            className="min-w-64 border-2 border-red-800/80 bg-red-600 font-semibold text-white shadow-md shadow-red-900/25 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-red-500/90 dark:bg-red-600 dark:hover:bg-red-500"
          >
            {submitLoading === "clock_out" ? "Timbrando..." : "Timbratura uscita"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
      </section>

      {user?.canManageTeamAttendance ? (
        <section className="card mt-6 border-amber-200/80 dark:border-amber-900/40">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Gestione timbrature (HR / amministratori)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Export mensile di tutti gli utenti e correzione timbrature per singolo dipendente.
          </p>
          {nexaUsesSupabaseAttendance() ? (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
              Con le timbrature su Supabase Edge queste funzioni non sono disponibili dall&apos;app Nest.
              Disattiva <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">NEXT_PUBLIC_NEXA_USE_SUPABASE_ATTENDANCE</code> per usarle.
            </p>
          ) : (
            <div className="mt-4 space-y-8">
              {hrManageError ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{hrManageError}</p>
              ) : null}

              <div className="border-t border-slate-200 pt-6 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Vista giornaliera team (CDC e team)
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Elenco dipendenti per centro di costo e team: prima entrata, ultima uscita, stati da calendario
                  (smart working, trasferta, ferie, malattia) e avvisi.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="block text-sm text-slate-700 dark:text-slate-300">
                    Data
                    <input
                      type="date"
                      className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      value={hrBoardDate}
                      onChange={(e) => setHrBoardDate(e.target.value)}
                    />
                  </label>
                </div>
                {hrBoardLoading ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Caricamento…</p>
                ) : hrBoardError ? (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{hrBoardError}</p>
                ) : hrBoard && hrBoard.costCenters.length > 0 ? (
                  <div className="mt-4 space-y-6 max-h-[min(70vh,520px)] overflow-y-auto pr-1">
                    {hrBoard.costCenters.map((cc) => (
                      <div key={cc.id}>
                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                          {cc.label}
                        </h4>
                        <div className="mt-2 space-y-4">
                          {cc.teams.map((tm) => (
                            <div key={tm.id}>
                              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{tm.label}</p>
                              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full min-w-[720px] text-left text-xs">
                                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                                    <tr>
                                      <th className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300">
                                        Dipendente
                                      </th>
                                      <th className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300">
                                        Entrata
                                      </th>
                                      <th className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300">
                                        Uscita
                                      </th>
                                      <th className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300">
                                        Modalità
                                      </th>
                                      <th className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300">
                                        Stato / calendario
                                      </th>
                                      <th className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300">Avvisi</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tm.rows.map((r) => (
                                      <tr
                                        key={r.userId}
                                        className="border-b border-slate-100 dark:border-slate-800 align-top"
                                      >
                                        <td className="px-2 py-2 font-medium text-slate-900 dark:text-slate-100">
                                          {r.fullName}
                                          <div className="font-normal text-[10px] text-slate-500 dark:text-slate-500">
                                            {r.email}
                                          </div>
                                        </td>
                                        <td className="px-2 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                                          {r.firstClockIn ?? "—"}
                                        </td>
                                        <td className="px-2 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                                          {r.lastClockOut ?? "—"}
                                        </td>
                                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">
                                          {r.workdayMode === "smartworking"
                                            ? "Smart working"
                                            : r.workdayMode === "office"
                                              ? "Sede"
                                              : "—"}
                                        </td>
                                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">
                                          {r.statusLabels.length === 0 ? (
                                            "—"
                                          ) : (
                                            <ul className="list-inside list-disc space-y-0.5">
                                              {r.statusLabels.map((s) => (
                                                <li key={s}>{s}</li>
                                              ))}
                                            </ul>
                                          )}
                                        </td>
                                        <td className="px-2 py-2">
                                          {r.alerts.length === 0 ? (
                                            <span className="text-slate-500">—</span>
                                          ) : (
                                            <ul className="list-inside list-disc space-y-0.5 text-amber-800 dark:text-amber-200">
                                              {r.alerts.map((a) => (
                                                <li key={a}>{a}</li>
                                              ))}
                                            </ul>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : hrBoard ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Nessun dipendente in vista per questa data.</p>
                ) : null}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Export Excel (tutti gli utenti)
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Scarica le timbrature del mese selezionato per l&apos;intera anagrafica consentita.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="block text-sm text-slate-700 dark:text-slate-300">
                    Mese
                    <input
                      type="month"
                      className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      value={exportMonth}
                      onChange={(e) => setExportMonth(e.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!token || exportLoading}
                    onClick={() => void onExportMonthXlsx()}
                  >
                    {exportLoading ? "Generazione..." : "Scarica XLSX"}
                  </Button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Visualizza e modifica per utente
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700 dark:text-slate-300">
                    Cerca (nome o email)
                    <input
                      type="search"
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      value={hrUserSearch}
                      onChange={(e) => setHrUserSearch(e.target.value)}
                      placeholder="Filtra elenco..."
                    />
                  </label>
                  <label className="block text-sm text-slate-700 dark:text-slate-300">
                    Utente
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      value={hrSelectedUserId}
                      onChange={(e) => setHrSelectedUserId(e.target.value)}
                    >
                      <option value="">— Seleziona —</option>
                      {filteredTeamUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} · {u.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">
                    Mese timbrature
                    <input
                      type="month"
                      className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      value={hrEditMonth}
                      onChange={(e) => setHrEditMonth(e.target.value)}
                    />
                  </label>
                </div>

                {hrLoading ? (
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Caricamento timbrature...</p>
                ) : hrSelectedUserId ? (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                        <tr>
                          <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Tipo</th>
                          <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Data e ora</th>
                          <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...hrEntries]
                          .sort((a, b) => a.at.localeCompare(b.at))
                          .map((item) => {
                            const draft = getDraft(item);
                            const busy = rowBusyId === item.id;
                            return (
                              <tr
                                key={item.id}
                                className="border-b border-slate-100 dark:border-slate-800"
                              >
                                <td className="px-3 py-2">
                                  <select
                                    className="w-full max-w-[140px] rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                    value={draft.type}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setEntryDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: {
                                          ...draft,
                                          type: e.target.value as "clock_in" | "clock_out"
                                        }
                                      }))
                                    }
                                  >
                                    <option value="clock_in">Entrata</option>
                                    <option value="clock_out">Uscita</option>
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="datetime-local"
                                    className="w-full max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                    value={draft.atLocal}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setEntryDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: { ...draft, atLocal: e.target.value }
                                      }))
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={busy}
                                      onClick={() => void onSaveHrEntry(item)}
                                    >
                                      Salva
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => void onDeleteHrEntry(item.id)}
                                    >
                                      Elimina
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    {hrEntries.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                        Nessuna timbratura in questo mese.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                    Seleziona un utente per caricare le timbrature del mese.
                  </p>
                )}

                {hrSelectedUserId ? (
                  <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-600">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Aggiungi timbratura
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="text-sm text-slate-700 dark:text-slate-300">
                        Tipo
                        <select
                          className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                          value={newEntryType}
                          onChange={(e) =>
                            setNewEntryType(e.target.value as "clock_in" | "clock_out")
                          }
                        >
                          <option value="clock_in">Entrata</option>
                          <option value="clock_out">Uscita</option>
                        </select>
                      </label>
                      <label className="text-sm text-slate-700 dark:text-slate-300">
                        Data e ora
                        <input
                          type="datetime-local"
                          className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                          value={newEntryAtLocal}
                          onChange={(e) => setNewEntryAtLocal(e.target.value)}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={addLoading}
                        onClick={() => void onAddHrEntry()}
                      >
                        {addLoading ? "Aggiunta..." : "Aggiungi"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Riepilogo giorni lavorati</h2>
        <div className="mt-3 space-y-2 text-sm">
          {summary.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-400">Nessun riepilogo disponibile.</p>
          ) : null}
          {[...summary]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((item) => (
              <div
                key={`${item.userId}-${item.date}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <span>{item.date}</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {item.minutesWorked} min - {item.mode}
                </span>
              </div>
            ))}
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Storico timbrature di oggi</h2>
        <div className="mt-3 space-y-4">
          {todayEntries.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-400">Nessuna timbratura registrata oggi.</p>
          ) : null}
          {todayEntries.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                item.type === "clock_in"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
              }`}
            >
              <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
              <span>{new Date(item.at).toLocaleTimeString("it-CH")}</span>
            </div>
          ))}
          <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
              Giorni precedenti
            </summary>
            <div className="mt-3 space-y-3">
              {olderDays.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">Nessun giorno precedente.</p>
              ) : null}
              {olderDays.map(([day, dayEntries]) => (
                <article key={day} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-synapse-gold dark:text-synapse-gold-bright">{day}</h3>
                  <div className="mt-2 space-y-2">
                    {dayEntries.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span>{item.type === "clock_in" ? "Entrata" : "Uscita"}</span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {new Date(item.at).toLocaleTimeString("it-CH")}
                        </span>
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
