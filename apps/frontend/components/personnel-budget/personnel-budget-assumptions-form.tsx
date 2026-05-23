"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  HebbFieldAssistProvider,
  HebbInput,
  HebbSelect,
  HebbTextarea
} from "@/components/hebb-field-assist";
import type { PersonnelBudgetAssumptionsDto } from "@/lib/api";
import { PERSONNEL_BUDGET_ASSUMPTIONS_FORM_ID } from "@/lib/personnel-budget-assumptions";

function num(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? String(v) : "";
}

function parseOptionalNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseRequiredNum(raw: string, fallback: number): number {
  const n = parseOptionalNum(raw);
  return n != null ? n : fallback;
}

export type PersonnelBudgetAssumptionsFormProps = {
  form: PersonnelBudgetAssumptionsDto;
  year: number;
  saving: boolean;
  onChange: (next: PersonnelBudgetAssumptionsDto) => void;
  onSave: () => void;
  onReload: () => void;
};

export function PersonnelBudgetAssumptionsForm({
  form,
  year,
  saving,
  onChange,
  onSave,
  onReload
}: PersonnelBudgetAssumptionsFormProps): React.JSX.Element {
  const partialForm = useMemo(
    () => ({
      year,
      employerInpsPercent: form.employerInpsPercent,
      employeeInpsPercent: form.employeeInpsPercent,
      inailPermille: form.inailPermille,
      tfrDivisor: form.tfrDivisor,
      welfarePercent: form.welfarePercent,
      bonusProvisionPercent: form.bonusProvisionPercent,
      inflationPercentAnnual: form.inflationPercentAnnual,
      payrollIndexationPercent: form.payrollIndexationPercent,
      defaultPayMonthsPerYear: form.defaultPayMonthsPerYear,
      defaultWeeklyContractHours: form.defaultWeeklyContractHours,
      plannedNewHires: form.plannedNewHires,
      plannedExits: form.plannedExits,
      avgNewHireRalAnnual: form.avgNewHireRalAnnual,
      employerInpsDiscountPercent: form.employerInpsDiscountPercent,
      overtimeBudgetPercentOnGross: form.overtimeBudgetPercentOnGross,
      travelBudgetPerFteMonthly: form.travelBudgetPerFteMonthly,
      compilationNotes: form.compilationNotes
    }),
    [form, year]
  );

  const ctx = useMemo(() => ({ year, section: "personnel-budget-assumptions" }), [year]);

  return (
    <HebbFieldAssistProvider formId={PERSONNEL_BUDGET_ASSUMPTIONS_FORM_ID} partialForm={partialForm} context={ctx}>
      <div className="space-y-8">
        <section className="grid gap-4 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,#0d1219_90%,var(--prom-surface-soft))] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            Aliquote costo datore
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <HebbInput
              label="INPS datore (%)"
              fieldKey="employerInpsPercent"
              value={num(form.employerInpsPercent)}
              onChange={(v) => setForm({ ...form, employerInpsPercent: parseOptionalNum(v) })}
              type="number"
              step="0.01"
              placeholder="Vuoto = profilo dipendente"
            />
            <HebbInput
              label="INPS dipendente (%)"
              fieldKey="employeeInpsPercent"
              value={num(form.employeeInpsPercent)}
              onChange={(v) => setForm({ ...form, employeeInpsPercent: parseOptionalNum(v) })}
              type="number"
              step="0.01"
            />
            <HebbInput
              label="INAIL (‰ permille)"
              fieldKey="inailPermille"
              value={num(form.inailPermille)}
              onChange={(v) => setForm({ ...form, inailPermille: parseOptionalNum(v) })}
              type="number"
              step="0.1"
            />
            <HebbInput
              label="Divisore TFR"
              fieldKey="tfrDivisor"
              value={num(form.tfrDivisor)}
              onChange={(v) => setForm({ ...form, tfrDivisor: parseOptionalNum(v) })}
              type="number"
              step="0.01"
            />
            <HebbInput
              label="Sconto INPS datore (%)"
              fieldKey="employerInpsDiscountPercent"
              value={String(form.employerInpsDiscountPercent ?? 0)}
              onChange={(v) =>
                setForm({ ...form, employerInpsDiscountPercent: parseRequiredNum(v, 0) })
              }
              type="number"
              step="0.01"
            />
            <HebbInput
              label="Welfare (% su lordo)"
              fieldKey="welfarePercent"
              value={String(form.welfarePercent ?? 0)}
              onChange={(v) => setForm({ ...form, welfarePercent: parseRequiredNum(v, 0) })}
              type="number"
              step="0.01"
            />
            <HebbInput
              label="Accantonamento bonus (% su lordo)"
              fieldKey="bonusProvisionPercent"
              value={String(form.bonusProvisionPercent ?? 0)}
              onChange={(v) => setForm({ ...form, bonusProvisionPercent: parseRequiredNum(v, 0) })}
              type="number"
              step="0.01"
            />
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,#0d1219_90%,var(--prom-surface-soft))] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            Indici e default azienda
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <HebbInput
              label="Inflazione annua (%)"
              fieldKey="inflationPercentAnnual"
              value={String(form.inflationPercentAnnual)}
              onChange={(v) => setForm({ ...form, inflationPercentAnnual: parseRequiredNum(v, 2.5) })}
              type="number"
              step="0.1"
            />
            <HebbInput
              label="Indicizzazione payroll (%)"
              fieldKey="payrollIndexationPercent"
              value={String(form.payrollIndexationPercent)}
              onChange={(v) => setForm({ ...form, payrollIndexationPercent: parseRequiredNum(v, 2) })}
              type="number"
              step="0.1"
            />
            <HebbSelect
              label="Mensilità standard"
              fieldKey="defaultPayMonthsPerYear"
              value={String(form.defaultPayMonthsPerYear)}
              onChange={(v) =>
                setForm({ ...form, defaultPayMonthsPerYear: parseRequiredNum(v, 13) })
              }
            >
              <option value="13">13</option>
              <option value="14">14</option>
            </HebbSelect>
            <HebbInput
              label="Ore settimanali contratto"
              fieldKey="defaultWeeklyContractHours"
              value={String(form.defaultWeeklyContractHours)}
              onChange={(v) => setForm({ ...form, defaultWeeklyContractHours: parseRequiredNum(v, 40) })}
              type="number"
              step="0.5"
            />
            <HebbInput
              label="Straordinari budget (% su lordo)"
              fieldKey="overtimeBudgetPercentOnGross"
              value={String(form.overtimeBudgetPercentOnGross)}
              onChange={(v) =>
                setForm({ ...form, overtimeBudgetPercentOnGross: parseRequiredNum(v, 3) })
              }
              type="number"
              step="0.1"
            />
            <HebbInput
              label="Trasferte (€/FTE/mese)"
              fieldKey="travelBudgetPerFteMonthly"
              value={String(form.travelBudgetPerFteMonthly)}
              onChange={(v) =>
                setForm({ ...form, travelBudgetPerFteMonthly: parseRequiredNum(v, 150) })
              }
              type="number"
              step="1"
            />
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,#0d1219_90%,var(--prom-surface-soft))] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            Ipotesi assunzioni / uscite
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <HebbInput
              label="Assunzioni pianificate (n.)"
              fieldKey="plannedNewHires"
              value={String(form.plannedNewHires)}
              onChange={(v) => setForm({ ...form, plannedNewHires: Math.max(0, parseRequiredNum(v, 0)) })}
              type="number"
              step="1"
              min={0}
            />
            <HebbInput
              label="Uscite pianificate (n.)"
              fieldKey="plannedExits"
              value={String(form.plannedExits)}
              onChange={(v) => setForm({ ...form, plannedExits: Math.max(0, parseRequiredNum(v, 0)) })}
              type="number"
              step="1"
              min={0}
            />
            <HebbInput
              label="RAL media nuove assunzioni (€/anno)"
              fieldKey="avgNewHireRalAnnual"
              value={num(form.avgNewHireRalAnnual)}
              onChange={(v) => setForm({ ...form, avgNewHireRalAnnual: parseOptionalNum(v) })}
              type="number"
              step="500"
            />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,#0d1219_90%,var(--prom-surface-soft))] p-4">
          <HebbTextarea
            label="Note compilazione (contesto AI)"
            fieldKey="compilationNotes"
            value={form.compilationNotes}
            onChange={(v) => setForm({ ...form, compilationNotes: v })}
            placeholder="Es. priorità CDC vendite, vincoli assunzioni Q3, politica welfare…"
          />
        </section>

        <div className="flex gap-2">
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Salvataggio…" : "Salva assumptions"}
          </Button>
          <Button type="button" variant="secondary" onClick={onReload}>
            Annulla modifiche
          </Button>
        </div>
      </div>
    </HebbFieldAssistProvider>
  );

  function setForm(next: PersonnelBudgetAssumptionsDto): void {
    onChange(next);
  }
}
