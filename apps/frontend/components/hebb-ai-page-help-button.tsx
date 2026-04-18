"use client";

import { useCallback, useEffect, useId, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHebbAiPageHelp, type HebbAiPageKey } from "@/lib/hebb-ai-for-hr-help";

type HebbAiPageHelpButtonProps = {
  pageKey: HebbAiPageKey;
  className?: string;
  /** Etichetta accessibile sul pulsante (default: «Guida alla pagina») */
  label?: string;
};

export function HebbAiPageHelpButton(props: HebbAiPageHelpButtonProps): JSX.Element {
  const { pageKey, className = "", label = "Guida alla pagina" } = props;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const content = getHebbAiPageHelp(pageKey);

  const close = useCallback((): void => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const modal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6"
            role="presentation"
            onClick={close}
          >
            <div
              className="absolute inset-0 bg-[color-mix(in_srgb,black_45%,transparent)] backdrop-blur-sm dark:bg-[color-mix(in_srgb,black_60%,transparent)]"
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={[
                "relative z-[1] max-h-[min(88vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6",
                "border-[color-mix(in_srgb,white_28%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_72%,transparent)]",
                "backdrop-blur-2xl dark:border-white/15 dark:bg-[color-mix(in_srgb,#0c1928_78%,transparent)]",
                "[box-shadow:0_24px_80px_-12px_rgba(0,45,114,0.25)]"
              ].join(" ")}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-[var(--prom-line)] pb-3">
                <h2 id={titleId} className="pr-2 text-lg font-semibold leading-snug text-[var(--prom-text)]">
                  {content.title}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 shrink-0 rounded-full p-0"
                  onClick={close}
                  aria-label="Chiudi guida"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--prom-muted)]">{content.summary}</p>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-text)]">Come usarla</p>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-[var(--prom-muted)]">
                  {content.howToUse.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              {content.bestPractices?.length ? (
                <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--prom-gold)_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] p-3">
                  <p className="text-xs font-semibold text-[var(--prom-text)]">Suggerimenti</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-[var(--prom-muted)]">
                    {content.bestPractices.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={[
          "h-9 w-9 shrink-0 rounded-full border-[var(--prom-line-strong)] p-0 text-[var(--prom-muted)]",
          "hover:border-[color-mix(in_srgb,var(--prom-gold)_45%,var(--prom-line))] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] hover:text-[var(--prom-text)]",
          className
        ].join(" ")}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
      >
        <HelpCircle className="h-4 w-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </Button>
      {modal}
    </>
  );
}
