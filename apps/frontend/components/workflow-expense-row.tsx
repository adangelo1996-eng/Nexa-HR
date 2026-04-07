"use client";

import { WorkflowExpenseFlowDiagram } from "@/components/workflow-flow-diagram";
import { Button } from "@/components/ui/button";
import type { ExpenseWorkflowRowDto } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  ristorante: "Ristorante / pasti",
  autostrada: "Autostrada",
  hotel: "Hotel",
  carburante: "Carburante",
  trasporti: "Trasporti",
  parcheggio: "Parcheggio",
  materiale: "Materiale",
  altro: "Altro"
};

function statusLabel(s: string): string {
  switch (s) {
    case "submitted":
      return "In attesa responsabile";
    case "pending_hr":
      return "In attesa HR";
    case "approved":
      return "Approvata";
    case "paid":
      return "Pagata";
    case "rejected":
      return "Rifiutata";
    default:
      return s;
  }
}

export function WorkflowExpenseRow(props: {
  row: ExpenseWorkflowRowDto;
  variant: "queue_manager" | "queue_hr" | "mine" | "history";
  showActions: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  busy?: boolean;
}): React.JSX.Element {
  const { row, variant, showActions, onApprove, onReject, busy } = props;
  const c = row.claim;
  const typeL = TYPE_LABELS[c.expenseType ?? "altro"] ?? c.expenseType ?? "—";
  const amount = `${(c.amountCents / 100).toFixed(2)} ${c.currency}`;

  const shell =
    variant === "history"
      ? "bg-[color-mix(in_srgb,var(--prom-surface-soft)_50%,transparent)]"
      : "bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)]";

  return (
    <div className={`rounded-lg border border-[var(--prom-line)] p-4 ${shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-[var(--prom-text)]">Nota spesa</p>
          <p className="text-sm text-[var(--prom-muted)]">
            <span className="text-[var(--prom-text)]">{row.requesterName}</span>
            <span className="mx-1.5 text-[var(--prom-line)]">·</span>
            {typeL}
            <span className="mx-1.5 text-[var(--prom-line)]">·</span>
            {amount}
          </p>
          {c.expenseDate ? (
            <p className="mt-0.5 text-xs text-[var(--prom-muted)]">Data spesa: {c.expenseDate}</p>
          ) : null}
          <p className="mt-1 text-sm text-[var(--prom-text)]">{c.description}</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
            c.status === "approved" || c.status === "paid"
              ? "bg-emerald-100/90 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200"
              : c.status === "rejected"
                ? "bg-rose-100/90 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200"
                : "bg-[color-mix(in_srgb,var(--prom-muted)_25%,transparent)] text-[var(--prom-text)]"
          }`}
        >
          {statusLabel(c.status)}
        </span>
      </div>
      <WorkflowExpenseFlowDiagram
        claim={c}
        requesterLabel={row.requesterName}
        managerLabel={row.firstLineManagerName}
      />
      {variant !== "history" ? (
        <p className="mt-2 text-xs text-[var(--prom-muted)]">
          Inserita: {new Date(c.createdAt).toLocaleString("it-CH")}
          {c.hasReceipt ? " · con scontrino" : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[var(--prom-muted)]">{new Date(c.createdAt).toLocaleString("it-CH")}</p>
      )}
      {showActions && onApprove && onReject ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
            Approva
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onReject}>
            Rifiuta
          </Button>
        </div>
      ) : null}
    </div>
  );
}
