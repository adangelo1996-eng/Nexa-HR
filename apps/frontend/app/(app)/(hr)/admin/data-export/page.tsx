"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  downloadAdminExportXlsx,
  fetchAdminExportFields,
  fetchCurrentUser,
  postAdminExportPreview,
  type AdminExportFieldDef,
  type AdminExportPreview
} from "@/lib/api";
import {
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";

const VARIABLE_IDS = new Set([
  "vacationDaysUsed",
  "sicknessDays",
  "smartworkingDays",
  "overtimeAmountEuro",
  "approvedExpenseReimbursementEuro"
]);

function expandExportSelection(selected: string[], catalog: AdminExportFieldDef[]): string[] {
  const set = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...set]) {
      const def = catalog.find((d) => d.id === id);
      for (const r of def?.requires ?? []) {
        if (!set.has(r)) {
          set.add(r);
          changed = true;
        }
      }
    }
  }
  return [...set];
}

export default function AdminDataExportPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<AdminExportFieldDef[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [competencePeriod, setCompetencePeriod] = useState("");
  const [preview, setPreview] = useState<AdminExportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const expanded = useMemo(() => expandExportSelection(selected, catalog), [selected, catalog]);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setErr(null);
    try {
      const me = await fetchCurrentUser(t);
      setUser(me);
      if (!sessionCanNexaAdmin(me)) {
        setLoading(false);
        return;
      }
      const { fields } = await fetchAdminExportFields(t);
      setCatalog(fields);
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        router.replace("/login");
        return;
      }
      setErr(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleField(id: string): void {
    if (VARIABLE_IDS.has(id) && !competencePeriod.trim()) {
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onPreview(): Promise<void> {
    const t = token ?? getToken();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const p = await postAdminExportPreview(t, {
        fields: expanded,
        competencePeriod: competencePeriod.trim() || undefined
      });
      setPreview(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Anteprima fallita");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(): Promise<void> {
    const t = token ?? getToken();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      await downloadAdminExportXlsx(t, {
        fields: expanded,
        competencePeriod: competencePeriod.trim() || undefined
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download fallito");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>;
  }
  if (!user || !sessionCanNexaAdmin(user)) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Export Excel dipendenti</h1>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">
            Seleziona le colonne da estrarre. I campi legati al mese (assenze, straordinari, spese) richiedono il mese
            competenza: quando ne selezioni uno, il mese viene incluso automaticamente ed è evidenziato insieme alle
            variabili correlate.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={"/admin/data-import" as Route} className="synapse-nav-link text-sm">
            Import Excel dipendenti
          </Link>
          <Link href="/admin" className="synapse-nav-link text-sm">
            Torna ad Admin
          </Link>
        </div>
      </div>

      <GlassCard className="p-4">
        <label className="flex max-w-xs flex-col gap-1 text-sm text-[var(--prom-muted)]">
          Mese competenza variabili (YYYY-MM)
          <input
            value={competencePeriod}
            onChange={(e) => setCompetencePeriod(e.target.value)}
            placeholder="es. 2026-03"
            className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
          />
        </label>
        <p className="mt-2 text-xs text-[var(--prom-muted)]">
          Obbligatorio per ferie, malattia, smart working, straordinari e note spese approvate. Lascia vuoto per export
          solo anagrafica.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((f) => {
            const needsMonth = VARIABLE_IDS.has(f.id);
            const blocked = needsMonth && !competencePeriod.trim();
            const isOn = expanded.includes(f.id);
            const implied = isOn && !selected.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                disabled={blocked}
                onClick={() => toggleField(f.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  blocked
                    ? "cursor-not-allowed border-[var(--prom-line)] opacity-40"
                    : isOn
                      ? implied
                        ? "border-amber-500/70 bg-amber-500/10 text-[var(--prom-text)]"
                        : "border-[var(--prom-gold)] bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] text-[var(--prom-text)]"
                      : "border-[var(--prom-line)] text-[var(--prom-muted)] hover:border-[var(--prom-line-strong)]"
                }`}
              >
                <span className="font-medium">{f.label}</span>
                {f.requires?.length ? (
                  <span className="mt-1 block text-[10px] opacity-80">Richiede: {f.requires.join(", ")}</span>
                ) : null}
                {blocked ? <span className="mt-1 block text-[10px] text-rose-600">Imposta il mese competenza</span> : null}
                {implied ? (
                  <span className="mt-1 block text-[10px] text-amber-800 dark:text-amber-200">
                    Incluso automaticamente (correlato)
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy || expanded.length === 0} onClick={() => void onPreview()}>
            Anteprima tabella
          </Button>
          <Button type="button" size="sm" disabled={busy || expanded.length === 0} onClick={() => void onDownload()}>
            Scarica Excel
          </Button>
        </div>
        {err ? <p className="mt-3 text-sm text-rose-600">{err}</p> : null}
      </GlassCard>

      {preview && preview.rows.length > 0 ? (
        <GlassCard className="overflow-x-auto p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">Anteprima ({preview.rows.length} righe)</h2>
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                {preview.columns.map((c) => (
                  <th
                    key={c.id}
                    className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-left font-medium text-[var(--prom-text)]"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 50).map((row, i) => (
                <tr key={i}>
                  {preview.columnIds.map((id) => (
                    <td
                      key={id}
                      className="border border-[var(--prom-line)] px-2 py-1 text-[var(--prom-text)] tabular-nums"
                    >
                      {row[id] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.rows.length > 50 ? (
            <p className="mt-2 text-xs text-[var(--prom-muted)]">Mostrate le prime 50 righe; l’Excel contiene tutte.</p>
          ) : null}
        </GlassCard>
      ) : null}
    </div>
  );
}
