/**
 * Precarica i dati del calendario lavoro dopo il login e li mette in cache in memoria.
 * La pagina /work-calendar consuma la cache al primo load (stesso mese / filtro) e poi aggiorna in silent.
 */

import {
  fetchCurrentUser,
  fetchHrWorkCalendar,
  fetchLeaveBalance,
  fetchMeTeamWorkCalendar,
  fetchUsers,
  type CalendarEventDto,
  type LeaveBalance,
  type User
} from "@/lib/api";
import { sessionCanSeeApprovalsAndHrExtras, type SessionUser } from "@/lib/auth-session";
import { monthRange } from "@/lib/work-calendar-ranges";

export type WorkCalendarWarmRowUser = { id: string; fullName: string };

/** Cache più lunga: il prefetch avviene dopo login; evita spinner al rientro nella pagina nella stessa sessione. */
const WARM_MAX_AGE_MS = 600_000;

export type WorkCalendarWarmPayload = {
  userId: string;
  year: number;
  month: number;
  userFilter: string;
  prefetchedAt: number;
  rowUsers: WorkCalendarWarmRowUser[];
  groupedRows: null;
  allUsersForSelect: User[];
  events: CalendarEventDto[];
  leaveBalance: LeaveBalance | null;
  costCenterLabelById: Record<string, string>;
  teamLabelById: Record<string, string>;
};

let warmPayload: WorkCalendarWarmPayload | null = null;

export function filterManagerRows(me: SessionUser, allUsers: User[]): WorkCalendarWarmRowUser[] {
  if (me.role === "superuser") {
    return allUsers
      .map((u) => ({ id: u.id, fullName: u.fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
  }
  const leadTeams = new Set(me.workTeamIdsWhereLead ?? []);
  return allUsers
    .filter((u) => {
      if (u.id === me.id) return true;
      if (u.managerId === me.id) return true;
      const tid = u.teamId?.trim();
      return Boolean(tid && leadTeams.has(tid));
    })
    .map((u) => ({ id: u.id, fullName: u.fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
}

function setWarm(p: WorkCalendarWarmPayload): void {
  warmPayload = p;
}

/**
 * Se userId / periodo / filtro coincidono con il prefetch, restituisce il payload e svuota la cache (uso singolo).
 */
export function takeWorkCalendarWarmPayload(
  userId: string,
  year: number,
  month: number,
  userFilter: string
): WorkCalendarWarmPayload | null {
  if (!warmPayload) {
    return null;
  }
  if (Date.now() - warmPayload.prefetchedAt > WARM_MAX_AGE_MS) {
    warmPayload = null;
    return null;
  }
  const f = userFilter.trim();
  if (
    warmPayload.userId !== userId ||
    warmPayload.year !== year ||
    warmPayload.month !== month ||
    warmPayload.userFilter !== f
  ) {
    return null;
  }
  const out = warmPayload;
  warmPayload = null;
  return out;
}

/**
 * Avvia in background il caricamento dati calendario (mese corrente). Non attendere.
 * Per superuser: solo warm delle API (nessuna cache strutturata) per ridurre latenza TCP/cache browser.
 */
export function prefetchWorkCalendarInBackground(token: string): void {
  void (async () => {
    try {
      const me = await fetchCurrentUser(token);
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const { from, to } = monthRange(y, m);
      const leaveBalanceP = fetchLeaveBalance(token, y).catch(() => null as LeaveBalance | null);

      if (me.role === "superuser") {
        const [ev, usersList, leaveBal] = await Promise.all([
          fetchHrWorkCalendar(token, { from, to }).catch(() => [] as CalendarEventDto[]),
          fetchUsers(token).catch(() => [] as User[]),
          leaveBalanceP
        ]);
        const rows = filterManagerRows(me, usersList);
        setWarm({
          userId: me.id,
          year: y,
          month: m,
          userFilter: "",
          prefetchedAt: Date.now(),
          rowUsers: rows,
          groupedRows: null,
          allUsersForSelect: usersList,
          events: ev,
          leaveBalance: leaveBal,
          costCenterLabelById: {},
          teamLabelById: {}
        });
        return;
      }

      if (!sessionCanSeeApprovalsAndHrExtras(me)) {
        const [{ users: rows, events: ev }, leaveBal] = await Promise.all([
          fetchMeTeamWorkCalendar(token, from, to),
          leaveBalanceP
        ]);
        setWarm({
          userId: me.id,
          year: y,
          month: m,
          userFilter: "",
          prefetchedAt: Date.now(),
          rowUsers: rows,
          groupedRows: null,
          allUsersForSelect: [],
          events: ev,
          leaveBalance: leaveBal,
          costCenterLabelById: {},
          teamLabelById: {}
        });
        return;
      }

      const usersList = await fetchUsers(token);
      const rows = filterManagerRows(me, usersList);
      const [ev, leaveBal] = await Promise.all([fetchHrWorkCalendar(token, { from, to }), leaveBalanceP]);
      setWarm({
        userId: me.id,
        year: y,
        month: m,
        userFilter: "",
        prefetchedAt: Date.now(),
        rowUsers: rows,
        groupedRows: null,
        allUsersForSelect: usersList,
        events: ev,
        leaveBalance: leaveBal,
        costCenterLabelById: {},
        teamLabelById: {}
      });
    } catch {
      /* prefetch best-effort */
    }
  })();
}
