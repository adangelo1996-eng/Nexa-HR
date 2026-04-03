import type { CalendarEventDto } from "@/lib/api";

export type WorkCalendarUserStats = {
  giorniFerieAnnuali: number;
  giorniRol: number;
  giorniMalattia: number;
  giorniSmartWorking: number;
  giorniFestivitaAziendali: number;
  giorniConTurno: number;
  richiesteInAttesa: number;
};

function ymd(s: string): string {
  return s.slice(0, 10);
}

function parseYmd(iso: string): [number, number, number] {
  const [y, m, d] = ymd(iso).split("-").map(Number);
  return [y, m, d];
}

function* eachDayInclusive(lo: string, hi: string): Generator<string> {
  const [y0, m0, d0] = parseYmd(lo);
  const [y1, m1, d1] = parseYmd(hi);
  let t = Date.UTC(y0, m0 - 1, d0);
  const end = Date.UTC(y1, m1 - 1, d1);
  while (t <= end) {
    const dt = new Date(t);
    const y = dt.getUTCFullYear();
    const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const da = String(dt.getUTCDate()).padStart(2, "0");
    yield `${y}-${mo}-${da}`;
    t += 86_400_000;
  }
}

function daysInWindow(evStart: string, evEnd: string | undefined, rangeFrom: string, rangeTo: string): string[] {
  const s = ymd(evStart);
  const e = ymd(evEnd ?? evStart);
  const rf = ymd(rangeFrom);
  const rt = ymd(rangeTo);
  const lo = s > rf ? s : rf;
  const hi = e < rt ? e : rt;
  if (lo > hi) return [];
  return [...eachDayInclusive(lo, hi)];
}

function isRejected(ev: CalendarEventDto): boolean {
  return String(ev.meta?.status ?? "") === "rejected";
}

function isPendingApproval(ev: CalendarEventDto): boolean {
  return ev.meta?.status === "pending";
}

export function aggregateWorkCalendarStats(
  events: CalendarEventDto[],
  rangeFrom: string,
  rangeTo: string
): WorkCalendarUserStats {
  const ferie = new Set<string>();
  const rol = new Set<string>();
  const mal = new Set<string>();
  const sw = new Set<string>();
  const fest = new Set<string>();
  const turni = new Set<string>();
  let richiesteInAttesa = 0;

  for (const ev of events) {
    if (ev.kind === "holiday") {
      for (const d of daysInWindow(ev.start, ev.end, rangeFrom, rangeTo)) fest.add(d);
      continue;
    }

    if (isRejected(ev)) continue;

    if (
      isPendingApproval(ev) &&
      (ev.kind === "leave" || ev.kind === "rol" || ev.kind === "smartworking" || ev.kind === "sickness")
    ) {
      richiesteInAttesa += 1;
    }

    switch (ev.kind) {
      case "leave":
        for (const d of daysInWindow(ev.start, ev.end, rangeFrom, rangeTo)) ferie.add(d);
        break;
      case "rol":
        for (const d of daysInWindow(ev.start, ev.end, rangeFrom, rangeTo)) rol.add(d);
        break;
      case "sickness":
        for (const d of daysInWindow(ev.start, ev.end, rangeFrom, rangeTo)) mal.add(d);
        break;
      case "smartworking":
        for (const d of daysInWindow(ev.start, ev.end, rangeFrom, rangeTo)) sw.add(d);
        break;
      case "shift":
        for (const d of daysInWindow(ev.start, ev.end, rangeFrom, rangeTo)) turni.add(d);
        break;
      default:
        break;
    }
  }

  return {
    giorniFerieAnnuali: ferie.size,
    giorniRol: rol.size,
    giorniMalattia: mal.size,
    giorniSmartWorking: sw.size,
    giorniFestivitaAziendali: fest.size,
    giorniConTurno: turni.size,
    richiesteInAttesa
  };
}

export function formatItalianDateLong(isoYmd: string): string {
  const [y, m, d] = parseYmd(isoYmd);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}
