"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, FileSpreadsheet, GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  downloadPersonnelBudgetActualExport,
  fetchPersonnelBudget,
  fetchCurrentUser,
  patchPersonnelBudgetCells,
  patchPersonnelBudgetCostCenterOrder,
  type PersonnelBudgetDepartment,
  type PersonnelBudgetMoney,
  type PersonnelBudgetRow,
  type PersonnelBudgetSnapshot
} from "@/lib/api";
import {
  budgetDeltaPercentLabel,
  formatPersonnelBudgetAmount,
  parsePersonnelBudgetMoneyInput
} from "@/lib/personnel-budget-format";
import {
  getToken,
  getSessionUser,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";
import { takePersonnelBudgetWarmPayload } from "@/lib/personnel-budget-prefetch";

type BudgetDraft = Partial<{
  ral: string;
  overtime: string;
  travel: string;
  inps: string;
  inail: string;
  tfr: string;
}>;

type BudgetColTotals = {
  bRal: number;
  cRal: number;
  bOvertime: number;
  cOvertime: number;
  bTravel: number;
  cTravel: number;
  bInps: number;
  cInps: number;
  bInail: number;
  cInail: number;
  bTfr: number;
  cTfr: number;
  bCompany: number;
  cCompany: number;
};

function emptyColTotals(): BudgetColTotals {
  return {
    bRal: 0,
    cRal: 0,
    bOvertime: 0,
    cOvertime: 0,
    bTravel: 0,
    cTravel: 0,
    bInps: 0,
    cInps: 0,
    bInail: 0,
    cInail: 0,
    bTfr: 0,
    cTfr: 0,
    bCompany: 0,
    cCompany: 0
  };
}

function addColTotals(a: BudgetColTotals, b: BudgetColTotals): BudgetColTotals {
  return {
    bRal: a.bRal + b.bRal,
    cRal: a.cRal + b.cRal,
    bOvertime: a.bOvertime + b.bOvertime,
    cOvertime: a.cOvertime + b.cOvertime,
    bTravel: a.bTravel + b.bTravel,
    cTravel: a.cTravel + b.cTravel,
    bInps: a.bInps + b.bInps,
    cInps: a.cInps + b.cInps,
    bInail: a.bInail + b.bInail,
    cInail: a.cInail + b.cInail,
    bTfr: a.bTfr + b.bTfr,
    cTfr: a.cTfr + b.cTfr,
    bCompany: a.bCompany + b.bCompany,
    cCompany: a.cCompany + b.cCompany
  };
}

function deptSortId(d: PersonnelBudgetDepartment): string {
  return d.costCenterId ?? "__none__";
}

function pickBudgetInputStr(
  b: Partial<PersonnelBudgetMoney>,
  sug: Partial<PersonnelBudgetMoney> | undefined,
  key: keyof PersonnelBudgetMoney
): string {
  const v = b[key];
  if (v != null && Number.isFinite(Number(v))) {
    return formatPersonnelBudgetAmount(Number(v));
  }
  const sv = sug?.[key];
  if (sv != null && Number.isFinite(Number(sv))) {
    return formatPersonnelBudgetAmount(Number(sv));
  }
  return "";
}

function budgetRowTotal(b: Partial<PersonnelBudgetMoney> | undefined): number {
  if (!b) return 0;
  return (
    (b.ral ?? 0) +
    (b.overtime ?? 0) +
    (b.travel ?? 0) +
    (b.inps ?? 0) +
    (b.inail ?? 0) +
    (b.tfr ?? 0)
  );
}

function mergedBudgetForRow(row: PersonnelBudgetRow, dr: BudgetDraft): Partial<PersonnelBudgetMoney> {
  return {
    ral: parsePersonnelBudgetMoneyInput(dr.ral ?? "") ?? row.budget.ral,
    overtime: parsePersonnelBudgetMoneyInput(dr.overtime ?? "") ?? row.budget.overtime,
    travel: parsePersonnelBudgetMoneyInput(dr.travel ?? "") ?? row.budget.travel,
    inps: parsePersonnelBudgetMoneyInput(dr.inps ?? "") ?? row.budget.inps,
    inail: parsePersonnelBudgetMoneyInput(dr.inail ?? "") ?? row.budget.inail,
    tfr: parsePersonnelBudgetMoneyInput(dr.tfr ?? "") ?? row.budget.tfr
  };
}

function computeDeptColTotals(dept: PersonnelBudgetDepartment, draftByUser: Record<string, BudgetDraft>): BudgetColTotals {
  const t = emptyColTotals();
  for (const row of dept.rows) {
    const dr = draftByUser[row.userId] ?? {};
    const merged = mergedBudgetForRow(row, dr);
    t.bRal += Number(merged.ral ?? 0);
    t.cRal += row.actual.ral;
    t.bOvertime += Number(merged.overtime ?? 0);
    t.cOvertime += row.actual.overtime;
    t.bTravel += Number(merged.travel ?? 0);
    t.cTravel += row.actual.travel;
    t.bInps += Number(merged.inps ?? 0);
    t.cInps += row.actual.inps;
    t.bInail += Number(merged.inail ?? 0);
    t.cInail += row.actual.inail;
    t.bTfr += Number(merged.tfr ?? 0);
    t.cTfr += row.actual.tfr;
    t.bCompany += budgetRowTotal(merged);
    t.cCompany += row.actual.totalCompanyCost;
  }
  return t;
}

function SortableDeptSection({
  dept,
  expanded,
  onToggle,
  draftByUser,
  colTotals,
  updateDraft,
  th,
  td
}: {
  dept: PersonnelBudgetDepartment;
  expanded: boolean;
  onToggle: () => void;
  draftByUser: Record<string, BudgetDraft>;
  colTotals: BudgetColTotals;
  updateDraft: (userId: string, field: keyof BudgetDraft, value: string) => void;
  th: string;
  td: string;
}): React.JSX.Element {
  const id = deptSortId(dept);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1
  };
  return (
    <section
      ref={setNodeRef}
      style={style}
      className="mb-8 rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] shadow-[var(--card-shadow)] backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--prom-line)] px-3 py-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] active:cursor-grabbing"
          aria-label={`Trascina reparto ${dept.costCenterName}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="flex flex-1 flex-wrap items-center gap-2 text-left min-w-0"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`dept-table-${id}`}
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="h-5 w-5 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          )}
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">{dept.costCenterName}</h2>
          {!expanded ? (
            <span className="text-sm text-[var(--prom-muted)] tabular-nums">
              Budget tot. az. {formatPersonnelBudgetAmount(colTotals.bCompany)} · Actual{" "}
              {formatPersonnelBudgetAmount(colTotals.cCompany)}
            </span>
          ) : null}
        </button>
      </div>
      {expanded ? (
        <div className="overflow-x-auto p-3">
          <table id={`dept-table-${id}`} className="min-w-[1680px] w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Dipendente</th>
                <th className={th} colSpan={4}>
                  RAL
                </th>
                <th className={th} colSpan={4}>
                  Straordinari
                </th>
                <th className={th} colSpan={4}>
                  Trasferte
                </th>
                <th className={th} colSpan={4}>
                  INPS (stima datore)
                </th>
                <th className={th} colSpan={4}>
                  INAIL (stima datore)
                </th>
                <th className={th} colSpan={4}>
                  TFR (accanton.)
                </th>
                <th className={th} colSpan={4}>
                  Tot. costo az.**
                </th>
              </tr>
              <tr>
                <th className={th} />
                {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                  <th key={`h-ral-${h}`} className={th}>
                    {h}
                  </th>
                ))}
                {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                  <th key={`h-ov-${h}`} className={th}>
                    {h}
                  </th>
                ))}
                {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                  <th key={`h-tr-${h}`} className={th}>
                    {h}
                  </th>
                ))}
                {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                  <th key={`h-inps-${h}`} className={th}>
                    {h}
                  </th>
                ))}
                {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                  <th key={`h-inail-${h}`} className={th}>
                    {h}
                  </th>
                ))}
                {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                  <th key={`h-tfr-${h}`} className={th}>
                    {h}
                  </th>
                ))}
                {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                  <th key={`h-tot-${h}`} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dept.rows.map((row: PersonnelBudgetRow) => {
                const dr = draftByUser[row.userId] ?? {};
                const merged = mergedBudgetForRow(row, dr);
                const bRal = Number(merged.ral ?? 0);
                const bOv = Number(merged.overtime ?? 0);
                const bTr = Number(merged.travel ?? 0);
                const bInps = Number(merged.inps ?? 0);
                const bInail = Number(merged.inail ?? 0);
                const bTfr = Number(merged.tfr ?? 0);
                const bDraftTot = budgetRowTotal(merged);
                const actTot = row.actual.totalCompanyCost;
                return (
                  <tr key={row.userId}>
                    <td className={td}>
                      <span className="font-medium">{row.fullName}</span>
                    </td>
                    <td className={`${td} text-[var(--prom-muted)] tabular-nums`}>
                      {formatPersonnelBudgetAmount(row.actual.ral)}
                    </td>
                    <td className={td}>
                      <input
                        className="w-[6.5rem] rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                        value={dr.ral ?? ""}
                        onChange={(e) => updateDraft(row.userId, "ral", e.target.value)}
                        onBlur={(e) => {
                          const p = parsePersonnelBudgetMoneyInput(e.target.value);
                          if (p != null) {
                            updateDraft(row.userId, "ral", formatPersonnelBudgetAmount(p));
                          }
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(bRal - row.actual.ral)}</td>
                    <td className={`${td} text-xs tabular-nums`}>
                      {budgetDeltaPercentLabel(row.actual.ral, bRal)}
                    </td>
                    <td className={`${td} text-[var(--prom-muted)] tabular-nums`}>
                      {formatPersonnelBudgetAmount(row.actual.overtime)}
                    </td>
                    <td className={td}>
                      <input
                        className="w-[6.5rem] rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                        value={dr.overtime ?? ""}
                        onChange={(e) => updateDraft(row.userId, "overtime", e.target.value)}
                        onBlur={(e) => {
                          const p = parsePersonnelBudgetMoneyInput(e.target.value);
                          if (p != null) {
                            updateDraft(row.userId, "overtime", formatPersonnelBudgetAmount(p));
                          }
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(bOv - row.actual.overtime)}</td>
                    <td className={`${td} text-xs tabular-nums`}>
                      {budgetDeltaPercentLabel(row.actual.overtime, bOv)}
                    </td>
                    <td className={`${td} text-[var(--prom-muted)] tabular-nums`}>
                      {formatPersonnelBudgetAmount(row.actual.travel)}
                    </td>
                    <td className={td}>
                      <input
                        className="w-[6.5rem] rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                        value={dr.travel ?? ""}
                        onChange={(e) => updateDraft(row.userId, "travel", e.target.value)}
                        onBlur={(e) => {
                          const p = parsePersonnelBudgetMoneyInput(e.target.value);
                          if (p != null) {
                            updateDraft(row.userId, "travel", formatPersonnelBudgetAmount(p));
                          }
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(bTr - row.actual.travel)}</td>
                    <td className={`${td} text-xs tabular-nums`}>
                      {budgetDeltaPercentLabel(row.actual.travel, bTr)}
                    </td>
                    <td className={`${td} text-[var(--prom-muted)] tabular-nums`}>
                      {formatPersonnelBudgetAmount(row.actual.inps)}
                    </td>
                    <td className={td}>
                      <input
                        className="w-[6.5rem] rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                        value={dr.inps ?? ""}
                        onChange={(e) => updateDraft(row.userId, "inps", e.target.value)}
                        onBlur={(e) => {
                          const p = parsePersonnelBudgetMoneyInput(e.target.value);
                          if (p != null) {
                            updateDraft(row.userId, "inps", formatPersonnelBudgetAmount(p));
                          }
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(bInps - row.actual.inps)}</td>
                    <td className={`${td} text-xs tabular-nums`}>
                      {budgetDeltaPercentLabel(row.actual.inps, bInps)}
                    </td>
                    <td className={`${td} text-[var(--prom-muted)] tabular-nums`}>
                      {formatPersonnelBudgetAmount(row.actual.inail)}
                    </td>
                    <td className={td}>
                      <input
                        className="w-[6.5rem] rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                        value={dr.inail ?? ""}
                        onChange={(e) => updateDraft(row.userId, "inail", e.target.value)}
                        onBlur={(e) => {
                          const p = parsePersonnelBudgetMoneyInput(e.target.value);
                          if (p != null) {
                            updateDraft(row.userId, "inail", formatPersonnelBudgetAmount(p));
                          }
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(bInail - row.actual.inail)}</td>
                    <td className={`${td} text-xs tabular-nums`}>
                      {budgetDeltaPercentLabel(row.actual.inail, bInail)}
                    </td>
                    <td className={`${td} text-[var(--prom-muted)] tabular-nums`}>
                      {formatPersonnelBudgetAmount(row.actual.tfr)}
                    </td>
                    <td className={td}>
                      <input
                        className="w-[6.5rem] rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                        value={dr.tfr ?? ""}
                        onChange={(e) => updateDraft(row.userId, "tfr", e.target.value)}
                        onBlur={(e) => {
                          const p = parsePersonnelBudgetMoneyInput(e.target.value);
                          if (p != null) {
                            updateDraft(row.userId, "tfr", formatPersonnelBudgetAmount(p));
                          }
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(bTfr - row.actual.tfr)}</td>
                    <td className={`${td} text-xs tabular-nums`}>
                      {budgetDeltaPercentLabel(row.actual.tfr, bTfr)}
                    </td>
                    <td className={`${td} text-[var(--prom-muted)] tabular-nums`}>
                      {formatPersonnelBudgetAmount(row.actual.totalCompanyCost)}
                    </td>
                    <td className={`${td} font-medium tabular-nums`}>
                      {bDraftTot > 0 || Object.keys(row.budget).length > 0
                        ? formatPersonnelBudgetAmount(bDraftTot)
                        : "—"}
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(bDraftTot - actTot)}</td>
                    <td className={`${td} text-xs tabular-nums`}>
                      {budgetDeltaPercentLabel(actTot, bDraftTot)}
                    </td>
                  </tr>
                );
              })}
              {dept.rows.length > 0 ? (
                <tr className="bg-[color-mix(in_srgb,var(--prom-gold)_8%,transparent)] font-medium">
                  <td className={td}>Totale centro di costo</td>
                  <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                    {formatPersonnelBudgetAmount(colTotals.cRal)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(colTotals.bRal)}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatPersonnelBudgetAmount(colTotals.bRal - colTotals.cRal)}
                  </td>
                  <td className={`${td} text-xs tabular-nums`}>
                    {budgetDeltaPercentLabel(colTotals.cRal, colTotals.bRal)}
                  </td>
                  <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                    {formatPersonnelBudgetAmount(colTotals.cOvertime)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(colTotals.bOvertime)}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatPersonnelBudgetAmount(colTotals.bOvertime - colTotals.cOvertime)}
                  </td>
                  <td className={`${td} text-xs tabular-nums`}>
                    {budgetDeltaPercentLabel(colTotals.cOvertime, colTotals.bOvertime)}
                  </td>
                  <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                    {formatPersonnelBudgetAmount(colTotals.cTravel)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(colTotals.bTravel)}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatPersonnelBudgetAmount(colTotals.bTravel - colTotals.cTravel)}
                  </td>
                  <td className={`${td} text-xs tabular-nums`}>
                    {budgetDeltaPercentLabel(colTotals.cTravel, colTotals.bTravel)}
                  </td>
                  <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                    {formatPersonnelBudgetAmount(colTotals.cInps)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(colTotals.bInps)}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatPersonnelBudgetAmount(colTotals.bInps - colTotals.cInps)}
                  </td>
                  <td className={`${td} text-xs tabular-nums`}>
                    {budgetDeltaPercentLabel(colTotals.cInps, colTotals.bInps)}
                  </td>
                  <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                    {formatPersonnelBudgetAmount(colTotals.cInail)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(colTotals.bInail)}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatPersonnelBudgetAmount(colTotals.bInail - colTotals.cInail)}
                  </td>
                  <td className={`${td} text-xs tabular-nums`}>
                    {budgetDeltaPercentLabel(colTotals.cInail, colTotals.bInail)}
                  </td>
                  <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                    {formatPersonnelBudgetAmount(colTotals.cTfr)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(colTotals.bTfr)}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatPersonnelBudgetAmount(colTotals.bTfr - colTotals.cTfr)}
                  </td>
                  <td className={`${td} text-xs tabular-nums`}>
                    {budgetDeltaPercentLabel(colTotals.cTfr, colTotals.bTfr)}
                  </td>
                  <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                    {formatPersonnelBudgetAmount(colTotals.cCompany)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(colTotals.bCompany)}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatPersonnelBudgetAmount(colTotals.bCompany - colTotals.cCompany)}
                  </td>
                  <td className={`${td} text-xs tabular-nums`}>
                    {budgetDeltaPercentLabel(colTotals.cCompany, colTotals.bCompany)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {dept.rows.length === 0 ? (
            <p className="text-sm text-[var(--prom-muted)]">Nessun dipendente in questo reparto.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function GrandTotalTable({
  totals,
  th,
  td
}: {
  totals: BudgetColTotals;
  th: string;
  td: string;
}): React.JSX.Element {
  return (
    <section className="rounded-xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-3 shadow-[var(--card-shadow)]">
      <h2 className="mb-3 text-lg font-semibold text-[var(--prom-text)]">Totale budget (tutti i centri di costo)</h2>
      <div className="overflow-x-auto">
        <table className="min-w-[1680px] w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th} />
              <th className={th} colSpan={4}>
                RAL
              </th>
              <th className={th} colSpan={4}>
                Straordinari
              </th>
              <th className={th} colSpan={4}>
                Trasferte
              </th>
              <th className={th} colSpan={4}>
                INPS
              </th>
              <th className={th} colSpan={4}>
                INAIL
              </th>
              <th className={th} colSpan={4}>
                TFR
              </th>
              <th className={th} colSpan={4}>
                Tot. costo az.
              </th>
            </tr>
            <tr>
              <th className={th} />
              {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                <th key={`gt-ral-${h}`} className={th}>
                  {h}
                </th>
              ))}
              {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                <th key={`gt-ov-${h}`} className={th}>
                  {h}
                </th>
              ))}
              {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                <th key={`gt-tr-${h}`} className={th}>
                  {h}
                </th>
              ))}
              {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                <th key={`gt-inps-${h}`} className={th}>
                  {h}
                </th>
              ))}
              {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                <th key={`gt-inail-${h}`} className={th}>
                  {h}
                </th>
              ))}
              {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                <th key={`gt-tfr-${h}`} className={th}>
                  {h}
                </th>
              ))}
              {(["ACT", "BDG", "Δ", "Δ %"] as const).map((h) => (
                <th key={`gt-co-${h}`} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <td className={td}>Totali</td>
              <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                {formatPersonnelBudgetAmount(totals.cRal)}
              </td>
              <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(totals.bRal)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPersonnelBudgetAmount(totals.bRal - totals.cRal)}
              </td>
              <td className={`${td} text-xs tabular-nums`}>
                {budgetDeltaPercentLabel(totals.cRal, totals.bRal)}
              </td>
              <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                {formatPersonnelBudgetAmount(totals.cOvertime)}
              </td>
              <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(totals.bOvertime)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPersonnelBudgetAmount(totals.bOvertime - totals.cOvertime)}
              </td>
              <td className={`${td} text-xs tabular-nums`}>
                {budgetDeltaPercentLabel(totals.cOvertime, totals.bOvertime)}
              </td>
              <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                {formatPersonnelBudgetAmount(totals.cTravel)}
              </td>
              <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(totals.bTravel)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPersonnelBudgetAmount(totals.bTravel - totals.cTravel)}
              </td>
              <td className={`${td} text-xs tabular-nums`}>
                {budgetDeltaPercentLabel(totals.cTravel, totals.bTravel)}
              </td>
              <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                {formatPersonnelBudgetAmount(totals.cInps)}
              </td>
              <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(totals.bInps)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPersonnelBudgetAmount(totals.bInps - totals.cInps)}
              </td>
              <td className={`${td} text-xs tabular-nums`}>
                {budgetDeltaPercentLabel(totals.cInps, totals.bInps)}
              </td>
              <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                {formatPersonnelBudgetAmount(totals.cInail)}
              </td>
              <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(totals.bInail)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPersonnelBudgetAmount(totals.bInail - totals.cInail)}
              </td>
              <td className={`${td} text-xs tabular-nums`}>
                {budgetDeltaPercentLabel(totals.cInail, totals.bInail)}
              </td>
              <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                {formatPersonnelBudgetAmount(totals.cTfr)}
              </td>
              <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(totals.bTfr)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPersonnelBudgetAmount(totals.bTfr - totals.cTfr)}
              </td>
              <td className={`${td} text-xs tabular-nums`}>
                {budgetDeltaPercentLabel(totals.cTfr, totals.bTfr)}
              </td>
              <td className={`${td} tabular-nums text-[var(--prom-muted)]`}>
                {formatPersonnelBudgetAmount(totals.cCompany)}
              </td>
              <td className={`${td} tabular-nums`}>{formatPersonnelBudgetAmount(totals.bCompany)}</td>
              <td className={`${td} tabular-nums`}>
                {formatPersonnelBudgetAmount(totals.bCompany - totals.cCompany)}
              </td>
              <td className={`${td} text-xs tabular-nums`}>
                {budgetDeltaPercentLabel(totals.cCompany, totals.bCompany)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PersonnelBudgetPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [snap, setSnap] = useState<PersonnelBudgetSnapshot | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [departments, setDepartments] = useState<PersonnelBudgetDepartment[]>([]);
  const [draftByUser, setDraftByUser] = useState<Record<string, BudgetDraft>>({});
  const [expandedByDeptId, setExpandedByDeptId] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const hydrateBudgetSnapshot = useCallback((data: PersonnelBudgetSnapshot): void => {
    setSnap(data);
    const sorted = [...data.departments].sort((a, b) => {
      if (a.costCenterId == null) return 1;
      if (b.costCenterId == null) return -1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.costCenterName.localeCompare(b.costCenterName);
    });
    setDepartments(sorted);
    const drafts: Record<string, BudgetDraft> = {};
    for (const d of sorted) {
      for (const r of d.rows) {
        const b = r.budget;
        const sug = r.suggestedBudget;
        drafts[r.userId] = {
          ral: pickBudgetInputStr(b, sug, "ral"),
          overtime: pickBudgetInputStr(b, sug, "overtime"),
          travel: pickBudgetInputStr(b, sug, "travel"),
          inps: pickBudgetInputStr(b, sug, "inps"),
          inail: pickBudgetInputStr(b, sug, "inail"),
          tfr: pickBudgetInputStr(b, sug, "tfr")
        };
      }
    }
    setDraftByUser(drafts);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }): Promise<void> => {
      const silent = Boolean(opts?.silent);
      const t = getToken();
      if (!t) {
        setLoading(false);
        return;
      }
      setToken(t);
      setErr(null);
      if (!silent) {
        setLoading(true);
      }
      try {
        const me = await fetchCurrentUser(t).catch(() => getSessionUser() as SessionUser);
        const u = me ?? getSessionUser();
        setUser(u);
        if (!sessionCanNexaAdmin(u)) {
          router.replace("/");
          return;
        }
        if (!silent) {
          const warm = takePersonnelBudgetWarmPayload(u.id, year, month);
          if (warm) {
            hydrateBudgetSnapshot(warm.data);
            setLoading(false);
            void load({ silent: true });
            return;
          }
        }
        const data = await fetchPersonnelBudget(t, year, month);
        hydrateBudgetSnapshot(data);
      } catch (e) {
        if (shouldClearSessionOnUnauthorizedApiError(e)) {
          router.replace("/login");
          return;
        }
        setErr(e instanceof Error ? e.message : "Errore caricamento");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [year, month, router, hydrateBudgetSnapshot]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const { deptTotalsMap, pageTotals } = useMemo(() => {
    const deptTotalsMap: Record<string, BudgetColTotals> = {};
    let page = emptyColTotals();
    for (const dept of departments) {
      const t = computeDeptColTotals(dept, draftByUser);
      deptTotalsMap[deptSortId(dept)] = t;
      page = addColTotals(page, t);
    }
    return { deptTotalsMap, pageTotals: page };
  }, [departments, draftByUser]);

  function isDeptExpanded(id: string): boolean {
    return expandedByDeptId[id] !== false;
  }

  const toggleDept = (id: string): void => {
    setExpandedByDeptId((prev) => ({
      ...prev,
      [id]: !(prev[id] !== false)
    }));
  };

  const onDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event;
    if (!over || active.id === over.id || !token) {
      return;
    }
    const oldIdx = departments.findIndex((d) => deptSortId(d) === String(active.id));
    const newIdx = departments.findIndex((d) => deptSortId(d) === String(over.id));
    if (oldIdx < 0 || newIdx < 0) {
      return;
    }
    const next = arrayMove(departments, oldIdx, newIdx);
    setDepartments(next);
    const withCc = next.filter((d) => d.costCenterId != null);
    const order = withCc.map((d, i) => ({
      costCenterId: d.costCenterId as string,
      sortOrder: i
    }));
    try {
      await patchPersonnelBudgetCostCenterOrder(token, { year, order });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Salvataggio ordine fallito");
      void load();
    }
  };

  const updateDraft = (userId: string, field: keyof BudgetDraft, value: string): void => {
    setDraftByUser((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value }
    }));
  };

  const exportActualExcel = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t) {
      return;
    }
    setExporting(true);
    setErr(null);
    try {
      const blob = await downloadPersonnelBudgetActualExport(t, year, month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexa-personnel-budget-actual-${year}-${String(month).padStart(2, "0")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export fallito");
    } finally {
      setExporting(false);
    }
  };

  const saveBudgets = async (): Promise<void> => {
    if (!token || !snap) {
      return;
    }
    setSaving(true);
    setErr(null);
    const cells: Array<{
      userId: string;
      budgetRal: number | null;
      budgetOvertime: number | null;
      budgetTravel: number | null;
      budgetInps: number | null;
      budgetInail: number | null;
      budgetTfr: number | null;
    }> = [];
    for (const d of departments) {
      for (const r of d.rows) {
        const dr = draftByUser[r.userId] ?? {};
        cells.push({
          userId: r.userId,
          budgetRal: parsePersonnelBudgetMoneyInput(dr.ral ?? ""),
          budgetOvertime: parsePersonnelBudgetMoneyInput(dr.overtime ?? ""),
          budgetTravel: parsePersonnelBudgetMoneyInput(dr.travel ?? ""),
          budgetInps: parsePersonnelBudgetMoneyInput(dr.inps ?? ""),
          budgetInail: parsePersonnelBudgetMoneyInput(dr.inail ?? ""),
          budgetTfr: parsePersonnelBudgetMoneyInput(dr.tfr ?? "")
        });
      }
    }
    try {
      await patchPersonnelBudgetCells(token, { year, month, cells });
      await load();
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento budget…</p>;
  }
  if (!user || !sessionCanNexaAdmin(user)) {
    return null;
  }

  const th =
    "whitespace-nowrap border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-2 py-2 text-left text-xs font-medium text-[var(--prom-text)]";
  const td = "border border-[var(--prom-line)] px-2 py-1.5 text-sm text-[var(--prom-text)]";

  const ids = departments.map(deptSortId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Budget mensile</h1>
          <p className="text-sm text-[var(--prom-muted)]">
            Pianificazione per mese; consuntivo da cedolini, straordinari e note spese. Trascina i reparti per
            riordinare; chiudi un centro di costo per vedere il riepilogo sul titolo. Usa le altre schede per
            annuale, forecast e analysis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <label className="text-sm text-[var(--prom-muted)]">
            Mese{" "}
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="ml-1 rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-2 py-1.5"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Aggiorna
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled={exporting || !token}
            onClick={() => void exportActualExcel()}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? "Export…" : "Export Actual (Excel)"}
          </Button>
          <Button type="button" onClick={() => void saveBudgets()} disabled={saving || !snap}>
            {saving ? "Salvataggio…" : "Salva budget"}
          </Button>
        </div>
      </div>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {snap ? (
        <p className="text-xs text-[var(--prom-muted)]">
          Periodo consuntivo: <strong>{snap.period}</strong> —{" "}
          importi in EUR (profilo payroll Italia).{" "}
          Colonne: <strong>B</strong> = budget (editabile), <strong>C</strong> = consuntivo da cedolino /
          competenze. Per dipendenti <strong>IT</strong>, le celle budget INPS, INAIL e TFR si precompilano con le
          stime da anagrafica quando il budget non è ancora valorizzato (verificare sempre con il consulente).
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {departments.map((dept) => {
            const sid = deptSortId(dept);
            return (
              <SortableDeptSection
                key={sid}
                dept={dept}
                expanded={isDeptExpanded(sid)}
                onToggle={() => toggleDept(sid)}
                draftByUser={draftByUser}
                colTotals={deptTotalsMap[sid] ?? emptyColTotals()}
                updateDraft={updateDraft}
                th={th}
                td={td}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      {departments.length > 0 ? <GrandTotalTable totals={pageTotals} th={th} td={td} /> : null}

      <p className="text-xs text-[var(--prom-muted)]">
        ** Totale consuntivo: lordo mese + contributi datore stimati + accantonamento TFR (schema IT da anagrafica:
        settore IVS, premio INAIL in permille, divisore TFR)
        più trasferte. Valori normativi vanno
        allineati annualmente con consulenza del lavoro e tabella INAIL reale.
      </p>

      <Link href="/mappa-portale" className="text-sm text-[var(--prom-gold)] hover:underline">
        ← Torna alla dashboard
      </Link>
    </div>
  );
}
