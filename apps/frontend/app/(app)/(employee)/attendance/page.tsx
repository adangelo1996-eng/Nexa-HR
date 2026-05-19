"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { Button } from "@/components/ui/button";
import {
  createTeamTimeEntry,
  deleteTimeEntry,
  downloadAttendanceMonthExport,
  fetchAttendanceEntries,
  fetchAttendanceOvertimeAggregates,
  fetchAttendanceStatus,
  fetchAttendanceSummary,
  fetchAttendanceDayBoard,
  fetchAttendanceDayBoardCostCenters,
  downloadAttendanceDayBoardExport,
  fetchAttendanceTeamUsers,
  fetchCurrentUser,
  fetchUserCalendar,
  nexaUsesSupabaseAttendance,
  patchTimeEntry,
  type AttendanceOvertimeAggregates,
  type AttendanceStatus,
  type TeamAttendanceUserPicker,
  type TimeEntry,
  type WorkdaySummary,
  type AttendanceDayBoardResponse
} from "@/lib/api";
import {
  clearSession,
  getToken,
  sessionCanAccessPayrollArea,
  sessionCanHrExtendedOrTeamAttendance,
  type SessionUser
} from "@/lib/auth-session";
import { WorkedDaySummaryCards } from "@/components/worked-day-summary-cards";

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

type AttendanceView = "storico" | "straordinario" | "team";

function formatSecondsHm(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function workedSecondsFromSummary(row: WorkdaySummary): number {
  if (row.workedSeconds != null && row.workedSeconds >= 0) {
    return row.workedSeconds;
  }
  return Math.max(0, row.minutesWorked * 60);
}

function AttendancePageContent(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const view: AttendanceView =
    rawView === "straordinario" || rawView === "team" ? rawView : "storico";
  const setView = useCallback(
    (next: AttendanceView): void => {
      const q = new URLSearchParams(searchParams.toString());
      if (next === "storico") {
        q.delete("view");
      } else {
        q.set("view", next);
      }
      const suffix = q.toString();
      router.replace(suffix ? `/attendance?${suffix}` : "/attendance");
    },
    [router, searchParams]
  );
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<WorkdaySummary[]>([]);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [aggregates, setAggregates] = useState<AttendanceOvertimeAggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [hrBoardDate, setHrBoardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hrBoard, setHrBoard] = useState<AttendanceDayBoardResponse | null>(null);
  const [hrBoardLoading, setHrBoardLoading] = useState(false);
  const [hrBoardError, setHrBoardError] = useState<string | null>(null);
  const [hrBoardCcOptions, setHrBoardCcOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [hrBoardCcSelected, setHrBoardCcSelected] = useState<Set<string>>(new Set());
  const [hrBoardCcSearch, setHrBoardCcSearch] = useState("");
  const [hrBoardExportLoading, setHrBoardExportLoading] = useState(false);
  const [travelDates, setTravelDates] = useState<Set<string>>(() => new Set());

  const canHrExport = useMemo(
    () => Boolean(user && sessionCanHrExtendedOrTeamAttendance(user)),
    [user]
  );
  const canHrEdit = Boolean(user?.canManageTeamAttendance);

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
    if (!token || summary.length === 0) {
      setTravelDates(new Set());
      return;
    }
    const dates = summary.map((s) => s.date.slice(0, 10)).sort();
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
  }, [token, summary]);

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
    if (!token || !canHrExport || nexaUsesSupabaseAttendance()) {
      setHrBoardCcOptions([]);
      return;
    }
    let cancelled = false;
    void fetchAttendanceDayBoardCostCenters(token)
      .then((list) => {
        if (!cancelled) {
          setHrBoardCcOptions(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHrBoardCcOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, canHrExport]);

  const hrBoardCostCenterIds = useMemo(() => {
    if (hrBoardCcSelected.size === 0) {
      return undefined;
    }
    return [...hrBoardCcSelected];
  }, [hrBoardCcSelected]);

  useEffect(() => {
    if (!token || !canHrExport || nexaUsesSupabaseAttendance()) {
      setHrBoard(null);
      return;
    }
    let cancelled = false;
    setHrBoardLoading(true);
    setHrBoardError(null);
    void fetchAttendanceDayBoard(token, {
      date: hrBoardDate,
      costCenterIds: hrBoardCostCenterIds
    })
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
  }, [token, canHrExport, hrBoardDate, hrBoardCostCenterIds]);

  useEffect(() => {
    setNewEntryAtLocal(`${hrEditMonth}-01T09:00`);
  }, [hrEditMonth]);

  useEffect(() => {
    if (!token || !canHrEdit || !hrSelectedUserId || !hrEditMonth) {
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
  }, [token, canHrEdit, hrSelectedUserId, hrEditMonth]);

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

  const filteredHrBoardCcOptions = useMemo(() => {
    const q = hrBoardCcSearch.trim().toLowerCase();
    if (!q) {
      return hrBoardCcOptions;
    }
    return hrBoardCcOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
  }, [hrBoardCcOptions, hrBoardCcSearch]);

  function toggleHrBoardCc(id: string): void {
    setHrBoardCcSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function onExportHrBoard(): Promise<void> {
    if (!token) {
      return;
    }
    setHrManageError(null);
    setHrBoardExportLoading(true);
    try {
      await downloadAttendanceDayBoardExport(token, {
        date: hrBoardDate,
        costCenterIds: hrBoardCostCenterIds
      });
    } catch (ex) {
      setHrManageError(ex instanceof Error ? ex.message : "Export non riuscito");
    } finally {
      setHrBoardExportLoading(false);
    }
  }

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

  const todaySortedAsc = useMemo(
    () => [...todayEntries].sort((a, b) => a.at.localeCompare(b.at)),
    [todayEntries]
  );

  const todayWorkPairs = useMemo(() => {
    type Pair = { inAt: string; outAt: string | null; workedSec: number | null };
    const pairs: Pair[] = [];
    let pendingIn: TimeEntry | undefined;
    for (const e of todaySortedAsc) {
      if (e.type === "clock_in") {
        if (pendingIn) {
          pairs.push({ inAt: pendingIn.at, outAt: null, workedSec: null });
        }
        pendingIn = e;
      } else {
        if (pendingIn) {
          const sec = Math.max(
            0,
            Math.floor((new Date(e.at).getTime() - new Date(pendingIn.at).getTime()) / 1000)
          );
          pairs.push({ inAt: pendingIn.at, outAt: e.at, workedSec: sec });
          pendingIn = undefined;
        }
      }
    }
    if (pendingIn) {
      pairs.push({ inAt: pendingIn.at, outAt: null, workedSec: null });
    }
    return pairs;
  }, [todaySortedAsc]);

  function hrUserSuggestLabel(u: TeamAttendanceUserPicker): string {
    return `${u.fullName} · ${u.email}`;
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
      <header className="mb-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Presenze</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              Timbrature, riepilogo mensile e straordinario. Per timbrare usa la{" "}
              <Link href="/" className="font-medium text-[#3a5466] underline-offset-2 hover:underline dark:text-[#8aa3b3]">
                Dashboard
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NexaPageHelpButton pageKey="attendance" />
            {user && sessionCanAccessPayrollArea(user) ? (
              <Link
                href="/payroll-hebb"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-900/50"
              >
                Cedolini
              </Link>
            ) : null}
          </div>
        </div>
        <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-700" aria-label="Sezioni presenze">
          {(
            [
              ["storico", "Timbrature e storico"],
              ["straordinario", "Straordinario"],
              ...(canHrExport ? ([["team", "Team / HR"]] as const) : [])
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                view === id
                  ? "bg-[color-mix(in_srgb,#002D72_14%,transparent)] text-[#002D72] dark:text-sky-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60"
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {view === "straordinario" ? (
      <section className="card mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Straordinario</h2>
        {aggregates ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Oggi", aggregates.day.overtimeSeconds],
                ["Questa settimana", aggregates.week.overtimeSeconds],
                ["Questo mese", aggregates.month.overtimeSeconds],
                ["Quest'anno", aggregates.year.overtimeSeconds]
              ] as const
            ).map(([label, sec]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-4 text-center dark:border-slate-600 dark:bg-slate-900/40"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatSecondsHm(sec)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">—</p>
        )}
      </section>
      ) : null}

      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}

      {view === "team" && canHrExport ? (
        <section className="card mt-6 border-amber-200/80 dark:border-amber-900/40">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Gestione timbrature (HR / amministratori)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {canHrEdit
              ? "Export mensile di tutti gli utenti e correzione timbrature per singolo dipendente."
              : "Export Excel della vista giornaliera e del mese (solo lettura: la modifica timbrature è riservata al centro HR)."}
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
                  (remote working, trasferta, ferie, malattia) e avvisi.
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-9 w-9 shrink-0 p-0"
                    disabled={!token || hrBoardExportLoading}
                    onClick={() => void onExportHrBoard()}
                    title="Esporta in Excel la vista giornaliera (intestazioni e righe)"
                    aria-label="Esporta in Excel la vista giornaliera"
                  >
                    {hrBoardExportLoading ? (
                      <span className="text-xs">…</span>
                    ) : (
                      <FileSpreadsheet className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
                {hrBoardCcOptions.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                        Centri di costo
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs text-synapse-gold underline decoration-dotted hover:opacity-90"
                          onClick={() => setHrBoardCcSelected(new Set())}
                        >
                          Mostra tutti
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-600 underline decoration-dotted hover:opacity-90 dark:text-slate-400"
                          onClick={() =>
                            setHrBoardCcSelected(new Set(hrBoardCcOptions.map((o) => o.id)))
                          }
                        >
                          Seleziona tutti i CDC
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                      Senza selezione: tutti i dipendenti. Con uno o più CDC attivi, la vista si restringe.
                    </p>
                    <label className="mt-2 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      Cerca CDC
                      <input
                        type="search"
                        value={hrBoardCcSearch}
                        onChange={(e) => setHrBoardCcSearch(e.target.value)}
                        placeholder="Nome o codice…"
                        className="mt-1 w-full max-w-sm rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    {hrBoardCcSelected.size > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {hrBoardCcOptions
                          .filter((o) => hrBoardCcSelected.has(o.id))
                          .map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                              onClick={() => toggleHrBoardCc(o.id)}
                            >
                              {o.label}
                              <span className="text-slate-500" aria-hidden>
                                ×
                              </span>
                            </button>
                          ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">Filtro CDC: nessuno (tutti)</p>
                    )}
                    <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-slate-200/80 bg-white/60 p-2 dark:border-slate-700 dark:bg-slate-950/40">
                      <div className="flex flex-wrap gap-2">
                        {filteredHrBoardCcOptions.map((cc) => {
                          const on = hrBoardCcSelected.has(cc.id);
                          return (
                            <button
                              key={cc.id}
                              type="button"
                              onClick={() => toggleHrBoardCc(cc.id)}
                              className={[
                                "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                                on
                                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-100"
                                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
                              ].join(" ")}
                            >
                              {cc.label}
                            </button>
                          );
                        })}
                      </div>
                      {filteredHrBoardCcOptions.length === 0 ? (
                        <p className="py-2 text-center text-xs text-slate-500">Nessun CDC corrisponde.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
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
                                            ? "Remote working"
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
                    size="sm"
                    className="h-9 w-9 shrink-0 p-0"
                    disabled={!token || exportLoading}
                    onClick={() => void onExportMonthXlsx()}
                    title="Esporta in Excel tutte le timbrature del mese (intestazioni e righe)"
                    aria-label="Esporta in Excel le timbrature del mese"
                  >
                    {exportLoading ? (
                      <span className="text-xs">…</span>
                    ) : (
                      <FileSpreadsheet className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>

              {canHrEdit ? (
              <div className="border-t border-slate-200 pt-6 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Visualizza e modifica per utente
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Colonna sinistra: ricerca con suggerimenti e mese. Colonna destra: elenco timbrature e inserimento.
                </p>
                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <label className="block text-sm text-slate-700 dark:text-slate-300">
                      Cerca dipendente (nome o email, suggerimenti)
                      <input
                        type="search"
                        list="nexa-hr-user-datalist"
                        autoComplete="off"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        value={hrUserSearch}
                        onChange={(e) => {
                          const v = e.target.value;
                          setHrUserSearch(v);
                          const exact = teamUsers.find((u) => hrUserSuggestLabel(u) === v.trim());
                          setHrSelectedUserId(exact?.id ?? "");
                        }}
                        placeholder="Digita per filtrare, scegli dalla lista…"
                      />
                      <datalist id="nexa-hr-user-datalist">
                        {filteredTeamUsers.slice(0, 80).map((u) => (
                          <option key={u.id} value={hrUserSuggestLabel(u)} />
                        ))}
                      </datalist>
                    </label>
                    <label className="block text-sm text-slate-700 dark:text-slate-300">
                      Mese timbrature
                      <input
                        type="month"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        value={hrEditMonth}
                        onChange={(e) => setHrEditMonth(e.target.value)}
                      />
                    </label>
                    {hrSelectedUserId ? (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Selezionato:{" "}
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {teamUsers.find((u) => u.id === hrSelectedUserId)?.fullName ?? hrSelectedUserId}
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        Nessun dipendente selezionato: scegli una riga dai suggerimenti che combaciano con nome ed
                        email.
                      </p>
                    )}
                  </div>

                  <div className="min-w-0">
                {hrLoading ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">Caricamento timbrature...</p>
                ) : hrSelectedUserId ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
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
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Seleziona un utente nella colonna a sinistra per caricare le timbrature del mese.
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
              </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {view === "storico" ? (
      <>
      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Giorni lavorati</h2>
        <div className="mt-4">
          <WorkedDaySummaryCards rows={summary} user={user} travelDates={travelDates} />
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Oggi</h2>
        <div className="mt-4 space-y-4">
          {todayWorkPairs.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-400">Nessuna timbratura registrata oggi.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">
                        Entrata
                      </th>
                      <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">
                        Uscita
                      </th>
                      <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">
                        Lavorato
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayWorkPairs.map((pair, idx) => (
                      <tr
                        key={`${pair.inAt}-${pair.outAt ?? "open"}-${idx}`}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-3 py-2 tabular-nums text-slate-900 dark:text-slate-100">
                          {new Date(pair.inAt).toLocaleTimeString("it-CH", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-800 dark:text-slate-200">
                          {pair.outAt
                            ? new Date(pair.outAt).toLocaleTimeString("it-CH", {
                                hour: "2-digit",
                                minute: "2-digit"
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-800 dark:text-slate-200">
                          {pair.workedSec != null
                            ? formatSecondsHm(pair.workedSec)
                            : pair.outAt
                              ? "—"
                              : "In corso"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Straordinario oggi (giornata):{" "}
                <span className="font-semibold tabular-nums text-[#3a5466] dark:text-[#8aa3b3]">
                  {(status?.overtimeSeconds ?? 0) > 0
                    ? formatSecondsHm(status?.overtimeSeconds ?? 0)
                    : "—"}
                </span>
              </p>
            </>
          )}
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
      </>
      ) : null}
    </main>
  );
}

export default function AttendancePage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <main className="p-4 text-sm text-[var(--prom-muted)]">Caricamento presenze…</main>
      }
    >
      <AttendancePageContent />
    </Suspense>
  );
}
