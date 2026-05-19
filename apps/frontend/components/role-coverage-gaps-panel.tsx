"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteRoleCoverageGap,
  fetchRoleCoverageGaps,
  upsertRoleCoverageGap,
  type HrRoleCoverageGapDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export function RoleCoverageGapsPanel(): React.JSX.Element {
  const [items, setItems] = useState<HrRoleCoverageGapDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    roleTitle: "",
    headcountGap: 1,
    expectedRalAnnual: "",
    notes: ""
  });

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetchRoleCoverageGaps(token);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento copertura ruoli");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(): Promise<void> {
    const token = getToken();
    if (!token || !draft.roleTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await upsertRoleCoverageGap(token, {
        roleTitle: draft.roleTitle.trim(),
        headcountGap: draft.headcountGap,
        expectedRalAnnual: draft.expectedRalAnnual ? Number(draft.expectedRalAnnual) : null,
        notes: draft.notes.trim() || null
      });
      setDraft({ roleTitle: "", headcountGap: 1, expectedRalAnnual: "", notes: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string): Promise<void> {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      await deleteRoleCoverageGap(token, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eliminazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  const fmtEur = (n: number | null): string =>
    n != null
      ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
      : "—";

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Copertura ruoli (headcount)</h2>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            Persone mancanti per titolo ruolo e RAL attesa — alimenta{" "}
            <Link href={"/personnel-budget/forecast" as Route} className="text-[#002D72] underline dark:text-sky-200">
              forecast budget
            </Link>{" "}
            e workforce planning.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => void load()}>
          Aggiorna
        </Button>
      </div>
      {error ? (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <div className="mb-4 grid gap-3 rounded-xl border border-[var(--prom-line)] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-[var(--prom-muted)] lg:col-span-2">
          Titolo ruolo
          <Input
            className="mt-1"
            value={draft.roleTitle}
            onChange={(e) => setDraft((d) => ({ ...d, roleTitle: e.target.value }))}
            placeholder="es. Payroll specialist"
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)]">
          Persone mancanti
          <Input
            type="number"
            min={0}
            className="mt-1"
            value={draft.headcountGap}
            onChange={(e) => setDraft((d) => ({ ...d, headcountGap: Number(e.target.value) || 0 }))}
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)]">
          RAL attesa annua (EUR)
          <Input
            type="number"
            min={0}
            className="mt-1"
            value={draft.expectedRalAnnual}
            onChange={(e) => setDraft((d) => ({ ...d, expectedRalAnnual: e.target.value }))}
          />
        </label>
        <div className="flex items-end">
          <Button type="button" size="sm" disabled={busy || !draft.roleTitle.trim()} onClick={() => void onSave()}>
            Salva riga
          </Button>
        </div>
        <label className="text-xs text-[var(--prom-muted)] sm:col-span-2 lg:col-span-5">
          Note
          <Input
            className="mt-1"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />
        </label>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--prom-muted)]">Nessun gap ruolo configurato.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]" style={{ background: "var(--card-bg)" }}>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--prom-line)] text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
              <tr>
                <th className="px-4 py-3">Ruolo</th>
                <th className="px-4 py-3">Mancanti</th>
                <th className="px-4 py-3">RAL attesa</th>
                <th className="px-4 py-3">Costo annuo stimato</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const est =
                  row.expectedRalAnnual != null && row.headcountGap > 0
                    ? row.expectedRalAnnual * row.headcountGap
                    : null;
                return (
                  <tr key={row.id} className="border-b border-[var(--prom-line)] last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[var(--prom-text)]">{row.roleTitle}</td>
                    <td className="px-4 py-2.5">{row.headcountGap}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fmtEur(row.expectedRalAnnual)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--prom-muted)]">{fmtEur(est)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void onDelete(row.id)}>
                        Elimina
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
