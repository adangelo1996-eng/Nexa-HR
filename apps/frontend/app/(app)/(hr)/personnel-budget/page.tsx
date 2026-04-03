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
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isSwissPayrollFeatureEnabled } from "@/lib/nexa-swiss-payroll-flag";
import {
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
  getToken,
  getSessionUser,
  sessionCanAccessPersonnelBudgetArea,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

type BudgetDraft = Partial<{
  ral: string;
  overtime: string;
  travel: string;
  inps: string;
  inail: string;
  tfr: string;
}>;

function deptSortId(d: PersonnelBudgetDepartment): string {
  return d.costCenterId ?? "__none__";
}

function parseChf(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function formatNum(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function pickBudgetInputStr(
  b: Partial<PersonnelBudgetMoney>,
  sug: Partial<PersonnelBudgetMoney> | undefined,
  key: keyof PersonnelBudgetMoney
): string {
  const v = b[key];
  if (v != null && Number.isFinite(Number(v))) {
    return String(v);
  }
  const sv = sug?.[key];
  if (sv != null && Number.isFinite(Number(sv))) {
    return String(sv);
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

function SortableDeptSection({
  dept,
  children
}: {
  dept: PersonnelBudgetDepartment;
  children: React.ReactNode;
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
      <div className="flex items-center gap-2 border-b border-[var(--prom-line)] px-3 py-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] active:cursor-grabbing"
          aria-label={`Trascina reparto ${dept.costCenterName}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-[var(--prom-text)]">{dept.costCenterName}</h2>
      </div>
      <div className="overflow-x-auto p-3">{children}</div>
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }
    setToken(t);
    setErr(null);
    try {
      const me = await fetchCurrentUser(t).catch(() => getSessionUser() as SessionUser);
      const u = me ?? getSessionUser();
      setUser(u);
      if (!sessionCanAccessPersonnelBudgetArea(u)) {
        router.replace("/");
        return;
      }
      const data = await fetchPersonnelBudget(t, year, month);
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
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [year, month, router]);

  useEffect(() => {
    void load();
  }, [load]);

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
          budgetRal: parseChf(dr.ral ?? ""),
          budgetOvertime: parseChf(dr.overtime ?? ""),
          budgetTravel: parseChf(dr.travel ?? ""),
          budgetInps: parseChf(dr.inps ?? ""),
          budgetInail: parseChf(dr.inail ?? ""),
          budgetTfr: parseChf(dr.tfr ?? "")
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
  if (!user || !sessionCanAccessPersonnelBudgetArea(user)) {
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
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Budget personale</h1>
          <p className="text-sm text-[var(--prom-muted)]">
            Pianificazione annuale per mese; consuntivo da cedolini, straordinari e note spese. Trascina i reparti
            per riordinare.
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
          <Button type="button" onClick={() => void saveBudgets()} disabled={saving || !snap}>
            {saving ? "Salvataggio…" : "Salva budget"}
          </Button>
        </div>
      </div>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {snap ? (
        <p className="text-xs text-[var(--prom-muted)]">
          Periodo consuntivo: <strong>{snap.period}</strong> —{" "}
          {isSwissPayrollFeatureEnabled()
            ? "importi in EUR per profilo IT, CHF per profilo CH dove applicabile."
            : "importi in EUR (payroll Svizzera disattivato: consuntivo e stime da motore IT). "}
          Colonne: <strong>B</strong> = budget (editabile), <strong>C</strong> = consuntivo da cedolino /
          competenze. Per dipendenti <strong>IT</strong>, le celle budget INPS, INAIL e TFR si precompilano con le
          stime da anagrafica quando il budget non è ancora valorizzato (verificare sempre con il consulente).
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {departments.map((dept) => (
            <SortableDeptSection key={deptSortId(dept)} dept={dept}>
              <table className="min-w-[1100px] w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={th}>Dipendente</th>
                    <th className={th} colSpan={2}>
                      RAL
                    </th>
                    <th className={th} colSpan={2}>
                      Straordinari
                    </th>
                    <th className={th} colSpan={2}>
                      Trasferte
                    </th>
                    <th className={th} colSpan={2}>
                      INPS (stima datore)
                    </th>
                    <th className={th} colSpan={2}>
                      INAIL (stima datore)
                    </th>
                    <th className={th} colSpan={2}>
                      TFR (accanton.)
                    </th>
                    <th className={th} colSpan={2}>
                      Tot. costo az.**
                    </th>
                  </tr>
                  <tr>
                    <th className={th} />
                    <th className={th}>B</th>
                    <th className={th}>C</th>
                    <th className={th}>B</th>
                    <th className={th}>C</th>
                    <th className={th}>B</th>
                    <th className={th}>C</th>
                    <th className={th}>B</th>
                    <th className={th}>C</th>
                    <th className={th}>B</th>
                    <th className={th}>C</th>
                    <th className={th}>B</th>
                    <th className={th}>C</th>
                    <th className={th}>B</th>
                    <th className={th}>C</th>
                  </tr>
                </thead>
                <tbody>
                  {dept.rows.map((row: PersonnelBudgetRow) => {
                    const dr = draftByUser[row.userId] ?? {};
                    const merged: Partial<PersonnelBudgetMoney> = {
                      ral: parseChf(dr.ral ?? "") ?? row.budget.ral,
                      overtime: parseChf(dr.overtime ?? "") ?? row.budget.overtime,
                      travel: parseChf(dr.travel ?? "") ?? row.budget.travel,
                      inps: parseChf(dr.inps ?? "") ?? row.budget.inps,
                      inail: parseChf(dr.inail ?? "") ?? row.budget.inail,
                      tfr: parseChf(dr.tfr ?? "") ?? row.budget.tfr
                    };
                    const bDraftTot = budgetRowTotal(merged);
                    return (
                      <tr key={row.userId}>
                        <td className={td}>
                          <span className="font-medium">{row.fullName}</span>
                        </td>
                        <td className={td}>
                          <input
                            className="w-24 rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                            value={dr.ral ?? ""}
                            onChange={(e) => updateDraft(row.userId, "ral", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatNum(row.actual.ral)}</td>
                        <td className={td}>
                          <input
                            className="w-24 rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                            value={dr.overtime ?? ""}
                            onChange={(e) => updateDraft(row.userId, "overtime", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatNum(row.actual.overtime)}</td>
                        <td className={td}>
                          <input
                            className="w-24 rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                            value={dr.travel ?? ""}
                            onChange={(e) => updateDraft(row.userId, "travel", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatNum(row.actual.travel)}</td>
                        <td className={td}>
                          <input
                            className="w-24 rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                            value={dr.inps ?? ""}
                            onChange={(e) => updateDraft(row.userId, "inps", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatNum(row.actual.inps)}</td>
                        <td className={td}>
                          <input
                            className="w-24 rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                            value={dr.inail ?? ""}
                            onChange={(e) => updateDraft(row.userId, "inail", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatNum(row.actual.inail)}</td>
                        <td className={td}>
                          <input
                            className="w-24 rounded border border-[var(--prom-line)] bg-transparent px-1 py-0.5"
                            value={dr.tfr ?? ""}
                            onChange={(e) => updateDraft(row.userId, "tfr", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatNum(row.actual.tfr)}</td>
                        <td className={`${td} font-medium`}>
                          {bDraftTot > 0 || Object.keys(row.budget).length > 0
                            ? formatNum(
                                (merged.ral ?? 0) +
                                  (merged.overtime ?? 0) +
                                  (merged.travel ?? 0) +
                                  (merged.inps ?? 0) +
                                  (merged.inail ?? 0) +
                                  (merged.tfr ?? 0)
                              )
                            : "—"}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {formatNum(row.actual.totalCompanyCost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {dept.rows.length === 0 ? (
                <p className="text-sm text-[var(--prom-muted)]">Nessun dipendente in questo reparto.</p>
              ) : null}
            </SortableDeptSection>
          ))}
        </SortableContext>
      </DndContext>

      <p className="text-xs text-[var(--prom-muted)]">
        ** Totale consuntivo: lordo mese + contributi datore stimati + accantonamento TFR (schema IT da anagrafica:
        settore IVS, premio INAIL in permille, divisore TFR)
        {isSwissPayrollFeatureEnabled() ? " oppure modello CH," : ""} più trasferte. Valori normativi vanno
        allineati annualmente con consulenza del lavoro e tabella INAIL reale.
      </p>

      <Link href="/" className="text-sm text-[var(--prom-gold)] hover:underline">
        ← Torna alla dashboard
      </Link>
    </div>
  );
}
