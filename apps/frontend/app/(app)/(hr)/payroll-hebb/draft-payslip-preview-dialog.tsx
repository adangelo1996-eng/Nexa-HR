"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Payslip } from "@/lib/api";

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export function DraftPayslipPreviewDialog({
  open,
  onClose,
  payslip,
  employeeName,
  onDownloadPdf,
  pdfLoading
}: {
  open: boolean;
  onClose: () => void;
  payslip: Payslip | null;
  employeeName: string;
  onDownloadPdf: () => void;
  pdfLoading?: boolean;
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !payslip) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Chiudi anteprima"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-preview-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h2 id="draft-preview-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Bozza cedolino
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {employeeName} · {payslip.period}
              {payslip.variablePeriod && payslip.variablePeriod !== payslip.period
                ? ` · variabili ${payslip.variablePeriod}`
                : ""}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Stato: bozza (non ancora visibile al dipendente)</p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs text-slate-500">Lordo</p>
              <p className="text-lg font-semibold tabular-nums">{formatEuro(payslip.grossSalary ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs text-slate-500">Netto</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatEuro(payslip.netSalary)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-600 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 font-medium">Codice</th>
                  <th className="px-3 py-2 font-medium">Voce</th>
                  <th className="px-3 py-2 text-right font-medium">Importo</th>
                </tr>
              </thead>
              <tbody>
                {(payslip.lines ?? []).map((line, idx) => (
                  <tr key={`${idx}-${line.code}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{line.code}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{line.description}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        line.amount < 0 ? "text-red-600 dark:text-red-400" : ""
                      }`}
                    >
                      {formatEuro(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <Button type="button" variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
          <Button type="button" disabled={pdfLoading} onClick={() => void onDownloadPdf()}>
            {pdfLoading ? "Download…" : "Scarica PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}
