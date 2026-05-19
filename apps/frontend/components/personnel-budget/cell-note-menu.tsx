"use client";

import { MessageSquarePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { patchPersonnelBudgetCellNote, type PersonnelBudgetCellNoteDto } from "@/lib/api";

export type CellNoteTarget = {
  year: number;
  month: number | null;
  userId?: string | null;
  plannedLineId?: string | null;
  fieldKey: string;
};

export function cellNoteKey(t: CellNoteTarget): string {
  return `${t.year}|${t.month ?? 0}|${t.fieldKey}|${t.userId ?? ""}|${t.plannedLineId ?? ""}`;
}

export function usePersonnelBudgetCellNotesMap(
  notes: PersonnelBudgetCellNoteDto[]
): Map<string, PersonnelBudgetCellNoteDto> {
  return new Map(notes.map((n) => [cellNoteKey(n), n]));
}

export function PersonnelBudgetCellNoteMenu({
  token,
  target,
  notesMap,
  onSaved,
  children,
  className = ""
}: {
  token: string | null;
  target: CellNoteTarget;
  notesMap: Map<string, PersonnelBudgetCellNoteDto>;
  onSaved: () => void;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const key = cellNoteKey(target);
  const existing = notesMap.get(key);

  useEffect(() => {
    setDraft(existing?.note ?? "");
  }, [existing?.note, key]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const save = useCallback(async (): Promise<void> => {
    if (!token) return;
    setBusy(true);
    try {
      await patchPersonnelBudgetCellNote(token, {
        year: target.year,
        month: target.month,
        userId: target.userId ?? null,
        plannedLineId: target.plannedLineId ?? null,
        fieldKey: target.fieldKey,
        note: draft
      });
      setOpen(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }, [token, target, draft, onSaved]);

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className}`}>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </div>
      {existing?.note?.trim() ? (
        <span className="pointer-events-none absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
      ) : null}
      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,#121a28_98%,var(--prom-surface))] p-2 shadow-xl"
          role="dialog"
          aria-label="Nota cella"
        >
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--prom-text)]">
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Aggiungi nota
          </p>
          <textarea
            className="mb-2 w-full rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-xs text-[var(--prom-text)]"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="rounded px-2 py-0.5 text-xs text-[var(--prom-muted)] hover:bg-white/5"
              onClick={() => setOpen(false)}
            >
              Annulla
            </button>
            <button
              type="button"
              className="rounded bg-[color-mix(in_srgb,var(--prom-gold)_25%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--prom-text)]"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Salvo…" : "Salva"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
