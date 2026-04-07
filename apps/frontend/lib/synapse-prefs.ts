const SYNAPSE_PREFS_KEY = "synapse_prefs_v1";
export const NEXA_HR_PREFS_STORAGE_KEY = "nexa_hr_prefs_v1";
const NEXA_HR_PREFS_KEY = NEXA_HR_PREFS_STORAGE_KEY;
export const NEXA_HR_PREFS_CHANGED_EVENT = "nexa-hr-prefs-changed";

export type SynapseLocale = "it" | "en";

export interface SynapsePrefsV1 {
  locale: SynapseLocale;
}

export interface NexaHrPrefsV1 {
  /** Vista predefinita dopo login */
  defaultLanding: "dashboard" | "attendance";
  /** Formato ore nelle etichette */
  hoursFormat: "decimal" | "hm";
  /** Scorciatoie in cima al menu mobile (path, max 6). */
  menuShortcutHrefs?: string[];
}

const defaultSynapse: SynapsePrefsV1 = { locale: "it" };
const defaultNexaHr: NexaHrPrefsV1 = { defaultLanding: "dashboard", hoursFormat: "decimal", menuShortcutHrefs: [] };

export function readSynapsePrefs(): SynapsePrefsV1 {
  if (typeof window === "undefined") {
    return defaultSynapse;
  }
  try {
    const raw = localStorage.getItem(SYNAPSE_PREFS_KEY);
    if (!raw) {
      return defaultSynapse;
    }
    const parsed = JSON.parse(raw) as Partial<SynapsePrefsV1>;
    const locale = parsed.locale === "en" ? "en" : "it";
    return { locale };
  } catch {
    return defaultSynapse;
  }
}

export function writeSynapsePrefs(prefs: SynapsePrefsV1): void {
  try {
    localStorage.setItem(SYNAPSE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function readNexaHrPrefs(): NexaHrPrefsV1 {
  if (typeof window === "undefined") {
    return defaultNexaHr;
  }
  try {
    const raw = localStorage.getItem(NEXA_HR_PREFS_KEY);
    if (!raw) {
      return defaultNexaHr;
    }
    const parsed = JSON.parse(raw) as Partial<NexaHrPrefsV1>;
    const defaultLanding =
      parsed.defaultLanding === "attendance" ? "attendance" : "dashboard";
    const hoursFormat = parsed.hoursFormat === "hm" ? "hm" : "decimal";
    let menuShortcutHrefs: string[] = [];
    if (Array.isArray(parsed.menuShortcutHrefs)) {
      menuShortcutHrefs = parsed.menuShortcutHrefs
        .filter((x): x is string => typeof x === "string" && x.startsWith("/"))
        .slice(0, 6);
    }
    return { defaultLanding, hoursFormat, menuShortcutHrefs };
  } catch {
    return defaultNexaHr;
  }
}

export function writeNexaHrPrefs(prefs: NexaHrPrefsV1): void {
  try {
    localStorage.setItem(NEXA_HR_PREFS_KEY, JSON.stringify(prefs));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(NEXA_HR_PREFS_CHANGED_EVENT));
    }
  } catch {
    // ignore
  }
}
