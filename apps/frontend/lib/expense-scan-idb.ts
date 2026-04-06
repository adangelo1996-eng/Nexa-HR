/** Batch fotogrammi grezzi scanner → revisione (IndexedDB: supera i limiti di sessionStorage). */

const DB = "nexa_hr_expense_scan";
const STORE = "raw_frames";
const KEY = "pending_v1";

export type ExpenseScanRawPayload = {
  /** JPEG base64 senza prefisso data: */
  framesBase64: string[];
  savedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onerror = (): void => reject(req.error ?? new Error("IDB open"));
    req.onsuccess = (): void => resolve(req.result);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function writeExpenseScanRawToIdb(payload: ExpenseScanRawPayload): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error("IDB tx"));
    tx.objectStore(STORE).put(payload, KEY);
  });
  db.close();
}

export async function readExpenseScanRawFromIdb(): Promise<ExpenseScanRawPayload | null> {
  const db = await openDb();
  const raw = await new Promise<ExpenseScanRawPayload | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = (): void => resolve(req.result as ExpenseScanRawPayload | undefined);
    req.onerror = (): void => reject(req.error ?? new Error("IDB get"));
  });
  db.close();
  return raw ?? null;
}

export async function clearExpenseScanRawFromIdb(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error("IDB tx"));
    tx.objectStore(STORE).delete(KEY);
  });
  db.close();
}
