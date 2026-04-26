"use client";

import { useCallback, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { AiNarrativeDisplay } from "@/components/ai-narrative-display";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { LlmUsageStatusBanner } from "@/components/llm-usage-status-banner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { postHrCenterPersonnelBudgetReport, type HrCenterPersonnelBudgetAiBody } from "@/lib/api";
import { getToken } from "@/lib/auth-session";


function plainTextFromNarrative(n: unknown): string {
  const o = n as { envelope?: { title?: string; bullets?: string[]; summary?: string } };
  const e = o?.envelope;
  if (!e) {
    return JSON.stringify(n, null, 2);
  }
  const parts = [e.title, ...(e.bullets ?? []), e.summary].filter(Boolean);
  return parts.join("\n\n");
}

export default function HrCenterBudgetReportPage(): React.JSX.Element {
  const now = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<"abc" | "two_periods">("abc");
  const [abcScope, setAbcScope] = useState<"month" | "ytd">("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [yearA, setYearA] = useState(now.getFullYear());
  const [monthA, setMonthA] = useState(Math.max(1, now.getMonth()));
  const [yearB, setYearB] = useState(now.getFullYear());
  const [monthB, setMonthB] = useState(Math.min(12, now.getMonth() + 1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<unknown>(null);
  const [llm, setLlm] = useState<{ active: boolean; refineApplied: boolean; refineFailure?: string } | null>(null);
  const [exportPayload, setExportPayload] = useState<{
    mode: "two_periods" | "abc";
    sheets: Array<{ name: string; rows: string[][] }>;
  } | null>(null);

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const body: HrCenterPersonnelBudgetAiBody =
        mode === "abc"
          ? { mode: "abc", year, month, abcScope }
          : { mode: "two_periods", yearA, monthA, yearB, monthB };
      const r = await postHrCenterPersonnelBudgetReport(token, body);
      setNarrative(r.narrative);
      setLlm(r.llm);
      setExportPayload(r.export);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore report");
      setExportPayload(null);
    } finally {
      setLoading(false);
    }
  }, [abcScope, mode, month, monthA, monthB, year, yearA, yearB]);

  const downloadExcel = async (): Promise<void> => {
    if (!exportPayload) return;
    const wb = new ExcelJS.Workbook();
    for (const sh of exportPayload.sheets) {
      const ws = wb.addWorksheet(sh.name.slice(0, 31));
      for (const row of sh.rows) {
        ws.addRow(row);
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexa-budget-llm-${exportPayload.mode}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = (): void => {
    if (!narrative) return;
    const doc = new jsPDF();
    const text = plainTextFromNarrative(narrative);
    doc.setFillColor(0, 45, 114);
    doc.rect(0, 0, 220, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("Nexa HR", 14, 17);
    doc.setFontSize(9);
    doc.text("Report budget personale (LLM)", 14, 23);
    doc.setTextColor(28, 37, 44);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, 14, 34);
    doc.save("nexa-budget-llm-report.pdf");
  };

  const downloadPpt = async (): Promise<void> => {
    if (!narrative) return;
    try {
      const pptxgen = (await import("pptxgenjs")).default;
      const pres = new pptxgen();
      pres.layout = "LAYOUT_16x9";
      pres.author = "Nexa HR";
      pres.title = "Report budget personale";
      const brand = "002D72";
      const text = plainTextFromNarrative(narrative);
      const chunks = text.split(/\n\n+/).filter(Boolean);
      const slides = chunks.length ? chunks : [text];
      for (const chunk of slides.slice(0, 12)) {
        const slide = pres.addSlide();
        slide.background = { color: brand };
        slide.addText("Nexa HR", {
          x: 0.4,
          y: 0.35,
          w: "40%",
          h: 0.4,
          fontSize: 14,
          color: "FFFFFF",
          bold: true
        });
        slide.addText(chunk, {
          x: 0.45,
          y: 0.95,
          w: "88%",
          h: "72%",
          fontSize: 12,
          color: "F0F4FA",
          valign: "top"
        });
      }
      await pres.writeFile({ fileName: "nexa-budget-llm-report.pptx" });
    } catch {
      setError("Esportazione PowerPoint non disponibile: verifica dipendenze pptxgenjs.");
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard
        title="Report budget personale (LLM)"
        description="Analisi su dati pseudonimizzati e aggregati (Actual, Budget, Forecast o confronto tra due periodi). Sostituisce in buona parte la narrativa del report mensile: verificare sempre i numeri ufficiali in payroll / budget."
      >
        <LlmUsageStatusBanner idle={!llm} llm={llm} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-[var(--prom-muted)]">
            Modalità
            <select
              className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
              value={mode}
              onChange={(e) => setMode(e.target.value as "abc" | "two_periods")}
            >
              <option value="abc">Actual / Budget / Forecast (un periodo)</option>
              <option value="two_periods">Confronto tra due periodi</option>
            </select>
          </label>
        </div>
        {mode === "abc" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-[var(--prom-muted)] sm:col-span-2">
              Ambito analisi
              <select
                className="mt-1 w-full max-w-md rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
                value={abcScope}
                onChange={(e) => setAbcScope(e.target.value as "month" | "ytd")}
              >
                <option value="month">Solo il mese selezionato (mensile)</option>
                <option value="ytd">YTD: da gennaio al mese selezionato (progressivo)</option>
              </select>
            </label>
            <label className="block text-xs text-[var(--prom-muted)]">
              Anno
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm"
                value={year}
                min={2020}
                max={2100}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            <label className="block text-xs text-[var(--prom-muted)]">
              Mese
              <select
                className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--prom-line)] p-3">
              <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Periodo A</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className="rounded border border-[var(--prom-line)] px-2 py-1 text-sm"
                  value={yearA}
                  onChange={(e) => setYearA(Number(e.target.value))}
                />
                <select
                  className="rounded border border-[var(--prom-line)] px-2 py-1 text-sm"
                  value={monthA}
                  onChange={(e) => setMonthA(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--prom-line)] p-3">
              <p className="text-[10px] font-semibold uppercase text-[var(--prom-muted)]">Periodo B</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className="rounded border border-[var(--prom-line)] px-2 py-1 text-sm"
                  value={yearB}
                  onChange={(e) => setYearB(Number(e.target.value))}
                />
                <select
                  className="rounded border border-[var(--prom-line)] px-2 py-1 text-sm"
                  value={monthB}
                  onChange={(e) => setMonthB(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <HebbAiPageHelpButton pageKey="hr-center-budget-report" />
          <Button type="button" size="sm" disabled={loading} onClick={() => void run()}>
            {loading ? "Generazione…" : "Genera report LLM"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!exportPayload} onClick={() => void downloadExcel()}>
            Esporta Excel
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!narrative} onClick={() => downloadPdf()}>
            Esporta PDF
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!narrative} onClick={() => void downloadPpt()}>
            Esporta PowerPoint
          </Button>
        </div>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {narrative ? (
          <div className="mt-4 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-4">
            <h4 className="text-xs font-semibold uppercase text-[var(--prom-muted)]">Output</h4>
            <div className="mt-2">
              <AiNarrativeDisplay narrative={narrative} />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--prom-muted)]">
            Richiede permesso lettura budget personale e HR esteso (come la sezione Budget personale).
          </p>
        )}
      </GlassCard>
    </div>
  );
}
