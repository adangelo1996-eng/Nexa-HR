"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { GlassConfirmDialog } from "@/components/glass-confirm-dialog";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
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

  const pending = items.filter((r) => r.status === "submitted" || r.status === "pending_hr" || r.status === "draft");
  const closed = items.filter((r) => !pending.includes(r));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Note spese</h1>
          <p className="max-w-2xl text-sm text-[var(--prom-muted)]">
            Carica ricevute, invia per rimborso e segui lo stato fino all&apos;approvazione manager e HR in{" "}
            <Link href={"/workflow" as Route} className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Workflow
            </Link>
            .
          </p>
        </div>
        <NexaPageHelpButton pageKey="expenses" />
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 shadow-[var(--card-shadow)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--prom-text)]">
            <Receipt className="h-4 w-4 text-emerald-600" aria-hidden />
            Nuova richiesta
          </div>
          <p className="text-xs text-[var(--prom-muted)]">
            Scansiona o carica file (foto/PDF). Dopo l&apos;invio il flusso è manager → HR.
          </p>
          <Link
            href={"/expenses/scan" as Route}
            className="inline-flex w-full justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Carica o scansiona
          </Link>
        </div>
        <div className="space-y-2 rounded-xl border border-dashed border-[var(--prom-line)] p-4 text-xs text-[var(--prom-muted)]">
          <p className="font-semibold text-[var(--prom-text)]">Prima di inviare</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Importo, data e categoria corretti</li>
            <li>Ricevuta leggibile (foto nitida o PDF)</li>
            <li>Descrizione breve del motivo della spesa</li>
          </ul>
          <button
            type="button"
            className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            onClick={() => {
              void (async (): Promise<void> => {
                const token = getToken();
                if (!token) return;
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
            Scarica ZIP archivio scontrini
          </button>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">In corso</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna nota spesa in attesa.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {pending.map((r) => (
              <ExpenseRow
                key={r.id}
                row={r}
                typeLabel={typeLabel}
                requesterLabel={requesterLabel}
                onDelete={() => setDeleteTarget(r)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Storico</h2>
        {closed.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna nota spesa chiusa.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {closed.map((r) => (
              <ExpenseRow
                key={r.id}
                row={r}
                typeLabel={typeLabel}
                requesterLabel={requesterLabel}
                onDelete={canDeleteOwnExpense(r.status) ? () => setDeleteTarget(r) : undefined}
              />
            ))}
          </ul>
        )}
      </section>

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

function ExpenseRow(props: {
  row: ExpenseClaimDto;
  typeLabel: (id: string) => string;
  requesterLabel: string;
  onDelete?: () => void;
}): React.JSX.Element {
  const { row: r, typeLabel, requesterLabel, onDelete } = props;
  return (
    <li className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)] p-4 shadow-[var(--card-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-medium">{r.description}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${expenseStatusBadgeClassName(r.status)}`}>
            {expenseStatusLabelIt(r.status)}
          </span>
          {onDelete ? (
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/[0.06]"
              onClick={onDelete}
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
      <WorkflowExpenseFlowDiagram variant="stacked" claim={r} requesterLabel={requesterLabel} managerLabel={null} />
      {r.hasReceipt ? (
        <div className="mt-1 text-xs text-slate-500">
          Scontrino archiviato
          {r.receiptSha256 ? ` · ${r.receiptSha256.slice(0, 12)}…` : ""}
        </div>
      ) : null}
    </li>
  );
}
