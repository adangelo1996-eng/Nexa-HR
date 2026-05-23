"use client";

import { ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import {
  PersonnelBudgetCellNoteMenu,
  usePersonnelBudgetCellNotesMap
} from "@/components/personnel-budget/cell-note-menu";
import { PersonnelBudgetForecastCellAssist } from "@/components/personnel-budget/personnel-budget-forecast-cell-assist";
import type { PersonnelBudgetForecastMetricKey } from "@/lib/personnel-budget-assumptions";
import {
  MONTH_LABELS,
  PB_METRICS,
  PB_TABLE,
  PB_TABLE_WRAP,
  PB_TD,
  PB_TD_ZEBRA,
  PB_TH,
  PB_TH_GROUP_ACT,
  PB_TH_GROUP_FCST,
  type PbMetricKey
} from "@/components/personnel-budget/table-theme";
import {
  deletePersonnelBudgetPlannedExtraLine,
  downloadPersonnelBudgetActualExport,
  fetchCurrentUser,
  fetchPersonnelBudgetCellNotes,
  fetchPersonnelBudgetYearMonthly,
  patchPersonnelBudgetForecastCells,
  upsertPersonnelBudgetPlannedExtraLine,
  type PersonnelBudgetMoney,
  type PersonnelBudgetPlannedExtraLine,
  type PersonnelBudgetYearMonthlyDepartment,
  type PersonnelBudgetYearMonthlyResult,
  type PersonnelBudgetYearMonthlyRow
} from "@/lib/api";
import {
  formatPersonnelBudgetAmount,
  parsePersonnelBudgetMoneyInput
} from "@/lib/personnel-budget-format";
import {
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

type ForecastDraftKey = string;

function draftKey(userId: string, month: number, field: string): ForecastDraftKey {
  return `${userId}|${month}|${field}`;
}

function rowTotal(m: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number }): number {
  if (m.totalCompanyCost != null && Number.isFinite(m.totalCompanyCost)) {
    return m.totalCompanyCost;
  }
  return (m.ral ?? 0) + (m.overtime ?? 0) + (m.travel ?? 0) + (m.inps ?? 0) + (m.inail ?? 0) + (m.tfr ?? 0);
}

function pickMetric(
  m: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number },
  key: PbMetricKey
): number {
  if (key === "total") return rowTotal(m);
  return (m[key] as number) ?? 0;
}

function deptId(d: PersonnelBudgetYearMonthlyDepartment): string {
  return d.costCenterId ?? "__none__";
}

export function PersonnelBudgetYearMonthlyView(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<PersonnelBudgetYearMonthlyResult | null>(null);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof fetchPersonnelBudgetCellNotes>>>([]);
  const [expanded, setExpanded] = useState(false);
  const [expandedDept, setExpandedDept] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fcDraft, setFcDraft] = useState<Record<ForecastDraftKey, string>>({});
  const [highlightLineIds, setHighlightLineIds] = useState<Set<string>>(() => new Set());
  const notesMap = usePersonnelBudgetCellNotesMap(notes);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setErr(null);
    try {
      const me = await fetchCurrentUser(t);
      setUser(me);
      if (!sessionCanNexaAdmin(me)) {
        router.replace("/");
        return;
      }
      const [ym, cn] = await Promise.all([
        fetchPersonnelBudgetYearMonthly(t, year),
        fetchPersonnelBudgetCellNotes(t, year)
      ]);
      setData(ym);
      setNotes(cn);
      const drafts: Record<ForecastDraftKey, string> = {};
      for (const mo of ym.months) {
        for (const d of mo.departments) {
          for (const r of d.rows) {
            const f = r.forecast ?? {};
            for (const k of ["ral", "overtime", "travel", "inps", "inail", "tfr"] as const) {
              const v = f[k];
              if (v != null && Number.isFinite(Number(v))) {
                drafts[draftKey(r.userId, mo.month, k)] = formatPersonnelBudgetAmount(Number(v));
              }
            }
          }
        }
      }
      setFcDraft(drafts);
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const departments = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, PersonnelBudgetYearMonthlyDepartment & { rowsByUser: Map<string, PersonnelBudgetYearMonthlyRow> }>();
    for (const mo of data.months) {
      for (const d of mo.departments) {
        const id = deptId(d);
        if (!map.has(id)) {
          map.set(id, {
            ...d,
            rows: [],
            rowsByUser: new Map()
          });
        }
        const agg = map.get(id)!;
        for (const r of d.rows) {
          if (!agg.rowsByUser.has(r.userId)) {
            agg.rowsByUser.set(r.userId, { ...r });
            agg.rows.push(r);
          }
        }
        if ((d.plannedExtraLines?.length ?? 0) > 0) {
          agg.plannedExtraLines = d.plannedExtraLines;
        }
      }
    }
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.costCenterName.localeCompare(b.costCenterName));
  }, [data]);

  const visibleMetrics = useMemo(
    () => (expanded ? PB_METRICS : PB_METRICS.filter((m) => m.key === "total")),
    [expanded]
  );

  const saveForecast = async (): Promise<void> => {
    if (!token || !data) return;
    setSaving(true);
    setErr(null);
    try {
      for (const mo of data.months) {
        const cells: Array<{
          userId: string;
          forecastRal?: number | null;
          forecastOvertime?: number | null;
          forecastTravel?: number | null;
          forecastInps?: number | null;
          forecastInail?: number | null;
          forecastTfr?: number | null;
        }> = [];
        for (const d of mo.departments) {
          for (const r of d.rows) {
            const m = mo.month;
            cells.push({
              userId: r.userId,
              forecastRal: parsePersonnelBudgetMoneyInput(fcDraft[draftKey(r.userId, m, "ral")] ?? ""),
              forecastOvertime: parsePersonnelBudgetMoneyInput(fcDraft[draftKey(r.userId, m, "overtime")] ?? ""),
              forecastTravel: parsePersonnelBudgetMoneyInput(fcDraft[draftKey(r.userId, m, "travel")] ?? ""),
              forecastInps: parsePersonnelBudgetMoneyInput(fcDraft[draftKey(r.userId, m, "inps")] ?? ""),
              forecastInail: parsePersonnelBudgetMoneyInput(fcDraft[draftKey(r.userId, m, "inail")] ?? ""),
              forecastTfr: parsePersonnelBudgetMoneyInput(fcDraft[draftKey(r.userId, m, "tfr")] ?? "")
            });
          }
        }
        if (cells.length > 0) {
          await patchPersonnelBudgetForecastCells(token, { year, month: mo.month, cells });
        }
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento budget annuale…</p>;
  }
  if (!user || !sessionCanNexaAdmin(user)) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Budget mensile (anno)</h1>
          <p className="text-sm text-[var(--prom-muted)]">
            Consuntivo e forecast per tutti i mesi. Budget editabile dalla scheda Annuale.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NexaPageHelpButton pageKey="personnel-budget" />
          <label className="text-sm text-[var(--prom-muted)]">
            Anno{" "}
            <input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="ml-1 w-24 rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-2 py-1.5"
            />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Vista compatta" : "Espandi voci"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Aggiorna
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled={exporting || !token}
            onClick={() => {
              if (!token) return;
              setExporting(true);
              void downloadPersonnelBudgetActualExport(token, year)
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `nexa-personnel-budget-${year}.xlsx`;
                  a.click();
                  URL.revokeObjectURL(url);
                })
                .catch((e) => setErr(e instanceof Error ? e.message : "Export fallito"))
                .finally(() => setExporting(false));
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? "Export…" : "Export Excel"}
          </Button>
          <Button type="button" onClick={() => void saveForecast()} disabled={saving}>
            {saving ? "Salvataggio…" : "Salva forecast"}
          </Button>
        </div>
      </div>

      {err ? <p className="text-sm text-rose-500">{err}</p> : null}

      {departments.map((dept) => (
        <DeptYearBlock
          key={deptId(dept)}
          dept={dept}
          year={year}
          token={token}
          data={data}
          expanded={expandedDept[deptId(dept)] !== false}
          onToggle={() =>
            setExpandedDept((p) => ({ ...p, [deptId(dept)]: !(p[deptId(dept)] !== false) }))
          }
          columnExpanded={expanded}
          visibleMetrics={visibleMetrics}
          fcDraft={fcDraft}
          setFcDraft={setFcDraft}
          notesMap={notesMap}
          onNotesRefresh={() => void load()}
          highlightLineIds={highlightLineIds}
          onLineAdded={(id) => {
            setHighlightLineIds((s) => new Set(s).add(id));
            void load();
          }}
        />
      ))}

      <Link href="/mappa-portale" className="text-sm text-[var(--prom-gold)] hover:underline">
        ← Torna alla dashboard
      </Link>
    </div>
  );
}

function DeptYearBlock({
  dept,
  year,
  token,
  data,
  expanded,
  onToggle,
  columnExpanded,
  visibleMetrics,
  fcDraft,
  setFcDraft,
  notesMap,
  onNotesRefresh,
  highlightLineIds,
  onLineAdded
}: {
  dept: PersonnelBudgetYearMonthlyDepartment;
  year: number;
  token: string | null;
  data: PersonnelBudgetYearMonthlyResult | null;
  expanded: boolean;
  onToggle: () => void;
  columnExpanded: boolean;
  visibleMetrics: typeof PB_METRICS;
  fcDraft: Record<string, string>;
  setFcDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  notesMap: ReturnType<typeof usePersonnelBudgetCellNotesMap>;
  onNotesRefresh: () => void;
  highlightLineIds: Set<string>;
  onLineAdded: (id: string) => void;
}): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const [lineMonth, setLineMonth] = useState(1);
  const [lineLabel, setLineLabel] = useState("");
  const [lineBusy, setLineBusy] = useState(false);
  const [lineDrafts, setLineDrafts] = useState<Record<string, Partial<Record<PbMetricKey, string>>>>({});

  const rows = dept.rows;

  return (
    <section className="rounded-xl border border-[color-mix(in_srgb,var(--prom-line)_70%,transparent)] bg-[color-mix(in_srgb,#0d1219_88%,var(--prom-surface-soft))] shadow-lg">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--prom-line)] px-3 py-2">
        <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={onToggle}>
          {expanded ? <ChevronDown className="h-5 w-5 text-[var(--prom-muted)]" /> : <ChevronRight className="h-5 w-5" />}
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">{dept.costCenterName}</h2>
        </button>
        {expanded ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            {adding ? "Annulla" : "Aggiungi riga"}
          </Button>
        ) : null}
      </div>
      {expanded && adding ? (
        <form
          className="mx-3 mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!token || !lineLabel.trim()) return;
            setLineBusy(true);
            void upsertPersonnelBudgetPlannedExtraLine(token, {
              year,
              month: lineMonth,
              costCenterId: dept.costCenterId,
              label: lineLabel.trim(),
              budgetRal: 0,
              budgetOvertime: 0,
              budgetTravel: 0,
              budgetInps: 0,
              budgetInail: 0,
              budgetTfr: 0
            })
              .then((line) => {
                setLineLabel("");
                setAdding(false);
                onLineAdded(line.id);
              })
              .finally(() => setLineBusy(false));
          }}
        >
          <label className="text-xs text-[var(--prom-muted)]">
            Mese
            <select
              className="mt-1 block rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm"
              value={lineMonth}
              onChange={(e) => setLineMonth(Number(e.target.value))}
            >
              {MONTH_LABELS.map((l, i) => (
                <option key={l} value={i + 1}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--prom-muted)]">
            Etichetta
            <input
              className="mt-1 block w-48 rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm"
              value={lineLabel}
              onChange={(e) => setLineLabel(e.target.value)}
              required
            />
          </label>
          <Button type="submit" size="sm" disabled={lineBusy}>
            {lineBusy ? "Salvo…" : "Aggiungi riga"}
          </Button>
        </form>
      ) : null}
      {expanded ? (
        <div className={PB_TABLE_WRAP}>
          <table className={PB_TABLE}>
            <thead>
              <tr>
                <th className={PB_TH} rowSpan={2}>
                  Dipendente
                </th>
                {MONTH_LABELS.map((label, mi) => (
                  <th
                    key={label}
                    className={`${PB_TH} text-center`}
                    colSpan={visibleMetrics.length * 2}
                  >
                    {label}
                  </th>
                ))}
              </tr>
              <tr>
                {MONTH_LABELS.map((label) =>
                  visibleMetrics.flatMap((met) => [
                    <th key={`${label}-a-${met.key}`} className={`${PB_TH} ${PB_TH_GROUP_ACT} text-[10px]`}>
                      ACT {met.label}
                    </th>,
                    <th key={`${label}-f-${met.key}`} className={`${PB_TH} ${PB_TH_GROUP_FCST} text-[10px]`}>
                      FCST {met.label}
                    </th>
                  ])
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className={PB_TD_ZEBRA}>
                  <td className={`${PB_TD} font-medium sticky left-0 z-10 bg-[color-mix(in_srgb,#121a28_98%,transparent)]`}>
                    {row.fullName}
                  </td>
                  {data?.months.map((mo) => {
                    const monthRow =
                      mo.departments.find((d) => deptId(d) === deptId(dept))?.rows.find((r) => r.userId === row.userId) ??
                      row;
                    const act = monthRow.actual;
                    const fc = monthRow.forecast ?? {};
                    return visibleMetrics.flatMap((met) => {
                      const actVal = pickMetric(act, met.key);
                      const fcKey = draftKey(row.userId, mo.month, met.key === "total" ? "ral" : met.key);
                      const fcVal =
                        met.key === "total"
                          ? rowTotal({
                              ral: parsePersonnelBudgetMoneyInput(fcDraft[draftKey(row.userId, mo.month, "ral")] ?? "") ?? fc.ral,
                              overtime:
                                parsePersonnelBudgetMoneyInput(fcDraft[draftKey(row.userId, mo.month, "overtime")] ?? "") ??
                                fc.overtime,
                              travel:
                                parsePersonnelBudgetMoneyInput(fcDraft[draftKey(row.userId, mo.month, "travel")] ?? "") ??
                                fc.travel,
                              inps:
                                parsePersonnelBudgetMoneyInput(fcDraft[draftKey(row.userId, mo.month, "inps")] ?? "") ?? fc.inps,
                              inail:
                                parsePersonnelBudgetMoneyInput(fcDraft[draftKey(row.userId, mo.month, "inail")] ?? "") ??
                                fc.inail,
                              tfr:
                                parsePersonnelBudgetMoneyInput(fcDraft[draftKey(row.userId, mo.month, "tfr")] ?? "") ?? fc.tfr
                            })
                          : parsePersonnelBudgetMoneyInput(fcDraft[fcKey] ?? "") ?? pickMetric(fc, met.key);
                      return [
                        <td key={`${mo.month}-a-${met.key}`} className={`${PB_TD} tabular-nums text-[var(--prom-muted)]`}>
                          <PersonnelBudgetCellNoteMenu
                            token={token}
                            target={{
                              year,
                              month: mo.month,
                              userId: row.userId,
                              fieldKey: `actual.${met.key}`
                            }}
                            notesMap={notesMap}
                            onSaved={onNotesRefresh}
                          >
                            <span>{formatPersonnelBudgetAmount(actVal)}</span>
                          </PersonnelBudgetCellNoteMenu>
                        </td>,
                        <td key={`${mo.month}-f-${met.key}`} className={PB_TD}>
                          {met.key === "total" ? (
                            <span className="tabular-nums">{formatPersonnelBudgetAmount(fcVal)}</span>
                          ) : (
                            <PersonnelBudgetCellNoteMenu
                              token={token}
                              target={{
                                year,
                                month: mo.month,
                                userId: row.userId,
                                fieldKey: `forecast.${met.key}`
                              }}
                              notesMap={notesMap}
                              onSaved={onNotesRefresh}
                            >
                              <div className="flex items-center gap-0.5">
                                <input
                                  className="w-[4.75rem] rounded border border-[color-mix(in_srgb,var(--prom-line)_80%,#3d9a6a)] bg-[color-mix(in_srgb,#1a2f28_40%,transparent)] px-1 py-0.5 text-xs tabular-nums"
                                  value={fcDraft[fcKey] ?? ""}
                                  onChange={(e) =>
                                    setFcDraft((p) => ({ ...p, [fcKey]: e.target.value }))
                                  }
                                />
                                <PersonnelBudgetForecastCellAssist
                                  metricKey={met.key as PersonnelBudgetForecastMetricKey}
                                  year={year}
                                  month={mo.month}
                                  userId={row.userId}
                                  partialForm={{
                                    budgetRalMonthly: monthRow.budget.ral,
                                    budgetRalAnnual:
                                      monthRow.budget.ral != null
                                        ? Number(monthRow.budget.ral) * 13
                                        : undefined
                                  }}
                                  onSuggestValue={(v) =>
                                    setFcDraft((p) => ({ ...p, [fcKey]: v }))
                                  }
                                />
                              </div>
                            </PersonnelBudgetCellNoteMenu>
                          )}
                        </td>
                      ];
                    });
                  })}
                </tr>
              ))}
              {(dept.plannedExtraLines ?? []).map((line) => (
                <PlannedExtraYearRow
                  key={line.id}
                  line={line}
                  year={year}
                  token={token}
                  dept={dept}
                  data={data}
                  visibleMetrics={visibleMetrics}
                  highlight={highlightLineIds.has(line.id)}
                  lineDrafts={lineDrafts}
                  setLineDrafts={setLineDrafts}
                  notesMap={notesMap}
                  onNotesRefresh={onNotesRefresh}
                  onDelete={() => {
                    if (!token) return;
                    void deletePersonnelBudgetPlannedExtraLine(token, line.id).then(onNotesRefresh);
                  }}
                  onSaved={() => {
                    if (!token) return;
                    const dr = lineDrafts[line.id] ?? {};
                    void upsertPersonnelBudgetPlannedExtraLine(token, {
                      id: line.id,
                      year,
                      month: lineMonth,
                      costCenterId: dept.costCenterId,
                      label: line.label,
                      budgetRal: parsePersonnelBudgetMoneyInput(dr.ral ?? ""),
                      budgetOvertime: parsePersonnelBudgetMoneyInput(dr.overtime ?? ""),
                      budgetTravel: parsePersonnelBudgetMoneyInput(dr.travel ?? ""),
                      budgetInps: parsePersonnelBudgetMoneyInput(dr.inps ?? ""),
                      budgetInail: parsePersonnelBudgetMoneyInput(dr.inail ?? ""),
                      budgetTfr: parsePersonnelBudgetMoneyInput(dr.tfr ?? "")
                    }).then(onNotesRefresh);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function PlannedExtraYearRow({
  line,
  year,
  highlight,
  onDelete,
  visibleMetrics,
  lineDrafts,
  setLineDrafts
}: {
  line: PersonnelBudgetPlannedExtraLine;
  year: number;
  token: string | null;
  dept: PersonnelBudgetYearMonthlyDepartment;
  data: PersonnelBudgetYearMonthlyResult | null;
  visibleMetrics: typeof PB_METRICS;
  highlight: boolean;
  lineDrafts: Record<string, Partial<Record<PbMetricKey, string>>>;
  setLineDrafts: React.Dispatch<React.SetStateAction<Record<string, Partial<Record<PbMetricKey, string>>>>>;
  notesMap: ReturnType<typeof usePersonnelBudgetCellNotesMap>;
  onNotesRefresh: () => void;
  onDelete: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const dr = lineDrafts[line.id] ?? {};
  const init = (k: PbMetricKey): string => {
    if (dr[k] != null) return dr[k] as string;
    const b = line.budget;
    if (k === "total") return formatPersonnelBudgetAmount(rowTotal(b));
    return formatPersonnelBudgetAmount((b[k] as number) ?? 0);
  };
  return (
    <tr className={`italic ${highlight ? "ring-2 ring-inset ring-amber-400/80 bg-amber-500/10" : PB_TD_ZEBRA}`}>
      <td className={`${PB_TD} sticky left-0 z-10 bg-[color-mix(in_srgb,#121a28_98%,transparent)]`}>
        <input
          className="w-full min-w-[8rem] rounded border border-[var(--prom-line)] bg-transparent px-1 text-sm"
          defaultValue={line.label}
          onBlur={(e) =>
            setLineDrafts((p) => ({
              ...p,
              [line.id]: { ...p[line.id], label: e.target.value }
            }))
          }
        />
        <button type="button" className="ml-1 text-[10px] text-rose-400" onClick={onDelete}>
          Rimuovi
        </button>
      </td>
      {MONTH_LABELS.flatMap((_, mi) =>
        visibleMetrics.flatMap((met) => [
          <td key={`${line.id}-${mi}-a`} className={`${PB_TD} text-[var(--prom-muted)]`}>
            —
          </td>,
          <td key={`${line.id}-${mi}-f`} className={PB_TD}>
            {met.key === "total" ? (
              init("total")
            ) : (
              <div className="flex items-center gap-0.5">
                <input
                  className="w-[4.75rem] rounded border border-[var(--prom-line)] bg-transparent px-1 text-xs tabular-nums"
                  defaultValue={init(met.key)}
                  onChange={(e) =>
                    setLineDrafts((p) => ({
                      ...p,
                      [line.id]: { ...p[line.id], [met.key]: e.target.value }
                    }))
                  }
                />
                <PersonnelBudgetForecastCellAssist
                  metricKey={met.key as PersonnelBudgetForecastMetricKey}
                  year={year}
                  month={mi + 1}
                  plannedLineId={line.id}
                  partialForm={{
                    budgetRalMonthly: line.budget.ral,
                    label: line.label
                  }}
                  onSuggestValue={(v) =>
                    setLineDrafts((p) => ({
                      ...p,
                      [line.id]: { ...p[line.id], [met.key]: v }
                    }))
                  }
                />
              </div>
            )}
          </td>
        ])
      )}
    </tr>
  );
}
