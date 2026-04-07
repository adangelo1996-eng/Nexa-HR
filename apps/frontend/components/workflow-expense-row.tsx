"use client";

import { useState } from "react";
import { WorkflowExpenseFlowDiagram } from "@/components/workflow-flow-diagram";
import { WorkflowExpenseGlassModal } from "@/components/workflow-expense-glass-modal";
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

function initials(name: string): string {
  if (!name?.trim()) {
    return "?";
  }
  const p = name.trim().split(/\s+/);
  if (p.length === 1) {
    return p[0]!.slice(0, 2).toUpperCase();
  }
  return `${p[0]!.charAt(0)}${p[p.length - 1]!.charAt(0)}`.toUpperCase();
}

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
  const [detailOpen, setDetailOpen] = useState(false);
  const c = row.claim;
  const typeL = TYPE_LABELS[c.expenseType ?? "altro"] ?? c.expenseType ?? "—";
  const amount = `${(c.amountCents / 100).toFixed(2)} ${c.currency}`;

  const shell =
    variant === "history"
      ? "bg-[color-mix(in_srgb,var(--prom-surface-soft)_50%,transparent)]"
      : "bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)]";

  return (
    <div className={`rounded-lg border border-[var(--prom-line)] p-4 ${shell}`}>
      <div
        role="button"
        tabIndex={0}
        className="cursor-pointer rounded-md outline-none transition-opacity hover:opacity-[0.97] focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--prom-surface)]"
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 gap-3">
            {row.requesterPhotoUrl ? (
              <img
                src={row.requesterPhotoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-muted)_14%,transparent)] text-xs font-semibold text-[var(--prom-text)]"
                aria-hidden
              >
                {initials(row.requesterName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-[var(--prom-text)]">{row.requesterName}</p>
              <p className="text-sm text-[var(--prom-muted)]">
                {typeL}
                <span className="mx-1.5 text-[var(--prom-line)]">·</span>
                {amount}
              </p>
              {c.expenseDate ? (
                <p className="mt-0.5 text-xs text-[var(--prom-muted)]">{c.expenseDate}</p>
              ) : null}
              <p className="mt-1 line-clamp-2 text-sm text-[var(--prom-text)]">{c.description}</p>
            </div>
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
        <p className="mt-2 text-[11px] text-[var(--prom-muted)]">
          {new Date(c.createdAt).toLocaleDateString("it-CH")}
          {c.hasReceipt ? " · scontrino" : ""}
        </p>
      </div>
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
      <WorkflowExpenseGlassModal row={row} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
