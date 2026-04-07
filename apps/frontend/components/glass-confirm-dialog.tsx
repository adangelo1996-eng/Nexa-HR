"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GlassConfirmDialog(props: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}): React.JSX.Element | null {
  const {
    open,
    title = "Conferma",
    message,
    confirmLabel = "Conferma",
    cancelLabel = "Annulla",
    variant = "default",
    busy = false,
    onConfirm,
    onCancel
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xl" aria-hidden />
      <div
        className="relative z-[1] w-full max-w-md rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_78%,transparent)] p-5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)] backdrop-blur-2xl dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.55)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="glass-confirm-title"
        aria-describedby="glass-confirm-desc"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="glass-confirm-title" className="text-lg font-semibold text-[var(--prom-text)]">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-full p-1 text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface)_85%,transparent)] hover:text-[var(--prom-text)] disabled:opacity-40"
            aria-label={cancelLabel}
            disabled={busy}
            onClick={onCancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p id="glass-confirm-desc" className="mt-3 text-sm leading-relaxed text-[var(--prom-muted)]">
          {message}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            className={
              variant === "danger"
                ? "!bg-rose-600 hover:!brightness-110 dark:!bg-rose-500"
                : undefined
            }
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
