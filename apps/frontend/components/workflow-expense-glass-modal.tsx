"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fetchExpenseClaimReceipt, type ExpenseWorkflowRowDto } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { WorkflowExpenseFlowDiagram } from "@/components/workflow-flow-diagram";

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

export function WorkflowExpenseGlassModal(props: {
  row: ExpenseWorkflowRowDto;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const { row, open, onClose } = props;
  const c = row.claim;
  const typeL = TYPE_LABELS[c.expenseType ?? "altro"] ?? c.expenseType ?? "—";
  const amount = `${(c.amountCents / 100).toFixed(2)} ${c.currency}`;
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptErr, setReceiptErr] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const receiptObjectUrlRef = useRef<string | null>(null);

  function revokeReceiptUrl(): void {
    if (receiptObjectUrlRef.current) {
      URL.revokeObjectURL(receiptObjectUrlRef.current);
      receiptObjectUrlRef.current = null;
    }
    setReceiptUrl(null);
  }

  useEffect(() => {
    if (!open) {
      revokeReceiptUrl();
      setReceiptErr(null);
      setReceiptLoading(false);
      return;
    }
    if (!c.hasReceipt) {
      setReceiptErr(null);
      setReceiptLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setReceiptErr("Sessione non valida.");
      return;
    }
    let cancelled = false;
    setReceiptLoading(true);
    setReceiptErr(null);
    revokeReceiptUrl();
    void fetchExpenseClaimReceipt(token, c.id)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const url = URL.createObjectURL(blob);
        receiptObjectUrlRef.current = url;
        setReceiptUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setReceiptErr("Impossibile caricare lo scontrino.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReceiptLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (receiptObjectUrlRef.current) {
        URL.revokeObjectURL(receiptObjectUrlRef.current);
        receiptObjectUrlRef.current = null;
      }
    };
  }, [open, c.id, c.hasReceipt]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-md transition-opacity"
        aria-hidden
      />
      <div
        className="relative z-[1] flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_72%,transparent)] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-glass-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--prom-line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="expense-glass-modal-title" className="text-lg font-semibold text-[var(--prom-text)]">
              Nota spesa
            </h2>
            <p className="mt-1 text-sm text-[var(--prom-muted)]">
              <span className="text-[var(--prom-text)]">{row.requesterName}</span>
              <span className="mx-1.5 text-[var(--prom-line)]">·</span>
              {typeL}
              <span className="mx-1.5 text-[var(--prom-line)]">·</span>
              {amount}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 rounded-full p-0"
            onClick={onClose}
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
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
          {c.expenseDate ? (
            <p className="mt-3 text-sm text-[var(--prom-muted)]">Data spesa: {c.expenseDate}</p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-[var(--prom-text)]">{c.description}</p>
          <div className="mt-4">
            <WorkflowExpenseFlowDiagram
              claim={c}
              requesterLabel={row.requesterName}
              managerLabel={row.firstLineManagerName}
            />
          </div>
          <p className="mt-3 text-xs text-[var(--prom-muted)]">
            Inserita: {new Date(c.createdAt).toLocaleString("it-CH")}
            {c.hasReceipt ? " · con allegato scontrino" : ""}
          </p>
          {c.hasReceipt ? (
            <div className="mt-5 rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_50%,transparent)] p-3 backdrop-blur-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                Allegato
              </p>
              {receiptLoading ? (
                <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
              ) : receiptErr ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{receiptErr}</p>
              ) : receiptUrl ? (
                <img
                  src={receiptUrl}
                  alt="Scontrino"
                  className="max-h-[min(50dvh,22rem)] w-auto max-w-full rounded-lg border border-[var(--prom-line)] object-contain"
                />
              ) : null}
            </div>
          ) : (
            <p className="mt-5 text-sm text-[var(--prom-muted)]">Nessun allegato per questa nota spesa.</p>
          )}
        </div>
      </div>
    </div>
  );
}
