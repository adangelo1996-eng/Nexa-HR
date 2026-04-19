"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelPendingLeavePlan,
  cancelPendingSicknessEvent,
  cancelSmartworkingRequest,
  cancelTravelRequest,
  cancelMeetingRoomBooking,
  createLeavePlan,
  createMeetingRoom,
  createMeetingRoomBooking,
  createSmartworkingRequest,
  createTravelRequest,
  fetchAdminCostCenters,
  fetchAdminWorkTeams,
  fetchCurrentUser,
  fetchHrWorkCalendar,
  fetchLeaveBalance,
  fetchMeetingRoomBookingEvents,
  fetchMeetingRooms,
  fetchMeTeamWorkCalendar,
  fetchUserCalendar,
  fetchUsers,
  reportSickness,
  setAttendanceWorkMode,
  updateLeavePlan,
  updateSicknessEvent,
  updateSmartworkingRequest,
  updateTravelRequest,
  type CalendarEventDto,
  type LeaveBalance,
  type MeetingRoomDto,
  type User
} from "@/lib/api";
import { calendarEventAbbrev } from "@/lib/calendar-event-labels";
import { aggregateWorkCalendarStats, formatItalianDateLong } from "@/lib/work-calendar-analytics";
import { monthRange } from "@/lib/work-calendar-ranges";
import { takeWorkCalendarWarmPayload } from "@/lib/work-calendar-prefetch";
import {
  clearSession,
  getToken,
  sessionCanSeeApprovalsAndHrExtras,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser,
  type UserRole
} from "@/lib/auth-session";

type RowUser = { id: string; fullName: string };
type RoomRow = { id: string; fullName: string; room: MeetingRoomDto };

type AdminTableRow =
  | { kind: "cc"; id: string; label: string }
  | { kind: "team"; id: string; label: string }
  | { kind: "person"; row: RowUser }
  | { kind: "rooms"; label: string }
  | { kind: "room"; row: RoomRow };

function readMultiSelectValues(e: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(e.target.selectedOptions, (opt) => opt.value);
}

/** Pulsanti / righe azione trasferta: niente blu/cyan, allineato a --prom-* */
const TRAVEL_ACTION_ROW_CLASS =
  "rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-4 py-3 text-left text-sm font-medium text-[var(--prom-text)] transition hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_100%,transparent)]";

function kindStyle(kind: CalendarEventDto["kind"]): string {
  switch (kind) {
    case "shift":
      return "border-[color-mix(in_srgb,var(--prom-gold)_50%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_14%,transparent)] text-[var(--prom-text)]";
    case "smartworking":
      return "border-violet-500/50 bg-violet-500/15 text-violet-900 dark:text-violet-100";
    case "leave":
      return "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100";
    case "rol":
      return "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100";
    case "holiday":
      return "border-rose-500/50 bg-rose-500/15 text-rose-900 dark:text-rose-100";
    case "sickness":
      return "border-orange-500/50 bg-orange-500/15 text-orange-900 dark:text-orange-100";
    case "travel":
      return "border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] text-[var(--prom-text)]";
    case "office":
      return "border-[color-mix(in_srgb,var(--prom-gold)_50%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_14%,transparent)] text-[var(--prom-text)]";
    case "room_booking":
      return "border-sky-500/40 bg-sky-500/15 text-sky-950 dark:text-sky-100";
    default:
      return "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)]";
  }
}

function isCalendarPending(ev: CalendarEventDto): boolean {
  return ev.meta?.status === "pending";
}

function isCalendarApproved(ev: CalendarEventDto): boolean {
  return String(ev.meta?.status ?? "") === "approved";
}

function eventStyle(ev: CalendarEventDto): string {
  const st = String(ev.meta?.status ?? "");
  if (
    st === "rejected" &&
    (ev.kind === "leave" ||
      ev.kind === "rol" ||
      ev.kind === "smartworking" ||
      ev.kind === "sickness" ||
      ev.kind === "travel")
  ) {
    return "border-red-600/70 bg-red-500/15 text-red-950 dark:border-red-500/55 dark:bg-red-950/40 dark:text-red-100";
  }
  if (
    isCalendarPending(ev) &&
    (ev.kind === "leave" ||
      ev.kind === "rol" ||
      ev.kind === "smartworking" ||
      ev.kind === "sickness" ||
      ev.kind === "travel")
  ) {
    return "border-yellow-500/55 bg-yellow-500/15 text-yellow-950 dark:text-yellow-100";
  }
  return kindStyle(ev.kind);
}

type SwDayState = { on: boolean; requestId?: string; status?: string };

function deriveSwDayState(events: CalendarEventDto[]): SwDayState {
  const sws = events.filter((e) => e.kind === "smartworking");
  if (sws.length === 0) return { on: false };
  const fromReqs = sws.filter(
    (e) => typeof e.meta?.swRequestId === "string" && String(e.meta.swRequestId).length > 0
  );
  const activeReq = fromReqs.find((e) => String(e.meta?.status ?? "") !== "rejected");
  if (activeReq) {
    const st = String(activeReq.meta?.status ?? "");
    return {
      on: st === "pending" || st === "approved",
      requestId: String(activeReq.meta?.swRequestId),
      status: st
    };
  }
  if (fromReqs.length > 0 && fromReqs.every((e) => String(e.meta?.status ?? "") === "rejected")) {
    return { on: false };
  }
  return { on: true, status: "approved" };
}

function findPendingSwRequestIdForUser(events: CalendarEventDto[], userId: string): string | undefined {
  for (const e of events) {
    if (e.kind !== "smartworking" || e.userId !== userId) continue;
    if (String(e.meta?.status) === "pending" && typeof e.meta?.swRequestId === "string") {
      return e.meta.swRequestId;
    }
  }
  return undefined;
}

function patchSmartworkingRequestInCalendar(
  events: CalendarEventDto[],
  userId: string,
  requestId: string,
  newDay: string,
  note: string | null
): CalendarEventDto[] {
  const d = newDay.slice(0, 10);
  const noteTrim = note?.trim() || null;
  return events.map((ev) => {
    if (ev.kind !== "smartworking" || ev.userId !== userId) return ev;
    if (String(ev.meta?.swRequestId) !== requestId) return ev;
    const meta: Record<string, unknown> = { ...ev.meta, swRequestId: requestId, status: "pending" };
    if (noteTrim) meta.note = noteTrim;
    else delete meta.note;
    return { ...ev, start: d, end: d, meta };
  });
}

const OPTIMISTIC_CLIENT_ID = "optimisticClientId";

function removeOptimisticClientEvents(events: CalendarEventDto[], clientId: string): CalendarEventDto[] {
  return events.filter((e) => String(e.meta?.[OPTIMISTIC_CLIENT_ID] ?? "") !== clientId);
}

function newClientOptimisticId(): string {
  return `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function appendOptimisticLeave(
  events: CalendarEventDto[],
  args: { userId: string; start: string; end: string; leaveKind: "annual" | "rol"; clientId: string }
): CalendarEventDto[] {
  const isRol = args.leaveKind === "rol";
  const ev: CalendarEventDto = {
    id: `opt-cal-leave-${args.clientId}`,
    kind: isRol ? "rol" : "leave",
    title: isRol ? "Permesso ROL (in attesa)" : "Ferie (in attesa)",
    start: args.start.slice(0, 10),
    end: args.end.slice(0, 10),
    userId: args.userId,
    meta: {
      leaveId: `opt-leave-${args.clientId}`,
      status: "pending",
      kind: args.leaveKind,
      [OPTIMISTIC_CLIENT_ID]: args.clientId
    }
  };
  return [...events, ev];
}

function appendOptimisticSickness(
  events: CalendarEventDto[],
  args: { userId: string; from: string; to: string; clientId: string }
): CalendarEventDto[] {
  const ev: CalendarEventDto = {
    id: `opt-cal-sk-${args.clientId}`,
    kind: "sickness",
    title: "Malattia (in attesa)",
    start: args.from.slice(0, 10),
    end: args.to.slice(0, 10),
    userId: args.userId,
    meta: {
      sicknessId: `opt-sk-${args.clientId}`,
      status: "pending",
      [OPTIMISTIC_CLIENT_ID]: args.clientId
    }
  };
  return [...events, ev];
}

function appendOptimisticSmartworking(
  events: CalendarEventDto[],
  args: { userId: string; day: string; note?: string; clientId: string }
): CalendarEventDto[] {
  const d = args.day.slice(0, 10);
  const meta: Record<string, unknown> = {
    swRequestId: `opt-sw-${args.clientId}`,
    status: "pending",
    [OPTIMISTIC_CLIENT_ID]: args.clientId
  };
  if (args.note?.trim()) meta.note = args.note.trim();
  const ev: CalendarEventDto = {
    id: `opt-cal-swr-${args.clientId}`,
    kind: "smartworking",
    title: "Smart working (in attesa)",
    start: d,
    end: d,
    userId: args.userId,
    meta
  };
  return [...events, ev];
}

function appendOptimisticTravel(
  events: CalendarEventDto[],
  args: { userId: string; day: string; note?: string; clientId: string }
): CalendarEventDto[] {
  const d = args.day.slice(0, 10);
  const meta: Record<string, unknown> = {
    travelRequestId: `opt-tr-${args.clientId}`,
    status: "pending",
    [OPTIMISTIC_CLIENT_ID]: args.clientId
  };
  if (args.note?.trim()) meta.note = args.note.trim();
  const ev: CalendarEventDto = {
    id: `opt-cal-tr-${args.clientId}`,
    kind: "travel",
    title: "Trasferta (in attesa)",
    start: d,
    end: d,
    userId: args.userId,
    meta
  };
  return [...events, ev];
}

function appendOptimisticOffice(
  events: CalendarEventDto[],
  args: { userId: string; day: string; clientId: string }
): CalendarEventDto[] {
  const d = args.day.slice(0, 10);
  const ev: CalendarEventDto = {
    id: `opt-cal-office-${args.clientId}`,
    kind: "office",
    title: "Sede",
    start: d,
    end: d,
    userId: args.userId,
    meta: { date: d, [OPTIMISTIC_CLIENT_ID]: args.clientId }
  };
  return [...events, ev];
}

/** Form/checkbox state: if a pending SW request exists for the user, it stays “on” while editing day (not only when that day matches events yet). */
function deriveSwFormState(events: CalendarEventDto[], userId: string, swPendingDay: string): SwDayState {
  const dayIso = swPendingDay.slice(0, 10);
  const atDay = deriveSwDayState(eventsForCell(events, userId, dayIso));
  const rid = findPendingSwRequestIdForUser(events, userId);
  if (!rid) return atDay;
  const pendingEv = events.find(
    (e) =>
      e.kind === "smartworking" &&
      e.userId === userId &&
      String(e.meta?.swRequestId) === rid &&
      String(e.meta?.status) === "pending"
  );
  if (!pendingEv) return atDay;
  return {
    on: true,
    requestId: rid,
    status: "pending"
  };
}

type TrDayState = { on: boolean; requestId?: string; status?: string };

function deriveTravelDayState(events: CalendarEventDto[]): TrDayState {
  const trs = events.filter((e) => e.kind === "travel");
  if (trs.length === 0) return { on: false };
  const fromReqs = trs.filter(
    (e) => typeof e.meta?.travelRequestId === "string" && String(e.meta.travelRequestId).length > 0
  );
  const activeReq = fromReqs.find((e) => String(e.meta?.status ?? "") !== "rejected");
  if (activeReq) {
    const st = String(activeReq.meta?.status ?? "");
    return {
      on: st === "pending" || st === "approved",
      requestId: String(activeReq.meta?.travelRequestId),
      status: st
    };
  }
  if (fromReqs.length > 0 && fromReqs.every((e) => String(e.meta?.status ?? "") === "rejected")) {
    return { on: false };
  }
  return { on: true, status: "approved" };
}

function findPendingTravelRequestIdForUser(events: CalendarEventDto[], userId: string): string | undefined {
  for (const e of events) {
    if (e.kind !== "travel" || e.userId !== userId) continue;
    if (String(e.meta?.status) === "pending" && typeof e.meta?.travelRequestId === "string") {
      return e.meta.travelRequestId;
    }
  }
  return undefined;
}

function patchTravelRequestInCalendar(
  events: CalendarEventDto[],
  userId: string,
  requestId: string,
  newDay: string,
  note: string | null
): CalendarEventDto[] {
  const d = newDay.slice(0, 10);
  const noteTrim = note?.trim() || null;
  return events.map((ev) => {
    if (ev.kind !== "travel" || ev.userId !== userId) return ev;
    if (String(ev.meta?.travelRequestId) !== requestId) return ev;
    const meta: Record<string, unknown> = { ...ev.meta, travelRequestId: requestId, status: "pending" };
    if (noteTrim) meta.note = noteTrim;
    else delete meta.note;
    return { ...ev, start: d, end: d, meta };
  });
}

function deriveTravelFormState(events: CalendarEventDto[], userId: string, trPendingDay: string): TrDayState {
  const dayIso = trPendingDay.slice(0, 10);
  const atDay = deriveTravelDayState(eventsForCell(events, userId, dayIso));
  const rid = findPendingTravelRequestIdForUser(events, userId);
  if (!rid) return atDay;
  const pendingEv = events.find(
    (e) =>
      e.kind === "travel" &&
      e.userId === userId &&
      String(e.meta?.travelRequestId) === rid &&
      String(e.meta?.status) === "pending"
  );
  if (!pendingEv) return atDay;
  return {
    on: true,
    requestId: rid,
    status: "pending"
  };
}

type ModalStep = "menu" | "smartworking" | "leave" | "sickness" | "travel";
type RoomModalStep = "room_menu" | "room_book" | "room_create";

function eventTouchesDay(ev: CalendarEventDto, dayIso: string): boolean {
  const d = dayIso.slice(0, 10);
  const s = ev.start.slice(0, 10);
  const e = (ev.end ?? ev.start).slice(0, 10);
  return d >= s && d <= e;
}

function eventsForCell(events: CalendarEventDto[], userId: string, dayIso: string): CalendarEventDto[] {
  const list: CalendarEventDto[] = [];
  for (const ev of events) {
    if (!eventTouchesDay(ev, dayIso)) continue;
    if (ev.kind === "holiday") {
      list.push(ev);
      continue;
    }
    if (ev.userId === userId) list.push(ev);
  }
  return list;
}

function holidayTitleForDay(events: CalendarEventDto[], dayIso: string): string | null {
  const h = events.find((ev) => ev.kind === "holiday" && eventTouchesDay(ev, dayIso));
  return h?.title ?? null;
}

function filterManagerRows(me: SessionUser, allUsers: User[]): RowUser[] {
  if (me.role === "superuser") {
    return allUsers.map((u) => ({ id: u.id, fullName: u.fullName })).sort((a, b) => a.fullName.localeCompare(b.fullName, "it"));
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

function canShowCalendarEventActions(me: SessionUser | null, rowUserId: string): boolean {
  if (!me) return false;
  if (rowUserId.startsWith("room:")) return false;
  if (!sessionCanSeeApprovalsAndHrExtras(me)) return me.id === rowUserId;
  return me.id === rowUserId || me.role === "superuser" || me.isTeamResponsible === true;
}

/** Superuser: anche sulla propria riga; HR (team/admin): correzione su dipendenti, non sul proprio profilo salvo superuser. */
function canEditApprovedCalendarChip(
  me: SessionUser | null,
  rowUserId: string,
  ev: CalendarEventDto
): boolean {
  if (!me || isCalendarPending(ev) || String(ev.meta?.status ?? "") === "rejected") {
    return false;
  }
  if (!isCalendarApproved(ev)) {
    return false;
  }
  if (
    ev.kind === "leave" ||
    ev.kind === "rol" ||
    ev.kind === "sickness" ||
    ev.kind === "smartworking" ||
    ev.kind === "travel"
  ) {
    const hasEntityId =
      ((ev.kind === "leave" || ev.kind === "rol") && typeof ev.meta?.leaveId === "string") ||
      (ev.kind === "sickness" && typeof ev.meta?.sicknessId === "string") ||
      (ev.kind === "smartworking" && typeof ev.meta?.swRequestId === "string") ||
      (ev.kind === "travel" && typeof ev.meta?.travelRequestId === "string");
    if (!hasEntityId) {
      return false;
    }
  } else {
    return false;
  }
  if (me.role === "superuser") {
    return true;
  }
  if (!sessionCanSeeApprovalsAndHrExtras(me)) {
    return false;
  }
  if (me.id === rowUserId) {
    return false;
  }
  return canShowCalendarEventActions(me, rowUserId);
}

function isPendingWithMutableRequest(ev: CalendarEventDto): boolean {
  if (!isCalendarPending(ev)) return false;
  if (ev.kind === "leave" || ev.kind === "rol") return typeof ev.meta?.leaveId === "string";
  if (ev.kind === "sickness") return typeof ev.meta?.sicknessId === "string";
  if (ev.kind === "smartworking") return typeof ev.meta?.swRequestId === "string";
  if (ev.kind === "travel") return typeof ev.meta?.travelRequestId === "string";
  return false;
}

function calendarEventStartDateIso(ev: CalendarEventDto): string {
  return ev.start.slice(0, 10);
}

/** Oggi YYYY-MM-DD (Europe/Rome), allineato al backend per “futuro”. */
function calendarDateTodayIsoRome(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

function isCalendarEventStartInFuture(ev: CalendarEventDto): boolean {
  return calendarEventStartDateIso(ev) > calendarDateTodayIsoRome();
}

/** HR esteso / Synapse admin / superuser: possono modificare anche giorni passati. */
function viewerCanEditPastCalendarEvents(me: SessionUser | null): boolean {
  if (!me) return false;
  if (me.role === "superuser") return true;
  if (me.canNexaAdmin === true) return true;
  if (me.canAccessHrExtendedConsole === true) return true;
  return false;
}

function calendarEventEndDateIso(ev: CalendarEventDto): string {
  return (ev.end ?? ev.start).slice(0, 10);
}

/** Dipendente/responsabile: modifica consentita solo se l’evento ha almeno un giorno ≥ oggi (o è HR). */
function nonHrMayEditCalendarEvent(me: SessionUser | null, ev: CalendarEventDto): boolean {
  if (viewerCanEditPastCalendarEvents(me)) return true;
  const today = calendarDateTodayIsoRome();
  return calendarEventEndDateIso(ev) >= today;
}

function assertMayOpenCalendarDayModal(me: SessionUser | null, dayIso: string): boolean {
  if (!me) return false;
  if (viewerCanEditPastCalendarEvents(me)) return true;
  return dayIso.slice(0, 10) >= calendarDateTodayIsoRome();
}

/** Creazione / duplicazione sale: solo superuser JWT o console Synapse admin (`canNexaAdmin`). */
function mayCreateMeetingRooms(me: SessionUser | null): boolean {
  if (!me) return false;
  return me.role === "superuser" || me.canNexaAdmin === true;
}

/** Solo il dipendente della riga (o superuser) può togliere assenze approvate future; HR vede ma non il pulsante. */
function canRemoveApprovedFutureAsEmployee(viewer: SessionUser | null, rowUserId: string): boolean {
  if (!viewer) return false;
  if (viewer.id === rowUserId) return true;
  if (viewer.role === "superuser") return true;
  return false;
}

/** Rimuovi dal calendario: in attesa/rifiutata, oppure approvata con inizio data futura (ferie, ROL, SW, trasferta). */
function canRemoveCalendarRequest(ev: CalendarEventDto, viewer: SessionUser | null, rowUserId: string): boolean {
  const st = String(ev.meta?.status ?? "");
  const pendingOrRejected = st === "pending" || st === "rejected";
  const approvedFuture =
    st === "approved" && isCalendarEventStartInFuture(ev) && canRemoveApprovedFutureAsEmployee(viewer, rowUserId);
  if (!pendingOrRejected && !approvedFuture) return false;
  if (ev.kind === "leave" || ev.kind === "rol") return typeof ev.meta?.leaveId === "string";
  if (ev.kind === "smartworking") return typeof ev.meta?.swRequestId === "string";
  if (ev.kind === "travel") return typeof ev.meta?.travelRequestId === "string";
  return false;
}

function hasActiveNonRejectedLeave(cellEvents: CalendarEventDto[]): boolean {
  return cellEvents.some(
    (e) => (e.kind === "leave" || e.kind === "rol") && String(e.meta?.status ?? "") !== "rejected"
  );
}

function hasActiveNonRejectedSickness(cellEvents: CalendarEventDto[]): boolean {
  return cellEvents.some((e) => e.kind === "sickness" && String(e.meta?.status ?? "") !== "rejected");
}

function hasActiveNonRejectedSmartworking(cellEvents: CalendarEventDto[]): boolean {
  const st = deriveSwDayState(cellEvents);
  if (String(st.status ?? "") === "rejected") return false;
  return Boolean(st.on || st.status === "pending");
}

function hasActiveNonRejectedTravel(cellEvents: CalendarEventDto[]): boolean {
  const st = deriveTravelDayState(cellEvents);
  if (String(st.status ?? "") === "rejected") return false;
  return Boolean(st.on || st.status === "pending");
}

const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

function AnalyticsStatRow({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--prom-line)] py-2 text-sm last:border-0">
      <dt className="text-[var(--prom-muted)]">{label}</dt>
      <dd className="tabular-nums font-medium text-[var(--prom-text)]">{value}</dd>
    </div>
  );
}

export default function WorkCalendarPage(): React.JSX.Element {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [rowUsers, setRowUsers] = useState<RowUser[]>([]);
  const [groupedRows, setGroupedRows] = useState<AdminTableRow[] | null>(null);
  const [allUsersForSelect, setAllUsersForSelect] = useState<User[]>([]);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [myAnalyticsEvents, setMyAnalyticsEvents] = useState<CalendarEventDto[]>([]);
  const [analyticsLeaveBalance, setAnalyticsLeaveBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string>("");
  const [modal, setModal] = useState<{ day: string; row: RowUser } | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>("menu");
  const [swOptimistic, setSwOptimistic] = useState<boolean | null>(null);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveKind, setLeaveKind] = useState<"annual" | "rol">("annual");
  const [swNote, setSwNote] = useState("");
  const [sickFrom, setSickFrom] = useState("");
  const [sickTo, setSickTo] = useState("");
  const [sickFile, setSickFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [editingSicknessId, setEditingSicknessId] = useState<string | null>(null);
  const [swPendingDay, setSwPendingDay] = useState("");
  const [travelNote, setTravelNote] = useState("");
  const [travelPendingDay, setTravelPendingDay] = useState("");
  const [travelOptimistic, setTravelOptimistic] = useState<boolean | null>(null);
  const [editingTravelRequestId, setEditingTravelRequestId] = useState<string | null>(null);
  const [editingSwRequestId, setEditingSwRequestId] = useState<string | null>(null);
  const [chipEditIsApproved, setChipEditIsApproved] = useState(false);
  const [hrYtdAnalyticsEvents, setHrYtdAnalyticsEvents] = useState<CalendarEventDto[]>([]);
  const [hrYtdAnalyticsLoading, setHrYtdAnalyticsLoading] = useState(false);
  const [costCenterLabelById, setCostCenterLabelById] = useState<Record<string, string>>({});
  const [teamLabelById, setTeamLabelById] = useState<Record<string, string>>({});
  const [analyticsFilterCc, setAnalyticsFilterCc] = useState<string[]>([]);
  const [analyticsFilterTeam, setAnalyticsFilterTeam] = useState<string[]>([]);
  const [analyticsFilterUserIds, setAnalyticsFilterUserIds] = useState<string[]>([]);
  const [analyticsFilterRoles, setAnalyticsFilterRoles] = useState<UserRole[]>([]);
  const [analyticsFilterManagerIds, setAnalyticsFilterManagerIds] = useState<string[]>([]);
  const [rooms, setRooms] = useState<MeetingRoomDto[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomModal, setRoomModal] = useState<{ day: string; row: RoomRow } | null>(null);
  const [roomModalStep, setRoomModalStep] = useState<RoomModalStep>("room_menu");
  const [roomBookingTitle, setRoomBookingTitle] = useState("");
  const [roomBookingStart, setRoomBookingStart] = useState("09:00");
  const [roomBookingEnd, setRoomBookingEnd] = useState("10:00");
  const [roomCreateName, setRoomCreateName] = useState("");
  const [roomCreateLocation, setRoomCreateLocation] = useState("");
  const [roomCreateSeats, setRoomCreateSeats] = useState<string>("");
  const [roomCreateHasScreen, setRoomCreateHasScreen] = useState(true);
  const [roomCreateHasWhiteboard, setRoomCreateHasWhiteboard] = useState(true);
  const [roomCreateHasProjector, setRoomCreateHasProjector] = useState(false);
  const [roomCreateHasVideo, setRoomCreateHasVideo] = useState(false);
  const [roomCreateExtras, setRoomCreateExtras] = useState("");

  const load = useCallback(async (opts?: { silent?: boolean }): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    const silent = Boolean(opts?.silent);
    setError(null);
    if (!silent) setLoading(true);
    try {
      const current = await fetchCurrentUser(t);
      const fidEarly = userFilter.trim();
      const warm = takeWorkCalendarWarmPayload(current.id, year, month, fidEarly);
      if (warm && !silent) {
        setMe(current);
        setRowUsers(warm.rowUsers);
        setGroupedRows(warm.groupedRows);
        setAllUsersForSelect(warm.allUsersForSelect);
        setEvents(warm.events);
        setMyAnalyticsEvents(warm.myAnalyticsEvents);
        setAnalyticsLeaveBalance(warm.analyticsLeaveBalance);
        setCostCenterLabelById(warm.costCenterLabelById);
        setTeamLabelById(warm.teamLabelById);
        setLoading(false);
        void load({ silent: true });
        return;
      }
      setMe(current);
      const { from, to } = monthRange(year, month);
      const yearFrom = `${year}-01-01`;
      const analyticsP = Promise.all([
        fetchUserCalendar(t, yearFrom, to).catch(() => [] as CalendarEventDto[]),
        fetchLeaveBalance(t, year).catch(() => null as LeaveBalance | null)
      ]);

      const roomsP = (async () => {
        setRoomsLoading(true);
        try {
          return await fetchMeetingRooms(t);
        } catch {
          return [] as MeetingRoomDto[];
        } finally {
          setRoomsLoading(false);
        }
      })();

      if (!sessionCanSeeApprovalsAndHrExtras(current)) {
        const [{ users: rows, events: ev }, [myEv, leaveBal]] = await Promise.all([
          fetchMeTeamWorkCalendar(t, from, to),
          analyticsP
        ]);
        const roomsList = await roomsP;
        setRooms(roomsList);
        const roomEvents = await fetchMeetingRoomBookingEvents(t, from, to).catch(() => [] as CalendarEventDto[]);
        setRowUsers(rows);
        setGroupedRows(null);
        setAllUsersForSelect([]);
        setEvents([...ev, ...roomEvents]);
        setMyAnalyticsEvents(myEv);
        setAnalyticsLeaveBalance(leaveBal);
      } else {
        const usersList = await fetchUsers(t);
        setAllUsersForSelect(usersList);
        if (current.role !== "superuser") {
          setCostCenterLabelById({});
          setTeamLabelById({});
        }
        let rows = filterManagerRows(current, usersList);
        const fid = userFilter.trim();
        let layout: AdminTableRow[] | null = null;
        if (fid) {
          rows = rows.filter((r) => r.id === fid);
        } else if (current.role === "superuser") {
          const visibleSet = new Set(rows.map((r) => r.id));
          const ccs = await fetchAdminCostCenters(t);
          const ccLabels: Record<string, string> = {};
          for (const cc of ccs) {
            ccLabels[cc.id] = [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name;
          }
          setCostCenterLabelById(ccLabels);
          const teamsNested = await Promise.all(
            [...ccs]
              .sort((a, b) => a.name.localeCompare(b.name, "it"))
              .map(async (cc) => ({ cc, teams: await fetchAdminWorkTeams(t, cc.id) }))
          );
          const tlabels: Record<string, string> = {};
          for (const { cc, teams } of teamsNested) {
            const pref = [cc.code, cc.name].filter(Boolean).join(" · ");
            const pfx = pref ? `${pref} — ` : "";
            for (const tm of teams) {
              tlabels[tm.id] = `${pfx}${tm.name}`;
            }
          }
          setTeamLabelById(tlabels);
          const built: AdminTableRow[] = [];
          const assigned = new Set<string>();
          const visibleUsers = usersList.filter((u) => visibleSet.has(u.id));

          for (const { cc, teams } of teamsNested) {
            const inCc = visibleUsers.filter((u) => u.costCenterId === cc.id);
            if (inCc.length === 0) continue;
            built.push({
              kind: "cc",
              id: cc.id,
              label: [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name
            });
            const teamsSorted = [...teams].sort((a, b) => a.name.localeCompare(b.name, "it"));
            const byTeam = new Map<string, User[]>();
            const noneTeam: User[] = [];
            for (const u of inCc) {
              if (u.teamId) {
                if (!byTeam.has(u.teamId)) byTeam.set(u.teamId, []);
                byTeam.get(u.teamId)!.push(u);
              } else {
                noneTeam.push(u);
              }
            }
            for (const team of teamsSorted) {
              const members = byTeam.get(team.id);
              if (!members?.length) continue;
              built.push({ kind: "team", id: team.id, label: team.name });
              for (const u of [...members].sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))) {
                built.push({ kind: "person", row: { id: u.id, fullName: u.fullName } });
                assigned.add(u.id);
              }
              byTeam.delete(team.id);
            }
            const unassigned = [...noneTeam, ...Array.from(byTeam.values()).flat()];
            if (unassigned.length > 0) {
              built.push({ kind: "team", id: `orphan-${cc.id}`, label: "Senza team / altro" });
              for (const u of [...unassigned].sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))) {
                built.push({ kind: "person", row: { id: u.id, fullName: u.fullName } });
                assigned.add(u.id);
              }
            }
          }
          const remaining = visibleUsers.filter((u) => !assigned.has(u.id));
          if (remaining.length > 0) {
            built.push({
              kind: "cc",
              id: "__no_cc",
              label: "Senza centro di costo o non assegnati"
            });
            built.push({ kind: "team", id: "__no_cc_team", label: "—" });
            for (const u of [...remaining].sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))) {
              built.push({ kind: "person", row: { id: u.id, fullName: u.fullName } });
            }
          }
          layout = built;
        }
        setGroupedRows(layout);
        setRowUsers(rows);
        const ids = fid ? [fid] : undefined;
        const [ev, [myEv, leaveBal], roomsList, roomEvents] = await Promise.all([
          fetchHrWorkCalendar(t, { from, to, userIds: ids }),
          analyticsP,
          roomsP,
          fetchMeetingRoomBookingEvents(t, from, to).catch(() => [] as CalendarEventDto[])
        ]);
        setRooms(roomsList);
        setEvents([...ev, ...roomEvents]);
        setMyAnalyticsEvents(myEv);
        setAnalyticsLeaveBalance(leaveBal);
      }
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Errore caricamento calendario");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [router, year, month, userFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = getToken();
    if (!t || !me || !sessionCanSeeApprovalsAndHrExtras(me)) {
      setHrYtdAnalyticsEvents([]);
      setHrYtdAnalyticsLoading(false);
      return;
    }
    let cancelled = false;
    setHrYtdAnalyticsLoading(true);
    const { to } = monthRange(year, month);
    const from = `${year}-01-01`;
    void fetchHrWorkCalendar(t, { from, to })
      .then((ev) => {
        if (!cancelled) {
          setHrYtdAnalyticsEvents(ev);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHrYtdAnalyticsEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHrYtdAnalyticsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [me, year, month]);

  const days = useMemo(() => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => {
      const d = i + 1;
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      return { iso, dow };
    });
  }, [year, month]);

  const openNewMeetingRoomForm = useCallback(() => {
    if (!me || !mayCreateMeetingRooms(me)) return;
    const iso = days.find((d) => assertMayOpenCalendarDayModal(me, d.iso))?.iso;
    if (!iso) {
      setError("In questo mese non c'è un giorno su cui puoi aprire il modulo (solo date future, salvo permessi HR).");
      return;
    }
    const placeholderRoom: MeetingRoomDto = {
      id: "__new__",
      name: "",
      location: null,
      seats: null,
      hasScreen: true,
      hasProjector: false,
      hasWhiteboard: true,
      hasVideoConference: false,
      extraFeatures: []
    };
    setRoomModal({
      day: iso,
      row: { id: "room:__new__", fullName: "Nuova sala", room: placeholderRoom }
    });
    setRoomCreateName("");
    setRoomCreateLocation("");
    setRoomCreateSeats("");
    setRoomCreateHasScreen(true);
    setRoomCreateHasProjector(false);
    setRoomCreateHasWhiteboard(true);
    setRoomCreateHasVideo(false);
    setRoomCreateExtras("");
    setRoomModalStep("room_create");
  }, [days, me]);

  const tbodyItems = useMemo(
    () => {
      const base = (groupedRows ?? rowUsers.map((row) => ({ kind: "person" as const, row }))) as AdminTableRow[];
      const roomRows: AdminTableRow[] = rooms
        .map((r) => ({ kind: "room" as const, row: { id: `room:${r.id}`, fullName: r.name, room: r } }))
        .sort((a, b) => (a.kind === "room" && b.kind === "room" ? a.row.fullName.localeCompare(b.row.fullName, "it") : 0));
      return [
        ...base,
        { kind: "rooms" as const, label: "Sale riunioni" },
        ...(roomRows.length ? roomRows : [{ kind: "team" as const, id: "__rooms_empty", label: "Nessuna sala configurata" }])
      ];
    },
    [groupedRows, rowUsers, rooms]
  );

  const monthLabel = useMemo(
    () =>
      new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    [year, month]
  );

  const monthBounds = useMemo(() => monthRange(year, month), [year, month]);
  const yearStart = `${year}-01-01`;
  const statsMese = useMemo(
    () => aggregateWorkCalendarStats(myAnalyticsEvents, monthBounds.from, monthBounds.to),
    [myAnalyticsEvents, monthBounds.from, monthBounds.to]
  );
  const statsYtd = useMemo(
    () => aggregateWorkCalendarStats(myAnalyticsEvents, yearStart, monthBounds.to),
    [myAnalyticsEvents, yearStart, monthBounds.to]
  );

  const baseUsersForAnalytics = useMemo(() => {
    const allowed = new Set(rowUsers.map((r) => r.id));
    return allUsersForSelect.filter((u) => allowed.has(u.id));
  }, [allUsersForSelect, rowUsers]);

  const analyticsHasAnyDimensionFilter = useMemo(
    () =>
      analyticsFilterCc.length > 0 ||
      analyticsFilterTeam.length > 0 ||
      analyticsFilterUserIds.length > 0 ||
      analyticsFilterRoles.length > 0 ||
      analyticsFilterManagerIds.length > 0,
    [
      analyticsFilterCc,
      analyticsFilterTeam,
      analyticsFilterUserIds,
      analyticsFilterRoles,
      analyticsFilterManagerIds
    ]
  );

  const analyticsFilteredUserIds = useMemo(() => {
    return baseUsersForAnalytics
      .filter((u) => {
        if (!analyticsHasAnyDimensionFilter) {
          return true;
        }
        if (analyticsFilterCc.length) {
          const cc = u.costCenterId?.trim() || "__none__";
          if (!analyticsFilterCc.includes(cc)) {
            return false;
          }
        }
        if (analyticsFilterTeam.length) {
          const tid = u.teamId?.trim() || "__none__";
          if (!analyticsFilterTeam.includes(tid)) {
            return false;
          }
        }
        if (analyticsFilterUserIds.length && !analyticsFilterUserIds.includes(u.id)) {
          return false;
        }
        if (analyticsFilterRoles.length && !analyticsFilterRoles.includes(u.role)) {
          return false;
        }
        if (analyticsFilterManagerIds.length) {
          const mid = u.managerId?.trim() || "__none__";
          if (!analyticsFilterManagerIds.includes(mid)) {
            return false;
          }
        }
        return true;
      })
      .map((u) => u.id);
  }, [
    baseUsersForAnalytics,
    analyticsHasAnyDimensionFilter,
    analyticsFilterCc,
    analyticsFilterTeam,
    analyticsFilterUserIds,
    analyticsFilterRoles,
    analyticsFilterManagerIds
  ]);

  const analyticsCcSelectOptions = useMemo(() => {
    const ids = new Set(baseUsersForAnalytics.map((u) => u.costCenterId?.trim() || "__none__"));
    return [...ids]
      .map((id) => ({
        id,
        label: costCenterLabelById[id] ?? (id === "__none__" ? "Senza centro di costo" : id)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [baseUsersForAnalytics, costCenterLabelById]);

  const analyticsTeamSelectOptions = useMemo(() => {
    const ids = new Set(baseUsersForAnalytics.map((u) => u.teamId?.trim() || "__none__"));
    return [...ids]
      .map((id) => ({
        id,
        label: teamLabelById[id] ?? (id === "__none__" ? "Senza team" : `Team ${id}`)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [baseUsersForAnalytics, teamLabelById]);

  const analyticsManagerSelectOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const u of baseUsersForAnalytics) {
      ids.add(u.managerId?.trim() || "__none__");
    }
    return [...ids]
      .map((id) => ({
        id,
        label:
          id === "__none__"
            ? "Senza responsabile"
            : allUsersForSelect.find((x) => x.id === id)?.fullName ?? id
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [baseUsersForAnalytics, allUsersForSelect]);

  const analyticsRoleSelectOptions = useMemo(() => {
    return [...new Set(baseUsersForAnalytics.map((u) => u.role))].sort();
  }, [baseUsersForAnalytics]);

  const hrAnalyticsEventsFiltered = useMemo(() => {
    if (!me || !sessionCanSeeApprovalsAndHrExtras(me)) {
      return [];
    }
    if (analyticsFilteredUserIds.length === 0) {
      return [];
    }
    const allowed = new Set(analyticsFilteredUserIds);
    return hrYtdAnalyticsEvents.filter(
      (ev) => ev.kind === "holiday" || (ev.userId && allowed.has(ev.userId))
    );
  }, [me, hrYtdAnalyticsEvents, analyticsFilteredUserIds]);

  const analyticsAggregateSampleExplanation = useMemo(() => {
    if (!me || !sessionCanSeeApprovalsAndHrExtras(me)) {
      return "";
    }
    if (!analyticsHasAnyDimensionFilter) {
      return "Nessun filtro attivo: il campione aggregato include tutti i dipendenti presenti nel dataset HR caricato (dal 1° gennaio alla fine del mese selezionato).";
    }
    const parts: string[] = [];
    if (analyticsFilterCc.length > 0) {
      parts.push(`${analyticsFilterCc.length} centro/i di costo`);
    }
    if (analyticsFilterTeam.length > 0) {
      parts.push(`${analyticsFilterTeam.length} team`);
    }
    if (analyticsFilterUserIds.length > 0) {
      parts.push(`${analyticsFilterUserIds.length} dipendente/i per nome`);
    }
    if (analyticsFilterRoles.length > 0) {
      parts.push(`${analyticsFilterRoles.length} ruolo/i Nexa`);
    }
    if (analyticsFilterManagerIds.length > 0) {
      parts.push(`${analyticsFilterManagerIds.length} responsabile/i`);
    }
    return `Filtri attivi: ${parts.join(", ")}. I criteri tra colonne diverse si combinano in AND (una persona deve soddisfarli tutti).`;
  }, [
    me,
    analyticsHasAnyDimensionFilter,
    analyticsFilterCc.length,
    analyticsFilterTeam.length,
    analyticsFilterUserIds.length,
    analyticsFilterRoles.length,
    analyticsFilterManagerIds.length
  ]);

  const statsAggMese = useMemo(() => {
    if (!me || !sessionCanSeeApprovalsAndHrExtras(me)) {
      return null;
    }
    return aggregateWorkCalendarStats(hrAnalyticsEventsFiltered, monthBounds.from, monthBounds.to);
  }, [me, hrAnalyticsEventsFiltered, monthBounds.from, monthBounds.to]);

  const statsAggYtd = useMemo(() => {
    if (!me || !sessionCanSeeApprovalsAndHrExtras(me)) {
      return null;
    }
    return aggregateWorkCalendarStats(hrAnalyticsEventsFiltered, yearStart, monthBounds.to);
  }, [me, hrAnalyticsEventsFiltered, yearStart, monthBounds.to]);

  const ytdEndLabel = useMemo(() => formatItalianDateLong(monthBounds.to), [monthBounds.to]);

  const modalHeaderDayIso = useMemo(() => {
    if (!modal) return "";
    if (modalStep === "smartworking") return (swPendingDay || modal.day).slice(0, 10);
    if (modalStep === "travel") return (travelPendingDay || modal.day).slice(0, 10);
    return modal.day.slice(0, 10);
  }, [modal, modalStep, swPendingDay, travelPendingDay]);

  const openModal = (day: string, row: RowUser): void => {
    setModal({ day, row });
    setModalStep("menu");
    setChipEditIsApproved(false);
    setEditingTravelRequestId(null);
    setEditingSwRequestId(null);
    setSwOptimistic(null);
    setTravelOptimistic(null);
    setSwPendingDay(day.slice(0, 10));
    setTravelPendingDay(day.slice(0, 10));
    setTravelNote("");
    setLeaveStart(day);
    setLeaveEnd(day);
    setLeaveKind("annual");
    setSwNote("");
    setSickFrom(day);
    setSickTo(day);
    setSickFile(null);
    setEditingLeaveId(null);
    setEditingSicknessId(null);
  };

  const closeModal = (): void => {
    setModal(null);
    setModalStep("menu");
    setChipEditIsApproved(false);
    setEditingTravelRequestId(null);
    setEditingSwRequestId(null);
    setSwOptimistic(null);
    setSwPendingDay("");
    setTravelPendingDay("");
    setTravelOptimistic(null);
    setTravelNote("");
    setSubmitting(null);
    setEditingLeaveId(null);
    setEditingSicknessId(null);
  };

  const beginEditFromChip = (day: string, row: RowUser, ev: CalendarEventDto): void => {
    if (!nonHrMayEditCalendarEvent(me, ev)) {
      setError("Le richieste su date già trascorse possono essere modificate solo da HR/Admin.");
      return;
    }
    setModal({ day, row });
    setChipEditIsApproved(isCalendarApproved(ev));
    setEditingTravelRequestId(null);
    setEditingSwRequestId(null);
    setSwOptimistic(null);
    setTravelOptimistic(null);
    setError(null);
    if (ev.kind === "leave" || ev.kind === "rol") {
      setModalStep("leave");
      setEditingLeaveId(String(ev.meta?.leaveId));
      setLeaveStart(ev.start.slice(0, 10));
      setLeaveEnd((ev.end ?? ev.start).slice(0, 10));
      setLeaveKind(ev.kind === "rol" ? "rol" : "annual");
      setEditingSicknessId(null);
      return;
    }
    if (ev.kind === "sickness") {
      setModalStep("sickness");
      setEditingSicknessId(String(ev.meta?.sicknessId));
      setSickFrom(ev.start.slice(0, 10));
      setSickTo((ev.end ?? ev.start).slice(0, 10));
      setSickFile(null);
      setEditingLeaveId(null);
      return;
    }
    if (ev.kind === "smartworking") {
      setModalStep("smartworking");
      setEditingLeaveId(null);
      setEditingSicknessId(null);
      setEditingSwRequestId(typeof ev.meta?.swRequestId === "string" ? ev.meta.swRequestId : null);
      setSwPendingDay(ev.start.slice(0, 10));
      setSwNote(typeof ev.meta?.note === "string" ? ev.meta.note : "");
      return;
    }
    if (ev.kind === "travel") {
      setModalStep("travel");
      setEditingLeaveId(null);
      setEditingSicknessId(null);
      setEditingTravelRequestId(
        typeof ev.meta?.travelRequestId === "string" ? ev.meta.travelRequestId : null
      );
      setTravelPendingDay(ev.start.slice(0, 10));
      setTravelNote(typeof ev.meta?.note === "string" ? ev.meta.note : "");
    }
  };

  const cancelPendingFromChip = async (ev: CalendarEventDto): Promise<void> => {
    const t = getToken();
    if (!t) return;
    const st = String(ev.meta?.status ?? "");
    const rejected = st === "rejected";
    const approvedFuture = st === "approved" && isCalendarEventStartInFuture(ev);
    const confirmMsg = rejected
      ? "Rimuovere questa richiesta rifiutata dal calendario?"
      : approvedFuture
        ? "Rimuovere questa richiesta approvata? (solo se la data è futura.)"
        : "Annullare questa richiesta in attesa?";
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setError(null);
    try {
      if ((ev.kind === "leave" || ev.kind === "rol") && typeof ev.meta?.leaveId === "string") {
        await cancelPendingLeavePlan(t, ev.meta.leaveId);
      } else if (ev.kind === "sickness" && typeof ev.meta?.sicknessId === "string") {
        await cancelPendingSicknessEvent(t, ev.meta.sicknessId);
      } else if (ev.kind === "smartworking" && typeof ev.meta?.swRequestId === "string") {
        await cancelSmartworkingRequest(t, ev.meta.swRequestId);
      } else if (ev.kind === "travel" && typeof ev.meta?.travelRequestId === "string") {
        await cancelTravelRequest(t, ev.meta.travelRequestId);
      } else {
        return;
      }
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore annullo richiesta");
    }
  };

  const onPrevMonth = (): void => {
    if (month <= 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const onNextMonth = (): void => {
    if (month >= 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const isOwnRow = Boolean(modal && me && modal.row.id === me.id);
  const canHrEditOtherCalendarRow = Boolean(
    modal && me && modal.row.id !== me.id && sessionCanSeeApprovalsAndHrExtras(me)
  );
  const cellEventsModal = modal ? eventsForCell(events, modal.row.id, modal.day) : [];
  const menuDayHasLeave = hasActiveNonRejectedLeave(cellEventsModal);
  const menuDayHasSickness = hasActiveNonRejectedSickness(cellEventsModal);
  const menuDayHasSw = hasActiveNonRejectedSmartworking(cellEventsModal);
  const serverSwCell = useMemo(() => deriveSwDayState(cellEventsModal), [cellEventsModal]);
  const serverSwForm = useMemo(
    () => (modal ? deriveSwFormState(events, modal.row.id, swPendingDay || modal.day) : { on: false }),
    [events, modal, swPendingDay]
  );
  const swAtSelectedDay = useMemo(() => {
    if (!modal) {
      return { on: false } as SwDayState;
    }
    const dayIso = (swPendingDay || modal.day).slice(0, 10);
    return deriveSwDayState(eventsForCell(events, modal.row.id, dayIso));
  }, [events, modal, swPendingDay]);
  const swDisplayOn = swOptimistic !== null ? swOptimistic : serverSwForm.on;

  const pendingLeaveInModal = cellEventsModal.find(
    (e) =>
      (e.kind === "leave" || e.kind === "rol") &&
      String(e.meta?.status) === "pending" &&
      typeof e.meta?.leaveId === "string"
  );
  const pendingSicknessInModal = cellEventsModal.find(
    (e) =>
      e.kind === "sickness" &&
      String(e.meta?.status) === "pending" &&
      typeof e.meta?.sicknessId === "string"
  );
  const pendingSwInModal = serverSwCell.status === "pending" && Boolean(serverSwCell.requestId);
  const menuDayHasTravel = hasActiveNonRejectedTravel(cellEventsModal);
  const menuDayHasOffice = cellEventsModal.some((e) => e.kind === "office");
  const serverTravelCell = useMemo(() => deriveTravelDayState(cellEventsModal), [cellEventsModal]);
  const serverTravelForm = useMemo(
    () => (modal ? deriveTravelFormState(events, modal.row.id, travelPendingDay || modal.day) : { on: false }),
    [events, modal, travelPendingDay]
  );
  const travelAtSelectedDay = useMemo(() => {
    if (!modal) {
      return { on: false } as TrDayState;
    }
    const dayIso = (travelPendingDay || modal.day).slice(0, 10);
    return deriveTravelDayState(eventsForCell(events, modal.row.id, dayIso));
  }, [events, modal, travelPendingDay]);
  const trDisplayOn = travelOptimistic !== null ? travelOptimistic : serverTravelForm.on;
  const pendingTravelInModal = serverTravelCell.status === "pending" && Boolean(serverTravelCell.requestId);

  const showSmartworkingModalSaveButton =
    Boolean(serverSwForm.requestId) &&
    (serverSwForm.status === "pending" ||
      (chipEditIsApproved && serverSwForm.status === "approved"));
  const showTravelModalSaveButton =
    Boolean(serverTravelForm.requestId) &&
    (serverTravelForm.status === "pending" ||
      (chipEditIsApproved && serverTravelForm.status === "approved"));

  useEffect(() => {
    if (!modal) {
      setSwOptimistic(null);
      return;
    }
    setSwOptimistic(null);
  }, [modal?.day, modal?.row.id, serverSwForm.on, serverSwForm.requestId, serverSwForm.status]);

  useEffect(() => {
    if (!modal) {
      setTravelOptimistic(null);
      return;
    }
    setTravelOptimistic(null);
  }, [modal?.day, modal?.row.id, serverTravelForm.on, serverTravelForm.requestId, serverTravelForm.status]);

  const onSmartworkingSwitch = (next: boolean): void => {
    const t = getToken();
    if (!t || !modal || !me) return;
    setError(null);
    if (!isOwnRow && next && me.role !== "superuser") {
      setError("Solo il dipendente può richiedere un nuovo smart working da qui.");
      return;
    }
    if (next) {
      if (serverSwForm.on) return;
      const dayIso = (swPendingDay || modal.day).slice(0, 10);
      const clientId = newClientOptimisticId();
      flushSync(() => {
        setEvents((prev) =>
          appendOptimisticSmartworking(prev, {
            userId: modal.row.id,
            day: dayIso,
            note: swNote.trim() || undefined,
            clientId
          })
        );
      });
      void createSmartworkingRequest(t, {
        day: dayIso,
        note: swNote.trim() || undefined,
        ...(me.role === "superuser" && !isOwnRow ? { userId: modal.row.id } : {})
      })
        .then(() => void load({ silent: true }))
        .catch((e) => {
          setEvents((prev) => removeOptimisticClientEvents(prev, clientId));
          setSwOptimistic(null);
          setError(e instanceof Error ? e.message : "Errore smart working");
        });
      return;
    }
    if (serverSwForm.status === "approved" || (serverSwForm.on && !serverSwForm.requestId)) {
      setError("La richiesta è già approvata o confermata in presenze. Contatta il responsabile per modifiche.");
      return;
    }
    if (serverSwForm.status === "pending" && serverSwForm.requestId) {
      setSwOptimistic(false);
      void cancelSmartworkingRequest(t, serverSwForm.requestId)
        .then(() => void load({ silent: true }))
        .catch((e) => {
          setSwOptimistic(null);
          setError(e instanceof Error ? e.message : "Errore annullo smart working");
        });
    }
  };

  const onTravelSwitch = (next: boolean): void => {
    const t = getToken();
    if (!t || !modal) return;
    setError(null);
    if (!isOwnRow && next) {
      setError("Solo il dipendente può richiedere una nuova trasferta da qui.");
      return;
    }
    if (next) {
      if (serverTravelForm.on) return;
      const dayIso = (travelPendingDay || modal.day).slice(0, 10);
      const clientId = newClientOptimisticId();
      flushSync(() => {
        setEvents((prev) =>
          appendOptimisticTravel(prev, {
            userId: modal.row.id,
            day: dayIso,
            note: travelNote.trim() || undefined,
            clientId
          })
        );
      });
      void createTravelRequest(t, { day: dayIso, note: travelNote.trim() || undefined })
        .then(() => void load({ silent: true }))
        .catch((e) => {
          setEvents((prev) => removeOptimisticClientEvents(prev, clientId));
          setTravelOptimistic(null);
          setError(e instanceof Error ? e.message : "Errore trasferta");
        });
      return;
    }
    if (serverTravelForm.status === "approved" || (serverTravelForm.on && !serverTravelForm.requestId)) {
      setError("La trasferta risulta già approvata. Contatta il responsabile per modifiche.");
      return;
    }
    if (serverTravelForm.status === "pending" && serverTravelForm.requestId) {
      setTravelOptimistic(false);
      void cancelTravelRequest(t, serverTravelForm.requestId)
        .then(() => void load({ silent: true }))
        .catch((e) => {
          setTravelOptimistic(null);
          setError(e instanceof Error ? e.message : "Errore annullo trasferta");
        });
    }
  };

  const submitLeave = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal || !me) return;
    const adminCreatesForOther = me.role === "superuser" && !isOwnRow && !editingLeaveId;
    if (!isOwnRow && !editingLeaveId && !adminCreatesForOther) {
      setError("Non puoi creare una nuova richiesta ferie per un altro utente da questo riquadro.");
      return;
    }
    setSubmitting("leave");
    setError(null);
    try {
      if (editingLeaveId) {
        await updateLeavePlan(t, editingLeaveId, {
          startDate: leaveStart,
          endDate: leaveEnd,
          kind: leaveKind
        });
        closeModal();
        await load();
      } else {
        const clientId = newClientOptimisticId();
        flushSync(() => {
          setEvents((prev) =>
            appendOptimisticLeave(prev, {
              userId: modal.row.id,
              start: leaveStart,
              end: leaveEnd,
              leaveKind,
              clientId
            })
          );
        });
        closeModal();
        try {
          await createLeavePlan(t, {
            startDate: leaveStart,
            endDate: leaveEnd,
            kind: leaveKind,
            ...(adminCreatesForOther ? { userId: modal.row.id } : {})
          });
          await load();
        } catch (inner) {
          setEvents((prev) => removeOptimisticClientEvents(prev, clientId));
          setError(inner instanceof Error ? inner.message : "Errore invio ferie");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio ferie");
    } finally {
      setSubmitting(null);
    }
  };

  const submitSick = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal || !me) return;
    const adminCreatesForOther = me.role === "superuser" && !isOwnRow && !editingSicknessId;
    if (!isOwnRow && !editingSicknessId && !adminCreatesForOther) {
      setError("Non puoi creare una nuova comunicazione malattia per un altro utente da qui.");
      return;
    }
    setSubmitting("sick");
    setError(null);
    try {
      if (editingSicknessId) {
        await updateSicknessEvent(t, editingSicknessId, { fromDate: sickFrom, toDate: sickTo });
        closeModal();
        await load();
      } else {
        const clientId = newClientOptimisticId();
        flushSync(() => {
          setEvents((prev) =>
            appendOptimisticSickness(prev, {
              userId: modal.row.id,
              from: sickFrom,
              to: sickTo,
              clientId
            })
          );
        });
        closeModal();
        try {
          await reportSickness(
            t,
            {
              fromDate: sickFrom,
              toDate: sickTo,
              ...(adminCreatesForOther ? { userId: modal.row.id } : {})
            },
            sickFile
          );
          await load();
        } catch (inner) {
          setEvents((prev) => removeOptimisticClientEvents(prev, clientId));
          setError(inner instanceof Error ? inner.message : "Errore malattia");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore malattia");
    } finally {
      setSubmitting(null);
    }
  };

  const savePendingSmartworkingEdits = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal || serverSwForm.status !== "pending" || !serverSwForm.requestId) return;
    const nextNote = swNote.trim() || null;
    const rid = serverSwForm.requestId;
    const swEv = events.find(
      (e) =>
        e.kind === "smartworking" &&
        e.userId === modal.row.id &&
        String(e.meta?.swRequestId) === rid &&
        String(e.meta?.status) === "pending"
    );
    const prevDay = swEv?.start.slice(0, 10) ?? (swPendingDay || modal.day).slice(0, 10);
    const prevNoteRaw = typeof swEv?.meta?.note === "string" ? swEv.meta.note : "";
    const prevNote = prevNoteRaw.trim() || null;
    const nextDay = (swPendingDay || modal.day).slice(0, 10);
    if (nextDay === prevDay.slice(0, 10) && nextNote === prevNote) {
      return;
    }
    setError(null);
    setSubmitting("sw-save");
    try {
      flushSync(() => {
        setEvents((prev) => patchSmartworkingRequestInCalendar(prev, modal.row.id, rid, nextDay, nextNote));
      });
      await updateSmartworkingRequest(t, rid, {
        day: nextDay,
        note: nextNote ?? undefined
      });
      await load({ silent: true });
    } catch (e) {
      await load({ silent: true });
      setError(e instanceof Error ? e.message : "Errore aggiornamento smart working");
    } finally {
      setSubmitting(null);
    }
  };

  const saveApprovedSmartworkingEdits = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal) {
      return;
    }
    const rid = editingSwRequestId ?? serverSwCell.requestId;
    if (!rid || serverSwCell.status !== "approved") {
      return;
    }
    const nextNote = swNote.trim() || null;
    const nextDay = (swPendingDay || modal.day).slice(0, 10);
    setError(null);
    setSubmitting("sw-save-approved");
    try {
      flushSync(() => {
        setEvents((prev) => patchSmartworkingRequestInCalendar(prev, modal.row.id, rid, nextDay, nextNote));
      });
      closeModal();
      await updateSmartworkingRequest(t, rid, {
        day: nextDay,
        note: nextNote ?? undefined
      });
      await load();
    } catch (e) {
      await load({ silent: true });
      setError(e instanceof Error ? e.message : "Errore aggiornamento smart working");
    } finally {
      setSubmitting(null);
    }
  };

  const saveSmartworkingModalEdits = async (): Promise<void> => {
    if (chipEditIsApproved && serverSwCell.status === "approved") {
      await saveApprovedSmartworkingEdits();
      return;
    }
    await savePendingSmartworkingEdits();
  };

  const savePendingTravelEdits = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal || serverTravelForm.status !== "pending" || !serverTravelForm.requestId) return;
    const nextNote = travelNote.trim() || null;
    const rid = serverTravelForm.requestId;
    const trEv = events.find(
      (e) =>
        e.kind === "travel" &&
        e.userId === modal.row.id &&
        String(e.meta?.travelRequestId) === rid &&
        String(e.meta?.status) === "pending"
    );
    const prevDay = trEv?.start.slice(0, 10) ?? (travelPendingDay || modal.day).slice(0, 10);
    const prevNoteRaw = typeof trEv?.meta?.note === "string" ? trEv.meta.note : "";
    const prevNote = prevNoteRaw.trim() || null;
    const nextDay = (travelPendingDay || modal.day).slice(0, 10);
    if (nextDay === prevDay.slice(0, 10) && nextNote === prevNote) {
      return;
    }
    setError(null);
    setSubmitting("tr-save");
    try {
      flushSync(() => {
        setEvents((prev) => patchTravelRequestInCalendar(prev, modal.row.id, rid, nextDay, nextNote));
      });
      await updateTravelRequest(t, rid, {
        day: nextDay,
        note: nextNote ?? undefined
      });
      await load({ silent: true });
    } catch (e) {
      await load({ silent: true });
      setError(e instanceof Error ? e.message : "Errore aggiornamento trasferta");
    } finally {
      setSubmitting(null);
    }
  };

  const saveApprovedTravelEdits = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal) {
      return;
    }
    const rid = editingTravelRequestId ?? serverTravelCell.requestId ?? serverTravelForm.requestId;
    if (!rid || serverTravelCell.status !== "approved") {
      return;
    }
    const nextNote = travelNote.trim() || null;
    const nextDay = (travelPendingDay || modal.day).slice(0, 10);
    setError(null);
    setSubmitting("tr-save-approved");
    try {
      flushSync(() => {
        setEvents((prev) => patchTravelRequestInCalendar(prev, modal.row.id, rid, nextDay, nextNote));
      });
      closeModal();
      await updateTravelRequest(t, rid, {
        day: nextDay,
        note: nextNote ?? undefined
      });
      await load();
    } catch (e) {
      await load({ silent: true });
      setError(e instanceof Error ? e.message : "Errore aggiornamento trasferta");
    } finally {
      setSubmitting(null);
    }
  };

  const saveTravelModalEdits = async (): Promise<void> => {
    if (chipEditIsApproved && serverTravelCell.status === "approved") {
      await saveApprovedTravelEdits();
      return;
    }
    await savePendingTravelEdits();
  };

  const superuserTravelForOther = Boolean(modal && me && !isOwnRow && me.role === "superuser");

  const submitTravelAdminForOther = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal || !me || me.role !== "superuser" || isOwnRow) {
      return;
    }
    if (travelAtSelectedDay.on) {
      setError(
        travelAtSelectedDay.status === "pending"
          ? "Per questa data c'è già una richiesta trasferta in attesa."
          : "Per questa data risulta già una trasferta approvata."
      );
      return;
    }
    setSubmitting("travel-admin");
    setError(null);
    const dayIso = (travelPendingDay || modal.day).slice(0, 10);
    const clientId = newClientOptimisticId();
    try {
      flushSync(() => {
        setEvents((prev) =>
          appendOptimisticTravel(prev, {
            userId: modal.row.id,
            day: dayIso,
            note: travelNote.trim() || undefined,
            clientId
          })
        );
      });
      closeModal();
      await createTravelRequest(t, {
        day: dayIso,
        note: travelNote.trim() || undefined,
        userId: modal.row.id
      });
      await load();
    } catch (e) {
      setEvents((prev) => removeOptimisticClientEvents(prev, clientId));
      setError(e instanceof Error ? e.message : "Errore creazione trasferta");
    } finally {
      setSubmitting(null);
    }
  };

  const submitSmartworkingAdminForOther = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal || !me || me.role !== "superuser" || isOwnRow) {
      return;
    }
    if (swAtSelectedDay.on) {
      setError(
        swAtSelectedDay.status === "pending"
          ? "Per questa data c'è già una richiesta smart working in attesa."
          : "Per questa data risulta già uno smart working attivo."
      );
      return;
    }
    setSubmitting("sw-admin");
    setError(null);
    const dayIsoSw = (swPendingDay || modal.day).slice(0, 10);
    const clientIdSw = newClientOptimisticId();
    try {
      flushSync(() => {
        setEvents((prev) =>
          appendOptimisticSmartworking(prev, {
            userId: modal.row.id,
            day: dayIsoSw,
            note: swNote.trim() || undefined,
            clientId: clientIdSw
          })
        );
      });
      closeModal();
      await createSmartworkingRequest(t, {
        day: dayIsoSw,
        note: swNote.trim() || undefined,
        userId: modal.row.id
      });
      await load();
    } catch (e) {
      setEvents((prev) => removeOptimisticClientEvents(prev, clientIdSw));
      setError(e instanceof Error ? e.message : "Errore creazione smart working");
    } finally {
      setSubmitting(null);
    }
  };

  const applyOfficeForSelectedDay = async (): Promise<void> => {
    const t = getToken();
    if (!t || !modal || !isOwnRow) return;
    if (menuDayHasOffice || menuDayHasLeave || menuDayHasSickness || menuDayHasTravel) return;
    setSubmitting("office");
    setError(null);
    const officeDay = modal.day.slice(0, 10);
    const officeClientId = newClientOptimisticId();
    try {
      flushSync(() => {
        setEvents((prev) =>
          appendOptimisticOffice(prev, { userId: modal.row.id, day: officeDay, clientId: officeClientId })
        );
      });
      closeModal();
      await setAttendanceWorkMode(t, officeDay, "office");
      await load({ silent: true });
    } catch (e) {
      setEvents((prev) => removeOptimisticClientEvents(prev, officeClientId));
      setError(e instanceof Error ? e.message : "Impossibile impostare sede");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading && events.length === 0 && !error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--prom-muted)]">
        Caricamento calendario…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[min(100%,1600px)] space-y-5 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Calendario lavoro</h1>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            {!me ? (
              "Calendario mensile, assenze e festività aziendali."
            ) : sessionCanSeeApprovalsAndHrExtras(me) ? (
              <>
                Griglia mensile — team per centro di costo (dipendenti) o team diretto (manager). Festività sulle
                colonne.
              </>
            ) : (
              <>
                Visualizzi te e i colleghi del tuo gruppo: stesso work team se impostato; se nel team sei da solo si
                includono i riporti diretti del tuo responsabile; senza team si parte dai colleghi con lo stesso
                manager e, se insufficienti, dal centro di costo. Le festività aziendali compaiono per tutti.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-1 py-0.5 shadow-[var(--glass-shadow)] backdrop-blur-sm"
            style={{ boxShadow: "var(--glass-shadow)" }}
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Mese precedente"
              onClick={onPrevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] px-2 text-center text-sm font-medium capitalize text-[var(--prom-text)]">
              {monthLabel}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Mese successivo"
              onClick={onNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {me && sessionCanSeeApprovalsAndHrExtras(me) ? (
            <label className="flex items-center gap-2 text-xs text-[var(--prom-muted)]">
              <span>Dipendente</span>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="max-w-[200px] rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-2 py-1 text-[var(--prom-text)] backdrop-blur-sm"
              >
                <option value="">Tutto il team visibile</option>
                {allUsersForSelect.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
            Aggiorna
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className="rounded border border-[color-mix(in_srgb,var(--prom-gold)_50%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_14%,transparent)] px-2 py-0.5 text-[var(--prom-text)]">
          Turno
        </span>
        <span className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5">Smart working</span>
        <span className="rounded border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-2 py-0.5 text-[var(--prom-text)]">
          Trasferta
        </span>
        <span className="rounded border border-yellow-500/45 bg-yellow-500/12 px-2 py-0.5 text-yellow-950 dark:text-yellow-100">
          In attesa approvazione
        </span>
        <span className="rounded border border-red-500/50 bg-red-500/12 px-2 py-0.5 text-red-950 dark:text-red-100">
          Rifiutato (rimuovibile)
        </span>
        <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5">Ferie</span>
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5">ROL</span>
        <span className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5">Festività</span>
        <span className="rounded border border-orange-500/40 bg-orange-500/10 px-2 py-0.5">Malattia</span>
      </div>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div
        className="overflow-x-auto rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_82%,transparent)] shadow-[var(--card-shadow)] backdrop-blur-md"
        style={{
          background: "var(--glass-bg)",
          borderColor: "var(--glass-border)",
          boxShadow: "var(--card-shadow)"
        }}
      >
        <table className="w-max min-w-full border-collapse text-left text-[11px]">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-20 min-w-[140px] border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_95%,transparent)] px-2 py-2 text-[var(--prom-text)] backdrop-blur-md"
                style={{ background: "var(--glass-bg)" }}
              >
                Dipendente
              </th>
              {days.map(({ iso, dow }) => {
                const hol = holidayTitleForDay(events, iso);
                const weekend = dow === 0 || dow === 6;
                return (
                  <th
                    key={iso}
                    title={hol ?? undefined}
                    className={[
                      "min-w-[52px] border border-[var(--prom-line)] px-0.5 py-2 text-center font-normal",
                      weekend ? "bg-[color-mix(in_srgb,var(--prom-muted)_12%,transparent)]" : "",
                      hol ? "text-rose-700 dark:text-rose-300" : "text-[var(--prom-muted)]"
                    ].join(" ")}
                  >
                    <div className="leading-tight">{WEEKDAY_SHORT[dow]}</div>
                    <div className="font-medium text-[var(--prom-text)]">{iso.slice(8)}</div>
                    {hol ? <div className="mt-0.5 truncate text-[9px] text-rose-600/90">{hol}</div> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tbodyItems.map((item) => {
              if (item.kind === "cc") {
                return (
                  <tr key={`cc-${item.id}`}>
                    <td
                      colSpan={1 + days.length}
                      className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-muted)_14%,transparent)] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--prom-text)]"
                    >
                      {item.label}
                    </td>
                  </tr>
                );
              }
              if (item.kind === "team") {
                return (
                  <tr key={`team-${item.id}`}>
                    <td
                      colSpan={1 + days.length}
                      className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-muted)_8%,transparent)] px-2 py-1 pl-4 text-[11px] font-medium text-[var(--prom-muted)]"
                    >
                      {item.label}
                    </td>
                  </tr>
                );
              }
              if (item.kind === "rooms") {
                const mayManageRooms = mayCreateMeetingRooms(me);
                return (
                  <tr key="rooms-header">
                    <td
                      colSpan={1 + days.length}
                      className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--prom-text)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{item.label}</span>
                        {mayManageRooms ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-[10px] font-semibold normal-case"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openNewMeetingRoomForm();
                            }}
                          >
                            {rooms.length === 0 ? "Aggiungi prima sala" : "Aggiungi sala"}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              }
              const row = item.row;
              return (
                <tr key={row.id}>
                  <td
                    className="sticky left-0 z-10 border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-2 py-1 font-medium text-[var(--prom-text)] backdrop-blur-md"
                    style={{ background: "var(--glass-bg)" }}
                  >
                    {row.fullName}
                    {me?.id === row.id ? (
                      <span className="ml-1 text-[10px] font-normal text-[var(--prom-muted)]">(tu)</span>
                    ) : null}
                  </td>
                  {days.map(({ iso, dow }) => {
                    const list = eventsForCell(events, row.id, iso);
                    const weekend = dow === 0 || dow === 6;
                    const showActions = canShowCalendarEventActions(me, row.id);
                    return (
                      <td
                        key={`${row.id}-${iso}`}
                        className={[
                          "cursor-pointer align-top border border-[var(--prom-line)] p-0.5 transition-colors hover:bg-[color-mix(in_srgb,var(--prom-gold)_8%,transparent)]",
                          weekend ? "bg-[color-mix(in_srgb,var(--prom-muted)_8%,transparent)]" : ""
                        ].join(" ")}
                        onClick={() => {
                          if (row.id.startsWith("room:")) {
                            if (!assertMayOpenCalendarDayModal(me, iso)) {
                              setError("Le date passate non sono modificabili. Contatta HR.");
                              return;
                            }
                            setRoomModal({ day: iso, row: row as RoomRow });
                            setRoomModalStep("room_menu");
                            return;
                          }
                          if (!assertMayOpenCalendarDayModal(me, iso)) {
                            setError("Le date passate non sono modificabili. Contatta HR.");
                            return;
                          }
                          openModal(iso, row);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (row.id.startsWith("room:")) {
                              if (!assertMayOpenCalendarDayModal(me, iso)) {
                                setError("Le date passate non sono modificabili. Contatta HR.");
                                return;
                              }
                              setRoomModal({ day: iso, row: row as RoomRow });
                              setRoomModalStep("room_menu");
                              return;
                            }
                            if (!assertMayOpenCalendarDayModal(me, iso)) {
                              setError("Le date passate non sono modificabili. Contatta HR.");
                              return;
                            }
                            openModal(iso, row);
                          }
                        }}
                        role="gridcell"
                        tabIndex={0}
                      >
                        <div className="flex min-h-[48px] flex-col gap-0.5">
                          {list.map((ev) => {
                            const showEdit =
                              showActions &&
                              nonHrMayEditCalendarEvent(me, ev) &&
                              (isPendingWithMutableRequest(ev) ||
                                canEditApprovedCalendarChip(me, row.id, ev));
                            const showRemove =
                              (showActions && canRemoveCalendarRequest(ev, me, row.id)) ||
                              (row.id.startsWith("room:") &&
                                ev.kind === "room_booking" &&
                                typeof ev.meta?.bookingId === "string" &&
                                (me?.role === "superuser" || String(ev.meta?.bookedByUserId ?? "") === me?.id));
                            const actions =
                              showEdit || showRemove ? (
                                <span className="ml-0.5 inline-flex shrink-0 gap-0">
                                  {showEdit ? (
                                    <button
                                      type="button"
                                      className="rounded p-0.5 text-[var(--prom-muted)] hover:bg-black/10 hover:text-[var(--prom-text)] dark:hover:bg-white/10"
                                      aria-label="Modifica richiesta"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        beginEditFromChip(iso, row, ev);
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                  {showRemove ? (
                                    <button
                                      type="button"
                                      className="rounded p-0.5 text-[var(--prom-muted)] hover:bg-rose-500/20 hover:text-rose-700 dark:hover:text-rose-300"
                                      aria-label={
                                        ev.kind === "room_booking"
                                          ? "Annulla prenotazione sala"
                                          : String(ev.meta?.status ?? "") === "rejected"
                                          ? "Rimuovi richiesta rifiutata"
                                          : String(ev.meta?.status ?? "") === "approved"
                                            ? "Rimuovi richiesta approvata futura"
                                            : "Annulla richiesta"
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (ev.kind === "room_booking" && typeof ev.meta?.bookingId === "string") {
                                          void cancelMeetingRoomBooking(getToken() || "", String(ev.meta.bookingId))
                                            .then(() => {
                                              setEvents((prev) =>
                                                prev.filter((x) => String(x.meta?.bookingId ?? "") !== String(ev.meta?.bookingId))
                                              );
                                            })
                                            .catch((err) => {
                                              setError(err instanceof Error ? err.message : "Annullamento fallito");
                                            });
                                          return;
                                        }
                                        void cancelPendingFromChip(ev);
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </span>
                              ) : null;
                            return (
                              <div
                                key={`${ev.id}-${ev.kind}-${ev.start}`}
                                className={[
                                  "flex items-start gap-0.5 rounded border px-1 py-0.5 leading-tight",
                                  eventStyle(ev)
                                ].join(" ")}
                                title={ev.title}
                              >
                                <div className="min-w-0 flex-1 truncate font-semibold tracking-tight">
                                  <span className="truncate">{calendarEventAbbrev(ev)}</span>
                                </div>
                                {actions}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details
        className="group mt-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow)]"
        style={{ boxShadow: "var(--glass-shadow)" }}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-[var(--prom-text)] [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--prom-muted)] transition-transform group-open:rotate-90" />
          <span>
            {me && sessionCanSeeApprovalsAndHrExtras(me) ? "Analytics HR" : "Analytics personale"}
            <span className="ml-2 text-xs font-normal capitalize text-[var(--prom-muted)]">{monthLabel}</span>
          </span>
        </summary>
        <div className="border-t border-[var(--prom-line)] px-4 pb-4 pt-3">
          {me && sessionCanSeeApprovalsAndHrExtras(me) ? (
            <div className="mb-8 space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  Aggregato (vista calendario)
                </h3>
                <p className="text-xs text-[var(--prom-muted)]">
                  Conteggi giorni-persona sul campione scelto sotto, dal 1° gennaio {year} al {ytdEndLabel}. Le richieste
                  rifiutate non contano. In ogni elenco: tenere premuto Ctrl (Windows) o Cmd (Mac) e cliccare le voci per
                  selezioni multiple; deseleziona tutte le righe di un elenco per non applicare quel criterio.
                </p>
                <p className="mt-2 rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_55%,transparent)] px-3 py-2 text-xs text-[var(--prom-text)]">
                  {analyticsAggregateSampleExplanation}
                </p>
                {hrYtdAnalyticsLoading ? (
                  <p className="mt-2 text-xs text-[var(--prom-muted)]">Caricamento dati aggregati…</p>
                ) : null}
              </div>
              <fieldset className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_35%,transparent)] p-4">
                <legend className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  Campione per l&apos;aggregato — ogni lista è opzionale
                </legend>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Centro di costo
                  <span className="mt-0.5 block text-[10px] font-normal leading-snug text-[var(--prom-muted)]">
                    Filtra per anagrafica CDC. Elenco vuoto = non restringere per centro di costo.
                  </span>
                  <select
                    multiple
                    size={5}
                    value={analyticsFilterCc}
                    onChange={(e) => setAnalyticsFilterCc(readMultiSelectValues(e))}
                    className="mt-1 min-h-[5.5rem] w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-1 py-1 text-[11px] text-[var(--prom-text)]"
                  >
                    {analyticsCcSelectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Team (work team)
                  <span className="mt-0.5 block text-[10px] font-normal leading-snug text-[var(--prom-muted)]">
                    Filtra per team operativo. Elenco vuoto = non restringere per team.
                  </span>
                  <select
                    multiple
                    size={5}
                    value={analyticsFilterTeam}
                    onChange={(e) => setAnalyticsFilterTeam(readMultiSelectValues(e))}
                    className="mt-1 min-h-[5.5rem] w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-1 py-1 text-[11px] text-[var(--prom-text)]"
                  >
                    {analyticsTeamSelectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Dipendente (nome)
                  <span className="mt-0.5 block text-[10px] font-normal leading-snug text-[var(--prom-muted)]">
                    Solo utenti già visibili nella vista calendario HR. Elenco vuoto = non restringere per persona.
                  </span>
                  <select
                    multiple
                    size={5}
                    value={analyticsFilterUserIds}
                    onChange={(e) => setAnalyticsFilterUserIds(readMultiSelectValues(e))}
                    className="mt-1 min-h-[5.5rem] w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-1 py-1 text-[11px] text-[var(--prom-text)]"
                  >
                    {[...baseUsersForAnalytics]
                      .sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Ruolo (Nexa)
                  <span className="mt-0.5 block text-[10px] font-normal leading-snug text-[var(--prom-muted)]">
                    Filtra per ruolo applicativo. Elenco vuoto = non restringere per ruolo.
                  </span>
                  <select
                    multiple
                    size={3}
                    value={analyticsFilterRoles}
                    onChange={(e) => setAnalyticsFilterRoles(readMultiSelectValues(e) as UserRole[])}
                    className="mt-1 min-h-[4rem] w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-1 py-1 text-[11px] text-[var(--prom-text)]"
                  >
                    {analyticsRoleSelectOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] text-[var(--prom-muted)] sm:col-span-2 xl:col-span-1">
                  Responsabile (manager diretto)
                  <span className="mt-0.5 block text-[10px] font-normal leading-snug text-[var(--prom-muted)]">
                    Filtra per manager assegnato in anagrafica. Elenco vuoto = non restringere per responsabile.
                  </span>
                  <select
                    multiple
                    size={5}
                    value={analyticsFilterManagerIds}
                    onChange={(e) => setAnalyticsFilterManagerIds(readMultiSelectValues(e))}
                    className="mt-1 min-h-[5.5rem] w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-1 py-1 text-[11px] text-[var(--prom-text)]"
                  >
                    {analyticsManagerSelectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--prom-text)] underline decoration-dotted underline-offset-2 hover:opacity-90"
                  onClick={() => {
                    setAnalyticsFilterCc([]);
                    setAnalyticsFilterTeam([]);
                    setAnalyticsFilterUserIds([]);
                    setAnalyticsFilterRoles([]);
                    setAnalyticsFilterManagerIds([]);
                  }}
                >
                  Azzera tutti i filtri del campione
                </button>
                <span className="text-[11px] text-[var(--prom-muted)]">
                  {analyticsFilteredUserIds.length} dipendenti nel campione dopo i criteri
                  {analyticsHasAnyDimensionFilter ? " (filtri applicati)" : " (nessun filtro)"}
                </span>
              </div>
              {baseUsersForAnalytics.length === 0 ? (
                <p className="text-xs text-[var(--prom-muted)]">Nessun dipendente nella vista calendario.</p>
              ) : analyticsFilteredUserIds.length === 0 && analyticsHasAnyDimensionFilter ? (
                <p className="text-xs text-[var(--prom-muted)]">Nessun dipendente corrisponde ai filtri selezionati.</p>
              ) : hrYtdAnalyticsLoading || !statsAggMese || !statsAggYtd ? null : (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                      Mese selezionato (aggregato)
                    </h4>
                    <dl className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_60%,transparent)] px-3">
                      <AnalyticsStatRow label="Ferie annuali (giorni)" value={statsAggMese.giorniFerieAnnuali} />
                      <AnalyticsStatRow label="ROL (giorni)" value={statsAggMese.giorniRol} />
                      <AnalyticsStatRow label="Malattia (giorni)" value={statsAggMese.giorniMalattia} />
                      <AnalyticsStatRow label="Smart working (giorni)" value={statsAggMese.giorniSmartWorking} />
                      <AnalyticsStatRow label="Trasferte (giorni)" value={statsAggMese.giorniTrasferta} />
                      <AnalyticsStatRow label="Festività aziendali (giorni)" value={statsAggMese.giorniFestivitaAziendali} />
                      <AnalyticsStatRow label="Turni (giorni con turno)" value={statsAggMese.giorniConTurno} />
                      <AnalyticsStatRow label="Richieste in attesa (nr.)" value={statsAggMese.richiesteInAttesa} />
                    </dl>
                  </div>
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                      Dal 1° gennaio al {ytdEndLabel} (aggregato)
                    </h4>
                    <dl className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_60%,transparent)] px-3">
                      <AnalyticsStatRow label="Ferie annuali (giorni)" value={statsAggYtd.giorniFerieAnnuali} />
                      <AnalyticsStatRow label="ROL (giorni)" value={statsAggYtd.giorniRol} />
                      <AnalyticsStatRow label="Malattia (giorni)" value={statsAggYtd.giorniMalattia} />
                      <AnalyticsStatRow label="Smart working (giorni)" value={statsAggYtd.giorniSmartWorking} />
                      <AnalyticsStatRow label="Trasferte (giorni)" value={statsAggYtd.giorniTrasferta} />
                      <AnalyticsStatRow label="Festività aziendali (giorni)" value={statsAggYtd.giorniFestivitaAziendali} />
                      <AnalyticsStatRow label="Turni (giorni con turno)" value={statsAggYtd.giorniConTurno} />
                      <AnalyticsStatRow label="Richieste in attesa (nr.)" value={statsAggYtd.richiesteInAttesa} />
                    </dl>
                  </div>
                </div>
              )}
              <div className="border-t border-[var(--prom-line)] pt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                  Il tuo riepilogo personale
                </h3>
                <p className="mb-4 text-xs text-[var(--prom-muted)]">
                  Stessi periodi del riquadro qui sotto, calcolati solo sul tuo utente collegato.
                </p>
              </div>
            </div>
          ) : (
            <p className="mb-4 text-xs text-[var(--prom-muted)]">
              Solo i tuoi dati: nessun filtro e nessun confronto con colleghi. Riepilogo giorni dal calendario per il
              tuo utente — mese selezionato e cumulativo dal 1° gennaio alla fine del mese mostrato in testata. Le
              richieste rifiutate non contano nei giorni.
            </p>
          )}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Mese selezionato
              </h3>
              <dl className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_60%,transparent)] px-3">
                <AnalyticsStatRow label="Ferie annuali (giorni)" value={statsMese.giorniFerieAnnuali} />
                <AnalyticsStatRow label="ROL (giorni)" value={statsMese.giorniRol} />
                <AnalyticsStatRow label="Malattia (giorni)" value={statsMese.giorniMalattia} />
                <AnalyticsStatRow label="Smart working (giorni)" value={statsMese.giorniSmartWorking} />
                <AnalyticsStatRow label="Trasferte (giorni)" value={statsMese.giorniTrasferta} />
                <AnalyticsStatRow label="Festività aziendali (giorni)" value={statsMese.giorniFestivitaAziendali} />
                <AnalyticsStatRow label="Turni (giorni con turno)" value={statsMese.giorniConTurno} />
                <AnalyticsStatRow label="Richieste in attesa (nr.)" value={statsMese.richiesteInAttesa} />
              </dl>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Dal 1° gennaio al {ytdEndLabel}
              </h3>
              <dl className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_60%,transparent)] px-3">
                <AnalyticsStatRow label="Ferie annuali (giorni)" value={statsYtd.giorniFerieAnnuali} />
                <AnalyticsStatRow label="ROL (giorni)" value={statsYtd.giorniRol} />
                <AnalyticsStatRow label="Malattia (giorni)" value={statsYtd.giorniMalattia} />
                <AnalyticsStatRow label="Smart working (giorni)" value={statsYtd.giorniSmartWorking} />
                <AnalyticsStatRow label="Trasferte (giorni)" value={statsYtd.giorniTrasferta} />
                <AnalyticsStatRow label="Festività aziendali (giorni)" value={statsYtd.giorniFestivitaAziendali} />
                <AnalyticsStatRow label="Turni (giorni con turno)" value={statsYtd.giorniConTurno} />
                <AnalyticsStatRow label="Richieste in attesa (nr.)" value={statsYtd.richiesteInAttesa} />
              </dl>
              {analyticsLeaveBalance && analyticsLeaveBalance.year === year ? (
                <p className="mt-3 rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_50%,transparent)] px-3 py-2 text-xs text-[var(--prom-muted)]">
                  Saldo ferie {year}:{" "}
                  <span className="font-medium text-[var(--prom-text)]">{analyticsLeaveBalance.residualDays}</span>{" "}
                  residui su{" "}
                  <span className="font-medium text-[var(--prom-text)]">{analyticsLeaveBalance.allocatedDays}</span>{" "}
                  assegnati ({analyticsLeaveBalance.usedDays} utilizzati).
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </details>

      {!loading && rowUsers.length === 0 ? (
        <p className="text-sm text-[var(--prom-muted)]">Nessun dipendente in questa vista.</p>
      ) : null}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="presentation"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-modal-title"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--glass-border)] p-5 shadow-[var(--glass-shadow)]"
            style={{
              background: "var(--glass-bg)",
              boxShadow: "var(--glass-shadow)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {(isOwnRow || canHrEditOtherCalendarRow) && modalStep !== "menu" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mb-1 -ml-2 h-8 px-2 text-[11px]"
                    onClick={() => setModalStep("menu")}
                  >
                    ← Indietro
                  </Button>
                ) : null}
                <h2 id="cal-modal-title" className="text-base font-semibold text-[var(--prom-text)]">
                  {formatItalianDateLong(modalHeaderDayIso)} · {modal.row.fullName}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-lg leading-none"
                aria-label="Chiudi"
                onClick={closeModal}
              >
                ×
              </Button>
            </div>

            <div className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] p-3">
              <p className="text-[11px] font-medium text-[var(--prom-muted)]">Eventi in questo giorno</p>
              {cellEventsModal.length === 0 ? (
                <p className="text-xs text-[var(--prom-muted)]">Nessun evento.</p>
              ) : (
                <ul className="space-y-2">
                  {cellEventsModal.map((ev) => (
                    <li
                      key={`${ev.id}-${ev.kind}-${ev.userId ?? ""}`}
                      className={["rounded-lg border px-3 py-2 text-xs", eventStyle(ev)].join(" ")}
                    >
                      <span className="font-semibold">{calendarEventAbbrev(ev)}</span>
                      <span className="ml-1.5 opacity-90">{ev.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isOwnRow || canHrEditOtherCalendarRow ? (
              <div className="mt-4 space-y-4 border-t border-[var(--prom-line)] pt-4">
                {modalStep === "menu" && isOwnRow ? (
                  <div className="grid gap-2">
                    {!menuDayHasOffice && !menuDayHasLeave && !menuDayHasSickness && !menuDayHasTravel ? (
                      <button
                        type="button"
                        onClick={() => void applyOfficeForSelectedDay()}
                        disabled={submitting === "office"}
                        className="rounded-xl border border-[color-mix(in_srgb,var(--prom-gold)_45%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] px-4 py-3 text-left text-sm font-medium text-[var(--prom-text)] transition hover:bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] disabled:opacity-60"
                      >
                        {submitting === "office" ? "Salvataggio…" : "Sede"}
                      </button>
                    ) : null}
                    {!menuDayHasSw ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSwPendingDay(modal.day.slice(0, 10));
                          setSwNote("");
                          setModalStep("smartworking");
                        }}
                        className="rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-3 text-left text-sm font-medium text-violet-950 transition hover:bg-violet-500/15 dark:text-violet-100"
                      >
                        Smart working
                      </button>
                    ) : null}
                    {!menuDayHasTravel ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTravelPendingDay(modal.day.slice(0, 10));
                          setTravelNote("");
                          setModalStep("travel");
                        }}
                        className={TRAVEL_ACTION_ROW_CLASS}
                      >
                        Trasferta
                      </button>
                    ) : null}
                    {!menuDayHasLeave ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ev = cellEventsModal.find(
                            (e) =>
                              (e.kind === "leave" || e.kind === "rol") &&
                              String(e.meta?.status) === "pending" &&
                              typeof e.meta?.leaveId === "string"
                          );
                          if (ev) {
                            setEditingLeaveId(String(ev.meta?.leaveId));
                            setLeaveStart(ev.start.slice(0, 10));
                            setLeaveEnd((ev.end ?? ev.start).slice(0, 10));
                            setLeaveKind(ev.kind === "rol" ? "rol" : "annual");
                          } else {
                            setEditingLeaveId(null);
                            setLeaveStart(modal.day);
                            setLeaveEnd(modal.day);
                            setLeaveKind("annual");
                          }
                          setModalStep("leave");
                        }}
                        className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-left text-sm font-medium text-emerald-950 transition hover:bg-emerald-500/15 dark:text-emerald-100"
                      >
                        Richiesta ferie / ROL
                      </button>
                    ) : null}
                    {!menuDayHasSickness ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ev = cellEventsModal.find(
                            (e) =>
                              e.kind === "sickness" &&
                              String(e.meta?.status) === "pending" &&
                              typeof e.meta?.sicknessId === "string"
                          );
                          if (ev) {
                            setEditingSicknessId(String(ev.meta?.sicknessId));
                            setSickFrom(ev.start.slice(0, 10));
                            setSickTo((ev.end ?? ev.start).slice(0, 10));
                          } else {
                            setEditingSicknessId(null);
                            setSickFrom(modal.day);
                            setSickTo(modal.day);
                          }
                          setSickFile(null);
                          setModalStep("sickness");
                        }}
                        className="rounded-xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 text-left text-sm font-medium text-orange-950 transition hover:bg-orange-500/15 dark:text-orange-100"
                      >
                        Comunicazione malattia
                      </button>
                    ) : null}
                    {menuDayHasSw && menuDayHasTravel && menuDayHasLeave && menuDayHasSickness ? (
                      <p className="text-[11px] text-[var(--prom-muted)]">
                        Per questo giorno risultano già richieste attive. Usa matita o X sulle etichette in
                        griglia per modificare o annullare quelle in attesa.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {modalStep === "menu" && canHrEditOtherCalendarRow ? (
                  <div className="grid gap-2">
                    <p className="text-[11px] text-[var(--prom-muted)]">
                      Responsabile / admin: puoi modificare solo richieste ancora in attesa di approvazione per
                      questo giorno.
                    </p>
                    {pendingLeaveInModal ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLeaveId(String(pendingLeaveInModal.meta?.leaveId));
                          setLeaveStart(pendingLeaveInModal.start.slice(0, 10));
                          setLeaveEnd((pendingLeaveInModal.end ?? pendingLeaveInModal.start).slice(0, 10));
                          setLeaveKind(pendingLeaveInModal.kind === "rol" ? "rol" : "annual");
                          setModalStep("leave");
                        }}
                        className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-left text-sm font-medium text-emerald-950 transition hover:bg-emerald-500/15 dark:text-emerald-100"
                      >
                        Modifica ferie / ROL in attesa
                      </button>
                    ) : null}
                    {pendingSicknessInModal ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSicknessId(String(pendingSicknessInModal.meta?.sicknessId));
                          setSickFrom(pendingSicknessInModal.start.slice(0, 10));
                          setSickTo((pendingSicknessInModal.end ?? pendingSicknessInModal.start).slice(0, 10));
                          setSickFile(null);
                          setModalStep("sickness");
                        }}
                        className="rounded-xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 text-left text-sm font-medium text-orange-950 transition hover:bg-orange-500/15 dark:text-orange-100"
                      >
                        Modifica malattia in attesa
                      </button>
                    ) : null}
                    {pendingSwInModal ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ev = cellEventsModal.find(
                            (e) =>
                              e.kind === "smartworking" &&
                              String(e.meta?.status) === "pending" &&
                              typeof e.meta?.swRequestId === "string"
                          );
                          if (ev) {
                            setSwPendingDay(ev.start.slice(0, 10));
                            setSwNote(typeof ev.meta?.note === "string" ? ev.meta.note : "");
                          } else {
                            setSwPendingDay(modal.day.slice(0, 10));
                            setSwNote("");
                          }
                          setModalStep("smartworking");
                        }}
                        className="rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-3 text-left text-sm font-medium text-violet-950 transition hover:bg-violet-500/15 dark:text-violet-100"
                      >
                        Modifica smart working in attesa
                      </button>
                    ) : null}
                    {pendingTravelInModal ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ev = cellEventsModal.find(
                            (e) =>
                              e.kind === "travel" &&
                              String(e.meta?.status) === "pending" &&
                              typeof e.meta?.travelRequestId === "string"
                          );
                          if (ev) {
                            setTravelPendingDay(ev.start.slice(0, 10));
                            setTravelNote(typeof ev.meta?.note === "string" ? ev.meta.note : "");
                          } else {
                            setTravelPendingDay(modal.day.slice(0, 10));
                            setTravelNote("");
                          }
                          setModalStep("travel");
                        }}
                        className={TRAVEL_ACTION_ROW_CLASS}
                      >
                        Modifica trasferta in attesa
                      </button>
                    ) : null}
                    {!pendingLeaveInModal && !pendingSicknessInModal && !pendingSwInModal && !pendingTravelInModal ? (
                      <p className="text-xs text-[var(--prom-muted)]">
                        Nessuna richiesta in attesa per questa data (solo le richieste approvate non sono
                        modificabili da qui).
                      </p>
                    ) : null}
                    {me?.role === "superuser" ? (
                      <div className="mt-3 grid gap-2 border-t border-[var(--prom-line)] pt-3">
                        <p className="text-[11px] text-[var(--prom-muted)]">
                          Admin: registra nuove assenze per {modal.row.fullName}.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLeaveId(null);
                            setLeaveStart(modal.day);
                            setLeaveEnd(modal.day);
                            setLeaveKind("annual");
                            setModalStep("leave");
                          }}
                          className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-left text-sm font-medium text-emerald-950 transition hover:bg-emerald-500/15 dark:text-emerald-100"
                        >
                          Nuova richiesta ferie / ROL
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSicknessId(null);
                            setSickFrom(modal.day);
                            setSickTo(modal.day);
                            setSickFile(null);
                            setModalStep("sickness");
                          }}
                          className="rounded-xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 text-left text-sm font-medium text-orange-950 transition hover:bg-orange-500/15 dark:text-orange-100"
                        >
                          Nuova comunicazione malattia
                        </button>
                        {!menuDayHasSw ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSwPendingDay(modal.day.slice(0, 10));
                              setSwNote("");
                              setModalStep("smartworking");
                            }}
                            className="rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-3 text-left text-sm font-medium text-violet-950 transition hover:bg-violet-500/15 dark:text-violet-100"
                          >
                            Nuovo smart working
                          </button>
                        ) : null}
                        {!menuDayHasTravel ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTravelPendingDay(modal.day.slice(0, 10));
                              setTravelNote("");
                              setModalStep("travel");
                            }}
                            className={TRAVEL_ACTION_ROW_CLASS}
                          >
                            Nuova trasferta
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {modalStep === "leave" ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-[var(--prom-text)]">
                      {editingLeaveId
                        ? "Modifica richiesta (in attesa)"
                        : !isOwnRow && me?.role === "superuser"
                          ? `Richiesta ferie / ROL per ${modal.row.fullName}`
                          : "Richiesta ferie / ROL"}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block text-[11px] text-[var(--prom-muted)]">
                        Inizio
                        <input
                          type="date"
                          value={leaveStart}
                          onChange={(e) => setLeaveStart(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                        />
                      </label>
                      <label className="block text-[11px] text-[var(--prom-muted)]">
                        Fine
                        <input
                          type="date"
                          value={leaveEnd}
                          onChange={(e) => setLeaveEnd(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                        />
                      </label>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--prom-muted)]">
                      Tipo
                      <select
                        value={leaveKind}
                        onChange={(e) => setLeaveKind(e.target.value === "rol" ? "rol" : "annual")}
                        className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1 text-[var(--prom-text)]"
                      >
                        <option value="annual">Ferie</option>
                        <option value="rol">ROL</option>
                      </select>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      disabled={submitting !== null}
                      onClick={() => void submitLeave()}
                    >
                      {submitting === "leave"
                        ? "Invio…"
                        : editingLeaveId
                          ? "Salva modifiche"
                          : "Invia richiesta ferie/ROL"}
                    </Button>
                  </div>
                ) : null}

                {modalStep === "smartworking" ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-[var(--prom-text)]">Smart working</p>
                    <label className="block text-[11px] text-[var(--prom-muted)]">
                      Giorno
                      <input
                        type="date"
                        value={(swPendingDay || modal.day).slice(0, 10)}
                        onChange={(e) => setSwPendingDay(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                      />
                    </label>
                    {superuserTravelForOther ? (
                      <>
                        <p className="text-[11px] text-[var(--prom-muted)]">
                          Registra uno smart working per{" "}
                          <span className="font-medium text-[var(--prom-text)]">{modal.row.fullName}</span>. Le quote
                          settimanali/mensili non si applicano alle richieste registrate dal superuser.
                        </p>
                        {swAtSelectedDay.on ? (
                          <p className="text-[10px] text-[var(--prom-muted)]">
                            {swAtSelectedDay.status === "pending"
                              ? "Per questa data c’è già una richiesta in attesa: torna al menu e usa «Modifica smart working in attesa»."
                              : "Per questa data risulta già uno smart working attivo (approvato o da presenze)."}
                          </p>
                        ) : null}
                        <label className="block text-[11px] text-[var(--prom-muted)]">
                          Nota (opzionale)
                          <input
                            type="text"
                            value={swNote}
                            onChange={(e) => setSwNote(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                          />
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-1"
                          disabled={submitting !== null || swAtSelectedDay.on}
                          onClick={() => void submitSmartworkingAdminForOther()}
                        >
                          {submitting === "sw-admin" ? "Invio…" : "Registra smart working"}
                        </Button>
                      </>
                    ) : (
                      <>
                        {isOwnRow ? (
                          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)] px-3 py-2.5">
                            <span className="text-[11px] text-[var(--prom-text)]">
                              Richiedi smart working per questo giorno
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              aria-checked={swDisplayOn}
                              checked={swDisplayOn}
                              onChange={(e) => onSmartworkingSwitch(e.target.checked)}
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--prom-line)] accent-violet-600"
                            />
                          </label>
                        ) : (
                          <p className="text-[11px] text-[var(--prom-muted)]">
                            Per il dipendente: modifica solo richieste già in attesa (giorno e nota). Per annullare usa
                            l&apos;interruttore sotto se la richiesta è ancora in sospeso.
                          </p>
                        )}
                        {!isOwnRow && serverSwForm.status === "pending" && serverSwForm.requestId ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onSmartworkingSwitch(false)}
                          >
                            Annulla richiesta smart working in attesa
                          </Button>
                        ) : null}
                        {swDisplayOn &&
                        serverSwForm.status !== "pending" &&
                        !(chipEditIsApproved && serverSwForm.status === "approved") ? (
                          <p className="text-[10px] text-[var(--prom-muted)]">
                            Per questa data risulta già uno smart working (approvato o da presenze). Non è possibile
                            inserirne un altro.
                          </p>
                        ) : null}
                        <label className="block text-[11px] text-[var(--prom-muted)]">
                          Nota (opzionale)
                          <input
                            type="text"
                            value={swNote}
                            onChange={(e) => setSwNote(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                          />
                        </label>
                        <p className="text-[10px] text-[var(--prom-muted)]">
                          La richiesta viene inviata in background; puoi chiudere il riquadro o scegliere un’altra
                          opzione dal menu.
                        </p>
                        {showSmartworkingModalSaveButton ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="mt-1"
                            disabled={submitting !== null}
                            onClick={() => void saveSmartworkingModalEdits()}
                          >
                            {submitting === "sw-save" || submitting === "sw-save-approved"
                              ? "Salvataggio…"
                              : chipEditIsApproved && serverSwForm.status === "approved"
                                ? "Salva correzione (approvato)"
                                : "Aggiorna giorno / nota (in attesa)"}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}

                {modalStep === "travel" ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-[var(--prom-text)]">Trasferta</p>
                    <label className="block text-[11px] text-[var(--prom-muted)]">
                      Giorno
                      <input
                        type="date"
                        value={(travelPendingDay || modal.day).slice(0, 10)}
                        onChange={(e) => setTravelPendingDay(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                      />
                    </label>
                    {superuserTravelForOther ? (
                      <>
                        <p className="text-[11px] text-[var(--prom-muted)]">
                          Registra una trasferta per{" "}
                          <span className="font-medium text-[var(--prom-text)]">{modal.row.fullName}</span>. La richiesta
                          resta soggetta alle stesse approvazioni delle altre trasferte.
                        </p>
                        {travelAtSelectedDay.on ? (
                          <p className="text-[10px] text-[var(--prom-muted)]">
                            {travelAtSelectedDay.status === "pending"
                              ? "Per questa data c’è già una richiesta in attesa: torna al menu e usa «Modifica trasferta in attesa»."
                              : "Per questa data risulta già una trasferta approvata."}
                          </p>
                        ) : null}
                        <label className="block text-[11px] text-[var(--prom-muted)]">
                          Nota / destinazione (opzionale)
                          <input
                            type="text"
                            value={travelNote}
                            onChange={(e) => setTravelNote(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                          />
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-1"
                          disabled={submitting !== null || travelAtSelectedDay.on}
                          onClick={() => void submitTravelAdminForOther()}
                        >
                          {submitting === "travel-admin" ? "Invio…" : "Registra trasferta"}
                        </Button>
                      </>
                    ) : (
                      <>
                        {isOwnRow ? (
                          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)] px-3 py-2.5">
                            <span className="text-[11px] text-[var(--prom-text)]">
                              Richiedi trasferta per questo giorno
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              aria-checked={trDisplayOn}
                              checked={trDisplayOn}
                              onChange={(e) => onTravelSwitch(e.target.checked)}
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--prom-line)] accent-[var(--prom-gold)]"
                            />
                          </label>
                        ) : (
                          <p className="text-[11px] text-[var(--prom-muted)]">
                            Per il dipendente: modifica solo richieste ancora in attesa (giorno e nota).
                          </p>
                        )}
                        {!isOwnRow && serverTravelForm.status === "pending" && serverTravelForm.requestId ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => onTravelSwitch(false)}>
                            Annulla richiesta trasferta in attesa
                          </Button>
                        ) : null}
                        {trDisplayOn &&
                        serverTravelForm.status !== "pending" &&
                        !(chipEditIsApproved && serverTravelForm.status === "approved") ? (
                          <p className="text-[10px] text-[var(--prom-muted)]">
                            Per questa data risulta già una trasferta approvata. Non è possibile inserirne un’altra.
                          </p>
                        ) : null}
                        <label className="block text-[11px] text-[var(--prom-muted)]">
                          Nota / destinazione (opzionale)
                          <input
                            type="text"
                            value={travelNote}
                            onChange={(e) => setTravelNote(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                          />
                        </label>
                        {showTravelModalSaveButton ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="mt-1"
                            disabled={submitting !== null}
                            onClick={() => void saveTravelModalEdits()}
                          >
                            {submitting === "tr-save" || submitting === "tr-save-approved"
                              ? "Salvataggio…"
                              : chipEditIsApproved && serverTravelForm.status === "approved"
                                ? "Salva correzione (approvato)"
                                : "Aggiorna giorno / nota (in attesa)"}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}

                {modalStep === "sickness" ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-[var(--prom-text)]">
                      {editingSicknessId
                        ? "Modifica comunicazione (in attesa)"
                        : !isOwnRow && me?.role === "superuser"
                          ? `Comunicazione malattia per ${modal.row.fullName}`
                          : "Comunicazione malattia"}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block text-[11px] text-[var(--prom-muted)]">
                        Da
                        <input
                          type="date"
                          value={sickFrom}
                          onChange={(e) => setSickFrom(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                        />
                      </label>
                      <label className="block text-[11px] text-[var(--prom-muted)]">
                        A
                        <input
                          type="date"
                          value={sickTo}
                          onChange={(e) => setSickTo(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                        />
                      </label>
                    </div>
                    {editingSicknessId ? (
                      <p className="mt-2 text-[10px] text-[var(--prom-muted)]">
                        Per un nuovo certificato contatta HR; qui puoi aggiornare solo le date finché la richiesta è in attesa.
                      </p>
                    ) : (
                      <label className="mt-2 block text-[11px] text-[var(--prom-muted)]">
                        Certificato (opzionale, pdf/jpg)
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg"
                          className="mt-1 block w-full text-xs text-[var(--prom-muted)]"
                          onChange={(e) => setSickFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      disabled={submitting !== null}
                      onClick={() => void submitSick()}
                    >
                      {submitting === "sick"
                        ? "Invio…"
                        : editingSicknessId
                          ? "Salva modifiche"
                          : "Invia comunicazione"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-xs text-[var(--prom-muted)]">
                Solo il dipendente interessato può creare richieste da qui. Turni restano gestiti dalla pianificazione.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                Chiudi
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {roomModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            setRoomModal(null);
            setRoomModalStep("room_menu");
          }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-modal-title"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--glass-border)] p-5 shadow-[var(--glass-shadow)]"
            style={{ background: "var(--glass-bg)", boxShadow: "var(--glass-shadow)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {roomModalStep !== "room_menu" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mb-1 -ml-2 h-8 px-2 text-[11px]"
                    onClick={() => {
                      if (roomModalStep === "room_create" && roomModal.row.room.id === "__new__") {
                        setRoomModal(null);
                        setRoomModalStep("room_menu");
                        return;
                      }
                      setRoomModalStep("room_menu");
                    }}
                  >
                    ← Indietro
                  </Button>
                ) : null}
                <h2 id="room-modal-title" className="text-base font-semibold text-[var(--prom-text)]">
                  {formatItalianDateLong(roomModal.day.slice(0, 10))} ·{" "}
                  {roomModal.row.room.id === "__new__"
                    ? roomCreateName.trim() || "Nuova sala"
                    : roomModal.row.room.name}
                </h2>
                <p className="mt-1 text-xs text-[var(--prom-muted)]">
                  {roomModal.row.room.location ? roomModal.row.room.location : "Sala riunioni"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-lg leading-none"
                aria-label="Chiudi"
                onClick={() => {
                  setRoomModal(null);
                  setRoomModalStep("room_menu");
                }}
              >
                ×
              </Button>
            </div>

            <div className="mt-3 rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] p-3 text-xs text-[var(--prom-text)]">
              <p className="text-[11px] font-medium text-[var(--prom-muted)]">Caratteristiche</p>
              <ul className="mt-2 grid gap-1">
                <li>
                  Posti:{" "}
                  <span className="font-medium">{roomModal.row.room.seats != null ? roomModal.row.room.seats : "—"}</span>
                </li>
                <li>Schermo: <span className="font-medium">{roomModal.row.room.hasScreen ? "sì" : "no"}</span></li>
                <li>Proiettore: <span className="font-medium">{roomModal.row.room.hasProjector ? "sì" : "no"}</span></li>
                <li>Lavagna: <span className="font-medium">{roomModal.row.room.hasWhiteboard ? "sì" : "no"}</span></li>
                <li>Video: <span className="font-medium">{roomModal.row.room.hasVideoConference ? "sì" : "no"}</span></li>
                {roomModal.row.room.extraFeatures.length ? (
                  <li>
                    Altro:{" "}
                    <span className="font-medium">{roomModal.row.room.extraFeatures.join(", ")}</span>
                  </li>
                ) : null}
              </ul>
            </div>

            {roomModalStep === "room_menu" ? (
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-4 py-3 text-left text-sm font-medium text-sky-950 transition hover:bg-sky-500/15 dark:text-sky-100"
                  onClick={() => {
                    setRoomBookingTitle("");
                    setRoomBookingStart("09:00");
                    setRoomBookingEnd("10:00");
                    setRoomModalStep("room_book");
                  }}
                >
                  Prenota
                </button>
                {mayCreateMeetingRooms(me) ? (
                  <button
                    type="button"
                    className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] px-4 py-3 text-left text-sm font-medium text-[var(--prom-text)] transition hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)]"
                    onClick={() => {
                      setRoomCreateName(roomModal.row.room.name);
                      setRoomCreateLocation(roomModal.row.room.location ?? "");
                      setRoomCreateSeats(roomModal.row.room.seats != null ? String(roomModal.row.room.seats) : "");
                      setRoomCreateHasScreen(roomModal.row.room.hasScreen);
                      setRoomCreateHasProjector(roomModal.row.room.hasProjector);
                      setRoomCreateHasWhiteboard(roomModal.row.room.hasWhiteboard);
                      setRoomCreateHasVideo(roomModal.row.room.hasVideoConference);
                      setRoomCreateExtras(roomModal.row.room.extraFeatures.join(", "));
                      setRoomModalStep("room_create");
                    }}
                  >
                    Duplica come nuova sala
                  </button>
                ) : null}
                {roomsLoading ? <p className="text-[11px] text-[var(--prom-muted)]">Caricamento sale…</p> : null}
              </div>
            ) : null}

            {roomModalStep === "room_book" ? (
              <div className="mt-4 space-y-3 border-t border-[var(--prom-line)] pt-4">
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Titolo (opzionale)
                  <input
                    value={roomBookingTitle}
                    onChange={(e) => setRoomBookingTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-[11px] text-[var(--prom-muted)]">
                    Inizio
                    <input
                      value={roomBookingStart}
                      onChange={(e) => setRoomBookingStart(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
                      placeholder="09:00"
                    />
                  </label>
                  <label className="block text-[11px] text-[var(--prom-muted)]">
                    Fine
                    <input
                      value={roomBookingEnd}
                      onChange={(e) => setRoomBookingEnd(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
                      placeholder="10:00"
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    const token = getToken();
                    if (!token) return;
                    const day = roomModal.day.slice(0, 10);
                    const startsAt = `${day}T${roomBookingStart}:00.000Z`;
                    const endsAt = `${day}T${roomBookingEnd}:00.000Z`;
                    setSubmitting("room_booking");
                    void createMeetingRoomBooking(token, roomModal.row.room.id, {
                      startsAt,
                      endsAt,
                      ...(roomBookingTitle.trim() ? { title: roomBookingTitle.trim() } : {})
                    })
                      .then((ev) => {
                        setEvents((prev) => [...prev, ev]);
                        setRoomModalStep("room_menu");
                      })
                      .catch((err) => {
                        setError(err instanceof Error ? err.message : "Prenotazione fallita");
                      })
                      .finally(() => setSubmitting(null));
                  }}
                  disabled={submitting === "room_booking"}
                  className="w-full"
                >
                  {submitting === "room_booking" ? "Prenotazione…" : "Conferma prenotazione"}
                </Button>
              </div>
            ) : null}

            {roomModalStep === "room_create" ? (
              <div className="mt-4 space-y-3 border-t border-[var(--prom-line)] pt-4">
                <p className="text-[11px] text-[var(--prom-muted)]">
                  Creazione sala: solo superuser o amministratore Synapse.
                </p>
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Nome
                  <input
                    value={roomCreateName}
                    onChange={(e) => setRoomCreateName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
                  />
                </label>
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Dove si trova (opzionale)
                  <input
                    value={roomCreateLocation}
                    onChange={(e) => setRoomCreateLocation(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
                  />
                </label>
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Posti (opzionale)
                  <input
                    value={roomCreateSeats}
                    onChange={(e) => setRoomCreateSeats(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
                    placeholder="8"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--prom-text)]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={roomCreateHasScreen} onChange={(e) => setRoomCreateHasScreen(e.target.checked)} />
                    Schermo
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={roomCreateHasProjector} onChange={(e) => setRoomCreateHasProjector(e.target.checked)} />
                    Proiettore
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={roomCreateHasWhiteboard} onChange={(e) => setRoomCreateHasWhiteboard(e.target.checked)} />
                    Lavagna
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={roomCreateHasVideo} onChange={(e) => setRoomCreateHasVideo(e.target.checked)} />
                    Video
                  </label>
                </div>
                <label className="block text-[11px] text-[var(--prom-muted)]">
                  Altre caratteristiche (separate da virgola)
                  <input
                    value={roomCreateExtras}
                    onChange={(e) => setRoomCreateExtras(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_85%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
                    placeholder="presa HDMI, aria condizionata, accesso disabili"
                  />
                </label>
                <Button
                  type="button"
                  onClick={() => {
                    const token = getToken();
                    if (!token) return;
                    setSubmitting("room_create");
                    const seats = roomCreateSeats.trim() ? Number(roomCreateSeats.trim()) : undefined;
                    void createMeetingRoom(token, {
                      name: roomCreateName,
                      ...(roomCreateLocation.trim() ? { location: roomCreateLocation.trim() } : {}),
                      ...(Number.isFinite(seats as number) ? { seats: seats as number } : {}),
                      hasScreen: roomCreateHasScreen,
                      hasProjector: roomCreateHasProjector,
                      hasWhiteboard: roomCreateHasWhiteboard,
                      hasVideoConference: roomCreateHasVideo,
                      extraFeatures: roomCreateExtras
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean)
                    })
                      .then(({ id }) => {
                        void fetchMeetingRooms(token).then((items) => {
                          setRooms(items);
                          const created = items.find((r) => r.id === id);
                          if (created && roomModal) {
                            setRoomModal({ ...roomModal, row: { id: `room:${created.id}`, fullName: created.name, room: created } });
                          }
                          setRoomModalStep("room_menu");
                        });
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : "Creazione fallita"))
                      .finally(() => setSubmitting(null));
                  }}
                  disabled={submitting === "room_create"}
                  className="w-full"
                >
                  {submitting === "room_create" ? "Creazione…" : "Crea sala"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
