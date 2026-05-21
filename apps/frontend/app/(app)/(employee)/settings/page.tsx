"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { HebbFieldAssistProvider, HebbInput } from "@/components/hebb-field-assist";
import { Button } from "@/components/ui/button";
import {
  applyImport,
  downloadImportTemplate,
  fetchCompanySettings,
  fetchCurrentUser,
  fetchImportHistory,
  patchCompanySettings,
  patchMyPayrollProfileIt,
  validateImportFile,
  type CompanySettingsDto,
  type ImportCategory,
  type ImportCellError,
  type ImportHistoryItem,
  type PayrollProfileItPatch
} from "@/lib/api";
import {
  clearSession,
  getToken,
  sessionCanAccessPayrollArea,
  sessionCanNexaAdmin,
  sessionCanViewOrgExpenseClaims,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";
import { NEXA_NAV_ROUTE_CATALOG, navCatalogLabelForHref } from "@/lib/nav-routes-catalog";
import type { Route } from "next";
import {
  readNexaHrPrefs,
  readSynapsePrefs,
  writeNexaHrPrefs,
  writeSynapsePrefs,
  type NexaHrDefaultLanding,
  type NexaHrPrefsV1,
  type SynapsePrefsV1
} from "@/lib/synapse-prefs";
import { useTheme } from "@/components/theme-provider";
import { IT_REGION_NAMES, itComuniDatalistOptionsForRegion } from "@/lib/data/it-locations";

const CAT_LABEL: Record<ImportCategory, string> = {
  users: "Utenti",
  cost_centers: "Centri di costo",
  roles: "Ruoli",
  leave_allowances: "Ferie (giorni annuali)",
  user_managers: "Responsabili (email)",
  user_payroll_anagrafica: "Anagrafica payroll (IBAN, RAL, fisco IT)"
};

const MONTHS_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre"
] as const;

export default function SettingsPage(): React.JSX.Element {
  const router = useRouter();
  const { theme, setTheme, mounted } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [synapsePrefs, setSynapsePrefs] = useState<SynapsePrefsV1>(() => readSynapsePrefs());
  const [nexaPrefs, setNexaPrefs] = useState<NexaHrPrefsV1>(() => readNexaHrPrefs());
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [canCompanySettings, setCanCompanySettings] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<CompanySettingsDto | null>(null);
  const [customVarRows, setCustomVarRows] = useState<Array<{ key: string; value: string }>>([]);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyLoadFailed, setCompanyLoadFailed] = useState(false);
  const [importCategory, setImportCategory] = useState<ImportCategory>("users");
  const [validateErrors, setValidateErrors] = useState<ImportCellError[]>([]);
  const [validatedRows, setValidatedRows] = useState<unknown[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [itBusy, setItBusy] = useState(false);
  const [itOk, setItOk] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<SessionUser | null>(null);
  const [canEditItProfile, setCanEditItProfile] = useState(false);
  const [itForm, setItForm] = useState<PayrollProfileItPatch>({
    fiscalCode: "",
    maritalStatus: "",
    dependentsChildren: 0,
    dependentSpouse: false,
    disabilityFlag: false,
    taxDomicileMunicipalityIt: "",
    taxDomicileSameAsResidence: true,
    taxRegion: "",
    taxMunicipalityIt: "",
    payMonthsPerYear: 13,
    annualGrossSalary: null,
    partTimeModality: "",
    ccnlCode: "",
    ccnlLevel: "",
    legalCategory: "",
    contractEndDate: "",
    fixedSupplementMonthly: null,
    garnishmentMonthlyEstimate: null,
    fringeBenefitYtdEuros: null,
    contractFixedTerm: false
  });

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
        setProfileUser(me);
        setCanEditItProfile(me.canEditSelfPayrollProfileIt === true);
        setIsSuperuser(Boolean(me.isSynapseSuperuser));
        setItForm({
          fiscalCode: me.fiscalCode ?? "",
          maritalStatus: me.maritalStatus ?? "",
          dependentsChildren: me.dependentsChildren ?? 0,
          dependentSpouse: Boolean(me.dependentSpouse),
          disabilityFlag: Boolean(me.disabilityFlag),
          taxDomicileMunicipalityIt: me.taxDomicileMunicipalityIt ?? "",
          taxDomicileSameAsResidence: me.taxDomicileSameAsResidence !== false,
          taxRegion: me.taxRegion ?? "",
          taxMunicipalityIt: me.taxMunicipalityIt ?? "",
          payMonthsPerYear: me.payMonthsPerYear === 12 || me.payMonthsPerYear === 14 ? me.payMonthsPerYear : 13,
          annualGrossSalary: me.annualGrossSalary ?? null,
          partTimeModality: me.partTimeModality ?? "",
          ccnlCode: me.ccnlCode ?? "",
          ccnlLevel: me.ccnlLevel ?? "",
          legalCategory: me.legalCategory ?? "",
          contractEndDate: me.contractEndDate ?? "",
          fixedSupplementMonthly: me.fixedSupplementMonthly ?? null,
          garnishmentMonthlyEstimate: me.garnishmentMonthlyEstimate ?? null,
          fringeBenefitYtdEuros: me.fringeBenefitYtdEuros ?? null,
          contractFixedTerm: Boolean(me.contractFixedTerm)
        });
        const canCo = sessionCanNexaAdmin(me);
        setCanCompanySettings(canCo);
        if (canCo) {
          try {
            const cs = await fetchCompanySettings(tokenValue);
            setCompanyDraft(cs);
            setCompanyLoadFailed(false);
            setCustomVarRows(
              Object.entries(cs.customVariables).map(([key, value]) => ({ key, value }))
            );
          } catch {
            setCompanyDraft(null);
            setCustomVarRows([]);
            setCompanyLoadFailed(true);
          }
        } else {
          setCompanyDraft(null);
          setCustomVarRows([]);
          setCompanyLoadFailed(false);
        }
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

  const comuneResidenzaSuggestions = useMemo(
    () => itComuniDatalistOptionsForRegion(String(itForm.taxRegion ?? "")),
    [itForm.taxRegion]
  );

  const shortcutPickerRoutes = useMemo(() => {
    let rows = [...NEXA_NAV_ROUTE_CATALOG];
    if (!sessionCanAccessPayrollArea(profileUser ?? undefined)) {
      rows = rows.filter((r) => r.href !== "/payroll-hebb");
    }
    if (!sessionCanNexaAdmin(profileUser ?? undefined)) {
      rows = rows.filter(
        (r) =>
          r.href !== "/personnel-budget" &&
          r.href !== "/admin" &&
          r.href !== ("/admin/data-export" as Route) &&
          r.href !== ("/admin/data-import" as Route) &&
          r.href !== ("/admin/payslip-import" as Route)
      );
    }
    if (!sessionCanViewOrgExpenseClaims(profileUser ?? undefined)) {
      rows = rows.filter((r) => r.href !== ("/expenses/org" as Route));
    }
    return rows;
  }, [profileUser]);

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

  async function onSaveCompanySettings(): Promise<void> {
    if (!token || !companyDraft) return;
    setCompanyBusy(true);
    setError(null);
    try {
      const customVariables: Record<string, string> = {};
      for (const row of customVarRows) {
        const k = row.key.trim();
        if (!k) continue;
        customVariables[k] = row.value.trim();
      }
      const updated = await patchCompanySettings(token, {
        fiscalYearStartMonth: companyDraft.fiscalYearStartMonth,
        companyLegalName: companyDraft.companyLegalName,
        companyVatNumber: companyDraft.companyVatNumber,
        companyRegistrationInfo: companyDraft.companyRegistrationInfo,
        companyCcnl: companyDraft.companyCcnl,
        defaultCurrency: companyDraft.defaultCurrency,
        weeklyFullTimeHours: companyDraft.weeklyFullTimeHours,
        payrollInstallmentMonths: companyDraft.payrollInstallmentMonths,
        customVariables
      });
      setCompanyDraft(updated);
      setCustomVarRows(
        Object.entries(updated.customVariables).map(([key, value]) => ({ key, value }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio variabili aziendali fallito");
    } finally {
      setCompanyBusy(false);
    }
  }

  async function onSaveItProfile(): Promise<void> {
    if (!token || !canEditItProfile) return;
    setItOk(null);
    setError(null);
    setItBusy(true);
    try {
      const ral =
        itForm.annualGrossSalary != null && String(itForm.annualGrossSalary).trim() !== ""
          ? Number(itForm.annualGrossSalary)
          : null;
      await patchMyPayrollProfileIt(token, {
        fiscalCode: (itForm.fiscalCode ?? "").trim() || null,
        maritalStatus: (itForm.maritalStatus ?? "").trim() || null,
        dependentsChildren: Math.min(20, Math.max(0, Number(itForm.dependentsChildren) || 0)),
        dependentSpouse: Boolean(itForm.dependentSpouse),
        disabilityFlag: Boolean(itForm.disabilityFlag),
        taxDomicileMunicipalityIt: (itForm.taxDomicileMunicipalityIt ?? "").trim() || null,
        taxDomicileSameAsResidence: Boolean(itForm.taxDomicileSameAsResidence),
        taxRegion: (itForm.taxRegion ?? "").trim() || undefined,
        taxMunicipalityIt: (itForm.taxMunicipalityIt ?? "").trim() || undefined,
        payMonthsPerYear: itForm.payMonthsPerYear === 12 || itForm.payMonthsPerYear === 14 ? itForm.payMonthsPerYear : 13,
        annualGrossSalary: ral != null && ral >= 0 ? ral : null,
        partTimeModality: (itForm.partTimeModality ?? "").trim() || null,
        ccnlCode: (itForm.ccnlCode ?? "").trim() || null,
        ccnlLevel: (itForm.ccnlLevel ?? "").trim() || null,
        legalCategory: (itForm.legalCategory ?? "").trim() || null,
        contractEndDate: (itForm.contractEndDate ?? "").trim() || null,
        fixedSupplementMonthly:
          itForm.fixedSupplementMonthly != null && Number(itForm.fixedSupplementMonthly) >= 0
            ? Number(itForm.fixedSupplementMonthly)
            : null,
        garnishmentMonthlyEstimate:
          itForm.garnishmentMonthlyEstimate != null && Number(itForm.garnishmentMonthlyEstimate) >= 0
            ? Number(itForm.garnishmentMonthlyEstimate)
            : null,
        fringeBenefitYtdEuros:
          itForm.fringeBenefitYtdEuros != null && Number(itForm.fringeBenefitYtdEuros) >= 0
            ? Number(itForm.fringeBenefitYtdEuros)
            : null,
        contractFixedTerm: Boolean(itForm.contractFixedTerm)
      });
      setItOk("Profilo salvato. Lo stipendio mensile operativo viene ricalcolato da RAL e mensilità, se indicati.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio profilo IT fallito");
    } finally {
      setItBusy(false);
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

      {profileUser ? (
        <GlassCard title="Profilo organizzativo" description="Dati non sensibili (sola lettura da anagrafica).">
          <HebbFieldAssistProvider
            formId="settings.profile"
            partialForm={{
              contractType: profileUser.contractType,
              costCenterId: profileUser.costCenterId,
              department: profileUser.costCenterId
            }}
          >
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <HebbInput
                label="Tipologia contratto (riferimento)"
                fieldKey="contractType"
                value={profileUser.contractType?.trim() || ""}
                onChange={() => {}}
                readOnly
                className="rounded-lg border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-slate-300"
              />
              <HebbInput
                label="Centro di costo / dipartimento (ID)"
                fieldKey="department"
                value={profileUser.costCenterId?.trim() || ""}
                onChange={() => {}}
                readOnly
                className="rounded-lg border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-slate-300"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Usa HEBB per suggerimenti; le modifiche ufficiali restano in anagrafica HR / admin.
            </p>
          </HebbFieldAssistProvider>
        </GlassCard>
      ) : null}

      <GlassCard title="Nexa HR" description="Comportamento predefinito nell’app.">
        <div className="space-y-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Vista dopo il login</span>
            <select
              value={nexaPrefs.defaultLanding}
              onChange={(e) => {
                const v = e.target.value;
                const defaultLanding: NexaHrDefaultLanding =
                  v === "attendance"
                    ? "attendance"
                    : v === "dashboard"
                      ? "dashboard"
                      : "mappa-portale";
                persistNexa({ ...nexaPrefs, defaultLanding });
              }}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value="mappa-portale">Mappa portale</option>
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
          <div className="space-y-2 border-t border-slate-700/40 pt-3">
            <div className="text-slate-700 dark:text-slate-300">
              Scorciatoie menu (mobile)
              <p className="mt-0.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                Fino a 6 voci in cima al drawer su schermi piccoli.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(nexaPrefs.menuShortcutHrefs ?? []).map((href) => (
                <span
                  key={href}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-600/80 bg-slate-950/50 px-2 py-1 text-xs text-slate-200"
                >
                  {navCatalogLabelForHref(href)}
                  <button
                    type="button"
                    className="rounded-full px-1 text-slate-400 hover:text-rose-400"
                    aria-label={`Rimuovi ${href}`}
                    onClick={() => {
                      const next = (nexaPrefs.menuShortcutHrefs ?? []).filter((h) => h !== href);
                      persistNexa({ ...nexaPrefs, menuShortcutHrefs: next });
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {(nexaPrefs.menuShortcutHrefs ?? []).length >= 6 ? null : (
                <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                  <span>Aggiungi</span>
                  <select
                    className="rounded border border-slate-600 bg-slate-950/60 px-2 py-1 text-slate-100"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      e.target.value = "";
                      if (!v || !v.startsWith("/")) {
                        return;
                      }
                      const cur = nexaPrefs.menuShortcutHrefs ?? [];
                      if (cur.includes(v) || cur.length >= 6) {
                        return;
                      }
                      persistNexa({ ...nexaPrefs, menuShortcutHrefs: [...cur, v] });
                    }}
                  >
                    <option value="">Scegli pagina…</option>
                    {shortcutPickerRoutes
                      .filter((r) => !(nexaPrefs.menuShortcutHrefs ?? []).includes(r.href))
                      .map((r) => (
                        <option key={r.href} value={r.href}>
                          {r.label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard
        title="Profilo fiscale e contratto (Italia)"
        description={
          canEditItProfile
            ? "Dati per simulazioni cedolino e detrazioni. RAL e mensilità aggiornano lo stipendio mensile usato dal motore (RAL ÷ mensilità)."
            : "Sola lettura: le modifiche sono gestite solo da amministratori o HR tramite anagrafica dipendente."
        }
      >
        {!canEditItProfile && profileUser ? (
          <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3 text-sm text-slate-300">
            <div className="font-medium text-slate-200">Contratto (anagrafica)</div>
            <p className="mt-1 text-xs text-slate-400">
              Tipologia: {profileUser.contractType?.trim() || "—"} · Ore settimanali:{" "}
              {profileUser.weeklyContractHours != null ? `${profileUser.weeklyContractHours} h` : "—"} · Retribuzione
              base mensile:{" "}
              {profileUser.baseSalaryMonthly != null ? `${profileUser.baseSalaryMonthly.toFixed(2)} €` : "—"}
            </p>
          </div>
        ) : null}
        {profileUser?.companyCcnl?.trim() ? (
          <div className="mb-4 rounded-lg border border-amber-700/40 bg-slate-950/40 p-3 text-sm text-slate-200">
            <div className="font-medium">CCNL di riferimento (impostazione aziendale)</div>
            <p className="mt-1 text-slate-300">{profileUser.companyCcnl.trim()}</p>
            <p className="mt-1 text-xs text-slate-500">Sola lettura: modificabile solo da console admin nelle variabili aziendali.</p>
          </div>
        ) : null}
        <div
          className={
            !canEditItProfile
              ? "pointer-events-none select-none opacity-[0.92]"
              : undefined
          }
        >
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Codice fiscale</span>
            <input
              value={String(itForm.fiscalCode ?? "")}
              onChange={(e) => setItForm({ ...itForm, fiscalCode: e.target.value.toUpperCase().slice(0, 16) })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              maxLength={16}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Stato civile</span>
            <select
              value={String(itForm.maritalStatus ?? "")}
              onChange={(e) => setItForm({ ...itForm, maritalStatus: e.target.value || "" })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value="">—</option>
              <option value="single">Single</option>
              <option value="married">Sposato/a</option>
              <option value="divorced">Divorziato/a</option>
              <option value="widowed">Vedovo/a</option>
              <option value="civil_union">Unione civile</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Figli a carico</span>
            <input
              type="number"
              min={0}
              max={20}
              value={itForm.dependentsChildren ?? 0}
              onChange={(e) =>
                setItForm({ ...itForm, dependentsChildren: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={Boolean(itForm.dependentSpouse)}
              onChange={(e) => setItForm({ ...itForm, dependentSpouse: e.target.checked })}
            />
            <span className="text-slate-700 dark:text-slate-300">Coniuge a carico</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(itForm.disabilityFlag)}
              onChange={(e) => setItForm({ ...itForm, disabilityFlag: e.target.checked })}
            />
            <span className="text-slate-700 dark:text-slate-300">Disabilità (flag informativo)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(itForm.contractFixedTerm)}
              onChange={(e) => setItForm({ ...itForm, contractFixedTerm: e.target.checked })}
            />
            <span className="text-slate-700 dark:text-slate-300">Contratto a tempo determinato</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Regione (addizionale)</span>
            <input
              value={String(itForm.taxRegion ?? "")}
              onChange={(e) => setItForm({ ...itForm, taxRegion: e.target.value.slice(0, 64) })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              placeholder="Suggerimenti da elenco statico"
              list="nexa-settings-it-regioni"
              autoComplete="off"
            />
            <datalist id="nexa-settings-it-regioni">
              {IT_REGION_NAMES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Comune di residenza</span>
            <input
              value={String(itForm.taxMunicipalityIt ?? "")}
              onChange={(e) => setItForm({ ...itForm, taxMunicipalityIt: e.target.value.slice(0, 120) })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              list="nexa-settings-it-comuni-res"
              autoComplete="off"
            />
            <datalist id="nexa-settings-it-comuni-res">
              {comuneResidenzaSuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-[11px] text-slate-500">
              Suggerimenti da dataset locale (estendibile); è possibile digitare un comune non in elenco.
            </p>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(itForm.taxDomicileSameAsResidence)}
              onChange={(e) => setItForm({ ...itForm, taxDomicileSameAsResidence: e.target.checked })}
            />
            <span className="text-slate-700 dark:text-slate-300">Domicilio fiscale = residenza</span>
          </label>
          {!itForm.taxDomicileSameAsResidence ? (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-slate-700 dark:text-slate-300">Comune domicilio fiscale</span>
              <input
                value={String(itForm.taxDomicileMunicipalityIt ?? "")}
                onChange={(e) => setItForm({ ...itForm, taxDomicileMunicipalityIt: e.target.value.slice(0, 120) })}
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Mensilità contrattuali</span>
            <select
              value={String(itForm.payMonthsPerYear ?? 13)}
              onChange={(e) => setItForm({ ...itForm, payMonthsPerYear: Number(e.target.value) })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value={12}>12</option>
              <option value={13}>13</option>
              <option value={14}>14</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">RAL annua lorda (€)</span>
            <input
              type="number"
              min={0}
              step={100}
              value={itForm.annualGrossSalary ?? ""}
              onChange={(e) =>
                setItForm({
                  ...itForm,
                  annualGrossSalary: e.target.value === "" ? null : Number(e.target.value)
                })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Categoria legale</span>
            <select
              value={String(itForm.legalCategory ?? "")}
              onChange={(e) => setItForm({ ...itForm, legalCategory: e.target.value })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value="">—</option>
              <option value="operaio">Operaio</option>
              <option value="impiegato">Impiegato</option>
              <option value="quadro">Quadro</option>
              <option value="dirigente">Dirigente</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Part-time (modalità)</span>
            <select
              value={String(itForm.partTimeModality ?? "")}
              onChange={(e) => setItForm({ ...itForm, partTimeModality: e.target.value })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            >
              <option value="">—</option>
              <option value="full">Full time equivalent</option>
              <option value="horizontal">Orizzontale</option>
              <option value="vertical">Verticale</option>
              <option value="mixed">Misto</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">CCNL (codice / testo)</span>
            <input
              value={String(itForm.ccnlCode ?? "")}
              onChange={(e) => setItForm({ ...itForm, ccnlCode: e.target.value.slice(0, 64) })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Livello CCNL</span>
            <input
              value={String(itForm.ccnlLevel ?? "")}
              onChange={(e) => setItForm({ ...itForm, ccnlLevel: e.target.value.slice(0, 64) })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Fine contratto (YYYY-MM-DD)</span>
            <input
              type="date"
              value={String(itForm.contractEndDate ?? "")}
              onChange={(e) => setItForm({ ...itForm, contractEndDate: e.target.value })}
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Integrazione fissa mensile (€)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={itForm.fixedSupplementMonthly ?? ""}
              onChange={(e) =>
                setItForm({
                  ...itForm,
                  fixedSupplementMonthly: e.target.value === "" ? null : Number(e.target.value)
                })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-700 dark:text-slate-300">Trattenute stimate mensili (€)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={itForm.garnishmentMonthlyEstimate ?? ""}
              onChange={(e) =>
                setItForm({
                  ...itForm,
                  garnishmentMonthlyEstimate: e.target.value === "" ? null : Number(e.target.value)
                })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-slate-700 dark:text-slate-300">Fringe benefit YTD (€)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={itForm.fringeBenefitYtdEuros ?? ""}
              onChange={(e) =>
                setItForm({
                  ...itForm,
                  fringeBenefitYtdEuros: e.target.value === "" ? null : Number(e.target.value)
                })
              }
              className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
            />
          </label>
        </div>
        </div>
        {canEditItProfile ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={itBusy} onClick={() => void onSaveItProfile()}>
            {itBusy ? "Salvataggio…" : "Salva profilo IT"}
          </Button>
          {itOk ? <span className="text-xs text-emerald-600 dark:text-emerald-400">{itOk}</span> : null}
        </div>
        ) : null}
      </GlassCard>

      {canCompanySettings && companyLoadFailed && !companyDraft ? (
        <GlassCard
          title="Variabili aziendali (solo admin)"
          description="Impossibile caricare le impostazioni dal server."
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const t = getToken();
              if (!t) return;
              setCompanyLoadFailed(false);
              void (async () => {
                try {
                  const cs = await fetchCompanySettings(t);
                  setCompanyDraft(cs);
                  setCustomVarRows(
                    Object.entries(cs.customVariables).map(([key, value]) => ({ key, value }))
                  );
                } catch {
                  setCompanyLoadFailed(true);
                }
              })();
            }}
          >
            Riprova
          </Button>
        </GlassCard>
      ) : null}

      {canCompanySettings && companyDraft ? (
        <GlassCard
          title="Variabili aziendali (solo admin)"
          description={`Tenant ${companyDraft.companyId}. Anno di riferimento, dati anagrafici leggeri e coppie nome/valore per parametri interni.`}
        >
          <div className="space-y-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">
                Inizio anno di riferimento (mese)
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Seleziona da quale mese parte l&apos;anno societario / di pianificazione (es. aprile per fiscal year
                UK-style). Le altre parti dell&apos;app possono leggere questo valore in seguito.
              </p>
              <select
                value={String(companyDraft.fiscalYearStartMonth)}
                onChange={(e) =>
                  setCompanyDraft({
                    ...companyDraft,
                    fiscalYearStartMonth: Number(e.target.value)
                  })
                }
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              >
                {MONTHS_IT.map((label, i) => (
                  <option key={label} value={String(i + 1)}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">Ragione sociale</span>
              <input
                type="text"
                value={companyDraft.companyLegalName}
                onChange={(e) =>
                  setCompanyDraft({ ...companyDraft, companyLegalName: e.target.value })
                }
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
                maxLength={240}
                autoComplete="organization"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-slate-700 dark:text-slate-300">Partita IVA / VAT</span>
                <input
                  type="text"
                  value={companyDraft.companyVatNumber}
                  onChange={(e) =>
                    setCompanyDraft({ ...companyDraft, companyVatNumber: e.target.value })
                  }
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
                  maxLength={64}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-700 dark:text-slate-300">Valuta predefinita</span>
                <input
                  type="text"
                  value={companyDraft.defaultCurrency}
                  onChange={(e) =>
                    setCompanyDraft({
                      ...companyDraft,
                      defaultCurrency: e.target.value.toUpperCase().slice(0, 8)
                    })
                  }
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
                  maxLength={8}
                  placeholder="EUR"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">Dati iscrizione (REA / CCIAA / note)</span>
              <input
                type="text"
                value={companyDraft.companyRegistrationInfo}
                onChange={(e) =>
                  setCompanyDraft({ ...companyDraft, companyRegistrationInfo: e.target.value })
                }
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
                maxLength={240}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">CCNL di riferimento (azienda)</span>
              <p className="text-xs text-slate-500">
                Contratto nazionale applicato al tenant; visibile in sola lettura ai dipendenti nel profilo
                fiscale/contrattuale.
              </p>
              <input
                type="text"
                value={companyDraft.companyCcnl}
                onChange={(e) => setCompanyDraft({ ...companyDraft, companyCcnl: e.target.value })}
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
                maxLength={240}
                placeholder="es. Commercio, Metalmeccanici Industria…"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">
                Ore settimanali contratto full-time (riferimento)
              </span>
              <input
                type="number"
                min={1}
                max={80}
                value={companyDraft.weeklyFullTimeHours}
                onChange={(e) =>
                  setCompanyDraft({
                    ...companyDraft,
                    weeklyFullTimeHours: Math.min(80, Math.max(1, Number(e.target.value) || 40))
                  })
                }
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">Mensilità (ripartizione RAL annua)</span>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Numero di rate mensili considerato per la pro-rata del budget personale (tipicamente 12–14).
              </p>
              <input
                type="number"
                min={12}
                max={14}
                value={companyDraft.payrollInstallmentMonths}
                onChange={(e) =>
                  setCompanyDraft({
                    ...companyDraft,
                    payrollInstallmentMonths: Math.min(14, Math.max(12, Number(e.target.value) || 12))
                  })
                }
                className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-slate-100"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-300">Variabili personalizzate</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCustomVarRows((rows) => [...rows, { key: "", value: "" }])}
                >
                  Aggiungi
                </Button>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                Coppie nome/valore (es. codice Zucchetti, soglia straOre). Solo chiavi non vuote vengono salvate.
              </p>
              <ul className="space-y-2">
                {customVarRows.map((row, idx) => (
                  <li key={`${idx}-${row.key}`} className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[140px] flex-1 flex flex-col gap-0.5 text-xs">
                      Nome
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomVarRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, key: v } : r))
                          );
                        }}
                        className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-2 py-1.5 text-slate-100"
                        maxLength={120}
                      />
                    </label>
                    <label className="min-w-[160px] flex-[2] flex flex-col gap-0.5 text-xs">
                      Valore
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomVarRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, value: v } : r))
                          );
                        }}
                        className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-2 py-1.5 text-slate-100"
                        maxLength={2000}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-rose-400 hover:text-rose-300"
                      onClick={() => setCustomVarRows((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      Rimuovi
                    </Button>
                  </li>
                ))}
              </ul>
              {customVarRows.length === 0 ? (
                <p className="text-xs text-slate-500">Nessuna variabile: usa &quot;Aggiungi&quot;.</p>
              ) : null}
            </div>

            <Button type="button" disabled={companyBusy} onClick={() => void onSaveCompanySettings()}>
              {companyBusy ? "Salvataggio…" : "Salva variabili aziendali"}
            </Button>
          </div>
        </GlassCard>
      ) : null}

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
