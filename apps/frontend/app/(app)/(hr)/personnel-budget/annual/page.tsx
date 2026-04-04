"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fetchPersonnelBudgetAnnualMatrix,
  fetchCurrentUser,
  postPersonnelBudgetApplyProRata,
  postPersonnelBudgetYearApprove,
  type PersonnelBudgetAnnualMatrixRow
} from "@/lib/api";
import { formatPersonnelBudgetAmount } from "@/lib/personnel-budget-format";
import {
  getToken,
  sessionCanAccessPersonnelBudgetArea,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

type MetricKey = "ral" | "overtime" | "travel" | "inps" | "inail" | "tfr";

const METRIC_LABEL: Record<MetricKey, string> = {
  ral: "RAL",
  overtime: "Straord.",
  travel: "Trasferte",
  inps: "INPS",
  inail: "INAIL",
  tfr: "TFR"
};

export default function PersonnelBudgetAnnualPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [metric, setMetric] = useState<MetricKey>("ral");
  const [ccFilter, setCcFilter] = useState<string>("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPersonnelBudgetAnnualMatrix>> | null>(null);

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
      if (!sessionCanAccessPersonnelBudgetArea(me)) {
        setLoading(false);
        return;
      }
      const m = await fetchPersonnelBudgetAnnualMatrix(t, year);
      setData(m);
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

  const ccOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of data?.rows ?? []) {
      if (r.costCenterId) s.add(r.costCenterId);
    }
    return [...s].sort();
  }, [data?.rows]);

  const teamOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of data?.rows ?? []) {
      if (r.teamId) s.add(r.teamId);
    }
    return [...s].sort();
  }, [data?.rows]);

  const filteredRows = useMemo(() => {
    let rows: PersonnelBudgetAnnualMatrixRow[] = data?.rows ?? [];
    if (ccFilter) {
      rows = rows.filter((r) => (r.costCenterId ?? "") === ccFilter);
    }
    if (teamFilter) {
      rows = rows.filter((r) => (r.teamId ?? "") === teamFilter);
    }
    return rows;
  }, [data?.rows, ccFilter, teamFilter]);

  async function onApprove(): Promise<void> {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await postPersonnelBudgetYearApprove(token, year);
      await load();
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Approvazione fallita");
    } finally {
      setBusy(false);
    }
  }

  async function onProRata(): Promise<void> {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await postPersonnelBudgetApplyProRata(token, year);
      await load();
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Pro-rata fallita");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento matrice annuale…</p>;
  }
  if (!user || !sessionCanAccessPersonnelBudgetArea(user)) {
    return null;
  }

  const th =
    "whitespace-nowrap border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-[var(--prom-text)] sm:text-xs";
  const td = "border border-[var(--prom-line)] px-1.5 py-1 text-[11px] text-[var(--prom-text)] sm:text-sm";

  const status = data?.yearStatus.status ?? "draft";
  const approved = status === "approved";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Budget annuo</h1>
        <p className="text-sm text-[var(--prom-muted)]">
          Vista 12 mesi per dipendente; usa la mensilità aziendale per la pro-rata assistita. Con approvazione
          annuale le modifiche al budget mensile sono bloccate.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
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
          Voce{" "}
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="ml-1 rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-2 py-1.5"
          >
            {(Object.keys(METRIC_LABEL) as MetricKey[]).map((k) => (
              <option key={k} value={k}>
                {METRIC_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--prom-muted)]">
          CDC{" "}
          <select
            value={ccFilter}
            onChange={(e) => setCcFilter(e.target.value)}
            className="ml-1 max-w-[200px] rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-2 py-1.5"
          >
            <option value="">Tutti</option>
            {ccOptions.map((id) => (
              <option key={id} value={id}>
                {data?.rows.find((r) => r.costCenterId === id)?.costCenterName ?? id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--prom-muted)]">
          Team{" "}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="ml-1 max-w-[200px] rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-2 py-1.5"
          >
            <option value="">Tutti</option>
            {teamOptions.map((id) => (
              <option key={id} value={id}>
                {data?.rows.find((r) => r.teamId === id)?.teamName ?? id}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          Aggiorna
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || approved}
          onClick={() => void onProRata()}
        >
          Applica pro-rata
        </Button>
        <Button type="button" size="sm" disabled={busy || approved} onClick={() => void onApprove()}>
          Approva anno
        </Button>
      </div>

      <p className="text-xs text-[var(--prom-muted)]">
        Stato:{" "}
        <strong className={approved ? "text-emerald-600" : ""}>
          {approved ? "Approvato" : "Bozza"}
        </strong>
        {data?.payrollInstallmentMonths != null ? (
          <>
            {" "}
            — Mensilità: <strong>{data.payrollInstallmentMonths}</strong>
          </>
        ) : null}
      </p>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--prom-line)]">
        <table className="min-w-[900px] w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Dipendente</th>
              <th className={th}>CDC</th>
              <th className={th}>Team</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i + 1} className={th}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.userId}>
                <td className={td}>
                  <span className="font-medium">{row.fullName}</span>
                </td>
                <td className={`${td} text-[var(--prom-muted)]`}>{row.costCenterName ?? "—"}</td>
                <td className={`${td} text-[var(--prom-muted)]`}>{row.teamName ?? "—"}</td>
                {row.months.map((m) => (
                  <td key={m.month} className={`${td} text-right tabular-nums`}>
                    {formatPersonnelBudgetAmount(m.budget[metric])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
