"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  downloadPayslipPdf,
  fetchCurrentUser,
  fetchUsers,
  generatePayslip,
  type Payslip,
  type User
} from "@/lib/api";
import { clearSession, getToken, type SessionUser } from "@/lib/auth-session";

export default function PayrollCalcPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [result, setResult] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const currentUser = await fetchCurrentUser(tokenValue);
        if (currentUser.role === "employee") {
          router.replace("/");
          return;
        }
        const availableUsers = await fetchUsers(tokenValue);
        setUser(currentUser);
        setUsers(availableUsers);
        setSelectedUserId(availableUsers[0]?.id ?? "");
      } catch (loadError) {
        clearSession();
        router.replace("/login");
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento dati payroll");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId),
    [users, selectedUserId]
  );

  async function onGenerate(): Promise<void> {
    if (!token || !selectedUserId || !period) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payslip = await generatePayslip(token, selectedUserId, period);
      setResult(payslip);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore calcolo cedolino");
    } finally {
      setSubmitting(false);
    }
  }

  async function onExportPdf(): Promise<void> {
    if (!token || !selectedUserId || !period) {
      return;
    }
    try {
      await downloadPayslipPdf(token, selectedUserId, period);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Errore export PDF");
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-slate-300">Caricamento area payroll...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calcolo cedolino</h1>
          <p className="text-sm text-slate-400">
            Area manager/admin. Operatore attuale: {user?.fullName}
          </p>
        </div>
        <Link href="/" className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">
          Torna alla dashboard
        </Link>
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold">Nuovo calcolo</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Dipendente
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            >
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName} ({item.role})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Periodo
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => void onGenerate()}
            disabled={submitting || !selectedUserId || !period}
            className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-70"
          >
            {submitting ? "Calcolo in corso..." : "Calcola cedolino"}
          </button>
          <button
            onClick={() => void onExportPdf()}
            disabled={!result}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-60"
          >
            Esporta PDF
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </section>

      {result ? (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold">Risultato cedolino</h2>
          <p className="mt-1 text-sm text-slate-400">
            {selectedUser?.fullName} - {result.period}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-700 p-3">
              <p className="text-xs text-slate-400">Lordo</p>
              <p className="text-xl font-semibold">CHF {(result.grossSalary ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3">
              <p className="text-xs text-slate-400">Netto</p>
              <p className="text-xl font-semibold">CHF {result.netSalary.toFixed(2)}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(result.lines ?? []).slice(0, 8).map((line) => (
              <div key={`${line.code}-${line.description}`} className="flex items-center justify-between text-sm">
                <span>
                  {line.code} - {line.description}
                </span>
                <span>CHF {line.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
