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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-synapse-body">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Chiudi anteprima"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,#002D72_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-surface)_96%,#002d7208)] shadow-2xl backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-preview-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color-mix(in_srgb,#002D72_28%,var(--prom-line))] bg-gradient-to-r from-[#002D72] to-[#1a4d8c] px-4 py-3 text-white">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">Nexa · HR Payroll</p>
            <h2 id="draft-preview-title" className="mt-0.5 text-lg font-semibold tracking-tight">
              Bozza cedolino
            </h2>
            <p className="mt-1 text-sm text-white/90">
              {employeeName} · {payslip.period}
              {payslip.variablePeriod && payslip.variablePeriod !== payslip.period
                ? ` · variabili ${payslip.variablePeriod}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-amber-100/95">
              Stato: bozza (non ancora visibile al dipendente fino a pubblicazione periodo).
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-white/90 hover:bg-white/15"
            onClick={onClose}
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 text-[var(--prom-text)]">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Lordo</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--prom-text)]">
                {formatEuro(payslip.grossSalary ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--prom-gold)_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Netto</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                {formatEuro(payslip.netSalary)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)]">
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead className="border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,#002D72_08%,var(--prom-surface-soft))] text-xs uppercase text-[var(--prom-muted)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Codice</th>
                  <th className="px-3 py-2 font-semibold">Voce</th>
                  <th className="px-3 py-2 text-right font-semibold">Importo</th>
                </tr>
              </thead>
              <tbody>
                {(payslip.lines ?? []).map((line, idx) => (
                  <tr
                    key={`${idx}-${line.code}`}
                    className="border-b border-[var(--prom-line)] last:border-0 odd:bg-[color-mix(in_srgb,var(--prom-surface)_40%,transparent)]"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-[var(--prom-muted)]">{line.code}</td>
                    <td className="px-3 py-2 text-[var(--prom-text)]">{line.description}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        line.amount < 0 ? "text-red-600 dark:text-red-400" : "text-[var(--prom-text)]"
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
        <div className="flex flex-wrap gap-2 border-t border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-4 py-3">
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
