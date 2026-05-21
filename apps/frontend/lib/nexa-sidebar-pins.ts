export const NEXA_SIDEBAR_PINS_HR_KEY = "nexa_sidebar_pins_hr";
export const NEXA_SIDEBAR_PINS_EMPLOYEE_KEY = "nexa_sidebar_pins_employee";
export const NEXA_SIDEBAR_PINS_CHANGED_EVENT = "nexa-sidebar-pins-changed";

/** sectionId (pillar id o employee section id) → href[] */
export type SidebarPinsBySection = Record<string, string[]>;

const MAX_PINS_PER_SECTION = 8;

function storageKey(mode: "hr" | "employee"): string {
  return mode === "hr" ? NEXA_SIDEBAR_PINS_HR_KEY : NEXA_SIDEBAR_PINS_EMPLOYEE_KEY;
}

function normalizePins(raw: unknown): SidebarPinsBySection {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: SidebarPinsBySection = {};
  for (const [sectionId, hrefs] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(hrefs)) {
      continue;
    }
    const clean = hrefs
      .filter((h): h is string => typeof h === "string" && h.startsWith("/"))
      .slice(0, MAX_PINS_PER_SECTION);
    if (clean.length > 0) {
      out[sectionId] = clean;
    }
  }
  return out;
}

export function readSidebarPins(mode: "hr" | "employee"): SidebarPinsBySection {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(storageKey(mode));
    if (!raw) {
      return {};
    }
    return normalizePins(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function writeSidebarPins(mode: "hr" | "employee", pins: SidebarPinsBySection): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(normalizePins(pins)));
    window.dispatchEvent(new Event(NEXA_SIDEBAR_PINS_CHANGED_EVENT));
  } catch {
    /* ignore quota */
  }
}

export function addSidebarPin(mode: "hr" | "employee", sectionId: string, href: string): void {
  const pins = readSidebarPins(mode);
  const current = pins[sectionId] ?? [];
  if (current.includes(href) || current.length >= MAX_PINS_PER_SECTION) {
    return;
  }
  writeSidebarPins(mode, { ...pins, [sectionId]: [...current, href] });
}

export function removeSidebarPin(mode: "hr" | "employee", sectionId: string, href: string): void {
  const pins = readSidebarPins(mode);
  const current = pins[sectionId];
  if (!current?.includes(href)) {
    return;
  }
  const next = current.filter((h) => h !== href);
  const updated = { ...pins };
  if (next.length === 0) {
    delete updated[sectionId];
  } else {
    updated[sectionId] = next;
  }
  writeSidebarPins(mode, updated);
}
