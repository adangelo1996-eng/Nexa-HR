"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import {
  fetchCurrentUser,
  fetchUsers,
  postPayslipImportCommit,
  postPayslipImportPreview,
  type PayslipImportPreviewResult,
  type User
} from "@/lib/api";
import { clearSession, getToken, shouldClearSessionOnUnauthorizedApiError } from "@/lib/auth-session";
import { useRouter } from "next/navigation";

export default function PayslipImportPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [netSalary, setNetSalary] = useState("");
  const [grossSalary, setGrossSalary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PayslipImportPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    try {
      await fetchCurrentUser(t);
      const list = await fetchUsers(t);
      setUsers(list);
      setUserId((prev) => prev || (list[0]?.id ?? ""));
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Errore caricamento");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPreview(): Promise<void> {
    if (!token || !file) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    setPreview(null);
    try {
      const r = await postPayslipImportPreview(token, file);
      setPreview(r);
      if (r.suggestedPeriod) {
        setPeriod(r.suggestedPeriod);
      }
      if (r.netHints[0]) {
        const n = r.netHints[0].replace(/\./g, "").replace(",", ".");
        const parsed = Number.parseFloat(n);
        if (Number.isFinite(parsed)) {
          setNetSalary(String(parsed));
        }
      }
      setMessage("Anteprima estratta. Verifica periodo e importi prima di pubblicare.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anteprima fallita");
    } finally {
      setBusy(false);
    }
  }

  async function onCommit(): Promise<void> {
    if (!token || !file || !userId.trim() || !period.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await postPayslipImportCommit(token, file, {
        userId: userId.trim(),
        period: period.trim(),
        netSalary: netSalary.trim() ? Number.parseFloat(netSalary.replace(",", ".")) : undefined,
        grossSalary: grossSalary.trim() ? Number.parseFloat(grossSalary.replace(",", ".")) : undefined
      });
      setMessage("Cedolino pubblicato nello storage del dipendente. Può scaricarlo da «Cedolini».");
      setFile(null);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fallito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-synapse-text dark:text-white">Import cedolini (PDF)</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Estrazione testo lato server (pdf-parse) con suggerimenti su periodo e netto; il file viene salvato in
          storage Supabase collegato al dipendente. Riservato agli operatori payroll (stessi permessi della console
          Hebb).
        </p>
      </header>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}

      <GlassCard title="Destinatario e periodo">
        <div className="space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-300">Dipendente</span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} — {u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-300">Periodo (YYYY-MM)</span>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              placeholder="2026-03"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-300">Netto (opz., per lista cedolini)</span>
            <input
              value={netSalary}
              onChange={(e) => setNetSalary(e.target.value)}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-300">Lordo (opz.)</span>
            <input
              value={grossSalary}
              onChange={(e) => setGrossSalary(e.target.value)}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              inputMode="decimal"
            />
          </label>
        </div>
      </GlassCard>

      <GlassCard title="File PDF">
        <div className="space-y-3 text-sm">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-100"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy || !file || !token} onClick={() => void onPreview()}>
              Analizza PDF
            </Button>
            <Button type="button" disabled={busy || !file || !token} onClick={() => void onCommit()}>
              Pubblica sul dipendente
            </Button>
          </div>
        </div>
      </GlassCard>

      {preview ? (
        <GlassCard title="Anteprima testo (troncata)">
          <p className="mb-2 text-xs text-slate-500">
            Caratteri estratti: {preview.textLength}
            {preview.suggestedPeriod ? ` · Periodo suggerito: ${preview.suggestedPeriod}` : null}
            {preview.netHints.length > 0 ? ` · Netto: ${preview.netHints.join(", ")}` : null}
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">
            {preview.excerpt || "—"}
          </pre>
        </GlassCard>
      ) : null}
    </div>
  );
}
