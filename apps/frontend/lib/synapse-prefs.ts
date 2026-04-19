const SYNAPSE_PREFS_KEY = "synapse_prefs_v1";
export const NEXA_HR_PREFS_STORAGE_KEY = "nexa_hr_prefs_v1";
const NEXA_HR_PREFS_KEY = NEXA_HR_PREFS_STORAGE_KEY;
export const NEXA_HR_PREFS_CHANGED_EVENT = "nexa-hr-prefs-changed";

/** Stato apertura sezioni collassabili sidebar (persistito). */
export const NEXA_HR_SIDEBAR_SECTIONS_STORAGE_KEY = "nexa_hr_sidebar_sections_v3";

export type SynapseLocale = "it" | "en";

export interface SynapsePrefsV1 {
  locale: SynapseLocale;
}

export type NexaHrDefaultLanding = "mappa-portale" | "dashboard" | "attendance";

export interface NexaHrPrefsV1 {
  /** Vista predefinita dopo login */
  defaultLanding: NexaHrDefaultLanding;
  /** Formato ore nelle etichette */
  hoursFormat: "decimal" | "hm";
  /** Scorciatoie in cima al menu mobile (path, max 6). */
  menuShortcutHrefs?: string[];
}

const defaultSynapse: SynapsePrefsV1 = { locale: "it" };
const defaultNexaHr: NexaHrPrefsV1 = { defaultLanding: "mappa-portale", hoursFormat: "decimal", menuShortcutHrefs: [] };

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
    let defaultLanding: NexaHrDefaultLanding = "mappa-portale";
    if (parsed.defaultLanding === "dashboard") {
      defaultLanding = "dashboard";
    } else if (parsed.defaultLanding === "attendance") {
      defaultLanding = "attendance";
    } else if (parsed.defaultLanding === "mappa-portale") {
      defaultLanding = "mappa-portale";
    }
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

/** Percasso interno dopo login (password o SSO senza `next`). */
export function postLoginPathFromNexaHrPrefs(prefs: NexaHrPrefsV1): string {
  switch (prefs.defaultLanding) {
    case "dashboard":
      return "/";
    case "attendance":
      return "/attendance";
    case "mappa-portale":
    default:
      return "/mappa-portale";
  }
}

/** Dopo login: tutte le categorie menu chiuse (nuova sessione). */
export function resetNexaHrSidebarSectionsAllClosed(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(NEXA_HR_SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify({}));
  } catch {
    /* ignore */
  }
}
