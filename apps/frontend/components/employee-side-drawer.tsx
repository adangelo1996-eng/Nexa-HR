"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, type JSX } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EmployeeDrawerSubject = {
  userId: string;
  fullName: string;
  email?: string | null;
  roleName?: string | null;
};

type EmployeeSideDrawerProps = {
  subject: EmployeeDrawerSubject | null;
  onClose: () => void;
};

export function EmployeeSideDrawer(props: EmployeeSideDrawerProps): JSX.Element | null {
  const { subject, onClose } = props;

  useEffect(() => {
    if (!subject) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [subject, onClose]);

  if (!subject) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
        aria-label="Chiudi pannello"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-md flex-col border-l border-[var(--prom-line)] bg-[var(--card-bg)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Scheda ${subject.fullName}`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--prom-line)] px-5 py-4">
          <div>
            <p className="text-lg font-semibold text-[var(--prom-text)]">{subject.fullName}</p>
            {subject.roleName ? <p className="mt-1 text-sm text-[var(--prom-muted)]">{subject.roleName}</p> : null}
            {subject.email ? (
              <a
                href={`mailto:${subject.email}`}
                className="mt-2 block text-sm text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
              >
                {subject.email}
              </a>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9 w-9 shrink-0 rounded-full p-0" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Chiudi</span>
          </Button>
        </header>
        <DrawerBody userId={subject.userId} onClose={onClose} />
      </aside>
    </>
  );
}

function DrawerBody(props: { userId: string; onClose: () => void }): JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
      <p className="text-sm text-[var(--prom-muted)]">
        Anteprima rapida dalla struttura organizzativa. Apri la scheda completa per anagrafica e storico (se autorizzato).
      </p>
      <Link href={`/employee/${encodeURIComponent(props.userId)}` as Route} className="inline-flex" onClick={props.onClose}>
        <Button type="button" className="w-full">
          Apri scheda dipendente
        </Button>
      </Link>
    </div>
  );
}
