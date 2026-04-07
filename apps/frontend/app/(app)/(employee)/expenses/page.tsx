"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WorkflowExpenseFlowDiagram } from "@/components/workflow-flow-diagram";
import {
  downloadExpenseReceiptsArchiveZip,
  fetchExpenseClaims,
  type ExpenseClaimDto
} from "@/lib/api";
import { expenseStatusBadgeClassName, expenseStatusLabelIt } from "@/lib/expense-status-ui";
import { getSessionUser, getToken } from "@/lib/auth-session";

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

export default function ExpensesPage(): React.JSX.Element {
  const [items, setItems] = useState<ExpenseClaimDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requesterLabel, setRequesterLabel] = useState<string>("Tu");

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

  useEffect(() => {
    const me = getSessionUser();
    setRequesterLabel(me?.fullName?.trim() || me?.email || "Tu");
  }, []);

  const typeLabel = (id: string) => EXPENSE_TYPES.find((t) => t.id === id)?.label ?? id;

  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
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

      <div className="space-y-3 rounded border border-slate-200 p-4 dark:border-slate-700">
        <div className="text-sm font-medium">Nuova richiesta</div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Carica file dall&apos;archivio (PDF o immagine) e/o scatta una o più foto, poi ritaglia ogni scontrino prima
          dell&apos;invio. Dopo l&apos;invio la richiesta segue il flusso{" "}
          <span className="font-medium text-slate-800 dark:text-slate-200">responsabile → HR</span>
          {", "}
          poi il rimborso può confluire nel cedolino del mese successivo alla data spesa. Senza responsabile in
          anagrafica la richiesta va diretta a HR. Puoi seguire lo stato anche in{" "}
          <Link href={"/workflow" as Route} className="font-medium text-emerald-700 underline dark:text-emerald-400">
            Workflow
          </Link>
          .
        </p>
        <Link
          href={"/expenses/scan" as Route}
          className="inline-flex w-full justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Carica o scansiona scontrini
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="space-y-2 text-sm">
        {items.length === 0 ? <li className="text-slate-500">Nessuna nota spesa ancora.</li> : null}
        {items.map((r) => (
          <li key={r.id} className="rounded border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="font-medium">{r.description}</div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${expenseStatusBadgeClassName(r.status)}`}
              >
                {expenseStatusLabelIt(r.status)}
              </span>
            </div>
            <div className="mt-1 text-slate-600 dark:text-slate-400">
              {typeLabel(r.expenseType ?? "altro")} — {(r.amountCents / 100).toFixed(2)} {r.currency}
              {r.expenseDate ? ` · data spesa ${r.expenseDate}` : ""}
              {r.payslipPeriod ? ` · cedolino previsto ${r.payslipPeriod}` : ""}
            </div>
            <WorkflowExpenseFlowDiagram claim={r} requesterLabel={requesterLabel} managerLabel={null} />
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
