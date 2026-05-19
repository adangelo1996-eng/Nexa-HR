"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
        inailPermille: form.inailPermille,
        tfrDivisor: form.tfrDivisor,
        welfarePercent: form.welfarePercent,
        bonusProvisionPercent: form.bonusProvisionPercent
      });
      setForm(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento assunzioni…</p>;
  }
  if (!user || !sessionCanNexaAdmin(user) || !form) {
    return null;
  }

  const num = (v: number | null): string => (v != null && Number.isFinite(v) ? String(v) : "");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Assunzioni budget</h1>
          <p className="text-sm text-[var(--prom-muted)]">
            Aliquote usate per stime INPS, INAIL, TFR e accantonamenti nel budget e nel forecast.
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

      <div className="grid gap-4 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,#0d1219_90%,var(--prom-surface-soft))] p-4">
        <label className="block text-sm">
          <span className="text-[var(--prom-muted)]">INPS datore (%)</span>
          <input
            type="number"
            step="0.01"
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
            value={num(form.employerInpsPercent)}
            onChange={(e) =>
              setForm({
                ...form,
                employerInpsPercent: e.target.value === "" ? null : Number(e.target.value)
              })
            }
            placeholder="Vuoto = profilo dipendente / default"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--prom-muted)]">INAIL (‰ permille)</span>
          <input
            type="number"
            step="0.1"
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
            value={num(form.inailPermille)}
            onChange={(e) =>
              setForm({
                ...form,
                inailPermille: e.target.value === "" ? null : Number(e.target.value)
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--prom-muted)]">Divisore TFR</span>
          <input
            type="number"
            step="0.01"
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
            value={num(form.tfrDivisor)}
            onChange={(e) =>
              setForm({
                ...form,
                tfrDivisor: e.target.value === "" ? null : Number(e.target.value)
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--prom-muted)]">Welfare (% su lordo)</span>
          <input
            type="number"
            step="0.01"
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
            value={String(form.welfarePercent ?? 0)}
            onChange={(e) =>
              setForm({ ...form, welfarePercent: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--prom-muted)]">Accantonamento bonus (% su lordo)</span>
          <input
            type="number"
            step="0.01"
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2"
            value={String(form.bonusProvisionPercent ?? 0)}
            onChange={(e) =>
              setForm({ ...form, bonusProvisionPercent: Number(e.target.value) || 0 })
            }
          />
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvataggio…" : "Salva assunzioni"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Annulla modifiche
        </Button>
      </div>
    </div>
  );
}


