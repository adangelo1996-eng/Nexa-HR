"use client";

import { useCallback, useEffect, useId, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNexaPageHelp, type NexaPageHelpKey } from "@/lib/nexa-page-help";

type NexaPageHelpButtonProps = {
  pageKey: NexaPageHelpKey;
  className?: string;
  label?: string;
};

export function NexaPageHelpButton(props: NexaPageHelpButtonProps): JSX.Element {
  const { pageKey, className = "", label = "Guida pagina" } = props;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const content = getNexaPageHelp(pageKey);

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
          <HelpDialogModal titleId={titleId} content={content} onClose={close} />,
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
          "hover:border-[color-mix(in_srgb,#002D72_35%,var(--prom-line))] hover:text-[var(--prom-text)]",
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

function HelpDialogModal(props: {
  titleId: string;
  content: ReturnType<typeof getNexaPageHelp>;
  onClose: () => void;
}): JSX.Element {
  const { titleId, content, onClose } = props;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <HelpDialogBackdrop />
      <HelpDialogPanel titleId={titleId} content={content} onClose={onClose} />
    </div>
  );
}

function HelpDialogBackdrop(): JSX.Element {
  return (
    <div
      className="absolute inset-0 bg-[color-mix(in_srgb,black_45%,transparent)] backdrop-blur-sm"
      aria-hidden
    />
  );
}

function HelpDialogPanel(props: {
  titleId: string;
  content: ReturnType<typeof getNexaPageHelp>;
  onClose: () => void;
}): JSX.Element {
  const { titleId, content, onClose } = props;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="relative z-[1] max-h-[min(88vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--prom-line)] bg-[var(--card-bg)] p-5 shadow-2xl sm:p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--prom-line)] pb-3">
        <h2 id={titleId} className="pr-2 text-lg font-semibold text-[var(--prom-text)]">
          {content.title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 rounded-full p-0"
          onClick={onClose}
          aria-label="Chiudi guida"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--prom-muted)]">{content.summary}</p>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-text)]">Cosa fare qui</p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-[var(--prom-muted)]">
          {content.howToUse.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      {content.bestPractices?.length ? (
        <HelpDialogTips practices={content.bestPractices} />
      ) : null}
    </div>
  );
}

function HelpDialogTips(props: { practices: string[] }): JSX.Element {
  return (
    <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,#002D72_20%,var(--prom-line))] bg-[color-mix(in_srgb,#002D72_6%,transparent)] p-3">
      <p className="text-xs font-semibold text-[var(--prom-text)]">Suggerimenti</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-[var(--prom-muted)]">
        {props.practices.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
