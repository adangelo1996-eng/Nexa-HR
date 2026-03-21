"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface Payslip {
  id: string;
  userId: string;
  period: string;
  netSalary: number;
}

interface Props {
  role: "admin" | "manager_controllo_gestione" | "employee";
  currentUserId: string;
  currentUserName: string;
  payslips: Payslip[];
  onExportPdf: (userId: string, period: string) => Promise<void>;
}

export function PayslipArea({
  role,
  currentUserId,
  currentUserName,
  payslips,
  onExportPdf
}: Props): React.JSX.Element {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(userId: string, period: string, id: string): Promise<void> {
    setError(null);
    setBusyId(id);
    try {
      await onExportPdf(userId, period);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Errore export PDF");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card mt-6">
      <h2 className="text-xl font-semibold">Area riservata cedolini</h2>
      <p className="mt-1 text-sm text-slate-400">
        Accesso protetto: ogni dipendente vede solo i propri cedolini.
      </p>

      <div className="mt-4 space-y-3">
        {payslips.length === 0 ? (
          <p className="text-sm text-slate-400">Nessun cedolino disponibile.</p>
        ) : null}
        {payslips.map((item, index) => (
          <motion.div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-slate-700 p-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
          >
            <div>
              <p className="text-sm text-slate-300">{item.period}</p>
              <p className="text-lg font-medium">CHF {item.netSalary.toFixed(2)}</p>
            </div>
            <button
              onClick={() => void handleExport(item.userId, item.period, item.id)}
              disabled={busyId === item.id}
              className="rounded-lg bg-cyan-400 px-3 py-1 text-sm font-medium text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyId === item.id ? "Generazione..." : "Esporta PDF"}
            </button>
          </motion.div>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      <p className="mt-4 text-xs text-slate-500">
        Profilo: {role} | Utente: {currentUserName} ({currentUserId})
      </p>
    </section>
  );
}
