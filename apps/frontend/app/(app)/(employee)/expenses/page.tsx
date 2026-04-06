"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createWorker } from "tesseract.js";
import { ExpenseReceiptCropDialog } from "@/components/expense-receipt-crop-dialog";
import {
  createExpenseClaim,
  downloadExpenseReceiptsArchiveZip,
  fetchExpenseClaims,
  type ExpenseClaimDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
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

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export default function ExpensesPage(): React.JSX.Element {
  const router = useRouter();
  const [items, setItems] = useState<ExpenseClaimDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [description, setDescription] = useState("");
  const [expenseType, setExpenseType] = useState<string>("ristorante");
  const [expenseDate, setExpenseDate] = useState<string>(() => todayIsoLocal());
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState<"image/jpeg" | "image/png" | "image/webp" | null>(null);
  const [ocrRawText, setOcrRawText] = useState<string | null>(null);
  const [ocrSuggestedCents, setOcrSuggestedCents] = useState<number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    try {
      const rows = await fetchExpenseClaims(token, "self");
      setItems(rows);
      setError(null);
    } catch {
      setError("Impossibile caricare le note spese");
    }
  }, []);

  const runOcrOnReceipt = useCallback(async (base64: string, mime: string): Promise<void> => {
    setOcrBusy(true);
    setError(null);
    try {
      const worker = await createWorker("ita+eng");
      const blob = base64ToBlob(base64, mime);
      const {
        data: { text }
      } = await worker.recognize(blob);
      await worker.terminate();
      setOcrRawText(text);
      const guessed = guessAmountEurStringFromReceiptOcr(text);
      if (guessed) {
        setAmount(guessed);
        const euros = Number(guessed);
        if (Number.isFinite(euros)) {
          setOcrSuggestedCents(Math.round(euros * 100));
        }
      }
    } catch {
      setError("OCR non disponibile o lettura fallita");
    } finally {
      setOcrBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (cropSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(cropSrc);
      }
    };
  }, [cropSrc]);

  function onFileChosen(file: File | null): void {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }
    if (cropSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(cropSrc);
    }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCropOpen(true);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    if (!receiptBase64 || !receiptMime) {
      setError("Scansiona lo scontrino (ritaglio obbligatorio per archiviazione)");
      return;
    }
    const euros = Number(amount.replace(",", "."));
    if (!Number.isFinite(euros) || euros < 0) {
      setError("Importo non valido");
      return;
    }
    const desc = description.trim() || `Nota spese — ${EXPENSE_TYPES.find((t) => t.id === expenseType)?.label ?? expenseType}`;
    setBusy(true);
    setError(null);
    try {
      await createExpenseClaim(token, {
        amountCents: Math.round(euros * 100),
        currency,
        description: desc,
        expenseDate,
        expenseType,
        receiptBase64,
        receiptMime,
        ocrRawText: ocrRawText ?? undefined,
        ocrSuggestedCents: ocrSuggestedCents ?? undefined
      });
      setAmount("");
      setDescription("");
      setExpenseDate(todayIsoLocal());
      setReceiptBase64(null);
      setReceiptMime(null);
      setOcrRawText(null);
      setOcrSuggestedCents(null);
      if (cropSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(cropSrc);
      }
      setCropSrc(null);
      await load();
    } catch {
      setError("Invio nota spesa fallito");
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = (id: string) => EXPENSE_TYPES.find((t) => t.id === id)?.label ?? id;

  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <ExpenseReceiptCropDialog
        open={cropOpen}
        imageSrc={cropSrc}
        onClose={() => {
          setCropOpen(false);
          if (cropSrc?.startsWith("blob:")) {
            URL.revokeObjectURL(cropSrc);
          }
          setCropSrc(null);
        }}
        onConfirm={({ base64, mime }) => {
          setReceiptBase64(base64);
          setReceiptMime(mime);
          setCropOpen(false);
          if (cropSrc?.startsWith("blob:")) {
            URL.revokeObjectURL(cropSrc);
          }
          setCropSrc(null);
          void runOcrOnReceipt(base64, mime);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Note spese</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            onClick={() => {
              void (async (): Promise<void> => {
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
                  setError("Download archivio ZIP fallito");
                }
              })();
            }}
          >
            Scarica ZIP archivio
          </button>
          <Link
            href="/"
            className="inline-flex rounded-lg border border-synapse-gold/30 bg-white/70 px-3 py-2 text-sm font-medium text-synapse-text hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
          >
            Dashboard
          </Link>
        </div>
      </div>

      <form onSubmit={(ev) => void submit(ev)} className="space-y-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="text-sm font-medium">Nuova richiesta</div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Ritaglia con i quattro punti sullo scontrino. Il rimborso è previsto nel cedolino del mese successivo alla data
          spesa, dopo approvazione. L&apos;immagine è conservata con hash a fini di tracciabilità.
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-slate-500 dark:text-slate-400">
            Scontrino — foto o scansione
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={ocrBusy}
              className="mt-1 block w-full text-sm"
              onChange={(ev) => onFileChosen(ev.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={ocrBusy}
            onClick={() => router.push("/expenses/scan" as Route)}
            className="w-full rounded border border-synapse-gold/40 bg-synapse-gold/15 px-3 py-2 text-sm font-medium text-synapse-text hover:bg-synapse-gold/25 disabled:opacity-50 dark:border-synapse-gold/30 dark:text-white"
          >
            Scansiona con fotocamera (più scontrini → ritaglio e invio)
          </button>
        </div>
        {receiptBase64 ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Scontrino pronto. Puoi sostituirlo con un nuovo caricamento o scanner.
          </p>
        ) : null}
        {ocrBusy ? <p className="text-xs text-slate-500">OCR in corso sull&apos;area ritagliata…</p> : null}

        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {receiptBase64 && receiptMime ? (
            <div className="mx-auto shrink-0 md:mx-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${receiptMime};base64,${receiptBase64}`}
                alt="Anteprima scontrino"
                className="h-auto max-h-48 w-full max-w-[200px] rounded-lg border border-slate-200 object-contain dark:border-slate-600"
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-3">
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              Tipologia spesa
              <select
                value={expenseType}
                onChange={(ev) => setExpenseType(ev.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                {EXPENSE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500 dark:text-slate-400">
              Data spesa
              <input
                type="date"
                value={expenseDate}
                onChange={(ev) => setExpenseDate(ev.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Importo (€)"
                value={amount}
                onChange={(ev) => setAmount(ev.target.value)}
                className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <select
                value={currency}
                onChange={(ev) => setCurrency(ev.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>
        {ocrSuggestedCents != null ? (
          <p className="text-xs text-slate-500">
            Suggerimento OCR: {(ocrSuggestedCents / 100).toFixed(2)} € — verifica sempre prima di inviare.
          </p>
        ) : null}

        <input
          type="text"
          placeholder="Note aggiuntive (opzionale)"
          value={description}
          onChange={(ev) => setDescription(ev.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={busy || !receiptBase64}
          className="rounded bg-synapse-gold/90 px-3 py-1.5 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          {busy ? "Invio…" : "Invia"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="space-y-2 text-sm">
        {items.length === 0 ? <li className="text-slate-500">Nessuna nota spesa ancora.</li> : null}
        {items.map((r) => (
          <li key={r.id} className="rounded border border-slate-200 p-3 dark:border-slate-700">
            <div className="font-medium">{r.description}</div>
            <div className="text-slate-600 dark:text-slate-400">
              {typeLabel(r.expenseType ?? "altro")} — {(r.amountCents / 100).toFixed(2)} {r.currency} — {r.status}
              {r.expenseDate ? ` · data spesa ${r.expenseDate}` : ""}
              {r.payslipPeriod ? ` · cedolino previsto ${r.payslipPeriod}` : ""}
            </div>
            {r.hasReceipt ? (
              <div className="mt-1 text-xs text-slate-500">
                Documento archiviato
                {r.receiptSha256 ? ` · integrità SHA-256 ${r.receiptSha256.slice(0, 12)}…` : ""}
                {r.legalArchivalAt ? ` · registrato ${new Date(r.legalArchivalAt).toLocaleString("it-IT")}` : ""}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
