import type { RecruitCvScreeningSummaryDto } from "@/lib/api";

export function screeningScoreBadgeClass(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) {
    return "border-slate-300/80 bg-slate-100 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-[#b4c9dc]";
  }
  if (score >= 70) {
    return "border-emerald-300/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (score >= 40) {
    return "border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200";
  }
  return "border-rose-300/80 bg-rose-50 text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-200";
}

export function ScreeningScoreBadge({
  score,
  compact
}: {
  score: number | null | undefined;
  compact?: boolean;
}): React.JSX.Element {
  const label = score != null && Number.isFinite(score) ? `${Math.round(score)}/100` : "—";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${compact ? "text-[10px]" : "text-xs"} ${screeningScoreBadgeClass(score)}`}
      title="Punteggio screening CV AI"
    >
      AI {label}
    </span>
  );
}

export function ScreeningSummaryList({
  summary
}: {
  summary: RecruitCvScreeningSummaryDto | null | undefined;
}): React.JSX.Element | null {
  if (!summary) return null;
  const matches = summary.matches ?? [];
  const mismatches = summary.mismatches ?? [];
  if (matches.length === 0 && mismatches.length === 0 && !summary.summary?.trim()) {
    return null;
  }
  return (
    <div className="space-y-2 text-xs text-synapse-muted dark:text-[#b4c9dc]">
      {summary.summary?.trim() ? <p className="text-sm text-synapse-text dark:text-white">{summary.summary}</p> : null}
      {matches.length > 0 ? (
        <div>
          <p className="font-medium text-emerald-700 dark:text-emerald-300">Allineamenti</p>
          <ul className="list-disc pl-4">
            {matches.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {mismatches.length > 0 ? (
        <div>
          <p className="font-medium text-amber-700 dark:text-amber-300">Gap / attenzioni</p>
          <ul className="list-disc pl-4">
            {mismatches.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
