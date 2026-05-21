import { Injectable } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { AnalyticsOrchestratorService, type AnalyticsKpi } from "./analytics-orchestrator.service";

export type KpiHistoryPoint = {
  yearMonth: string;
  value: number | null;
  valueText: string;
};

export type KpiHistorySeries = {
  kpiKey: string;
  labelIt: string;
  chartType: "line" | "bar";
  points: KpiHistoryPoint[];
};

export type KpiSnapshotFilters = {
  costCenterId?: string;
  teamId?: string;
  from?: string;
  to?: string;
};

function parseYearMonth(raw: string | undefined, fallback: Date): string {
  const trimmed = raw?.trim();
  if (trimmed && /^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback.toISOString().slice(0, 7);
}

function enumerateMonths(fromYm: string, toYm: string): string[] {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function defaultFromMonth(toYm: string, span = 6): string {
  const [y, mo] = toYm.split("-").map(Number);
  let m = mo - (span - 1);
  let year = y;
  while (m < 1) {
    m += 12;
    year -= 1;
  }
  return `${year}-${String(m).padStart(2, "0")}`;
}

function parseNumericKpiValue(value: string): number | null {
  const normalized = value.replace(/\s/g, " ").trim();
  if (!normalized || normalized === "—" || normalized === "-") {
    return null;
  }
  const match = normalized.match(/-?\d[\d.,]*/);
  if (!match) {
    return null;
  }
  const n = Number.parseFloat(match[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class KpiSnapshotService {
  constructor(
    private readonly store: HrDataStore,
    private readonly orchestrator: AnalyticsOrchestratorService
  ) {}

  async getKpiHistory(
    auth: AuthContext,
    analysisId: string,
    query: KpiSnapshotFilters
  ): Promise<{ analysisId: string; from: string; to: string; series: KpiHistorySeries[] }> {
    const card = this.orchestrator.resolveCard(analysisId);
    const companyId = await this.orchestrator.companyIdForAuth(auth);
    const now = new Date();
    const to = parseYearMonth(query.to, now);
    const from = parseYearMonth(query.from, new Date(now.getFullYear(), now.getMonth() - 5, 1));
    const safeFrom = from <= to ? from : defaultFromMonth(to);
    const costCenterId = query.costCenterId?.trim() || "";
    const teamId = query.teamId?.trim() || "";

    for (const yearMonth of enumerateMonths(safeFrom, to)) {
      await this.ensureMonthSnapshot(auth, card.id, companyId, yearMonth, costCenterId, teamId);
    }

    const rows = await this.store.listKpiMonthlySnapshots({
      companyId,
      analysisId: card.id,
      from: safeFrom,
      to,
      costCenterId,
      teamId
    });

    const byKey = new Map<string, KpiHistorySeries>();
    for (const row of rows) {
      const hit =
        byKey.get(row.kpiKey) ??
        ({
          kpiKey: row.kpiKey,
          labelIt: row.labelIt,
          chartType: row.chartType,
          points: []
        } satisfies KpiHistorySeries);
      hit.points.push({
        yearMonth: row.yearMonth,
        value: row.valueNumeric,
        valueText: row.valueText
      });
      byKey.set(row.kpiKey, hit);
    }

    const series = [...byKey.values()].map((s) => ({
      ...s,
      points: s.points.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    }));

    return { analysisId: card.id, from: safeFrom, to, series };
  }

  private async ensureMonthSnapshot(
    auth: AuthContext,
    analysisId: string,
    companyId: string,
    yearMonth: string,
    costCenterId: string,
    teamId: string
  ): Promise<void> {
    const exists = await this.store.hasKpiMonthlySnapshotsForMonth({
      companyId,
      analysisId,
      yearMonth,
      costCenterId,
      teamId
    });
    if (exists) {
      return;
    }
    const { kpis } = await this.orchestrator.getAnalysisKpis(auth, analysisId, {
      costCenterId: costCenterId || undefined,
      teamId: teamId || undefined,
      yearMonth
    });
    await this.store.upsertKpiMonthlySnapshots(
      companyId,
      analysisId,
      yearMonth,
      kpis.map((k) => this.toSnapshotRow(k)),
      costCenterId,
      teamId
    );
  }

  private toSnapshotRow(kpi: AnalyticsKpi): {
    kpiKey: string;
    labelIt: string;
    chartType: "line" | "bar";
    valueNumeric: number | null;
    valueText: string;
  } {
    return {
      kpiKey: kpi.id,
      labelIt: kpi.labelIt,
      chartType: kpi.chartType ?? "line",
      valueNumeric: parseNumericKpiValue(kpi.value),
      valueText: kpi.value
    };
  }
}
