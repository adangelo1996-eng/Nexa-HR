"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchHrWorkCalendar, fetchUsers, fetchCurrentUser, type CalendarEventDto, type User } from "@/lib/api";
import { clearSession, getToken, shouldClearSessionOnUnauthorizedApiError } from "@/lib/auth-session";

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
      return "border-blue-500/50 bg-blue-500/10 text-blue-900 dark:text-blue-100";
    case "smartworking":
      return "border-violet-500/50 bg-violet-500/10 text-violet-900 dark:text-violet-100";
    case "leave":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
    case "rol":
      return "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100";
    case "holiday":
      return "border-rose-500/50 bg-rose-500/10 text-rose-900 dark:text-rose-100";
    case "sickness":
      return "border-orange-500/50 bg-orange-500/10";
    default:
      return "border-[var(--prom-line)] bg-[var(--prom-surface-soft)]";
  }
}

export default function WorkCalendarPage(): React.JSX.Element {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [userFilter, setUserFilter] = useState<string>("");

  const [y, m] = useMemo(() => {
    const [yy, mm] = ym.split("-").map(Number);
    return [yy, mm] as [number, number];
  }, [ym]);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const me = await fetchCurrentUser(t);
      if (me.role === "employee") {
        router.replace("/");
        return;
      }
      const allUsers = await fetchUsers(t);
      setUsers(allUsers);
      const { from, to } = monthRange(y, m);
      const ids =
        userFilter.trim() !== "" ? [userFilter.trim()] : undefined;
      const ev = await fetchHrWorkCalendar(t, { from, to, userIds: ids });
      setEvents(ev);
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
  }, [router, y, m, userFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventDto[]>();
    for (const ev of events) {
      const day = ev.start.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [events]);

  const daysInMonth = useMemo(() => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => {
      const d = i + 1;
      const day = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return day;
    });
  }, [y, m]);

  if (loading && events.length === 0 && !error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--prom-muted)]">
        Caricamento calendario…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Calendario lavoro</h1>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            Turni, smart working, ferie, ROL e festività (vista team).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
            <span>Mese</span>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
            <span>Dipendente</span>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="max-w-[200px] rounded border border-[var(--prom-line)] bg-transparent px-2 py-1"
            >
              <option value="">Tutti visibili</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </label>
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

      <div className="space-y-3">
        {daysInMonth.map((day) => {
          const list = byDay.get(day) ?? [];
          if (list.length === 0) return null;
          return (
            <section
              key={day}
              className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-3"
            >
              <h2 className="mb-2 text-sm font-medium text-[var(--prom-text)]">{day}</h2>
              <ul className="space-y-2">
                {list.map((ev) => {
                  const uname = ev.userId ? users.find((u) => u.id === ev.userId)?.fullName : null;
                  return (
                    <li
                      key={`${ev.id}-${ev.userId ?? ""}`}
                      className={[
                        "rounded-lg border px-3 py-2 text-xs",
                        kindStyle(ev.kind)
                      ].join(" ")}
                    >
                      <span className="font-medium">{ev.title}</span>
                      {uname ? (
                        <span className="ml-2 text-[10px] opacity-90">· {uname}</span>
                      ) : null}
                      {ev.kind === "shift" && ev.end ? (
                        <span className="ml-2 block text-[10px] opacity-80">
                          {ev.start.slice(11, 16)} – {ev.end.slice(11, 16)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {!loading && events.length === 0 ? (
        <p className="text-sm text-[var(--prom-muted)]">Nessun evento in questo periodo.</p>
      ) : null}
    </div>
  );
}
