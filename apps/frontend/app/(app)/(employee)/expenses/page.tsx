"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GlassConfirmDialog } from "@/components/glass-confirm-dialog";
import { WorkflowExpenseFlowDiagram } from "@/components/workflow-flow-diagram";
import {
  deleteExpenseClaim,
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

function canDeleteOwnExpense(status: string): boolean {
  return status === "draft" || status === "submitted" || status === "pending_hr" || status === "rejected";
}

export default function ExpensesPage(): React.JSX.Element {
  const [items, setItems] = useState<ExpenseClaimDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requesterLabel, setRequesterLabel] = useState<string>("Tu");
  const [deleteTarget, setDeleteTarget] = useState<ExpenseClaimDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Note spese</h1>
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
            href="/mappa-portale"
            className="inline-flex rounded-lg border border-synapse-gold/30 bg-white/70 px-3 py-2 text-sm font-medium text-synapse-text hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
          >
            Dashboard
          </Link>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 shadow-[var(--card-shadow)]">
        <div className="text-sm font-medium text-[var(--prom-text)]">Nuova richiesta</div>
        <p className="text-xs text-[var(--prom-muted)]">
          Scontrini da file o foto, ritaglio per richiesta. Flusso{" "}
          <span className="font-medium text-slate-800 dark:text-slate-200">manager → HR</span>; stato in{" "}
          <Link href={"/workflow" as Route} className="font-medium text-emerald-700 underline dark:text-emerald-400">
            Workflow
          </Link>
          .
        </p>
        <Link
          href={"/expenses/scan" as Route}
          className="inline-flex w-full justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Carica o scansiona
        </Link>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="space-y-3 text-sm">
        {items.length === 0 ? (
          <li className="text-[var(--prom-muted)]">Nessuna nota spesa ancora.</li>
        ) : null}
        {items.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)] p-4 shadow-[var(--card-shadow)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="font-medium">{r.description}</div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${expenseStatusBadgeClassName(r.status)}`}>
                  {expenseStatusLabelIt(r.status)}
                </span>
                {canDeleteOwnExpense(r.status) ? (
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                    onClick={() => setDeleteTarget(r)}
                  >
                    Elimina
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-1 text-[var(--prom-muted)]">
              {typeLabel(r.expenseType ?? "altro")} — {(r.amountCents / 100).toFixed(2)} {r.currency}
              {r.expenseDate ? ` · data spesa ${r.expenseDate}` : ""}
              {r.payslipPeriod ? ` · cedolino previsto ${r.payslipPeriod}` : ""}
            </div>
            <WorkflowExpenseFlowDiagram
              variant="stacked"
              claim={r}
              requesterLabel={requesterLabel}
              managerLabel={null}
            />
            {r.hasReceipt ? (
              <div className="mt-1 text-xs text-slate-500">
                Scontrino archiviato
                {r.receiptSha256 ? ` · ${r.receiptSha256.slice(0, 12)}…` : ""}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <GlassConfirmDialog
        open={deleteTarget !== null}
        title="Eliminare la nota spesa?"
        message={
          deleteTarget
            ? `Verrà rimossa solo questa richiesta e il relativo allegato (nessun altro dato). ${deleteTarget.description.slice(0, 120)}${deleteTarget.description.length > 120 ? "…" : ""}`
            : ""
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        variant="danger"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={async () => {
          const token = getToken();
          const row = deleteTarget;
          if (!token || !row) return;
          setDeleteBusy(true);
          setError(null);
          try {
            await deleteExpenseClaim(token, row.id);
            setDeleteTarget(null);
            await load();
          } catch {
            setError("Eliminazione non riuscita");
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </main>
  );
}
