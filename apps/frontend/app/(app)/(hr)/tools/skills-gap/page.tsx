"use client";

import { useEffect, useState } from "react";
import { fetchSkillsGap } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function SkillsGapPage(): React.JSX.Element {
  const [roleId, setRoleId] = useState("");
  const [items, setItems] = useState<
    Array<{
      roleId: string;
      roleName: string;
      skillCode: string;
      skillName: string;
      minLevel: number;
      avgUserLevel: number;
      gap: number;
      headcountInRole: number;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      return;
    }
    void (async (): Promise<void> => {
      setError(null);
      try {
        const res = await fetchSkillsGap(t, roleId.trim() || undefined);
        setItems(res.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore caricamento");
      }
    })();
  }, [roleId]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Skills gap (v1)</h1>
        <p className="mt-1 text-sm text-[var(--prom-muted)]">
          Confronto tra fabbisogno per ruolo (`hr_role_skill_requirements`) e livello medio dichiarato sui dipendenti
          (`hr_user_skills`). Popolare le tabelle via SQL/admin; senza dati la griglia resta vuota.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-[var(--prom-muted)]">Filtra per roleId (opzionale)</label>
        <input
          className="rounded-md border border-[var(--prom-line)] bg-[var(--prom-surface)] px-2 py-1.5 text-sm"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          placeholder="es. r3"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--prom-line)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)]">
            <tr>
              <th className="px-3 py-2 font-medium text-[var(--prom-text)]">Ruolo</th>
              <th className="px-3 py-2 font-medium text-[var(--prom-text)]">Competenza</th>
              <th className="px-3 py-2 font-medium text-[var(--prom-text)]">Min</th>
              <th className="px-3 py-2 font-medium text-[var(--prom-text)]">Media team</th>
              <th className="px-3 py-2 font-medium text-[var(--prom-text)]">Gap</th>
              <th className="px-3 py-2 font-medium text-[var(--prom-text)]">Headcount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={`${row.roleId}-${row.skillCode}`} className="border-b border-[var(--prom-line)]">
                <td className="px-3 py-2 text-[var(--prom-text)]">{row.roleName}</td>
                <td className="px-3 py-2 text-[var(--prom-muted)]">
                  <span className="font-mono text-xs text-[var(--prom-text)]">{row.skillCode}</span> {row.skillName}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.minLevel}</td>
                <td className="px-3 py-2 tabular-nums">{row.avgUserLevel}</td>
                <td className="px-3 py-2 tabular-nums font-medium text-[var(--prom-gold)]">{row.gap}</td>
                <td className="px-3 py-2 tabular-nums">{row.headcountInRole}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !error ? (
          <p className="px-3 py-4 text-sm text-[var(--prom-muted)]">Nessun fabbisogno configurato o nessun match.</p>
        ) : null}
      </div>
    </div>
  );
}
