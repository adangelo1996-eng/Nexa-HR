import type { ApprovalItem } from "@/lib/api";

/** Data calendario corrente in Europe/Rome (YYYY-MM-DD), allineato al backend `calendarDateTodayIsoRome`. */
export function todayIsoRome(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/** Differenza in giorni calendario fromIso → toIso (es. oggi → data richiesta). */
function diffCalendarDays(fromIso: string, toIso: string): number {
  const fromMs = new Date(`${fromIso}T12:00:00.000Z`).getTime();
  const toMs = new Date(`${toIso}T12:00:00.000Z`).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** Pending con data richiesta imminente o passata: priorità alta per il responsabile. */
export function isHighPriorityPending(item: ApprovalItem): boolean {
  if (item.status !== "pending" || !item.startDate) {
    return false;
  }
  const today = todayIsoRome();
  if (item.startDate < today) {
    return true;
  }
  const d = diffCalendarDays(today, item.startDate);
  return d >= 0 && d <= 2;
}

export interface WorkflowPartitions {
  toApprove: ApprovalItem[];
  mine: ApprovalItem[];
  history: ApprovalItem[];
}

export function partitionForWorkflow(items: ApprovalItem[], userId: string): WorkflowPartitions {
  const toApprove: ApprovalItem[] = [];
  const mine: ApprovalItem[] = [];
  const history: ApprovalItem[] = [];
  for (const item of items) {
    if (item.status === "approved" || item.status === "rejected") {
      history.push(item);
    } else if (item.status === "pending") {
      if (item.requestedBy !== userId) {
        toApprove.push(item);
      } else {
        mine.push(item);
      }
    }
  }
  return { toApprove, mine, history };
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Ordine lista "da approvare": priorità alta, poi startDate, poi at. */
export function sortToApprove(items: ApprovalItem[]): ApprovalItem[] {
  return [...items].sort((x, y) => {
    const hx = isHighPriorityPending(x) ? 0 : 1;
    const hy = isHighPriorityPending(y) ? 0 : 1;
    if (hx !== hy) {
      return hx - hy;
    }
    const sx = x.startDate ?? "\uffff";
    const sy = y.startDate ?? "\uffff";
    const c = compareIso(sx, sy);
    if (c !== 0) {
      return c;
    }
    return compareIso(x.at, y.at);
  });
}

/** Le mie richieste: pending prima, poi per data esito/decisione decrescente. */
export function sortMine(items: ApprovalItem[]): ApprovalItem[] {
  return [...items].sort((x, y) => {
    const px = x.status === "pending" ? 0 : 1;
    const py = y.status === "pending" ? 0 : 1;
    if (px !== py) {
      return px - py;
    }
    return y.at.localeCompare(x.at);
  });
}

const HISTORY_TYPE_ORDER = ["leave:annual", "leave:rol", "sickness", "smartworking", "travel"] as const;

/** Ordine intestazioni «Approvazioni in sospeso» (assenze): Ferie → ROL → Malattia → Trasferta → Remote working. */
const PENDING_APPROVAL_CATEGORY_ORDER = [
  "leave:annual",
  "leave:rol",
  "sickness",
  "travel",
  "smartworking"
] as const;

export function historyTypeKey(item: ApprovalItem): string {
  if (item.type === "leave") {
    return item.leaveKind === "rol" ? "leave:rol" : "leave:annual";
  }
  return item.type;
}

/** Etichetta italiana per categoria in coda approvazioni (assenze, spese, storico). */
export function pendingApprovalCategoryLabel(typeKey: string): string {
  switch (typeKey) {
    case "leave:annual":
      return "Ferie annuali";
    case "leave:rol":
      return "ROL";
    case "sickness":
      return "Malattia";
    case "travel":
      return "Trasferte";
    case "smartworking":
      return "Smart working";
    case "expense:manager":
      return "Spese · responsabile";
    case "expense:hr":
      return "Spese · HR";
    default:
      return typeKey;
  }
}

function historyTypeOrderIndex(key: string): number {
  const i = HISTORY_TYPE_ORDER.indexOf(key as (typeof HISTORY_TYPE_ORDER)[number]);
  return i === -1 ? 999 : i;
}

function pendingApprovalCategoryOrderIndex(key: string): number {
  const i = PENDING_APPROVAL_CATEGORY_ORDER.indexOf(key as (typeof PENDING_APPROVAL_CATEGORY_ORDER)[number]);
  return i === -1 ? 999 : i;
}

/** Raggruppa richieste assenza/permesso in attesa per tipologia (ordine fisso da piano prodotto). */
export function groupPendingApprovalsByCategory(
  items: ApprovalItem[]
): Array<{ typeKey: string; items: ApprovalItem[] }> {
  const byType = new Map<string, ApprovalItem[]>();
  for (const item of items) {
    const k = historyTypeKey(item);
    const g = byType.get(k) ?? [];
    g.push(item);
    byType.set(k, g);
  }
  const typeKeys = [...byType.keys()].sort((a, b) => pendingApprovalCategoryOrderIndex(a) - pendingApprovalCategoryOrderIndex(b));
  return typeKeys.map((typeKey) => ({
    typeKey,
    items: byType.get(typeKey) ?? []
  }));
}

/** Primo giorno richiesta per bucket storico; se manca startDate, giorno di `at` in Europe/Rome. */
export function requestDayKeyForHistory(item: ApprovalItem): string {
  if (item.startDate && /^\d{4}-\d{2}-\d{2}$/.test(item.startDate)) {
    return item.startDate;
  }
  try {
    return new Date(item.at).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  } catch {
    return "—";
  }
}

export interface HistoryDayGroup {
  day: string;
  typeGroups: Array<{ typeKey: string; items: ApprovalItem[] }>;
}

/** Storico: giorni per data richiesta (decrescente), sottogruppi per tipologia. */
export function groupHistoryByRequestDayAndType(historyItems: ApprovalItem[]): HistoryDayGroup[] {
  const byDay = new Map<string, ApprovalItem[]>();
  for (const item of historyItems) {
    const day = requestDayKeyForHistory(item);
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort((a, b) => {
    if (a === "—") {
      return 1;
    }
    if (b === "—") {
      return -1;
    }
    return b.localeCompare(a);
  });
  const out: HistoryDayGroup[] = [];
  for (const day of days) {
    const raw = byDay.get(day) ?? [];
    const byType = new Map<string, ApprovalItem[]>();
    for (const item of raw) {
      const k = historyTypeKey(item);
      const g = byType.get(k) ?? [];
      g.push(item);
      byType.set(k, g);
    }
    const typeKeys = [...byType.keys()].sort((a, b) => historyTypeOrderIndex(a) - historyTypeOrderIndex(b));
    const typeGroups = typeKeys.map((typeKey) => ({
      typeKey,
      items: (byType.get(typeKey) ?? []).sort((x, y) => y.at.localeCompare(x.at))
    }));
    out.push({ day, typeGroups });
  }
  return out;
}
