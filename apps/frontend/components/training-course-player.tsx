"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrainingAssignmentDto, TrainingCourseDto, TrainingCourseModuleDto } from "@/lib/api";

export type TrainingCoursePlayerProps = {
  course: TrainingCourseDto;
  assignment?: TrainingAssignmentDto | null;
  /** Anteprima HR: nessun salvataggio stato */
  previewMode?: boolean;
  onStatusChange?: (status: TrainingAssignmentDto["status"]) => Promise<void>;
  onComplete?: () => void;
  backHref?: string;
  backLabel?: string;
};

function moduleProgress(modules: TrainingCourseModuleDto[], moduleIndex: number, stepIndex: number): number {
  if (modules.length === 0) return 0;
  const totalSteps = modules.reduce((acc, m) => acc + Math.max(1, m.steps?.length ?? 1), 0);
  let done = 0;
  for (let i = 0; i < moduleIndex; i++) {
    done += Math.max(1, modules[i]!.steps?.length ?? 1);
  }
  done += stepIndex + 1;
  return Math.min(100, Math.round((done / totalSteps) * 100));
}

export function TrainingCoursePlayer(props: TrainingCoursePlayerProps): React.JSX.Element {
  const { course, assignment, previewMode = false, onStatusChange, onComplete, backHref, backLabel } = props;
  const modules = course.courseContent ?? [];
  const [moduleIndex, setModuleIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const currentModule = modules[moduleIndex];
  const steps = currentModule?.steps ?? [];
  const hasSteps = steps.length > 0;
  const progressPct = useMemo(() => moduleProgress(modules, moduleIndex, stepIndex), [modules, moduleIndex, stepIndex]);

  const atStart = moduleIndex === 0 && stepIndex === 0;
  const atEnd =
    modules.length === 0 ||
    (moduleIndex === modules.length - 1 && (!hasSteps || stepIndex >= steps.length - 1));

  useEffect(() => {
    if (previewMode || !onStatusChange || !assignment || assignment.status !== "not_started") return;
    void (async () => {
      setBusy(true);
      try {
        await onStatusChange("in_progress");
      } finally {
        setBusy(false);
      }
    })();
  }, [previewMode, onStatusChange, assignment]);

  const goPrev = useCallback((): void => {
    if (stepIndex > 0) {
      setStepIndex((s) => s - 1);
      return;
    }
    if (moduleIndex > 0) {
      const prev = modules[moduleIndex - 1];
      const prevSteps = prev?.steps?.length ?? 0;
      setModuleIndex((m) => m - 1);
      setStepIndex(Math.max(0, prevSteps - 1));
    }
  }, [moduleIndex, stepIndex, modules]);

  const goNext = useCallback(async (): Promise<void> => {
    if (hasSteps && stepIndex < steps.length - 1) {
      setStepIndex((s) => s + 1);
      return;
    }
    if (moduleIndex < modules.length - 1) {
      setModuleIndex((m) => m + 1);
      setStepIndex(0);
      return;
    }
    if (!previewMode && onStatusChange && assignment?.status !== "completed") {
      setBusy(true);
      try {
        await onStatusChange("completed");
        onComplete?.();
      } finally {
        setBusy(false);
      }
    }
  }, [hasSteps, stepIndex, steps.length, moduleIndex, modules.length, previewMode, onStatusChange, assignment, onComplete]);

  if (modules.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--prom-line)] px-6 py-12 text-center">
        <p className="text-sm text-[var(--prom-muted)]">Questo corso non ha ancora moduli pubblicati.</p>
        {course.description ? <p className="mt-3 text-sm text-[var(--prom-text)]">{course.description}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backHref ? (
        <a href={backHref} className="inline-block text-sm text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200">
          {backLabel ?? "← Indietro"}
        </a>
      ) : null}

      <div className="rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)] p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--prom-muted)]">
              {previewMode ? "Anteprima corso" : "Corso in corso"}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--prom-text)]">{course.title}</h2>
            {course.description ? <p className="mt-2 max-w-2xl text-sm text-[var(--prom-muted)]">{course.description}</p> : null}
          </div>
          <div className="text-right text-xs text-[var(--prom-muted)]">
            Modulo {moduleIndex + 1} / {modules.length}
            {!previewMode && assignment ? (
              <p className="mt-1">Scadenza {new Date(assignment.dueDate).toLocaleDateString("it-IT")}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-[var(--prom-muted)]">
            <span>Avanzamento</span>
            <span>{progressPct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-[#002D72] transition-all dark:bg-sky-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Moduli corso">
          {modules.map((mod, idx) => {
            const active = idx === moduleIndex;
            const done = idx < moduleIndex;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  setModuleIndex(idx);
                  setStepIndex(0);
                }}
                className={[
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                  active
                    ? "border-[#002D72] bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-[#002D72] dark:text-sky-200"
                    : "border-[var(--prom-line)] text-[var(--prom-muted)] hover:border-[#002D72]/40"
                ].join(" ")}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 opacity-50" />}
                {mod.title}
              </button>
            );
          })}
        </nav>
      </div>

      {currentModule ? (
        <article className="rounded-2xl border border-[color-mix(in_srgb,#002D72_22%,var(--prom-line))] bg-[var(--card-bg)] p-5 md:p-6">
          <h3 className="text-lg font-semibold text-[var(--prom-text)]">{currentModule.title}</h3>
          {currentModule.summary ? <p className="mt-2 text-sm leading-relaxed text-[var(--prom-muted)]">{currentModule.summary}</p> : null}

          {hasSteps ? (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
                Passo {stepIndex + 1} di {steps.length}
              </p>
              <p className="mt-3 text-base leading-relaxed text-[var(--prom-text)]">{steps[stepIndex]}</p>
              {steps.length > 1 ? (
                <ol className="mt-4 space-y-2 border-t border-[var(--prom-line)] pt-4">
                  {steps.map((step, i) => (
                    <li
                      key={step}
                      className={[
                        "flex gap-2 text-sm",
                        i === stepIndex ? "font-medium text-[var(--prom-text)]" : "text-[var(--prom-muted)]"
                      ].join(" ")}
                    >
                      <span className="font-mono text-xs opacity-60">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--prom-muted)]">Nessun passo dettagliato per questo modulo.</p>
          )}
        </article>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" disabled={atStart || busy} onClick={goPrev} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          Precedente
        </Button>
        <Button type="button" disabled={busy} onClick={() => void goNext()} className="gap-1">
          {atEnd ? (previewMode ? "Fine anteprima" : "Completa corso") : "Avanti"}
          {!atEnd ? <ChevronRight className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
