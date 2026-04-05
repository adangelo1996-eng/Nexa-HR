"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyEmployeeExcel,
  downloadEmployeeExcelNewUsersTemplate,
  fetchCurrentUser,
  validateEmployeeExcel,
  type EmployeeExcelApplyResponse,
  type EmployeeExcelValidateResponse
} from "@/lib/api";
import {
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";

export default function AdminDataImportPage(): React.JSX.Element | null {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [templateRows, setTemplateRows] = useState(5);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validatedOkFile, setValidatedOkFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<EmployeeExcelValidateResponse | null>(null);
  const [applyResult, setApplyResult] = useState<EmployeeExcelApplyResponse | null>(null);

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

  function onPickFile(f: File | null): void {
    setSelectedFile(f);
    setValidatedOkFile(null);
    setValidation(null);
    setApplyResult(null);
    setErr(null);
  }

  async function onValidate(): Promise<void> {
    const t = token ?? getToken();
    if (!t || !selectedFile) return;
    setBusy(true);
    setErr(null);
    setApplyResult(null);
    try {
      const v = await validateEmployeeExcel(t, selectedFile);
      setValidation(v);
      if (v.errors.length === 0) {
        setValidatedOkFile(selectedFile);
      } else {
        setValidatedOkFile(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Validazione fallita");
      setValidation(null);
      setValidatedOkFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function onApply(): Promise<void> {
    const t = token ?? getToken();
    if (!t || !validatedOkFile) return;
    setBusy(true);
    setErr(null);
    setApplyResult(null);
    try {
      const r = await applyEmployeeExcel(t, validatedOkFile);
      setApplyResult(r);
      setValidatedOkFile(null);
      setValidation(null);
      setSelectedFile(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Elaborazione fallita");
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadTemplate(): Promise<void> {
    const t = token ?? getToken();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      await downloadEmployeeExcelNewUsersTemplate(t, templateRows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download template fallito");
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
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Import Excel dipendenti</h1>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">
            Carica un file con le <strong>stesse intestazioni dell’export</strong> (foglio «Export»). In validazione vedi
            l’anteprima delle modifiche; l’<strong>applicazione</strong> aggiorna il database solo se l’intera
            elaborazione va a buon fine (in caso di errore le modifiche parziali vengono annullate). Le colonne del mese
            competenza e delle variabili mensili sono ignorate in scrittura.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={"/admin/data-export" as Route} className="synapse-nav-link">
            Vai a Export
          </Link>
          <Link href="/admin" className="synapse-nav-link">
            Torna ad Admin
          </Link>
        </div>
      </div>

      <GlassCard className="space-y-4 p-4">
        <h2 className="text-sm font-semibold text-[var(--prom-text)]">Template nuovi dipendenti</h2>
        <p className="text-xs text-[var(--prom-muted)]">
          Scarica un foglio già strutturato come l’export, con righe precompilate (ore settimanali, contratto, ferie,
          ruolo organizzativo predefinito, ruolo piattaforma <code className="text-[11px]">user</code>). Compila nome,
          cognome e centro di costo (codice o nome); poi usa lo stesso flusso di validazione e applicazione.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--prom-muted)]">
            Numero righe (1–200)
            <input
              type="number"
              min={1}
              max={200}
              value={templateRows}
              onChange={(e) => setTemplateRows(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
              className="w-28 rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-2 py-1.5 text-[var(--prom-text)]"
            />
          </label>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onDownloadTemplate()}>
            Scarica template .xlsx
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4 p-4">
        <h2 className="text-sm font-semibold text-[var(--prom-text)]">File da elaborare</h2>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block text-sm text-[var(--prom-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--prom-line)] file:bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--prom-text)]"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy || !selectedFile} onClick={() => void onValidate()}>
            Valida file
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !validatedOkFile}
            onClick={() => void onApply()}
            title={!validatedOkFile ? "Esegui prima una validazione senza errori" : undefined}
          >
            Applica modifiche al database
          </Button>
        </div>
        {validatedOkFile ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Validazione OK: puoi applicare. Il file usato in applicazione è l’ultimo validato con successo.
          </p>
        ) : null}
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
      </GlassCard>

      {validation && validation.errors.length > 0 ? (
        <GlassCard className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">Errori di validazione</h2>
          <ul className="list-inside list-disc space-y-1 text-xs text-[var(--prom-text)]">
            {validation.errors.map((e, i) => (
              <li key={i}>
                Riga {e.row}: <span className="font-medium">{e.field}</span> — {e.message}
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {validation && validation.preview.length > 0 ? (
        <GlassCard className="overflow-x-auto p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">
            Anteprima operazioni ({validation.preview.length})
          </h2>
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-left">
                  Riga
                </th>
                <th className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-left">
                  Azione
                </th>
                <th className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-left">
                  Utente
                </th>
                <th className="border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-1.5 text-left">
                  Dettaglio
                </th>
              </tr>
            </thead>
            <tbody>
              {validation.preview.map((p, i) => (
                <tr key={i}>
                  <td className="border border-[var(--prom-line)] px-2 py-1 tabular-nums">{p.row}</td>
                  <td className="border border-[var(--prom-line)] px-2 py-1">{p.action === "create" ? "Creazione" : "Aggiornamento"}</td>
                  <td className="border border-[var(--prom-line)] px-2 py-1">{p.userLabel}</td>
                  <td className="border border-[var(--prom-line)] px-2 py-1 text-[var(--prom-muted)]">
                    <ul className="list-inside list-disc">
                      {p.changes.map((c, j) => (
                        <li key={j}>{c}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      ) : null}

      {applyResult && applyResult.log.length > 0 ? (
        <GlassCard className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--prom-text)]">
            Elaborazione completata ({applyResult.created} creati, {applyResult.updated} aggiornati)
          </h2>
          <ul className="max-h-80 overflow-y-auto space-y-1 font-mono text-[11px] text-[var(--prom-text)]">
            {applyResult.log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}
