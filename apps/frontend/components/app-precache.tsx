"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  fetchAttendanceEntries,
  fetchAttendanceOvertimeAggregates,
  fetchAttendanceStatus,
  fetchAttendanceSummary,
  fetchCurrentUser,
  fetchHrWorkCalendar,
  fetchLeaveBalance,
  fetchMeTeamWorkCalendar,
  fetchUserCalendar,
  fetchUsers
} from "@/lib/api";
import { getToken, sessionCanSeeApprovalsAndHrExtras, type SessionUser } from "@/lib/auth-session";
import { currentCalendarMonthRange, mergedPersonalCalendarRange } from "@/lib/work-calendar-ranges";
import { prefetchPersonnelBudgetInBackground } from "@/lib/personnel-budget-prefetch";
import { prefetchWorkCalendarInBackground } from "@/lib/work-calendar-prefetch";

/** Route principali (chunk JS) per navigazione rapida. */
const PREFETCH_ROUTES: Route[] = [
  "/",
  "/mappa-portale",
  "/work-calendar",
  "/attendance",
  "/workflow",
  "/workflow/approvals",
  "/expenses",
  "/payslips",
  "/settings",
  "/organigramma",
  "/org-chart",
  "/smartworking",
  "/reports",
  "/personnel-budget"
];

/**
 * Precarica le stesse API usate da Dashboard presenze + Calendario lavoro (vista dipendente o HR).
 * Errori ignorati: serve solo a popolare cache HTTP / Service Worker se presente.
 */
async function warmAttendanceAndCalendarApis(token: string): Promise<void> {
  let me: SessionUser;
  try {
    me = await fetchCurrentUser(token);
  } catch {
    return;
  }

  const y = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const { from: ucFrom, to: ucTo } = mergedPersonalCalendarRange();
  const { from: monthFrom, to: monthTo } = currentCalendarMonthRange();

  const common = [
    fetchUserCalendar(token, ucFrom, ucTo).catch(() => {}),
    fetchLeaveBalance(token, y).catch(() => {}),
    fetchAttendanceEntries(token).catch(() => {}),
    fetchAttendanceSummary(token).catch(() => {}),
    fetchAttendanceStatus(token, today).catch(() => {}),
    fetchAttendanceOvertimeAggregates(token, today).catch(() => {})
  ];

  if (!sessionCanSeeApprovalsAndHrExtras(me)) {
    await Promise.all([
      ...common,
      fetchMeTeamWorkCalendar(token, monthFrom, monthTo).catch(() => {})
    ]);
    return;
  }

  await Promise.all([
    ...common,
    fetchUsers(token).catch(() => {}),
    fetchHrWorkCalendar(token, { from: monthFrom, to: monthTo }).catch(() => {})
  ]);
}

/**
 * Dopo login: prefetch Next.js delle pagine chiave + in background le API pesanti
 * (calendario personale/team/HR, presenze, ferie) per aprire le schermate senza attesa.
 */
export function AppPrecache(): null {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    const token = getToken();
    if (!token) {
      return;
    }
    ran.current = true;

    const run = (): void => {
      for (const href of PREFETCH_ROUTES) {
        void router.prefetch(href);
      }
      prefetchWorkCalendarInBackground(token);
      prefetchPersonnelBudgetInBackground(token);
      void warmAttendanceAndCalendarApis(token).catch(() => {
        /* warm cache only */
      });
    };

    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => run(), { timeout: 8000 });
    } else {
      window.setTimeout(run, 1200);
    }
  }, [router]);

  return null;
}
