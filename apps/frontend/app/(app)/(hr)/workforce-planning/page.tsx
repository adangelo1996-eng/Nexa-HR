"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  deleteWorkforcePlanningScenario,
  fetchCurrentUser,
  fetchWorkforceCockpit,
  fetchWorkforcePlanningScenarios,
  postAnalyticsNarrative,
  saveWorkforcePlanningScenario,
  type WorkforceCockpitScenario,
  type WorkforcePlanningScenarioDto
} from "@/lib/api";
import {
  downloadWorkforcePlanningExcel,
  downloadWorkforcePlanningPdfLandscape,
  type WorkforceExportBundle
} from "@/lib/workforce-planning-export";
import { getSessionUser, getToken, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile,
  hebbAiLinkClassName
} from "@/components/hebb-ai-experience-shell";
import { NexaMonthlyCostChart } from "@/components/nexa-charts";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";

type CockpitPayload = Awaited<ReturnType<typeof fetchWorkforceCockpit>>;

export type WorkforceAssumptions = {
  ralAnnualEur: number | null;
  ccnlLevel: string;
  hireMonth: string;
  notes: string;
};

export default function WorkforcePlanningPage(): React.JSX.Element {
  const [scenario, setScenario] = useState<WorkforceCockpitScenario>("base");
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchWorkforceCockpit>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeLlm, setNarrativeLlm] = useState(false);
  const [narrative, setNarrative] = useState<{
    title: string;
    bullets: string[];
    summary: string;
    llmApplied: boolean;
  } | null>(null);

  const [customFte, setCustomFte] = useState(0);
  const [customFlat, setCustomFlat] = useState(0);
  const [customScale, setCustomScale] = useState(100);
  const [customBusy, setCustomBusy] = useState(false);
  /** Firma parametri usata nell’ultima simulazione custom riuscita. */
  const [appliedCustomSig, setAppliedCustomSig] = useState<string | null>(null);
  const prevScenarioRef = useRef<WorkforceCockpitScenario>(scenario);

  const [compareLive, setCompareLive] = useState<CockpitPayload | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [assumptionRal, setAssumptionRal] = useState("");
  const [assumptionLevel, setAssumptionLevel] = useState("");
  const [assumptionHireMonth, setAssumptionHireMonth] = useState("");
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [dbScenarios, setDbScenarios] = useState<WorkforcePlanningScenarioDto[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioNotes, setScenarioNotes] = useState("");
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const customParamSig = useMemo(
    () => `${customFte}|${customFlat}|${customScale}`,
    [customFte, customFlat, customScale]
  );

  const loadDbScenarios = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    try {
      const res = await fetchWorkforcePlanningScenarios(t);
      setDbScenarios(res.items);
    } catch {
      setDbScenarios([]);
    }
  }, []);

  useEffect(() => {
    void loadDbScenarios();
  }, [loadDbScenarios]);

  const buildAssumptionsJson = (): Record<string, unknown> => ({
    scenario,
    customFte,
    customFlat,
    customScale,
    ralAnnualEur: assumptionRal.trim() ? Number(assumptionRal) : null,
    ccnlLevel: assumptionLevel.trim() || null,
    hireMonth: assumptionHireMonth.trim() || null,
    notes: scenarioNotes.trim() || null
  });

  const loadCompareBase = async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    setCompareBusy(true);
    setError(null);
    try {
      await fetchCurrentUser(t).catch(() => undefined);
      const r = await fetchWorkforceCockpit(t, "base", 6);
      setCompareLive(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confronto non disponibile");
    } finally {
      setCompareBusy(false);
    }
  };

  const applyDbScenarioCompare = (row: WorkforcePlanningScenarioDto): void => {
    const payload = row.payloadJson as CockpitPayload | undefined;
    if (payload?.series) {
      setCompareLive(payload);
    }
  };

  const loadPreset = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    await fetchCurrentUser(t).catch(() => undefined);
    setError(null);
    try {
      const r = await fetchWorkforceCockpit(t, scenario, 6);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    }
  }, [scenario]);

  const loadCustom = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    await fetchCurrentUser(t).catch(() => undefined);
    setError(null);
    setCustomBusy(true);
    try {
      const r = await fetchWorkforceCockpit(t, "custom", 6, {
        fteDelta: customFte,
        monthlyFlatDeltaEur: customFlat,
        seriesScalePercent: customScale
      });
      setData(r);
      setAppliedCustomSig(`${customFte}|${customFlat}|${customScale}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setCustomBusy(false);
    }
  }, [customFte, customFlat, customScale]);

  useEffect(() => {
    const prev = prevScenarioRef.current;
    if (scenario === "custom" && prev !== "custom") {
      setData(null);
      setNarrative(null);
      setAppliedCustomSig(null);
    }
    prevScenarioRef.current = scenario;
  }, [scenario]);

  useEffect(() => {
    if (scenario === "custom") {
      return;
    }
    void loadPreset();
  }, [scenario, loadPreset]);

  const costChartSeries = useMemo(() => {
    if (!data?.series.length) {
      return [];
    }
    const compareByMonth = compareLive
      ? new Map(compareLive.series.map((s) => [s.month, s.costEur]))
      : null;
    return data.series.map((s) => ({
      month: s.month,
      costEur: s.costEur,
      compareEur: compareByMonth?.get(s.month)
    }));
  }, [data, compareLive]);

  const compareRows = useMemo(() => {
    if (!data || !compareLive) return [];
    const byMonth = new Map(compareLive.series.map((s) => [s.month, s.costEur]));
    return data.series.map((s) => {
      const other = byMonth.get(s.month) ?? 0;
      const delta = s.costEur - other;
      const pct = other > 0 ? (delta / other) * 100 : null;
      return { month: s.month, active: s.costEur, other, delta, pct };
    });
  }, [data, compareLive]);

  const buildExportBundle = (): WorkforceExportBundle | null => {
    if (!data) return null;
    return {
      scenarioLabel: scenarioName.trim() || (scenario === "custom" ? "What-if" : scenario),
      savedAt: new Date().toLocaleString("it-IT"),
      assumptions: {
        ...buildAssumptionsJson(),
        custom: data.custom ?? null,
        compareWithBase: compareLive != null
      },
      cockpit: data,
      narrative: narrative
        ? { title: narrative.title, bullets: narrative.bullets, summary: narrative.summary }
        : null
    };
  };

  const saveDbScenario = async (): Promise<void> => {
    const t = getToken();
    if (!t || !data) return;
    const name = scenarioName.trim();
    if (!name) {
      setError("Indica un nome per lo scenario da salvare.");
      return;
    }
    setScenarioBusy(true);
    setError(null);
    try {
      await saveWorkforcePlanningScenario(t, {
        name,
        assumptionsJson: buildAssumptionsJson(),
        payloadJson: data as unknown as Record<string, unknown>,
        analysisText: narrative?.summary ?? null
      });
      setScenarioName("");
      await loadDbScenarios();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio scenario non riuscito");
    } finally {
      setScenarioBusy(false);
    }
  };

  const applyDbScenario = (row: WorkforcePlanningScenarioDto): void => {
    const payload = row.payloadJson as CockpitPayload | undefined;
    if (payload?.series) {
      setData(payload);
      setScenario(payload.scenario ?? "base");
      setNarrative(null);
    }
    setScenarioName(row.name);
    const a = row.assumptionsJson as {
      notes?: string;
      ralAnnualEur?: number | null;
      ccnlLevel?: string | null;
      hireMonth?: string | null;
      customFte?: number;
      customFlat?: number;
      customScale?: number;
    };
    setScenarioNotes(String(a?.notes ?? ""));
    setAssumptionRal(a?.ralAnnualEur != null ? String(a.ralAnnualEur) : "");
    setAssumptionLevel(String(a?.ccnlLevel ?? ""));
    setAssumptionHireMonth(String(a?.hireMonth ?? ""));
    if (a?.customFte != null) setCustomFte(a.customFte);
    if (a?.customFlat != null) setCustomFlat(a.customFlat);
    if (a?.customScale != null) setCustomScale(a.customScale);
  };

  const runExportExcel = async (): Promise<void> => {
    const bundle = buildExportBundle();
    if (!bundle) return;
    setExportBusy(true);
    try {
      await downloadWorkforcePlanningExcel(bundle);
    } finally {
      setExportBusy(false);
    }
  };

  const runExportPdf = (): void => {
    const bundle = buildExportBundle();
    if (!bundle) return;
    downloadWorkforcePlanningPdfLandscape(bundle);
  };

  const runNarrative = async (): Promise<void> => {
    const t = getToken();
    if (!t || !data) {
      return;
    }
    setNarrativeBusy(true);
    setError(null);
    try {
      const r = await postAnalyticsNarrative(t, {
        topic: "workforce_cockpit",
        payload: {
          scenario: data.scenario,
          summary: data.summary,
          series: data.series,
          custom: data.custom ?? null
        },
        useLlm: narrativeLlm
      });
      setNarrative({ title: r.title, bullets: r.bullets, summary: r.summary, llmApplied: r.llmApplied });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Narrativa non disponibile");
    } finally {
      setNarrativeBusy(false);
    }
  };

  const linkCn = hebbAiLinkClassName();
  const llmAllowed = sessionCanUseNexaAiOpenAiLlm(getSessionUser());

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Workforce planning"
      subtitle={
        <>
          Quante persone ci sono oggi e quanto costa la massa stipendi al mese, con una proiezione a sei mesi. Puoi
          confrontare scenari predefiniti o costruire un what-if con i tuoi numeri (variazioni di testa, importo fisso
          aggiuntivo, scala sui costi previsti). Per il dettaglio per reparto usa{" "}
          <Link href="/personnel-budget" className={linkCn}>
            Budget personale
          </Link>{" "}
          e{" "}
          <Link href="/forecast" className={linkCn}>
            Forecast costi
          </Link>
          .
        </>
      }
      headerTrailing={<NexaPageHelpButton pageKey="workforce-planning" />}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {(
          [
            ["base", "Scenario base", "A"],
            ["growth", "+2 FTE (stima)", "+"],
            ["freeze", "Costi flat", "═"],
            ["custom", "What-if libero", "?"]
          ] as const
        ).map(([key, label, badge]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScenario(key)}
            className={[
              "group flex min-w-[140px] flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-[var(--glass-shadow)] backdrop-blur-md transition sm:max-w-[200px]",
              scenario === key
                ? "border-[color-mix(in_srgb,var(--prom-gold)_55%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)]"
                : "border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] hover:border-[color-mix(in_srgb,var(--prom-gold)_45%,var(--prom-line))]"
            ].join(" ")}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#002D72] to-[#1a4d8c] text-xs font-bold text-white">
              {badge}
            </span>
            <span className="min-w-0 text-sm font-semibold text-[var(--prom-text)]">{label}</span>
          </button>
        ))}
      </div>

      <HebbAiGlassPanel className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Confronto scenari</h2>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Confronta con lo scenario base live o con uno scenario salvato nel database.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={compareBusy} onClick={() => void loadCompareBase()}>
              {compareBusy ? "Carico…" : "Confronta con base (live)"}
            </Button>
            {compareLive ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setCompareLive(null)}>
                Azzera confronto
              </Button>
            ) : null}
          </div>
        </div>
        {dbScenarios.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
            Scenario salvato per confronto
            <select
              className="max-w-md rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = "";
                const row = dbScenarios.find((s) => s.id === v);
                if (row) applyDbScenarioCompare(row);
              }}
            >
              <option value="">— scegli scenario salvato —</option>
              {dbScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-[var(--prom-muted)]">Salva uno scenario per riutilizzarlo nei confronti.</p>
        )}
      </HebbAiGlassPanel>

      <HebbAiGlassPanel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Assunzioni di scenario</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowAssumptions((v) => !v)}>
            {showAssumptions ? "Chiudi" : "Modifica assunzioni"}
          </Button>
        </div>
        {showAssumptions ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              RAL annua di riferimento (€)
              <Input value={assumptionRal} onChange={(e) => setAssumptionRal(e.target.value)} inputMode="decimal" placeholder="es. 42000" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              Livello CCNL
              <Input value={assumptionLevel} onChange={(e) => setAssumptionLevel(e.target.value)} placeholder="es. 4" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              Mese possibile assunzione
              <Input type="month" value={assumptionHireMonth} onChange={(e) => setAssumptionHireMonth(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)] sm:col-span-2 lg:col-span-4">
              Note / altri fattori
              <Input value={scenarioNotes} onChange={(e) => setScenarioNotes(e.target.value)} placeholder="Turnover, bonus, part-time…" />
            </label>
          </div>
        ) : (
          <p className="text-xs text-[var(--prom-muted)]">
            {assumptionRal || assumptionLevel || assumptionHireMonth
              ? `RAL ${assumptionRal || "—"} · Livello ${assumptionLevel || "—"} · Assunzione ${assumptionHireMonth || "—"}`
              : "Nessuna assunzione strutturata: apri «Modifica assunzioni» prima di salvare lo scenario."}
          </p>
        )}
      </HebbAiGlassPanel>

      {compareLive && data ? (
        <HebbAiGlassPanel className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">
            Vista affiancata · attivo: {data.scenario} · confronto: {compareLive.scenario}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <HebbAiGlassTile>
                <p className="text-[10px] font-medium uppercase text-[var(--prom-muted)]">Attivo · HC</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.headcount}</p>
              </HebbAiGlassTile>
              <HebbAiGlassTile>
                <p className="text-[10px] font-medium uppercase text-[var(--prom-muted)]">Attivo · massa / mese</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--prom-text)]">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                    data.summary.monthlyPayrollMassEur
                  )}
                </p>
              </HebbAiGlassTile>
              <HebbAiGlassTile>
                <p className="text-[10px] font-medium uppercase text-[var(--prom-muted)]">Attivo · spese pending</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.pendingExpenseCount}</p>
              </HebbAiGlassTile>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <HebbAiGlassTile>
                <p className="text-[10px] font-medium uppercase text-[var(--prom-muted)]">Confronto · HC</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--prom-text)]">{compareLive.summary.headcount}</p>
              </HebbAiGlassTile>
              <HebbAiGlassTile>
                <p className="text-[10px] font-medium uppercase text-[var(--prom-muted)]">Confronto · massa / mese</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--prom-text)]">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                    compareLive.summary.monthlyPayrollMassEur
                  )}
                </p>
              </HebbAiGlassTile>
              <HebbAiGlassTile>
                <p className="text-[10px] font-medium uppercase text-[var(--prom-muted)]">Confronto · spese pending</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--prom-text)]">
                  {compareLive.summary.pendingExpenseCount}
                </p>
              </HebbAiGlassTile>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--prom-line)]">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead className="border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] text-[var(--prom-muted)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Mese</th>
                  <th className="px-3 py-2 font-semibold">Costo attivo</th>
                  <th className="px-3 py-2 font-semibold">Costo confronto</th>
                  <th className="px-3 py-2 font-semibold">Delta</th>
                  <th className="px-3 py-2 font-semibold">Δ %</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.month} className="border-b border-[var(--prom-line)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--prom-text)]">{r.month}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--prom-text)]">
                      {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(r.active)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[var(--prom-muted)]">
                      {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(r.other)}
                    </td>
                    <td
                      className={`px-3 py-2 tabular-nums ${
                        r.delta > 0 ? "text-amber-800 dark:text-amber-200" : r.delta < 0 ? "text-emerald-800 dark:text-emerald-200" : ""
                      }`}
                    >
                      {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(r.delta)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[var(--prom-muted)]">
                      {r.pct == null ? "—" : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HebbAiGlassPanel>
      ) : null}

      {scenario === "custom" ? (
        <HebbAiGlassPanel className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Parametri what-if</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">
              Imposta le leve e avvia la simulazione: la massa stipendi attuale serve a stimare teste in più o in meno;
              l’importo fisso si somma ogni mese; la percentuale moltiplica l’intera curva del forecast (0–300%). I
              risultati compaiono nella dashboard dedicata sotto solo dopo l’esecuzione.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              <span className="font-semibold text-[var(--prom-text)]">Teste equivalenti (FTE)</span>
              <Input
                type="number"
                inputMode="numeric"
                value={Number.isNaN(customFte) ? "" : customFte}
                onChange={(e) => setCustomFte(Math.round(Number(e.target.value) || 0))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              <span className="font-semibold text-[var(--prom-text)]">Euro fissi al mese (±)</span>
              <Input
                type="number"
                inputMode="decimal"
                value={Number.isNaN(customFlat) ? "" : customFlat}
                onChange={(e) => setCustomFlat(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
              <span className="font-semibold text-[var(--prom-text)]">Scala su forecast (%)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={300}
                value={Number.isNaN(customScale) ? "" : customScale}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCustomScale(Number.isFinite(n) ? Math.min(300, Math.max(0, n)) : 100);
                }}
              />
            </label>
          </div>
          <Button type="button" disabled={customBusy} onClick={() => void loadCustom()}>
            {customBusy ? "Calcolo in corso…" : "Esegui simulazione"}
          </Button>
        </HebbAiGlassPanel>
      ) : null}

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      {scenario === "custom" && !data && !customBusy ? (
        <HebbAiGlassPanel className="border-dashed py-10 text-center">
          <p className="text-sm font-medium text-[var(--prom-text)]">In attesa di simulazione</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--prom-muted)]">
            La dashboard what-if (KPI, grafico a sei mesi e sintesi) si popola dopo «Esegui simulazione». Puoi cambiare i
            parametri e rilanciare quando vuoi.
          </p>
        </HebbAiGlassPanel>
      ) : null}

      {scenario === "custom" && customBusy && !data ? (
        <HebbAiGlassPanel className="py-12 text-center">
          <p className="text-sm text-[var(--prom-muted)]">Calcolo dello scenario in corso…</p>
        </HebbAiGlassPanel>
      ) : null}

      {data ? (
        <>
          {scenario === "custom" ? (
            <HebbAiGlassPanel className="space-y-6 ring-2 ring-[color-mix(in_srgb,var(--prom-gold)_42%,transparent)]">
              <div className="flex flex-col gap-2 border-b border-[var(--prom-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--prom-gold)]">Dashboard what-if</p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--prom-text)]">Risultato simulazione (parametri liberi)</h2>
                  <p className="mt-1 text-xs text-[var(--prom-muted)]">
                    FTE Δ {customFte} · flat €{customFlat}/mese · scala forecast {customScale}%
                  </p>
                </div>
              </div>
              {appliedCustomSig !== null && customParamSig !== appliedCustomSig ? (
                <p className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                  I parametri non coincidono più con questa simulazione. Esegui di nuovo per aggiornare la dashboard.
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3">
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Persone in organico (senza superuser)
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.headcount}</p>
                </HebbAiGlassTile>
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Stima massa retributiva mensile
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                      data.summary.monthlyPayrollMassEur
                    )}
                  </p>
                </HebbAiGlassTile>
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Note spese in attesa HR
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    {data.summary.pendingExpenseCount}
                  </p>
                </HebbAiGlassTile>
              </div>

              <NexaMonthlyCostChart
                series={costChartSeries}
                compareLabel={compareLive ? `Confronto (${compareLive.scenario})` : undefined}
                title="Costo mensile previsto (6 mesi)"
                className="!border-0 !bg-transparent !p-0 shadow-none"
              />
            </HebbAiGlassPanel>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Persone in organico (senza superuser)
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{data.summary.headcount}</p>
                </HebbAiGlassTile>
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Stima massa retributiva mensile
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                      data.summary.monthlyPayrollMassEur
                    )}
                  </p>
                </HebbAiGlassTile>
                <HebbAiGlassTile>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                    Note spese in attesa HR
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">
                    {data.summary.pendingExpenseCount}
                  </p>
                </HebbAiGlassTile>
              </div>

              <NexaMonthlyCostChart
                series={costChartSeries}
                compareLabel={compareLive ? `Confronto (${compareLive.scenario})` : undefined}
              />
            </>
          )}

          <HebbAiGlassPanel className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Scenari salvati (database)</h2>
            <div className="flex flex-wrap gap-2">
              <Input className="max-w-xs" placeholder="Nome scenario" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
              <Input className="min-w-[200px] flex-1" placeholder="Note assunzioni" value={scenarioNotes} onChange={(e) => setScenarioNotes(e.target.value)} />
              <Button type="button" size="sm" variant="outline" disabled={!data || scenarioBusy} onClick={() => void saveDbScenario()}>Salva scenario</Button>
              <Button type="button" size="sm" variant="outline" disabled={!data || exportBusy} onClick={() => void runExportExcel()}>Export Excel</Button>
              <Button type="button" size="sm" variant="outline" disabled={!data} onClick={() => runExportPdf()}>PDF landscape</Button>
            </div>
            {dbScenarios.length > 0 ? (
              <ul className="divide-y divide-[var(--prom-line)] rounded-xl border border-[var(--prom-line)] text-sm">
                {dbScenarios.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <button type="button" className="font-medium hover:underline" onClick={() => applyDbScenario(s)}>{s.name}</button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { const t = getToken(); if (t) void deleteWorkforcePlanningScenario(t, s.id).then(() => loadDbScenarios()); }}>Elimina</Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </HebbAiGlassPanel>

          <HebbAiGlassPanel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Analisi scenario</h2>
              <div className="flex flex-wrap items-center gap-3">
                {llmAllowed ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                    <input
                      type="checkbox"
                      className="rounded border-[var(--prom-line-strong)]"
                      checked={narrativeLlm}
                      onChange={(e) => setNarrativeLlm(e.target.checked)}
                    />
                    Raffinamento con AI (solo aggregati)
                  </label>
                ) : null}
                <Button type="button" size="sm" variant="outline" disabled={narrativeBusy} onClick={() => void runNarrative()}>
                  {narrativeBusy ? "Generazione…" : "Genera analisi"}
                </Button>
              </div>
            </div>
            {narrative ? (
              <div className="mt-6 space-y-3 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 text-sm text-[var(--prom-text)]">
                <p className="text-xs text-[var(--prom-muted)]">
                  Fonte: testo guidato dai dati in pagina{narrative.llmApplied ? ", con passaggio opzionale in AI" : ""}.
                </p>
                <p className="font-synapse text-base font-semibold">{narrative.title}</p>
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-[var(--prom-muted)]">
                  {narrative.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-[var(--prom-muted)]">{narrative.summary}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--prom-muted)]">
                Vengono usati solo numeri di riepilogo già mostrati qui sopra, senza elenco di persone.
              </p>
            )}
          </HebbAiGlassPanel>
        </>
      ) : scenario !== "custom" ? (
        <HebbAiGlassPanel className="py-12 text-center">
          <p className="text-sm text-[var(--prom-muted)]">Caricamento cockpit…</p>
        </HebbAiGlassPanel>
      ) : null}
    </HebbAiExperienceShell>
  );
}
