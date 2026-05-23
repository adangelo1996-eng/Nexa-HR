"use client";

import { Button } from "@/components/ui/button";
import { pendingApprovalCategoryLabel } from "@/lib/workflow-approval-groups";

export function WorkflowPendingCategorySection(props: {
  categoryKey: string;
  itemCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  showBulkApprove?: boolean;
  bulkBusy?: boolean;
  onBulkApprove?: () => Promise<void>;
}): React.JSX.Element | null {
  const {
    categoryKey,
    itemCount,
    defaultOpen = true,
    children,
    showBulkApprove = true,
    bulkBusy = false,
    onBulkApprove
  } = props;

  if (itemCount === 0) {
    return null;
  }

  const label = pendingApprovalCategoryLabel(categoryKey);

  async function handleBulk(): Promise<void> {
    if (!onBulkApprove) {
      return;
    }
    const msg =
      itemCount === 1
        ? `Confermi l'approvazione dell'unica richiesta in «${label}»?`
        : `Confermi l'approvazione di tutte le ${itemCount} richieste in «${label}»?`;
    if (!window.confirm(msg)) {
      return;
    }
    await onBulkApprove();
  }

  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_40%,transparent)]"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="shrink-0 text-[var(--prom-muted)] transition group-open:rotate-90"
            aria-hidden
          >
            ▸
          </span>
          <h3 className="text-sm font-semibold text-[var(--prom-text)]">{label}</h3>
          <span className="rounded-full bg-[color-mix(in_srgb,var(--prom-muted)_22%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--prom-text)]">
            {itemCount}
          </span>
        </div>
        {showBulkApprove && onBulkApprove ? (
          <Button
            type="button"
            size="sm"
            disabled={bulkBusy}
            onClick={(e) => {
              e.preventDefault();
              void handleBulk();
            }}
          >
            {bulkBusy ? "Approvazione…" : `Approva tutte · ${label}`}
          </Button>
        ) : null}
      </summary>
      <div className="space-y-3 border-t border-[var(--prom-line)] px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}
