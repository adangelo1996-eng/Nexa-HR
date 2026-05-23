import type { CoworkHistoryBatch, CoworkHistoryMonth } from "./cowork.types";

export function coworkHistoryMonthKey(appliedAtIso: string): string {
  const d = new Date(appliedAtIso);
  if (Number.isNaN(d.getTime())) {
    return "unknown";
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function coworkHistoryMonthLabelIt(monthKey: string): string {
  if (monthKey === "unknown") {
    return "Data sconosciuta";
  }
  const [y, m] = monthKey.split("-").map((v) => Number(v));
  if (!y || !m) {
    return monthKey;
  }
  const label = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function groupCoworkHistoryBatchesByMonth(batches: CoworkHistoryBatch[]): CoworkHistoryMonth[] {
  const byMonth = new Map<string, CoworkHistoryBatch[]>();
  for (const batch of batches) {
    const key = coworkHistoryMonthKey(batch.appliedAt);
    const list = byMonth.get(key) ?? [];
    list.push(batch);
    byMonth.set(key, list);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthBatches]) => ({
      month,
      label: coworkHistoryMonthLabelIt(month),
      batches: monthBatches.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
    }));
}

export function paginateCoworkHistoryMonths(
  months: CoworkHistoryMonth[],
  page: number,
  pageSize: number
): { months: CoworkHistoryMonth[]; totalMonths: number } {
  const totalMonths = months.length;
  const offset = (page - 1) * pageSize;
  return {
    months: months.slice(offset, offset + pageSize),
    totalMonths
  };
}
