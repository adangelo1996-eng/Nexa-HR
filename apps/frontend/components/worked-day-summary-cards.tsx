"use client";

import type { WorkdaySummary } from "@/lib/api";
import type { SessionUser } from "@/lib/auth-session";

const WEEKDAY_SHORT_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const;

function workedSecondsFromSummary(row: WorkdaySummary): number {
  if (row.workedSeconds != null && row.workedSeconds >= 0) {
    return row.workedSeconds;
  }
  return Math.max(0, row.minutesWorked * 60);
}

function formatSecondsHm(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function weekdayShortIt(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return WEEKDAY_SHORT_IT[d.getDay()] ?? "";
}

/** Mese abbreviato (es. «gen», «feb») coerente con la lingua UI. */
function monthShortIt(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("it-IT", { month: "short" }).replace(/\.$/, "");
}

function modeLabel(row: WorkdaySummary, travelDates: Set<string>): string {
  const d = row.date.slice(0, 10);
  if (travelDates.has(d)) {
    return "Trasferta";
  }
  if (row.mode === "smartworking") {
    return "Remote working";
  }
  return "Sede";
}

export function WorkedDaySummaryCards(props: {
  rows: WorkdaySummary[];
  user: Pick<SessionUser, "dailyTargetSeconds"> | null;
  travelDates: Set<string>;
}): React.JSX.Element {
  const targetSec =
    props.user?.dailyTargetSeconds != null && props.user.dailyTargetSeconds > 0
      ? props.user.dailyTargetSeconds
      : 8 * 3600;

  if (props.rows.length === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Nessun riepilogo disponibile.</p>;
  }

  return (
    <ul className="space-y-3">
      {[...props.rows]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((row) => {
          const worked = workedSecondsFromSummary(row);
          const otReported = Math.max(0, row.overtimeSeconds ?? 0);
          /** Secondi fino all’obiettivo e oltre (allineati al backend: OT = max(0, worked − target)). */
          const ordinarySec = Math.min(worked, targetSec);
          const otSec = Math.max(0, worked - targetSec);
          /**
           * Barra: larghezza totale = max(obiettivo, lavorato) così sotto l’obiettivo la % è
           * lavorato/obiettivo (es. 2h/8h = 25%); oltre obiettivo, parte chiara = fino al target, scura = OT.
           */
          const scaleSec = Math.max(targetSec, worked, 1);
          const ordinaryPct = (ordinarySec / scaleSec) * 100;
          const otPct = (otSec / scaleSec) * 100;
          const pctVsTarget = targetSec > 0 ? Math.min(100, (worked / targetSec) * 100) : 0;
          const mode = modeLabel(row, props.travelDates);
          const dayNum = row.date.slice(8, 10);
          return (
            <li
              key={`${row.userId}-${row.date}`}
              className="flex flex-wrap items-stretch gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-950/40"
            >
              <div
                className="flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg border-2 border-[color-mix(in_srgb,var(--prom-gold)_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] shadow-sm dark:bg-slate-900/60"
                aria-hidden
              >
                <span className="text-[10px] font-semibold uppercase leading-none text-slate-500 dark:text-slate-400">
                  {weekdayShortIt(row.date)}
                </span>
                <span className="mt-0.5 text-xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50">
                  {dayNum}
                </span>
                <span className="mt-0.5 text-[9px] font-medium capitalize leading-none text-slate-500 dark:text-slate-400">
                  {monthShortIt(row.date)}
                </span>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{mode}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500">
                    Obiettivo {formatSecondsHm(targetSec)}
                  </p>
                </div>
                <div
                  className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/90"
                  title={`${pctVsTarget.toFixed(0)}% dell’obiettivo giornaliero · ${formatSecondsHm(ordinarySec)} fino al target · ${otSec > 0 ? `${formatSecondsHm(otSec)} straord.` : "nessuno straord."}`}
                >
                  {ordinarySec > 0 ? (
                    <div
                      className="h-full shrink-0 bg-[color-mix(in_srgb,var(--prom-gold)_82%,white)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] dark:bg-[color-mix(in_srgb,var(--prom-gold)_58%,#1a1a1a)]"
                      style={{ width: `${ordinaryPct}%` }}
                    />
                  ) : null}
                  {otSec > 0 ? (
                    <div
                      className="h-full shrink-0 bg-[color-mix(in_srgb,var(--prom-gold)_38%,#0f172a)] dark:bg-[color-mix(in_srgb,var(--prom-gold)_32%,#000)]"
                      style={{ width: `${otPct}%` }}
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                  <span>
                    Lavorate <strong className="text-slate-800 dark:text-slate-200">{formatSecondsHm(worked)}</strong>
                  </span>
                  <span>
                    Straord.{" "}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {otReported > 0 ? formatSecondsHm(otReported) : "—"}
                    </strong>
                  </span>
                </div>
              </div>
            </li>
          );
        })}
    </ul>
  );
}
