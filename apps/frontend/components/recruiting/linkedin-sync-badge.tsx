"use client";

import type { RecruitPositionDto } from "@/lib/api";

export function linkedInSyncBadgeLabel(position: Pick<RecruitPositionDto, "linkedin_sync_status" | "source">): string {
  const status = position.linkedin_sync_status ?? "not_linked";
  if (status === "pending") return "In attesa";
  if (status === "synced") return "Su LinkedIn";
  if (status === "error") return "Errore sync";
  if (position.source === "linkedin") return "Da LinkedIn";
  return "Solo Nexa";
}

export function LinkedInSyncBadge({
  position
}: {
  position: Pick<RecruitPositionDto, "linkedin_sync_status" | "source">;
}): React.JSX.Element {
  const label = linkedInSyncBadgeLabel(position);
  const status = position.linkedin_sync_status ?? "not_linked";
  const tone =
    status === "synced"
      ? "border-sky-300/60 bg-sky-50 text-[#002D72] dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100"
      : status === "pending"
        ? "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100"
        : status === "error"
          ? "border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-100"
          : "border-[var(--card-border)] bg-white/70 text-synapse-muted dark:bg-[#052642]/60 dark:text-[#b4c9dc]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}
