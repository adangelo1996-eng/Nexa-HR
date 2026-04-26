"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { FileSpreadsheet } from "lucide-react";
import { jsPDF } from "jspdf";
import { fetchAttendanceReport, fetchCurrentUser } from "@/lib/api";
import { getToken, type SessionUser } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

function firstDayOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function lastDayOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function canExportHrReports(u: SessionUser | null): boolean {
  if (!u) {
    return false;
  }
  if (u.canExportAttendanceReports === true) {
    return true;
  }
  if (u.canExportAttendanceReports === false) {
    return false;
  }
  return Boolean(u.canManageTeamAttendance) || u.canAccessHrExtendedConsole === true;
}

export default function ReportsPage(): React.JSX.Element {
  const [from, setFrom] = useState(() => firstDayOfMonth(new Date()));
  const [to, setTo] = useState(() => lastDayOfMonth(new Date()));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<
    Array<{ userId: string; fullName: string; date: string; type: string; at: string }>
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }
    void fetchCurrentUser(token)
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const load = useCallback(async (fromD: string, toD: string) => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { rows: r } = await fetchAttendanceReport(token, fromD, toD);
      setRows(r);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Caricamento non riuscito");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    void load(from, to);
  }, [user, from, to, load]);

  const setCurrentMonth = useCallback(() => {
    const d = new Date();
    setFrom(firstDayOfMonth(d));
    setTo(lastDayOfMonth(d));
  }, []);

  const allowExport = useMemo(() => canExportHrReports(user), [user]);

  async function exportExcel(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    const { rows: data } = await fetchAttendanceReport(token, from, to);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("presenze");
    if (data.length === 0) {
      ws.addRow(["Nessun dato nel periodo"]);
    } else {
      const keys = Object.keys(data[0] as Record<string, unknown>);
      ws.addRow(keys);
      for (const r of data) {
        const rec = r as Record<string, unknown>;
        ws.addRow(keys.map((k) => rec[k] ?? ""));
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexa-presenze-${from}-${to}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    const { rows: data } = await fetchAttendanceReport(token, from, to);
    const doc = new jsPDF();
    doc.text("Nexa HR — Report presenze", 14, 16);
    let y = 26;
    data.slice(0, 40).forEach((r) => {
      doc.text(`${r.date} ${r.fullName} ${r.type}`, 14, y);
      y += 6;
    });
    doc.save(`nexa-presenze-${from}-${to}.pdf`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Report presenze</h1>
      <p className="text-sm text-[var(--prom-muted)]">
        All’apertura vengono caricati automaticamente i dati del <strong>mese in corso</strong>. Puoi restringere o
        ampliare le date a piacere.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--prom-muted)]">
          Da
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)]">
          A
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm"
          />
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={setCurrentMonth}>
          Mese in corso
        </Button>
        {allowExport ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 w-9 shrink-0 p-0"
              onClick={() => void exportExcel()}
              title="Esporta in Excel (prima riga intestazioni, poi i dati)"
              aria-label="Esporta Excel"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void exportPdf()}>
              PDF
            </Button>
          </>
        ) : (
          <p className="text-xs text-[var(--prom-muted)]">
            Export (Excel/PDF) riservato agli amministratori Nexa e al centro HR.
          </p>
        )}
      </div>
      {loadError ? <p className="text-sm text-rose-600">{loadError}</p> : null}
      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--prom-line)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] text-xs text-[var(--prom-muted)]">
                <th className="p-2 font-medium">Data</th>
                <th className="p-2 font-medium">Nome</th>
                <th className="p-2 font-medium">Tipo</th>
                <th className="p-2 font-medium">Orario</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-[var(--prom-muted)]">
                    Nessun dato per il periodo.
                  </td>
                </tr>
              ) : (
                rows.slice(0, 200).map((r, i) => (
                  <tr key={`${r.userId}-${r.date}-${r.type}-${i}`} className="border-b border-[var(--prom-line)]/60">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.fullName}</td>
                    <td className="p-2">{r.type}</td>
                    <td className="p-2 text-[var(--prom-muted)]">{r.at ? r.at.slice(0, 16) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {rows.length > 200 ? (
            <p className="border-t border-[var(--prom-line)] p-2 text-xs text-[var(--prom-muted)]">
              Mostrati i primi 200 movimenti; in export Excel/PDF è incluso l’elenco completo.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
