import type { CalendarEventDto } from "@/lib/api";

/** Etichetta breve per chip calendario (tooltip resta su ev.title). */
export function calendarEventAbbrev(ev: CalendarEventDto): string {
  if (ev.kind === "shift" && ev.end) {
    return `${ev.start.slice(11, 16)}–${ev.end.slice(11, 16)}`;
  }
  switch (ev.kind) {
    case "smartworking":
      return "SW";
    case "office":
      return "SD";
    case "travel":
      return "TR";
    case "leave":
      return "F";
    case "rol":
      return "ROL";
    case "sickness":
      return "M";
    case "holiday":
      return "Fest";
    case "shift":
      return "T";
    case "deadline":
      return "Scad";
    default:
      return ev.title.slice(0, 8);
  }
}
