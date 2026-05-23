"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PersonnelBudgetAssumptionsForm } from "@/components/personnel-budget/personnel-budget-assumptions-form";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import {
  fetchCurrentUser,
  fetchPersonnelBudgetAssumptions,
  patchPersonnelBudgetAssumptions,
  type PersonnelBudgetAssumptionsDto
} from "@/lib/api";
import {
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

export default function PersonnelBudgetAssumptionsPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<PersonnelBudgetAssumptionsDto | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const me = await fetchCurrentUser(t);
      setUser(me);
      if (!sessionCanNexaAdmin(me)) {
        setLoading(false);
        return;
      }
      const a = await fetchPersonnelBudgetAssumptions(t, year);
      setForm(a);
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

  async function save(): Promise<void> {
    const t = getToken();
    if (!t || !form) return;
    setSaving(true);
    setErr(null);
    try {
      const next = await patchPersonnelBudgetAssumptions(t, {
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
      });
      setForm(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento assumptions…</p>;
  }
  if (!user || !sessionCanNexaAdmin(user) || !form) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Assumptions</h1>
          <p className="text-sm text-[var(--prom-muted)]">
            Parametri per stime INPS, INAIL, TFR, inflazione e ipotesi di assunzione/uscita usati nel budget e nel
            forecast. Ogni campo supporta il suggerimento HEBB (icona ✨).
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {err ? <p className="text-sm text-rose-500">{err}</p> : null}

      <PersonnelBudgetAssumptionsForm
        form={form}
        year={year}
        saving={saving}
        onChange={setForm}
        onSave={() => void save()}
        onReload={() => void load()}
      />
    </div>
  );
}
