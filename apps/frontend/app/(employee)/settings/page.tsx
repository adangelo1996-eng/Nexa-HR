"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import {
  applyImport,
  downloadImportTemplate,
  fetchCurrentUser,
  fetchImportHistory,
  validateImportFile,
  type ImportCategory,
  type ImportCellError,
  type ImportHistoryItem
} from "@/lib/api";
import { clearSession, getToken, shouldClearSessionOnUnauthorizedApiError } from "@/lib/auth-session";
import {
  readNexaHrPrefs,
  readSynapsePrefs,
  writeNexaHrPrefs,
  writeSynapsePrefs,
  type NexaHrPrefsV1,
  type SynapsePrefsV1
} from "@/lib/synapse-prefs";
import { useTheme } from "@/components/theme-provider";

const CAT_LABEL: Record<ImportCategory, string> = {
  users: "Utenti",
  cost_centers: "Centri di costo",
  roles: "Ruoli",
  leave_allowances: "Ferie (giorni annuali)",
  user_managers: "Responsabili (email)"
};

export default function SettingsPage(): React.JSX.Element {
  const router = useRouter();
  const { theme, setTheme, mounted } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [synapsePrefs, setSynapsePrefs] = useState<SynapsePrefsV1>(() => readSynapsePrefs());
  const [nexaPrefs, setNexaPrefs] = useState<NexaHrPrefsV1>(() => readNexaHrPrefs());
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [importCategory, setImportCategory] = useState<ImportCategory>("users");
  const [validateErrors, setValidateErrors] = useState<ImportCellError[]>([]);
  const [validatedRows, setValidatedRows] = useState<unknown[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    const tokenValue = t;
    setToken(tokenValue);
    async function load(): Promise<void> {
      try {
        const me = await fetchCurrentUser(tokenValue);
        setIsSuperuser(Boolean(me.isSynapseSuperuser));
        if (Boolean(me.isSynapseSuperuser)) {
          try {
            const h = await fetchImportHistory(tokenValue);
            setHistory(h);
          } catch {
            setHistory([]);
          }
        }
      } catch (loadError) {
        if (shouldClearSessionOnUnauthorizedApiError(loadError)) {
          clearSession();
          router.replace("/login");
        } else {
          setError(loadError instanceof Error ? loadError.message : "Errore caricamento impostazioni");
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router]);

  useEffect(() => {
    setSynapsePrefs(readSynapsePrefs());
    setNexaPrefs(readNexaHrPrefs());
  }, []);

  function persistSynapse(next: SynapsePrefsV1): void {
    setSynapsePrefs(next);
    writeSynapsePrefs(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next.locale === "en" ? "en" : "it";
    }
  }

  function persistNexa(next: NexaHrPrefsV1): void {
    setNexaPrefs(next);
    writeNexaHrPrefs(next);
  }

  async function onDownloadTemplate(): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      const blob = await downloadImportTemplate(token, importCategory);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexa-import-${importCategory}-template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download fallito");
    }
  }

  async function onValidateFile(file: File | null): Promise<void> {
    if (!token || !file) return;
    setError(null);
    setValidateErrors([]);
    setValidatedRows(null);
    setImportBusy(true);
    setImportProgress("Validazione in corso...");
    try {
      const result = await validateImportFile(token, importCategory, file);
      setValidateErrors(result.errors);
      setValidatedRows(result.rows);
      if (result.errors.length > 0) {
        setImportProgress(null);
      } else {
        setImportProgress(`Validazione OK: ${result.rows.length} righe pronte.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validazione fallita");
      setImportProgress(null);
    } finally {
      setImportBusy(false);
    }
  }

  async function onApplyImport(): Promise<void> {
    if (!token || !validatedRows?.length) return;
    setError(null);
    setImportBusy(true);
    setImportProgress("Import in corso...");
    try {
      const res = await applyImport(token, importCategory, validatedRows);
      if (res.errors?.length) {
        setValidateErrors(res.errors);
        setError("Alcune righe non sono state importate.");
      } else {
        setImportProgress("Import completato.");
        setValidatedRows(null);
      }
      const h = await fetchImportHistory(token);
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fallito");
    } finally {
      setImportBusy(false);
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-slate-600 dark:text-slate-400">Caricamento impostazioni…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Impostazioni</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Preferenze Synapse e Nexa HR. L’import massivo è visibile solo ai superuser.
        </p>
      </header>

      <GlassCard title="Synapse" description="Lingua interfaccia e tema (sincronizzato con la barra in alto).">
        <div className="space-y-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Lingua</span>
            <select
              value={synapsePrefs.locale}
              onChange={(e) =>
                persistSynapse({
                  ...synapsePrefs,
                  locale: e.target.value === "en" ? "en" : "it"
                })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="flex items-center gap-3">
            <span className="text-slate-700 dark:text-slate-300">Tema</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!mounted}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "Passa a chiaro" : "Passa a scuro"}
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard title="Nexa HR" description="Comportamento predefinito nell’app.">
        <div className="space-y-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Vista dopo il login</span>
            <select
              value={nexaPrefs.defaultLanding}
              onChange={(e) =>
                persistNexa({
                  ...nexaPrefs,
                  defaultLanding: e.target.value === "attendance" ? "attendance" : "dashboard"
                })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value="dashboard">Dashboard</option>
              <option value="attendance">Timbrature</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Formato ore</span>
            <select
              value={nexaPrefs.hoursFormat}
              onChange={(e) =>
                persistNexa({
                  ...nexaPrefs,
                  hoursFormat: e.target.value === "hm" ? "hm" : "decimal"
                })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value="decimal">Decimali (es. 7,5)</option>
              <option value="hm">Ore e minuti</option>
            </select>
          </label>
        </div>
      </GlassCard>

      {isSuperuser ? (
        <GlassCard
          title="Import dati (superuser)"
          description="Storico globale su database (eventi validate/apply). Opzionale: dominio operatore (SYNAPSE_IMPORT_OPERATOR_EMAIL_DOMAINS), email righe (IMPORT_STRICT_EMAIL_DOMAIN), notifica IMPORT_NOTIFY_WEBHOOK_URL."
        >
          <div className="space-y-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">Categoria</span>
              <select
                value={importCategory}
                onChange={(e) => setImportCategory(e.target.value as ImportCategory)}
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              >
                {(Object.keys(CAT_LABEL) as ImportCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {CAT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void onDownloadTemplate()}>
                Scarica template
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-3 py-1.5 text-xs">
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => void onValidateFile(e.target.files?.[0] ?? null)}
                />
                Scegli file e valida
              </label>
            </div>
            {importProgress ? <p className="text-xs text-slate-500">{importProgress}</p> : null}
            {validateErrors.length > 0 ? (
              <div className="max-h-48 overflow-auto rounded border border-rose-900/50 bg-rose-950/20 p-2 text-xs text-rose-200">
                {validateErrors.map((err, i) => (
                  <div key={`${err.row}-${err.field}-${i}`}>
                    Riga {err.row}, {err.field}: {err.message}
                  </div>
                ))}
              </div>
            ) : null}
            {validatedRows && validatedRows.length > 0 && validateErrors.length === 0 ? (
              <Button type="button" disabled={importBusy} onClick={() => void onApplyImport()}>
                Applica import ({validatedRows.length} righe)
              </Button>
            ) : null}
            {history.length > 0 ? (
              <div className="mt-4 border-t border-slate-800 pt-4">
                <p className="mb-2 text-xs font-medium text-slate-400">
                  Storico import (tutti gli eventi, non filtrati per sessione)
                </p>
                <ul className="space-y-2 text-[11px] text-slate-500">
                  {history.slice(0, 12).map((h) => (
                    <li key={h.id} className="rounded border border-slate-800/80 bg-slate-950/40 p-2">
                      <span className="font-mono text-slate-400">{h.kind}</span> · {h.category} ·{" "}
                      <span className={h.status === "ok" ? "text-emerald-400/90" : ""}>{h.status}</span>
                      {h.kind === "apply" && h.createdCount != null ? (
                        <> · creati {h.createdCount}</>
                      ) : null}
                      {h.rowCount > 0 ? <> · {h.rowCount} righe</> : null}
                      {h.errorCount > 0 ? <> · {h.errorCount} errori</> : null}
                      {typeof h.fileSizeBytes === "number" ? (
                        <> · {(h.fileSizeBytes / 1024).toFixed(1)} KB</>
                      ) : null}
                      {h.fileName ? <> · {h.fileName}</> : null}
                      {h.actorEmail ? <> · da {h.actorEmail}</> : null}
                      <div className="mt-0.5 text-[10px] text-slate-600">
                        {new Date(h.finishedAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </GlassCard>
      ) : null}

      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}
