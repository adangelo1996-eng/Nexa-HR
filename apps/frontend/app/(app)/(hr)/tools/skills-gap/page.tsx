"use client";

import { useEffect, useState } from "react";
import { fetchSkillsGap } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";

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
    <HebbAiExperienceShell
      contentMax="wide"
      title="Skills gap (v1)"
      subtitle="Confronto tra fabbisogno per ruolo e livello medio dichiarato sui dipendenti. Popola le tabelle via SQL o admin: senza dati la griglia resta vuota."
      headerTrailing={<HebbAiPageHelpButton pageKey="skills-gap" />}
    >
      <HebbAiGlassPanel className="py-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]" htmlFor="skills-role">
          Filtra per roleId (opzionale)
        </label>
        <input
          id="skills-role"
          className="mt-2 w-full max-w-md rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)]"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          placeholder="es. r3"
        />
      </HebbAiGlassPanel>

      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      <HebbAiGlassPanel className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)]">
            <tr>
              <th className="px-4 py-3 font-semibold text-[var(--prom-text)]">Ruolo</th>
              <th className="px-4 py-3 font-semibold text-[var(--prom-text)]">Competenza</th>
              <th className="px-4 py-3 font-semibold text-[var(--prom-text)]">Min</th>
              <th className="px-4 py-3 font-semibold text-[var(--prom-text)]">Media team</th>
              <th className="px-4 py-3 font-semibold text-[var(--prom-text)]">Gap</th>
              <th className="px-4 py-3 font-semibold text-[var(--prom-text)]">Headcount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={`${row.roleId}-${row.skillCode}`} className="border-b border-[var(--prom-line)] last:border-0">
                <td className="px-4 py-3 text-[var(--prom-text)]">{row.roleName}</td>
                <td className="px-4 py-3 text-[var(--prom-muted)]">
                  <span className="font-mono text-xs text-[var(--prom-text)]">{row.skillCode}</span> {row.skillName}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--prom-text)]">{row.minLevel}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--prom-text)]">{row.avgUserLevel}</td>
                <td className="px-4 py-3 tabular-nums font-semibold text-[var(--prom-gold)]">{row.gap}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--prom-text)]">{row.headcountInRole}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !error ? (
          <p className="px-4 py-6 text-sm text-[var(--prom-muted)]">Nessun fabbisogno configurato o nessun match.</p>
        ) : null}
      </HebbAiGlassPanel>
    </HebbAiExperienceShell>
  );
}
