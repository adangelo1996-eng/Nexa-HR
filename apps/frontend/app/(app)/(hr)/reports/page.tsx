"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { fetchAttendanceReport } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

export default function ReportsPage(): React.JSX.Element {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  async function exportExcel(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    const { rows } = await fetchAttendanceReport(token, from, to);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "presenze");
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
      <div className="flex flex-wrap gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm" />
        <Button type="button" size="sm" onClick={() => void exportExcel()}>
          Excel
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => void exportPdf()}>
          PDF
        </Button>
      </div>
    </div>
  );
}
