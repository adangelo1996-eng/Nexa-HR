"use client";

import { Loader2 } from "lucide-react";

export type NexaAsyncLoadingMessage = "Caricamento..." | "Generazione AI..." | (string & {});

export function NexaAsyncLoadingOverlay(props: {
  open: boolean;
  message: NexaAsyncLoadingMessage;
}): React.JSX.Element | null {
  if (!props.open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="presentation"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" aria-hidden />
      <div
        className="relative z-[1] flex min-w-[220px] max-w-sm flex-col items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_82%,transparent)] px-6 py-5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
        role="status"
      >
        <Loader2 className="h-7 w-7 animate-spin text-[#002D72] dark:text-sky-200" aria-hidden />
        <p className="text-center text-sm font-medium text-[var(--prom-text)]">{props.message}</p>
      </div>
    </div>
  );
}
