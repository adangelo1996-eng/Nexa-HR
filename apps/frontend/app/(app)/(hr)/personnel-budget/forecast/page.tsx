"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fetchPersonnelBudgetForecastSnapshot,
  fetchCurrentUser,
  patchPersonnelBudgetForecastCells,
  type PersonnelBudgetForecastRow,
  type PersonnelBudgetMoney
} from "@/lib/api";
import { formatPersonnelBudgetAmount } from "@/lib/personnel-budget-format";
import {
  getToken,
  sessionCanAccessPersonnelBudgetArea,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

type ForecastDraft = Partial<{
  ral: string;
  overtime: string;
  travel: string;
  inps: string;
  inail: string;
  tfr: string;
}>;

function parseChf(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function rowForecastTotal(f: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number }): number {
  const ral = f.ral ?? 0;
  const ot = f.overtime ?? 0;
  const tr = f.travel ?? 0;
  const ip = f.inps ?? 0;
  const ia = f.inail ?? 0;
  const tf = f.tfr ?? 0;
  if (f.totalCompanyCost != null && Number.isFinite(f.totalCompanyCost)) {
    return f.totalCompanyCost;
  }
  return ral + ot + tr + ip + ia + tf;
}

export default function PersonnelBudgetForecastPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [snap, setSnap] = useState<Awaited<ReturnType<typeof fetchPersonnelBudgetForecastSnapshot>> | null>(
    null
  );
  const [draftByUser, setDraftByUser] = useState<Record<string, ForecastDraft>>({});

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
      if (!sessionCanAccessPersonnelBudgetArea(me)) {
        setLoading(false);
        return;
      }
      const data = await fetchPersonnelBudgetForecastSnapshot(t, year, month);
      setSnap(data);
      const next: Record<string, ForecastDraft> = {};
      for (const d of data.departments) {
        for (const r of d.rows) {
          const f = r.forecast;
          next[r.userId] = {
            ral: f.ral != null ? String(f.ral) : "",
            overtime: f.overtime != null ? String(f.overtime) : "",
            travel: f.travel != null ? String(f.travel) : "",
            inps: f.inps != null ? String(f.inps) : "",
            inail: f.inail != null ? String(f.inail) : "",
            tfr: f.tfr != null ? String(f.tfr) : ""
          };
        }
      }
      setDraftByUser(next);
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(userId: string, key: keyof ForecastDraft, value: string): void {
    setDraftByUser((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [key]: value }
    }));
  }

  async function save(): Promise<void> {
    const t = getToken();
    if (!t || !snap) return;
    setSaving(true);
    setErr(null);
    const cells: Array<{
      userId: string;
      forecastRal?: number | null;
      forecastOvertime?: number | null;
      forecastTravel?: number | null;
      forecastInps?: number | null;
      forecastInail?: number | null;
      forecastTfr?: number | null;
    }> = [];
    for (const d of snap.departments) {
      for (const r of d.rows) {
        const dr = draftByUser[r.userId] ?? {};
        cells.push({
          userId: r.userId,
          forecastRal: parseChf(dr.ral ?? ""),
          forecastOvertime: parseChf(dr.overtime ?? ""),
          forecastTravel: parseChf(dr.travel ?? ""),
          forecastInps: parseChf(dr.inps ?? ""),
          forecastInail: parseChf(dr.inail ?? ""),
          forecastTfr: parseChf(dr.tfr ?? "")
        });
      }
    }
    try {
      await patchPersonnelBudgetForecastCells(t, { year, month, cells });
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
  }

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento forecast…</p>;
  }
  if (!user || !sessionCanAccessPersonnelBudgetArea(user)) {
    return null;
  }

  const now = new Date();
  const isFutureMonth =
    year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

  const th =
    "whitespace-nowrap border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-1 py-1.5 text-left text-[10px] font-medium text-[var(--prom-text)] sm:text-xs";
  const td = "border border-[var(--prom-line)] px-1 py-1 text-[10px] text-[var(--prom-text)] sm:text-xs";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Forecast</h1>
        <p className="text-sm text-[var(--prom-muted)]">
          Confronto Actual / Budget / Forecast per il mese selezionato. Il forecast è modificabile anche dopo
          l&apos;approvazione del budget annuo. Per i mesi futuri il consuntivo non è ancora disponibile.
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
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          Aggiorna
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !snap}>
          {saving ? "Salvataggio…" : "Salva forecast"}
        </Button>
      </div>

      {isFutureMonth ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Mese futuro: le colonne consuntivo restano vuote fino al periodo di competenza.
        </p>
      ) : null}

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {snap ? (
        <div className="space-y-6 overflow-x-auto">
          {snap.departments.map((dept) => (
            <div key={dept.costCenterId ?? "__none__"}>
              <h2 className="mb-2 text-sm font-semibold text-[var(--prom-text)]">{dept.costCenterName}</h2>
              <table className="min-w-[1200px] w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th} rowSpan={2}>
                      Dipendente
                    </th>
                    <th className={th} colSpan={3}>
                      RAL
                    </th>
                    <th className={th} colSpan={3}>
                      Straord.
                    </th>
                    <th className={th} colSpan={3}>
                      Trasferte
                    </th>
                    <th className={th} colSpan={3}>
                      INPS
                    </th>
                    <th className={th} colSpan={3}>
                      INAIL
                    </th>
                    <th className={th} colSpan={3}>
                      TFR
                    </th>
                    <th className={th} colSpan={3}>
                      Tot. az.
                    </th>
                  </tr>
                  <tr>
                    {Array.from({ length: 7 }).map((_, i) => [
                      <th key={`${i}-a`} className={th}>
                        A
                      </th>,
                      <th key={`${i}-b`} className={th}>
                        B
                      </th>,
                      <th key={`${i}-f`} className={th}>
                        F
                      </th>
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {dept.rows.map((row: PersonnelBudgetForecastRow) => {
                    const dr = draftByUser[row.userId] ?? {};
                    const fMerged: Partial<PersonnelBudgetMoney> & { totalCompanyCost?: number } = {
                      ral: parseChf(dr.ral ?? "") ?? row.forecast.ral,
                      overtime: parseChf(dr.overtime ?? "") ?? row.forecast.overtime,
                      travel: parseChf(dr.travel ?? "") ?? row.forecast.travel,
                      inps: parseChf(dr.inps ?? "") ?? row.forecast.inps,
                      inail: parseChf(dr.inail ?? "") ?? row.forecast.inail,
                      tfr: parseChf(dr.tfr ?? "") ?? row.forecast.tfr,
                      totalCompanyCost: rowForecastTotal({
                        ral: parseChf(dr.ral ?? "") ?? row.forecast.ral,
                        overtime: parseChf(dr.overtime ?? "") ?? row.forecast.overtime,
                        travel: parseChf(dr.travel ?? "") ?? row.forecast.travel,
                        inps: parseChf(dr.inps ?? "") ?? row.forecast.inps,
                        inail: parseChf(dr.inail ?? "") ?? row.forecast.inail,
                        tfr: parseChf(dr.tfr ?? "") ?? row.forecast.tfr
                      })
                    };
                    const b = row.budget;
                    const bt =
                      (b.ral ?? 0) +
                      (b.overtime ?? 0) +
                      (b.travel ?? 0) +
                      (b.inps ?? 0) +
                      (b.inail ?? 0) +
                      (b.tfr ?? 0);
                    const at = row.actual.totalCompanyCost;
                    return (
                      <tr key={row.userId}>
                        <td className={td}>
                          <span className="font-medium">{row.fullName}</span>
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {isFutureMonth ? "—" : formatPersonnelBudgetAmount(row.actual.ral)}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatPersonnelBudgetAmount(b.ral)}</td>
                        <td className={td}>
                          <input
                            className="w-16 rounded border border-[var(--prom-line)] bg-transparent px-0.5 py-0.5 sm:w-20"
                            value={dr.ral ?? ""}
                            onChange={(e) => updateDraft(row.userId, "ral", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {isFutureMonth ? "—" : formatPersonnelBudgetAmount(row.actual.overtime)}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatPersonnelBudgetAmount(b.overtime)}</td>
                        <td className={td}>
                          <input
                            className="w-16 rounded border border-[var(--prom-line)] bg-transparent px-0.5 py-0.5 sm:w-20"
                            value={dr.overtime ?? ""}
                            onChange={(e) => updateDraft(row.userId, "overtime", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {isFutureMonth ? "—" : formatPersonnelBudgetAmount(row.actual.travel)}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatPersonnelBudgetAmount(b.travel)}</td>
                        <td className={td}>
                          <input
                            className="w-16 rounded border border-[var(--prom-line)] bg-transparent px-0.5 py-0.5 sm:w-20"
                            value={dr.travel ?? ""}
                            onChange={(e) => updateDraft(row.userId, "travel", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {isFutureMonth ? "—" : formatPersonnelBudgetAmount(row.actual.inps)}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatPersonnelBudgetAmount(b.inps)}</td>
                        <td className={td}>
                          <input
                            className="w-16 rounded border border-[var(--prom-line)] bg-transparent px-0.5 py-0.5 sm:w-20"
                            value={dr.inps ?? ""}
                            onChange={(e) => updateDraft(row.userId, "inps", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {isFutureMonth ? "—" : formatPersonnelBudgetAmount(row.actual.inail)}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatPersonnelBudgetAmount(b.inail)}</td>
                        <td className={td}>
                          <input
                            className="w-16 rounded border border-[var(--prom-line)] bg-transparent px-0.5 py-0.5 sm:w-20"
                            value={dr.inail ?? ""}
                            onChange={(e) => updateDraft(row.userId, "inail", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {isFutureMonth ? "—" : formatPersonnelBudgetAmount(row.actual.tfr)}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatPersonnelBudgetAmount(b.tfr)}</td>
                        <td className={td}>
                          <input
                            className="w-16 rounded border border-[var(--prom-line)] bg-transparent px-0.5 py-0.5 sm:w-20"
                            value={dr.tfr ?? ""}
                            onChange={(e) => updateDraft(row.userId, "tfr", e.target.value)}
                            inputMode="decimal"
                          />
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>
                          {isFutureMonth ? "—" : formatPersonnelBudgetAmount(at)}
                        </td>
                        <td className={`${td} text-[var(--prom-muted)]`}>{formatPersonnelBudgetAmount(bt)}</td>
                        <td className={`${td} font-medium`}>{formatPersonnelBudgetAmount(fMerged.totalCompanyCost ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
