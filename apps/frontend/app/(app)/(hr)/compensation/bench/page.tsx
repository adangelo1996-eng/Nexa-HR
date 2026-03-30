"use client";

import { useEffect, useState } from "react";
import { fetchUsers } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

type Row = { role: string; canton: string; medianMonthlyChf: number };

export default function CompensationBenchPage(): React.JSX.Element {
  const [bench, setBench] = useState<Row[]>([]);
  const [role, setRole] = useState("Sviluppatore");
  const [canton, setCanton] = useState("TI");
  const [internal, setInternal] = useState<number | null>(null);

  useEffect(() => {
    void fetch("/data/ch-benchmark.json")
      .then((r) => r.json())
      .then((j: { byRoleCanton: Row[] }) => setBench(j.byRoleCanton));
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }
    void (async (): Promise<void> => {
      const users = await fetchUsers(token);
      const u = users[0];
      setInternal(u ? Number(u.baseSalaryMonthly) || 5800 : null);
    })();
  }, []);

  const ref = bench.find((b) => b.role === role && b.canton === canton);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Benchmark CH</h1>
      <div className="flex flex-wrap gap-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm">
          {[...new Set(bench.map((b) => b.role))].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={canton} onChange={(e) => setCanton(e.target.value)} className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm">
          {[...new Set(bench.map((b) => b.canton))].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {ref ? (
        <p className="text-[var(--prom-text)]">
          Mediana mercato: <strong>{ref.medianMonthlyChf} CHF</strong>
          {internal != null ? (
            <>
              {" "}
              · campione interno: {internal} CHF
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-[var(--prom-muted)]">Nessun dato per la combinazione.</p>
      )}
    </div>
  );
}
