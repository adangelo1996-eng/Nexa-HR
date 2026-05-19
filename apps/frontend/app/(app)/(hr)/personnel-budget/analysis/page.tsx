"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import {
  fetchPersonnelBudgetAnalysis,
  fetchCurrentUser,
  patchPersonnelBudgetAnalysisNote,
  type PersonnelBudgetAnalysisCategory
} from "@/lib/api";
import {
  budgetDeltaPercentLabel,
  formatPersonnelBudgetAmount
} from "@/lib/personnel-budget-format";
import {
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

const CAT_LABEL: Record<PersonnelBudgetAnalysisCategory, string> = {
  ral: "RAL",
  overtime: "Straord.",
  travel: "Trasferte",
  inps: "INPS",
  inail: "INAIL",
  tfr: "TFR",
  totalCompanyCost: "Tot. costo az."
};

const NOTE_CATEGORIES: PersonnelBudgetAnalysisCategory[] = [
  "ral",
  "overtime",
  "travel",
  "inps",
  "inail",
  "tfr",
  "totalCompanyCost"
];

function noteKey(category: string, subjectUserId: string): string {
  return `${category}::${subjectUserId}`;
}

export default function PersonnelBudgetAnalysisPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [thresholdPct, setThresholdPct] = useState(5);
  const [thresholdAbs, setThresholdAbs] = useState(500);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPersonnelBudgetAnalysis>> | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

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
      const res = await fetchPersonnelBudgetAnalysis(t, {
        year,
        month,
        thresholdPct,
        thresholdAbs
      });
      setData(res);
      const drafts: Record<string, string> = {};
      for (const n of res.notes) {
        const k = noteKey(n.category, n.subjectUserId);
        drafts[k] = n.comment;
      }
      setCommentDrafts((prev) => ({ ...prev, ...drafts }));
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router, year, month, thresholdPct, thresholdAbs]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalsByCat = useMemo(() => {
    if (!data) return null;
    const a = data.totals.actual;
    const b = data.totals.budget;
    const f = data.totals.forecast;
    const keys: PersonnelBudgetAnalysisCategory[] = [
      "ral",
      "overtime",
      "travel",
      "inps",
      "inail",
      "tfr",
      "totalCompanyCost"
    ];
    return keys.map((k) => ({
      k,
      label: CAT_LABEL[k],
      actual: k === "totalCompanyCost" ? a.totalCompanyCost : a[k],
      budget: k === "totalCompanyCost" ? b.totalCompanyCost : b[k],
      forecast: k === "totalCompanyCost" ? f.totalCompanyCost : f[k]
    }));
  }, [data]);

  async function saveNote(category: string, subjectUserId: string): Promise<void> {
    const t = getToken();
    if (!t) return;
    const k = `${category}::${subjectUserId}`;
    const comment = commentDrafts[k] ?? "";
    setSavingKey(k);
    setErr(null);
    try {
      await patchPersonnelBudgetAnalysisNote(t, {
        year,
        month,
        category,
        subjectUserId,
        comment
      });
      await load();
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Salvataggio nota fallito");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento analysis…</p>;
  }
  if (!user || !sessionCanNexaAdmin(user)) {
    return null;
  }

  const th =
    "whitespace-nowrap border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-2 py-2 text-left text-xs font-medium text-[var(--prom-text)]";
  const td = "border border-[var(--prom-line)] px-2 py-1.5 text-sm text-[var(--prom-text)]";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Analysis</h1>
          <p className="text-sm text-[var(--prom-muted)]">
            Totali per categoria e varianze forecast vs budget oltre soglia; commenti per categoria o per dipendente.
          </p>
        </div>
        <NexaPageHelpButton pageKey="personnel-budget-analysis" />
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
        <label className="text-sm text-[var(--prom-muted)]">
          Soglia %{" "}
          <input
            type="number"
            min={0}
            step={0.1}
            value={thresholdPct}
            onChange={(e) => setThresholdPct(Number(e.target.value))}
            className="ml-1 w-20 rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-2 py-1.5"
          />
        </label>
        <label className="text-sm text-[var(--prom-muted)]">
          Soglia importo{" "}
          <input
            type="number"
            min={0}
            step={1}
            value={thresholdAbs}
            onChange={(e) => setThresholdAbs(Number(e.target.value))}
            className="ml-1 w-24 rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-2 py-1.5"
          />
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          Aggiorna
        </Button>
      </div>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {totalsByCat ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--prom-line)]">
          <table className="min-w-[640px] w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Categoria</th>
                <th className={th}>Actual</th>
                <th className={th}>Budget</th>
                <th className={th}>Δ (BDG − ACT)</th>
                <th className={th}>Δ %</th>
                <th className={th}>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {totalsByCat.map((row) => (
                <tr key={row.k}>
                  <td className={td}>{row.label}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatPersonnelBudgetAmount(row.actual)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatPersonnelBudgetAmount(row.budget)}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {formatPersonnelBudgetAmount(row.budget - row.actual)}
                  </td>
                  <td className={`${td} text-right tabular-nums text-xs`}>
                    {budgetDeltaPercentLabel(row.actual, row.budget)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{formatPersonnelBudgetAmount(row.forecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data ? (
        <>
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">
            Varianze oltre soglia (forecast − budget)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-[var(--prom-line)]">
            <table className="min-w-[800px] w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Categoria</th>
                  <th className={th}>Dipendente</th>
                  <th className={th}>Actual</th>
                  <th className={th}>Budget</th>
                  <th className={th}>Δ (BDG − ACT)</th>
                  <th className={th}>Δ %</th>
                  <th className={th}>Forecast</th>
                  <th className={th}>Δ (F − B)</th>
                  <th className={th}>Δ % F/B</th>
                </tr>
              </thead>
              <tbody>
                {data.variances.length === 0 ? (
                  <tr>
                    <td className={td} colSpan={9}>
                      Nessuna varianze sopra soglia.
                    </td>
                  </tr>
                ) : (
                  data.variances.map((v, i) => (
                    <tr key={`${v.userId ?? ""}-${v.category}-${i}`}>
                      <td className={td}>{CAT_LABEL[v.category]}</td>
                      <td className={td}>{v.fullName ?? "—"}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatPersonnelBudgetAmount(v.actual)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatPersonnelBudgetAmount(v.budget)}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {formatPersonnelBudgetAmount(v.budget - v.actual)}
                      </td>
                      <td className={`${td} text-right tabular-nums text-xs`}>
                        {budgetDeltaPercentLabel(v.actual, v.budget)}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{formatPersonnelBudgetAmount(v.forecast)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatPersonnelBudgetAmount(v.varianceBf)}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {v.variancePct == null ? "—" : `${v.variancePct.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Commenti (per categoria, aggregato)</h2>
          <ul className="space-y-4">
            {NOTE_CATEGORIES.map((category) => {
              const uid = "";
              const k = noteKey(category, uid);
              return (
                <li
                  key={category}
                  className="rounded-lg border border-[var(--prom-line)] p-3 text-sm"
                >
                  <div className="mb-1 font-medium text-[var(--prom-text)]">{CAT_LABEL[category]}</div>
                  <textarea
                    className="mb-2 min-h-[72px] w-full rounded border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
                    value={commentDrafts[k] ?? ""}
                    onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [k]: e.target.value }))}
                    placeholder="Nota sulla categoria…"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={savingKey === k}
                    onClick={() => void saveNote(category, uid)}
                  >
                    {savingKey === k ? "Salvataggio…" : "Salva nota"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
