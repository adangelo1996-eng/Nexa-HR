"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createWorker } from "tesseract.js";
import { ReceiptStillQuadEditor } from "@/components/receipt-still-quad-editor";
import {
  createExpenseClaimsBatch,
  downloadExpenseReceiptsArchiveZip,
  downloadExpenseReceiptsBatchZip,
  type ExpenseClaimDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { clearExpenseScanRawFromIdb, readExpenseScanRawFromIdb } from "@/lib/expense-scan-idb";
import { guessAmountEurStringFromReceiptOcr } from "@/lib/expense-ocr";

const EXPENSE_TYPES = [
  { id: "ristorante", label: "Ristorante / pasti" },
  { id: "autostrada", label: "Autostrada / pedaggio" },
  { id: "hotel", label: "Hotel / pernottamento" },
  { id: "carburante", label: "Carburante" },
  { id: "trasporti", label: "Trasporti (taxi, treno, volo)" },
  { id: "parcheggio", label: "Parcheggio" },
  { id: "materiale", label: "Materiale / cancelleria" },
  { id: "altro", label: "Altro" }
] as const;

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function payslipMonthLabelFromExpenseDate(isoDate: string): string {
  const [ys, ms] = isoDate.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) {
    return "—";
  }
  const next = new Date(y, mo, 1);
  return next.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function blobToBase64Raw(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error("read fail"));
    r.readAsDataURL(blob);
  });
}

type RowDraft = {
  id: string;
  previewUrl: string;
  receiptBase64: string;
  expenseType: string;
  expenseDate: string;
  amount: string;
  ocrRawText: string | null;
  ocrSuggestedCents: number | null;
  validated: boolean;
};

export default function ExpenseScanReviewPage(): React.JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<"load" | "crop" | "form">("load");
  const [rawFrames, setRawFrames] = useState<string[]>([]);
  const [cropIndex, setCropIndex] = useState(0);
  const [cropped, setCropped] = useState<RowDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSubmittedIds, setLastSubmittedIds] = useState<string[] | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  /** Feedback minimo su azioni riga (sync ma pesanti da renderizzare). */
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      const payload = await readExpenseScanRawFromIdb();
      if (!payload?.framesBase64?.length) {
        router.replace("/expenses/scan" as Route);
        return;
      }
      setRawFrames(payload.framesBase64);
      setCropIndex(0);
      setPhase("crop");
    })();
  }, [router]);

  useEffect(() => {
    if (!saveFeedback) {
      return;
    }
    const t = window.setTimeout(() => setSaveFeedback(null), 7000);
    return () => window.clearTimeout(t);
  }, [saveFeedback]);

  const runOcr = useCallback(async (base64: string): Promise<{ text: string | null; cents: number | null }> => {
    try {
      const worker = await createWorker("ita+eng");
      const blob = base64ToBlob(base64, "image/jpeg");
      const {
        data: { text }
      } = await worker.recognize(blob);
      await worker.terminate();
      const guessed = guessAmountEurStringFromReceiptOcr(text);
      let cents: number | null = null;
      if (guessed) {
        const euros = Number(guessed.replace(",", "."));
        if (Number.isFinite(euros)) {
          cents = Math.round(euros * 100);
        }
      }
      return { text, cents };
    } catch {
      return { text: null, cents: null };
    }
  }, []);

  const onCropConfirm = useCallback(
    async (blob: Blob): Promise<void> => {
      const b64 = await blobToBase64Raw(blob);
      const url = URL.createObjectURL(blob);
      const { text, cents } = await runOcr(b64);
      const euros = cents != null ? (cents / 100).toFixed(2) : "";
      const row: RowDraft = {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        previewUrl: url,
        receiptBase64: b64,
        expenseType: "ristorante",
        expenseDate: todayIsoLocal(),
        amount: euros,
        ocrRawText: text,
        ocrSuggestedCents: cents,
        validated: false
      };
      setCropped((prev) => {
        const n = prev.length + 1;
        queueMicrotask(() =>
          setSaveFeedback(
            `Ritaglio salvato in elenco locale (${n} di ${rawFrames.length}). Immagine compressa; non è ancora sul server — compila e valida ogni riga, poi «Invia».`
          )
        );
        return [...prev, row];
      });
      setCropIndex((i) => i + 1);
    },
    [runOcr, rawFrames.length]
  );

  useEffect(() => {
    if (phase === "crop" && rawFrames.length > 0 && cropIndex >= rawFrames.length) {
      setPhase("form");
    }
  }, [phase, cropIndex, rawFrames.length]);

  const onCropCancel = useCallback((): void => {
    setRawFrames((frames) => {
      if (frames.length === 0) {
        return frames;
      }
      const next = frames.filter((_, j) => j !== cropIndex);
      if (next.length === 0) {
        void clearExpenseScanRawFromIdb();
        router.replace("/expenses" as Route);
        queueMicrotask(() => setCropIndex(0));
        return next;
      }
      const newIdx = Math.min(cropIndex, next.length - 1);
      queueMicrotask(() => setCropIndex(newIdx));
      return next;
    });
  }, [cropIndex, router]);

  const removeRow = useCallback((id: string): void => {
    setCropped((rows) => {
      const row = rows.find((r) => r.id === id);
      if (row?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(row.previewUrl);
      }
      return rows.filter((r) => r.id !== id);
    });
  }, []);

  const ROW_ACTION_MIN_MS = 240;

  const withRowActionFeedback = useCallback((rowId: string, action: () => void): void => {
    setRowActionId(rowId);
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    action();
    const elapsed = typeof performance !== "undefined" ? performance.now() - t0 : 0;
    const wait = Math.max(0, ROW_ACTION_MIN_MS - elapsed);
    window.setTimeout(() => setRowActionId(null), wait);
  }, []);

  const updateRow = useCallback((id: string, patch: Partial<RowDraft>): void => {
    setCropped((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const validatedRows = cropped.filter((r) => r.validated);
  const totalCents = validatedRows.reduce((s, r) => {
    const e = Number(r.amount.replace(",", "."));
    return s + (Number.isFinite(e) ? Math.round(e * 100) : 0);
  }, 0);

  async function submitBatch(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    const toSend = cropped.filter((r) => r.validated);
    if (toSend.length === 0) {
      setError("Conferma almeno una riga con «Valida».");
      return;
    }
    for (const r of toSend) {
      const e = Number(r.amount.replace(",", "."));
      if (!Number.isFinite(e) || e < 0) {
        setError("Importo non valido su una riga validata.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const items = toSend.map((r) => {
        const euros = Number(r.amount.replace(",", "."));
        const desc =
          `Nota spese — ${EXPENSE_TYPES.find((t) => t.id === r.expenseType)?.label ?? r.expenseType}`.slice(0, 2000);
        return {
          amountCents: Math.round(euros * 100),
          currency: "EUR",
          description: desc,
          expenseDate: r.expenseDate,
          expenseType: r.expenseType,
          receiptBase64: r.receiptBase64,
          receiptMime: "image/jpeg" as const,
          ocrRawText: r.ocrRawText ?? undefined,
          ocrSuggestedCents: r.ocrSuggestedCents ?? undefined
        };
      });
      const { items: created } = await createExpenseClaimsBatch(token, items);
      setLastSubmittedIds(created.map((c: ExpenseClaimDto) => c.id));
      await clearExpenseScanRawFromIdb();
      for (const r of cropped) {
        if (r.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(r.previewUrl);
        }
      }
      setCropped([]);
      setPhase("form");
    } catch {
      setError("Invio note spese fallito.");
    } finally {
      setBusy(false);
    }
  }

  async function saveArchiveZip(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    try {
      const blob = await downloadExpenseReceiptsArchiveZip(token);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "scontrini-archivio.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Download archivio fallito.");
    }
  }

  async function saveBatchZip(): Promise<void> {
    const token = getToken();
    if (!token || !lastSubmittedIds?.length) {
      return;
    }
    try {
      const blob = await downloadExpenseReceiptsBatchZip(token, lastSubmittedIds);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "scontrini-batch.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Download ZIP batch fallito.");
    }
  }

  if (phase === "load") {
    return (
      <main className="mx-auto max-w-lg p-6 text-slate-600 dark:text-slate-400">
        Caricamento…
      </main>
    );
  }

  if (phase === "crop" && rawFrames.length > 0 && cropIndex < rawFrames.length) {
    const src = `data:image/jpeg;base64,${rawFrames[cropIndex]}`;
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center bg-slate-950 p-4">
        {saveFeedback ? (
          <div
            className="mb-4 w-full max-w-lg rounded-lg border border-emerald-600/50 bg-emerald-950/80 px-3 py-2 text-center text-sm text-emerald-100"
            role="status"
            aria-live="polite"
          >
            {saveFeedback}
          </div>
        ) : null}
        <p className="mb-3 text-center text-xs text-slate-400">
          Ritaglio {cropIndex + 1} di {rawFrames.length}
        </p>
        <ReceiptStillQuadEditor
          imageSrc={src}
          onCancel={onCropCancel}
          onConfirm={(blob) => onCropConfirm(blob)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {saveFeedback ? (
        <div
          className="rounded-lg border border-emerald-600/50 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-100"
          role="status"
          aria-live="polite"
        >
          {saveFeedback}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Revisione note spese</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/expenses"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
          >
            Torna alle note spese
          </Link>
          <button
            type="button"
            className="rounded-lg border border-synapse-gold/40 bg-synapse-gold/15 px-3 py-1.5 text-sm"
            onClick={() => void saveArchiveZip()}
          >
            Scarica archivio ZIP
          </button>
        </div>
      </div>

      {lastSubmittedIds ? (
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-4 text-sm">
          <p className="font-medium text-emerald-200">Invio completato.</p>
          <button
            type="button"
            className="mt-2 block text-emerald-300 underline"
            onClick={() => void saveBatchZip()}
          >
            Scarica ZIP degli scontrini appena inviati
          </button>
          <Link href="/expenses" className="mt-3 inline-block text-emerald-200 underline">
            Torna alle note spese
          </Link>
        </div>
      ) : null}

      <p className="text-xs text-slate-600 dark:text-slate-400">
        Per ogni scontrino: compila tipologia, data spesa e importo, poi «Valida». Il rimborso è previsto nel cedolino
        del mese successivo alla data spesa (es. {payslipMonthLabelFromExpenseDate(todayIsoLocal())}), dopo approvazione.
      </p>

      {cropped.length === 0 && !lastSubmittedIds ? (
        <p className="text-slate-500">Nessuna riga da mostrare.</p>
      ) : null}

      <ul className="space-y-6">
        {cropped.map((r) => (
          <li
            key={r.id}
            aria-busy={rowActionId === r.id}
            className={`rounded-xl border p-4 transition-opacity md:grid md:grid-cols-[minmax(0,220px)_1fr] md:gap-6 ${
              r.validated ? "border-emerald-600/40 bg-emerald-950/10" : "border-slate-200 dark:border-slate-700"
            } ${rowActionId === r.id ? "opacity-90" : ""}`}
          >
            <div className="mb-4 flex justify-center md:mb-0 md:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.previewUrl}
                alt="Anteprima scontrino"
                className="max-h-64 w-full max-w-[220px] rounded-lg object-contain"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <label className="block text-xs text-slate-500">
                Tipologia
                <select
                  value={r.expenseType}
                  disabled={rowActionId === r.id}
                  onChange={(ev) => updateRow(r.id, { expenseType: ev.target.value })}
                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
                >
                  {EXPENSE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-500">
                Data spesa
                <input
                  type="date"
                  value={r.expenseDate}
                  disabled={rowActionId === r.id}
                  onChange={(ev) => updateRow(r.id, { expenseDate: ev.target.value })}
                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <p className="text-[11px] text-slate-500">
                Cedolino previsto: {payslipMonthLabelFromExpenseDate(r.expenseDate)}
              </p>
              <label className="block text-xs text-slate-500">
                Importo (€)
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.amount}
                  disabled={rowActionId === r.id}
                  onChange={(ev) => updateRow(r.id, { amount: ev.target.value })}
                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              {r.ocrSuggestedCents != null ? (
                <p className="text-xs text-slate-500">
                  Suggerimento OCR: {(r.ocrSuggestedCents / 100).toFixed(2)} €
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-[2.25rem] min-w-[7.5rem] items-center justify-center gap-2 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-80"
                  disabled={rowActionId === r.id}
                  onClick={() =>
                    withRowActionFeedback(r.id, () => updateRow(r.id, { validated: true }))
                  }
                >
                  {rowActionId === r.id ? (
                    <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : null}
                  Valida riga
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[2.25rem] min-w-[10rem] items-center justify-center gap-2 rounded border border-slate-400 px-3 py-1.5 text-sm disabled:cursor-wait disabled:opacity-80"
                  disabled={rowActionId === r.id}
                  onClick={() =>
                    withRowActionFeedback(r.id, () => updateRow(r.id, { validated: false }))
                  }
                >
                  {rowActionId === r.id ? (
                    <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : null}
                  Annulla validazione
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[2.25rem] items-center justify-center gap-2 rounded border border-red-500/50 px-3 py-1.5 text-sm text-red-600 disabled:cursor-wait disabled:opacity-80 dark:text-red-400"
                  disabled={rowActionId === r.id}
                  onClick={() =>
                    withRowActionFeedback(r.id, () => removeRow(r.id))
                  }
                >
                  {rowActionId === r.id ? (
                    <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : null}
                  Rimuovi scontrino
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {cropped.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="text-sm font-medium">
            Totale note validate: {(totalCents / 100).toFixed(2)} €
          </div>
          <button
            type="button"
            disabled={busy || validatedRows.length === 0}
            className="rounded bg-synapse-gold/90 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            onClick={() => void submitBatch()}
          >
            {busy ? "Invio…" : "Invia note validate"}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </main>
  );
}
