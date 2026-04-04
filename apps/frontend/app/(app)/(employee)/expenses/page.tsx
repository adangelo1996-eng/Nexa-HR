"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createWorker } from "tesseract.js";
import { createExpenseClaim, fetchExpenseClaims, type ExpenseClaimDto } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function ExpensesPage(): React.JSX.Element {
  const [items, setItems] = useState<ExpenseClaimDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);

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

  useEffect(() => {
    void load();
  }, [load]);

  async function onReceiptSelected(file: File | null): Promise<void> {
    if (!file) {
      return;
    }
    setOcrBusy(true);
    setError(null);
    try {
      const worker = await createWorker("ita+eng");
      const {
        data: { text }
      } = await worker.recognize(file);
      await worker.terminate();
      const amountMatch = text.match(/(\d+[.,]\d{2})/);
      if (amountMatch) {
        setAmount(amountMatch[1].replace(",", "."));
      }
      if (!description.trim() && /km|km\.|eur/i.test(text)) {
        setDescription("Spesa da scontrino");
      }
    } catch {
      setError("OCR non disponibile");
    } finally {
      setOcrBusy(false);
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    const euros = Number(amount.replace(",", "."));
    if (!Number.isFinite(euros) || euros < 0 || !description.trim()) {
      setError("Importo e descrizione obbligatori");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createExpenseClaim(token, {
        amountCents: Math.round(euros * 100),
        currency,
        description: description.trim()
      });
      setAmount("");
      setDescription("");
      await load();
    } catch {
      setError("Invio nota spesa fallito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Note spese</h1>
        <Link
          href="/"
          className="inline-flex rounded-lg border border-synapse-gold/30 bg-white/70 px-3 py-2 text-sm font-medium text-synapse-text hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
        >
          Dashboard
        </Link>
      </div>
      <form onSubmit={(ev) => void submit(ev)} className="space-y-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="text-sm font-medium">Nuova richiesta</div>
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          Scontrino (OCR)
          <input
            type="file"
            accept="image/*"
            disabled={ocrBusy}
            className="mt-1 block w-full text-sm"
            onChange={(ev) => void onReceiptSelected(ev.target.files?.[0] ?? null)}
          />
        </label>
        {ocrBusy ? <p className="text-xs text-slate-500">Lettura immagine…</p> : null}
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Importo"
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
        <input
          type="text"
          placeholder="Descrizione"
          value={description}
          onChange={(ev) => setDescription(ev.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={busy}
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
              {(r.amountCents / 100).toFixed(2)} {r.currency} — {r.status}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
