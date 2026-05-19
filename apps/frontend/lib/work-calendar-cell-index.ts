import type { CalendarEventDto } from "@/lib/api";

function eventTouchesDay(ev: CalendarEventDto, dayIso: string): boolean {
  const d = dayIso.slice(0, 10);
  const s = ev.start.slice(0, 10);
  const e = (ev.end ?? ev.start).slice(0, 10);
  return d >= s && d <= e;
}

/** Indice `userId:YYYY-MM-DD` → eventi cella (festività sotto `*:day`). */
export function buildWorkCalendarCellIndex(
  events: CalendarEventDto[],
  dayIsos: string[]
): Map<string, CalendarEventDto[]> {
  const index = new Map<string, CalendarEventDto[]>();
  const push = (key: string, ev: CalendarEventDto): void => {
    const bucket = index.get(key);
    if (bucket) bucket.push(ev);
    else index.set(key, [ev]);
  };

  for (const ev of events) {
    if (ev.kind === "holiday") {
      for (const iso of dayIsos) {
        if (eventTouchesDay(ev, iso)) push(`*:${iso}`, ev);
      }
      continue;
    }
    if (!ev.userId) continue;
    const start = ev.start.slice(0, 10);
    const end = (ev.end ?? ev.start).slice(0, 10);
    for (const iso of dayIsos) {
      if (iso >= start && iso <= end) push(`${ev.userId}:${iso}`, ev);
    }
  }
  return index;
}

export function eventsForCellFromIndex(
  index: Map<string, CalendarEventDto[]>,
  userId: string,
  dayIso: string
): CalendarEventDto[] {
  const personal = index.get(`${userId}:${dayIso}`) ?? [];
  const holidays = index.get(`*:${dayIso}`) ?? [];
  if (holidays.length === 0) return personal;
  if (personal.length === 0) return holidays;
  return [...holidays, ...personal];
}
