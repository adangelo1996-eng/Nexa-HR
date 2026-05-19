import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

export type WorkforceExportCockpit = {
  scenario: string;
  summary: { headcount: number; monthlyPayrollMassEur: number; pendingExpenseCount: number };
  series: Array<{ month: string; costEur: number }>;
  custom?: { fteDelta: number; monthlyFlatDeltaEur: number; seriesScalePercent: number } | null;
};

export type WorkforceExportBundle = {
  scenarioLabel: string;
  savedAt: string;
  assumptions: Record<string, unknown>;
  cockpit: WorkforceExportCockpit;
  narrative?: { title: string; bullets: string[]; summary: string } | null;
};

function eur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export async function downloadWorkforcePlanningExcel(bundle: WorkforceExportBundle): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Nexa-HR";
  const ws = wb.addWorksheet("Workforce planning", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Sezione", key: "section", width: 28 },
    { header: "Voce", key: "label", width: 36 },
    { header: "Valore", key: "value", width: 24 }
  ];
  ws.addRow({ section: "Meta", label: "Scenario", value: bundle.scenarioLabel });
  ws.addRow({ section: "Meta", label: "Esportato il", value: bundle.savedAt });
  ws.addRow({});
  ws.addRow({ section: "KPI", label: "Headcount", value: bundle.cockpit.summary.headcount });
  ws.addRow({
    section: "KPI",
    label: "Massa stipendi mensile",
    value: bundle.cockpit.summary.monthlyPayrollMassEur
  });
  ws.addRow({ section: "KPI", label: "Spese in attesa", value: bundle.cockpit.summary.pendingExpenseCount });
  if (bundle.cockpit.custom) {
    ws.addRow({});
    ws.addRow({ section: "What-if", label: "FTE delta", value: bundle.cockpit.custom.fteDelta });
    ws.addRow({ section: "What-if", label: "Flat EUR/mese", value: bundle.cockpit.custom.monthlyFlatDeltaEur });
    ws.addRow({ section: "What-if", label: "Scala forecast %", value: bundle.cockpit.custom.seriesScalePercent });
  }
  ws.addRow({});
  ws.addRow({ section: "Serie", label: "Mese", value: "Costo previsto EUR" });
  for (const s of bundle.cockpit.series) {
    ws.addRow({ section: "Serie", label: s.month, value: s.costEur });
  }
  ws.addRow({});
  ws.addRow({ section: "Assunzioni", label: "JSON", value: JSON.stringify(bundle.assumptions, null, 0) });
  if (bundle.narrative) {
    ws.addRow({});
    ws.addRow({ section: "Sintesi AI", label: "Titolo", value: bundle.narrative.title });
    bundle.narrative.bullets.forEach((b, i) => {
      ws.addRow({ section: "Sintesi AI", label: `Bullet ${i + 1}`, value: b });
    });
    ws.addRow({ section: "Sintesi AI", label: "Summary", value: bundle.narrative.summary });
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `workforce-planning-${bundle.scenarioLabel.replace(/\s+/g, "-").slice(0, 40)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadWorkforcePlanningPdfLandscape(bundle: WorkforceExportBundle): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 14;
  let y = margin;
  const line = (text: string, size = 10, bold = false): void => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, 280 - margin * 2);
    for (const ln of lines) {
      if (y > 190) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin, y);
      y += size * 0.45 + 2;
    }
  };
  line("Nexa-HR · Workforce planning", 14, true);
  line(`Scenario: ${bundle.scenarioLabel} · ${bundle.savedAt}`, 9);
  y += 2;
  line("Assunzioni", 11, true);
  line(JSON.stringify(bundle.assumptions, null, 2), 8);
  y += 2;
  line("KPI di scenario", 11, true);
  line(`Headcount: ${bundle.cockpit.summary.headcount}`, 9);
  line(`Massa stipendi mensile: ${eur(bundle.cockpit.summary.monthlyPayrollMassEur)}`, 9);
  line(`Spese in attesa HR: ${bundle.cockpit.summary.pendingExpenseCount}`, 9);
  y += 2;
  line("Proiezione costi (mesi)", 11, true);
  for (const s of bundle.cockpit.series) {
    line(`${s.month}: ${eur(s.costEur)}`, 9);
  }
  if (bundle.narrative) {
    y += 2;
    line("Analisi / sintesi", 11, true);
    line(bundle.narrative.title, 10, true);
    for (const b of bundle.narrative.bullets) {
      line(`• ${b}`, 9);
    }
    line(bundle.narrative.summary, 9);
  }
  doc.save(`workforce-planning-${bundle.scenarioLabel.replace(/\s+/g, "-").slice(0, 40)}.pdf`);
}
