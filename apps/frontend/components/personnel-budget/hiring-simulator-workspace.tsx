"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CostCalculatorInputMode, CostCalculatorResult } from "@payday/domain";
import { calculateItalyCompanyCost } from "@payday/domain";
import { Loader2, Sparkles } from "lucide-react";
import { HebbAiExperienceShell } from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteHiringSimulatorScenario,
  fetchHiringSimulatorScenarios,
  postHiringSimulatorAdvise,
  postHiringSimulatorCompute,
  saveHiringSimulatorScenario,
  type HiringSimulatorAdvisePhase,
  type HiringSimulatorAdviseResponse,
  type HiringSimulatorInputBody,
  type HiringSimulatorScenarioRow
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

type WizardStep = "contratto" | "agevolazioni" | "benefit" | "risultato";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "contratto", label: "Contratto" },
  { id: "agevolazioni", label: "Agevolazioni" },
  { id: "benefit", label: "Benefit" },
  { id: "risultato", label: "Risultato" }
];

export function HiringSimulatorWorkspace(): React.JSX.Element {
  const [step, setStep] = useState<WizardStep>("contratto");
  const [mode, setMode] = useState<CostCalculatorInputMode>("ral");
  const [weeklyHours, setWeeklyHours] = useState(40);
  const [fullTimeHours, setFullTimeHours] = useState(40);
  const [payMonthsPerYear, setPayMonthsPerYear] = useState<12 | 13 | 14>(13);
  const [ral, setRal] = useState(35_000);
  const [targetNet, setTargetNet] = useState(2_000);
  const [ccnlCode, setCcnlCode] = useState("Commercio");
  const [ccnlLevel, setCcnlLevel] = useState("4");
  const [contractType, setContractType] = useState("Tempo indeterminato");
  const [roleTitle, setRoleTitle] = useState("");
  const [location, setLocation] = useState("Italia");

  const [agevFemale, setAgevFemale] = useState(false);
  const [agevUnder36, setAgevUnder36] = useState(false);
  const [agevSouth, setAgevSouth] = useState(false);
  const [agevNaspi, setAgevNaspi] = useState(false);
  const [agevProtected, setAgevProtected] = useState(false);
  const [agevOtherNotes, setAgevOtherNotes] = useState("");

  const [welfareAnnual, setWelfareAnnual] = useState(0);
  const [mealVouchers, setMealVouchers] = useState(0);
  const [smartWorking, setSmartWorking] = useState(0);
  const [otherBenefits, setOtherBenefits] = useState(0);

  const [advise, setAdvise] = useState<HiringSimulatorAdviseResponse | null>(null);
  const [adviseLoading, setAdviseLoading] = useState(false);
  const [serverResult, setServerResult] = useState<CostCalculatorResult | null>(null);
  const [scenarios, setScenarios] = useState<HiringSimulatorScenarioRow[]>([]);
  const [scenarioName, setScenarioName] = useState("");

  const inputBody = useMemo((): HiringSimulatorInputBody => {
    return {
      mode,
      weeklyContractHours: weeklyHours,
      weeklyFullTimeHours: fullTimeHours,
      payMonthsPerYear,
      annualGrossSalaryEuros: mode === "ral" ? ral : undefined,
      targetNetMonthlyEuros: mode === "net" ? targetNet : undefined,
      ccnlCode: ccnlCode.trim() || undefined,
      ccnlLevel: ccnlLevel.trim() || undefined,
      contractType: contractType.trim() || undefined,
      roleTitle: roleTitle.trim() || undefined,
      location: location.trim() || undefined,
      agevolazioni: {
        female: agevFemale,
        under36: agevUnder36,
        southZes: agevSouth,
        naspi: agevNaspi,
        protectedCategories: agevProtected,
        otherNotes: agevOtherNotes.trim() || undefined
      },
      benefits: {
        welfareAnnualEuros: welfareAnnual > 0 ? welfareAnnual : undefined,
        mealVouchersMonthlyEuros: mealVouchers > 0 ? mealVouchers : undefined,
        smartWorkingMonthlyEuros: smartWorking > 0 ? smartWorking : undefined,
        otherBenefitsMonthlyEuros: otherBenefits > 0 ? otherBenefits : undefined
      }
    };
  }, [
    mode,
    weeklyHours,
    fullTimeHours,
    payMonthsPerYear,
    ral,
    targetNet,
    ccnlCode,
    ccnlLevel,
    contractType,
    roleTitle,
    location,
    agevFemale,
    agevUnder36,
    agevSouth,
    agevNaspi,
    agevProtected,
    agevOtherNotes,
    welfareAnnual,
    mealVouchers,
    smartWorking,
    otherBenefits
  ]);

  const localResult = useMemo(() => calculateItalyCompanyCost(inputBody), [inputBody]);
  const result = serverResult ?? localResult;

  const loadScenarios = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const rows = await fetchHiringSimulatorScenarios(token);
      setScenarios(rows);
    } catch {
      setScenarios([]);
    }
  }, []);

  useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);

  const runAdvise = useCallback(
    async (phase: HiringSimulatorAdvisePhase) => {
      const token = getToken();
      if (!token) return;
      setAdviseLoading(true);
      try {
        const res = await postHiringSimulatorAdvise(token, { ...inputBody, phase });
        setAdvise(res);
        setServerResult(res.compute);
      } catch {
        setAdvise(null);
      } finally {
        setAdviseLoading(false);
      }
    },
    [inputBody]
  );

  useEffect(() => {
    const phase: HiringSimulatorAdvisePhase =
      step === "contratto" ? "criteria" : step === "agevolazioni" ? "agevolazioni" : step === "benefit" ? "benefits" : "validate";
    const t = window.setTimeout(() => {
      void runAdvise(phase);
    }, step === "risultato" ? 400 : 900);
    return () => window.clearTimeout(t);
  }, [step, inputBody, runAdvise]);

  const applyChip = (chip: string): void => {
    const c = chip.toLowerCase();
    if (c.includes("buoni pasto") || c.includes("€ 150")) {
      setMealVouchers(150);
      setStep("benefit");
      return;
    }
    if (c.includes("welfare")) {
      setWelfareAnnual(500);
      setStep("benefit");
      return;
    }
    if (c.includes("smart")) {
      setSmartWorking(50);
      setStep("benefit");
      return;
    }
    if (c.includes("agevolaz")) {
      setStep("agevolazioni");
      return;
    }
    if (c.includes("ccnl")) {
      setStep("contratto");
      return;
    }
    if (c.includes("valida")) {
      setStep("risultato");
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const t = window.setTimeout(() => {
      void postHiringSimulatorCompute(token, inputBody)
        .then(setServerResult)
        .catch(() => setServerResult(null));
    }, 600);
    return () => window.clearTimeout(t);
  }, [inputBody]);

  const saveScenario = async (): Promise<void> => {
    const token = getToken();
    const name = scenarioName.trim() || `Assunzione ${new Date().toLocaleDateString("it-IT")}`;
    if (!token) return;
    await saveHiringSimulatorScenario(token, { ...inputBody, name });
    setScenarioName("");
    await loadScenarios();
  };

  const loadScenario = (row: HiringSimulatorScenarioRow): void => {
    const p = row.payloadJson as HiringSimulatorInputBody;
    if (p.mode) setMode(p.mode);
    if (p.weeklyContractHours) setWeeklyHours(p.weeklyContractHours);
    if (p.weeklyFullTimeHours) setFullTimeHours(p.weeklyFullTimeHours);
    if (p.payMonthsPerYear) setPayMonthsPerYear(p.payMonthsPerYear);
    if (p.annualGrossSalaryEuros != null) setRal(p.annualGrossSalaryEuros);
    if (p.targetNetMonthlyEuros != null) setTargetNet(p.targetNetMonthlyEuros);
    if (p.ccnlCode) setCcnlCode(p.ccnlCode);
    if (p.ccnlLevel) setCcnlLevel(p.ccnlLevel);
    if (p.contractType) setContractType(p.contractType);
    if (p.roleTitle) setRoleTitle(p.roleTitle);
    if (p.location) setLocation(p.location);
    const a = p.agevolazioni;
    if (a) {
      setAgevFemale(Boolean(a.female));
      setAgevUnder36(Boolean(a.under36));
      setAgevSouth(Boolean(a.southZes));
      setAgevNaspi(Boolean(a.naspi));
      setAgevProtected(Boolean(a.protectedCategories));
      setAgevOtherNotes(a.otherNotes ?? "");
    }
    const b = p.benefits;
    if (b) {
      setWelfareAnnual(b.welfareAnnualEuros ?? 0);
      setMealVouchers(b.mealVouchersMonthlyEuros ?? 0);
      setSmartWorking(b.smartWorkingMonthlyEuros ?? 0);
      setOtherBenefits(b.otherBenefitsMonthlyEuros ?? 0);
    }
    setStep("risultato");
  };

  const prevStep = (): void => {
    const i = STEPS.findIndex((s) => s.id === step);
    setStep(STEPS[Math.max(0, i - 1)]!.id);
  };

  const nextStep = (): void => {
    const i = STEPS.findIndex((s) => s.id === step);
    setStep(STEPS[Math.min(STEPS.length - 1, i + 1)]!.id);
  };

  return (
    <HebbAiExperienceShell
      contentMax="wide"
      title="Simulatore costo azienda"
      subtitle="Definisci criteri contrattuali, verifica agevolazioni e benefit con il consulente AI; il motore calcola costo azienda e netto in tempo reale."
      headerTrailing={<HebbAiPageHelpButton pageKey="hiring-simulator" />}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              step === s.id
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-[var(--prom-surface)] text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>Passo: {STEPS.find((s) => s.id === step)?.label}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "contratto" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Ruolo / mansione</span>
                  <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="es. Addetto vendite" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">CCNL</span>
                  <Input value={ccnlCode} onChange={(e) => setCcnlCode(e.target.value)} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Livello</span>
                  <Input value={ccnlLevel} onChange={(e) => setCcnlLevel(e.target.value)} />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Tipo contratto</span>
                  <Input value={contractType} onChange={(e) => setContractType(e.target.value)} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Modalità</span>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as CostCalculatorInputMode)}
                    className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                  >
                    <option value="ral">RAL annua</option>
                    <option value="net">Netto mensile target</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Mensilità</span>
                  <select
                    value={payMonthsPerYear}
                    onChange={(e) => setPayMonthsPerYear(Number(e.target.value) as 12 | 13 | 14)}
                    className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                  >
                    <option value={12}>12</option>
                    <option value={13}>13</option>
                    <option value={14}>14</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Ore / settimana</span>
                  <Input type="number" min={1} step={0.5} value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Full-time ref.</span>
                  <Input type="number" min={1} step={0.5} value={fullTimeHours} onChange={(e) => setFullTimeHours(Number(e.target.value))} />
                </label>
                {mode === "ral" ? (
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-synapse-muted dark:text-[#b4c9dc]">RAL (EUR)</span>
                    <Input type="number" min={0} step={100} value={ral} onChange={(e) => setRal(Number(e.target.value))} />
                  </label>
                ) : (
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-synapse-muted dark:text-[#b4c9dc]">Netto mensile target</span>
                    <Input type="number" min={0} step={10} value={targetNet} onChange={(e) => setTargetNet(Number(e.target.value))} />
                  </label>
                )}
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Area geografica</span>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} />
                </label>
              </div>
            ) : null}

            {step === "agevolazioni" ? (
              <div className="grid gap-2 md:grid-cols-2">
                {(
                  [
                    ["Donna", agevFemale, setAgevFemale],
                    ["Under 36", agevUnder36, setAgevUnder36],
                    ["Mezzogiorno / ZES", agevSouth, setAgevSouth],
                    ["Percettore NASpI", agevNaspi, setAgevNaspi],
                    ["Categorie protette", agevProtected, setAgevProtected]
                  ] as const
                ).map(([label, checked, setter]) => (
                  <label key={label} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={(e) => setter(e.target.checked)} />
                    {label}
                  </label>
                ))}
                <label className="block space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Note agevolazioni</span>
                  <Input value={agevOtherNotes} onChange={(e) => setAgevOtherNotes(e.target.value)} />
                </label>
              </div>
            ) : null}

            {(step === "benefit" || step === "risultato") && (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Welfare annuo (EUR)</span>
                  <Input type="number" min={0} value={welfareAnnual} onChange={(e) => setWelfareAnnual(Number(e.target.value))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Buoni pasto / mese</span>
                  <Input type="number" min={0} value={mealVouchers} onChange={(e) => setMealVouchers(Number(e.target.value))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Smart working / mese</span>
                  <Input type="number" min={0} value={smartWorking} onChange={(e) => setSmartWorking(Number(e.target.value))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Altri benefit / mese</span>
                  <Input type="number" min={0} value={otherBenefits} onChange={(e) => setOtherBenefits(Number(e.target.value))} />
                </label>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={prevStep} disabled={step === "contratto"}>
                Indietro
              </Button>
              {step !== "risultato" ? (
                <Button type="button" size="sm" onClick={nextStep}>
                  Avanti
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => void saveScenario()}>
                  Salva scenario
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Breakdown live</CardTitle>
            <CardDescription>Aggiornamento immediato su ogni modifica.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">Netto</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatEuro(result.monthly.netEuros)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">Lordo</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatEuro(result.monthly.grossEuros)}</p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">Costo azienda</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatEuro(result.monthly.companyCostEuros)}</p>
              </div>
            </div>
            <details className="mt-4 rounded-lg border border-[var(--card-border)] p-3">
              <summary className="cursor-pointer text-sm font-medium">Dettaglio voci</summary>
              <div className="mt-2 space-y-1 text-sm">
                {result.breakdownCompanyCost.map((row) => (
                  <div key={row.key} className="flex justify-between gap-2">
                    <span className="text-synapse-muted dark:text-[#b4c9dc]">{row.label}</span>
                    <span className="tabular-nums">{formatEuro(row.euros)}</span>
                  </div>
                ))}
              </div>
            </details>
            <p className="mt-3 text-xs text-synapse-muted dark:text-[#b4c9dc]">
              Annuo: costo {formatEuro(result.annual.companyCostEuros)} · netto {formatEuro(result.annual.netEuros)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-sky-500/30 bg-gradient-to-br from-sky-950/20 to-transparent dark:from-sky-900/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-400" aria-hidden />
              Consulente AI
            </CardTitle>
            <CardDescription>
              {advise?.llm.refineApplied
                ? "Analisi strutturata (LLM)"
                : advise?.llm.active
                  ? "Fallback offline"
                  : "LLM non attivo — guida offline"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {adviseLoading ? (
              <p className="flex items-center gap-2 text-sm text-synapse-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Analisi in corso…
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-synapse-text dark:text-white">{advise?.advise.advisorMessage}</p>
            )}
            {advise?.advise.suggestedChips.length ? (
              <div className="flex flex-wrap gap-2">
                {advise.advise.suggestedChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => applyChip(chip)}
                    className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100 hover:bg-sky-500/20"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
            {advise?.advise.agevolazioniVerificate.length ? (
              <ul className="space-y-2 text-xs">
                {advise.advise.agevolazioniVerificate.map((a) => (
                  <li key={a.code} className="rounded-md border border-white/10 p-2">
                    <span className="font-medium">{a.label}</span>
                    <span className={a.applicable ? " ml-2 text-emerald-400" : " ml-2 text-amber-300"}>
                      {a.applicable ? "· da verificare" : "· non selezionata"}
                    </span>
                    <p className="mt-1 text-synapse-muted dark:text-[#b4c9dc]">{a.rationale}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {advise?.advise.benefitSuggestions.length ? (
              <ul className="space-y-2 text-xs">
                {advise.advise.benefitSuggestions.map((b) => (
                  <li key={b.key}>
                    <button type="button" className="text-left text-sky-300 hover:underline" onClick={() => applyChip(b.label)}>
                      {b.label}
                      {b.monthlyEurosEstimate != null ? ` (~${formatEuro(b.monthlyEurosEstimate)}/mese)` : ""}
                    </button>
                    <p className="text-synapse-muted dark:text-[#b4c9dc]">{b.rationale}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {advise?.advise.validationNotes.length ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-2 text-xs text-amber-100">
                {advise.advise.validationNotes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Scenari salvati</CardTitle>
          <CardDescription>Richiede permesso scrittura budget personale.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {scenarios.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => loadScenario(s)}>
                {s.name}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-400"
                onClick={() => {
                  const token = getToken();
                  if (!token) return;
                  void deleteHiringSimulatorScenario(token, s.id).then(() => loadScenarios());
                }}
              >
                ×
              </Button>
            </div>
          ))}
          <Input
            className="max-w-[200px]"
            placeholder="Nome scenario"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => void saveScenario()}>
            Salva corrente
          </Button>
        </CardContent>
      </Card>
    </HebbAiExperienceShell>
  );
}
