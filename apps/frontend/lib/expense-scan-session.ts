/** Trasferisce il risultato della scansione live dalla pagina dedicata al form Note spese. */

export const EXPENSE_LIVE_SCAN_STORAGE_KEY = "nexa_hr_expense_live_scan_v1";

export type ExpenseLiveScanPayload = {
  base64: string;
  mime: string;
};

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = (): void => {
      const r = reader.result;
      if (typeof r !== "string") {
        reject(new Error("readAsDataURL fallito"));
        return;
      }
      const comma = r.indexOf(",");
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    reader.onerror = (): void => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

export function writeExpenseLiveScanToSession(payload: ExpenseLiveScanPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(EXPENSE_LIVE_SCAN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota o storage disabilitato */
  }
}

/** Legge e rimuove il payload (una sola consegna al form). */
export function consumeExpenseLiveScanFromSession(): ExpenseLiveScanPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(EXPENSE_LIVE_SCAN_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  sessionStorage.removeItem(EXPENSE_LIVE_SCAN_STORAGE_KEY);
  try {
    const p = JSON.parse(raw) as unknown;
    if (
      typeof p === "object" &&
      p !== null &&
      typeof (p as ExpenseLiveScanPayload).base64 === "string" &&
      typeof (p as ExpenseLiveScanPayload).mime === "string"
    ) {
      return p as ExpenseLiveScanPayload;
    }
  } catch {
    /* ignore */
  }
  return null;
}
