"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { jsPDF } from "jspdf";
import { fetchAttendanceReport, fetchCurrentUser } from "@/lib/api";
import { getToken, type SessionUser } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

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
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }
    void fetchCurrentUser(token)
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const allowExport = useMemo(() => canExportHrReports(user), [user]);

  async function exportExcel(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    const { rows } = await fetchAttendanceReport(token, from, to);
    const wb = XLSX.utils.book_new();
    if (rows.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([["Nessun dato nel periodo"]]);
      XLSX.utils.book_append_sheet(wb, ws, "presenze");
    } else {
      const keys = Object.keys(rows[0] as Record<string, unknown>);
      const header = keys;
      const dataRows = rows.map((r) => keys.map((k) => (r as Record<string, unknown>)[k] ?? ""));
      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, "presenze");
    }
    XLSX.writeFile(wb, `nexa-presenze-${from}-${to}.xlsx`);
  }

  async function exportPdf(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    const { rows } = await fetchAttendanceReport(token, from, to);
    const doc = new jsPDF();
    doc.text("Nexa HR — Presenze", 14, 16);
    let y = 26;
    rows.slice(0, 40).forEach((r) => {
      doc.text(`${r.date} ${r.fullName} ${r.type}`, 14, y);
      y += 6;
    });
    doc.save(`nexa-presenze-${from}-${to}.pdf`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Report presenze</h1>
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm"
        />
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
    </div>
  );
}
