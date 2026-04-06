"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ReceiptLiveScanner } from "@/components/receipt-live-scanner";
import { blobToBase64 } from "@/lib/expense-scan-session";
import { writeExpenseScanRawToIdb } from "@/lib/expense-scan-idb";
import { receiptFileToScanJpegBlob } from "@/lib/receipt-file-to-scan-blob";

type PendingItem = {
  id: string;
  blob: Blob;
  previewUrl: string;
};

export default function ExpenseReceiptScanPage(): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [navBusy, setNavBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingItem[]>([]);
  pendingRef.current = pending;

  useEffect(() => {
    return (): void => {
      for (const p of pendingRef.current) {
        URL.revokeObjectURL(p.previewUrl);
      }
    };
  }, []);

  function removePending(id: string): void {
    setPending((prev) => {
      const x = prev.find((p) => p.id === id);
      if (x) {
        URL.revokeObjectURL(x.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function onArchiveFiles(files: FileList | null): Promise<void> {
    if (!files?.length) {
      return;
    }
    setFileBusy(true);
    setError(null);
    const added: PendingItem[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) {
          continue;
        }
        try {
          const blob = await receiptFileToScanJpegBlob(file);
          added.push({
            id: crypto.randomUUID(),
            blob,
            previewUrl: URL.createObjectURL(blob)
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "errore lettura file";
          setError(`${file.name}: ${msg}`);
        }
      }
      if (added.length > 0) {
        setPending((p) => [...p, ...added]);
      }
    } finally {
      setFileBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function goToCropStep(): Promise<void> {
    if (pending.length === 0) {
      setError("Aggiungi almeno una scansione dall’archivio o dalla fotocamera.");
      return;
    }
    setNavBusy(true);
    setError(null);
    try {
      const framesBase64 = await Promise.all(pending.map((p) => blobToBase64(p.blob)));
      await writeExpenseScanRawToIdb({
        framesBase64,
        savedAt: new Date().toISOString()
      });
      router.replace("/expenses/scan/review" as Route);
    } catch {
      setError("Impossibile preparare il passo ritaglio. Riprova.");
      setNavBusy(false);
    }
  }

  return (
    <>
      <ReceiptLiveScanner
        open={cameraOpen}
        variant="page"
        onClose={() => setCameraOpen(false)}
        onSessionComplete={async (blobs) => {
          const added: PendingItem[] = blobs.map((blob) => ({
            id: crypto.randomUUID(),
            blob,
            previewUrl: URL.createObjectURL(blob)
          }));
          setPending((prev) => [...prev, ...added]);
          setCameraOpen(false);
        }}
      />

      {!cameraOpen ? (
        <main className="mx-auto min-h-[100dvh] max-w-lg space-y-5 p-4 pb-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/expenses"
              className="text-sm text-slate-600 underline-offset-2 hover:underline dark:text-slate-400"
            >
              ← Note spese
            </Link>
          </div>

          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Acquisisci scontrini</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              1) Carica file dall&apos;archivio (PDF o immagine) e/o scatta foto con la fotocamera. 2) Rimuovi le
              anteprime che non ti servono. 3) Vai al ritaglio per ritagliare ogni scansione prima dell&apos;invio.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept="image/*,.pdf,application/pdf,.heic,.heif"
            multiple
            disabled={fileBusy || navBusy}
            onChange={(ev) => void onArchiveFiles(ev.target.files)}
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={fileBusy || navBusy}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 rounded-lg border border-synapse-gold/40 bg-synapse-gold/15 px-4 py-3 text-sm font-medium text-synapse-text hover:bg-synapse-gold/25 disabled:opacity-50 dark:border-synapse-gold/30 dark:text-white"
            >
              {fileBusy ? "Lettura file…" : "Scegli dall’archivio"}
            </button>
            <button
              type="button"
              disabled={navBusy}
              onClick={() => setCameraOpen(true)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              Scansiona con fotocamera
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            PDF: viene usata la prima pagina, convertita in immagine. Formati immagine: JPEG, PNG, WebP; altri tipi
            dipendono dal browser.
          </p>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                In coda ({pending.length})
              </span>
              {pending.length > 0 ? (
                <button
                  type="button"
                  className="text-xs text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
                  onClick={() => {
                    setPending((prev) => {
                      for (const p of prev) {
                        URL.revokeObjectURL(p.previewUrl);
                      }
                      return [];
                    });
                  }}
                >
                  Svuota tutto
                </button>
              ) : null}
            </div>

            {pending.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                Nessuna scansione. Usa i pulsanti sopra.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {pending.map((p, idx) => (
                  <li
                    key={p.id}
                    className="relative overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.previewUrl} alt="" className="aspect-[3/4] w-full object-cover" />
                    <div className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                      {idx + 1}
                    </div>
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-500"
                      onClick={() => removePending(p.id)}
                      aria-label={`Rimuovi scansione ${idx + 1}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            disabled={pending.length === 0 || navBusy}
            onClick={() => void goToCropStep()}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {navBusy ? "Preparazione…" : "Continua al ritaglio"}
          </button>
        </main>
      ) : null}
    </>
  );
}
