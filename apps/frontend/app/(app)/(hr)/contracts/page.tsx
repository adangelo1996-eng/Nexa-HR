"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getToken } from "@/lib/auth-session";
import {
  createHrStandardContract,
  deleteHrStandardContract,
  fetchHrContractPresets,
  fetchHrStandardContracts,
  type HrContractPresetDto
} from "@/lib/api";
import {
  CONTRACT_TEMPLATE_FORM,
  contractPartyPassesTemplateValidation,
  createNewContractFromTemplate,
  HR_CONTRACT_TEMPLATE_OPTIONS,
  normalizeContractPresetTemplateKey,
  type ContractPartyInfo,
  type HrContractDoc,
  type HrContractTemplateKey
} from "@/lib/contracts";

function shortIso(iso: string): string {
  return iso.slice(0, 10);
}

const DEFAULT_PARTY: ContractPartyInfo = {
  companyLegalName: "Azienda",
  companyAddress: "",
  employeeFirstName: "",
  employeeLastName: "",
  employeeAddress: "",
  roleTitle: "",
  workLocation: "",
  startDateIso: "",
  endDateIso: "",
  fixedTermReason: "",
  weeklyHours: undefined,
  intermittentWorkDescription: "",
  projectScopeSummary: "",
  ralEuros: 35_000,
  payMonthsPerYear: 13
};

function mergePartyDefaults(base: ContractPartyInfo, fromPreset: Record<string, unknown>): ContractPartyInfo {
  return {
    ...base,
    companyLegalName: String(fromPreset.companyLegalName ?? base.companyLegalName),
    companyAddress: fromPreset.companyAddress != null ? String(fromPreset.companyAddress) : base.companyAddress,
    employeeFirstName: fromPreset.employeeFirstName != null ? String(fromPreset.employeeFirstName) : base.employeeFirstName,
    employeeLastName: fromPreset.employeeLastName != null ? String(fromPreset.employeeLastName) : base.employeeLastName,
    employeeAddress: fromPreset.employeeAddress != null ? String(fromPreset.employeeAddress) : base.employeeAddress,
    roleTitle: fromPreset.roleTitle != null ? String(fromPreset.roleTitle) : base.roleTitle,
    workLocation: fromPreset.workLocation != null ? String(fromPreset.workLocation) : base.workLocation,
    startDateIso: fromPreset.startDateIso != null ? String(fromPreset.startDateIso) : base.startDateIso,
    endDateIso: fromPreset.endDateIso != null ? String(fromPreset.endDateIso) : base.endDateIso,
    fixedTermReason: fromPreset.fixedTermReason != null ? String(fromPreset.fixedTermReason) : base.fixedTermReason,
    weeklyHours:
      typeof fromPreset.weeklyHours === "number" && !Number.isNaN(fromPreset.weeklyHours)
        ? fromPreset.weeklyHours
        : base.weeklyHours,
    intermittentWorkDescription:
      fromPreset.intermittentWorkDescription != null
        ? String(fromPreset.intermittentWorkDescription)
        : base.intermittentWorkDescription,
    projectScopeSummary:
      fromPreset.projectScopeSummary != null ? String(fromPreset.projectScopeSummary) : base.projectScopeSummary,
    ralEuros:
      typeof fromPreset.ralEuros === "number" && !Number.isNaN(fromPreset.ralEuros) ? fromPreset.ralEuros : base.ralEuros,
    payMonthsPerYear:
      fromPreset.payMonthsPerYear === 12 || fromPreset.payMonthsPerYear === 13 || fromPreset.payMonthsPerYear === 14
        ? fromPreset.payMonthsPerYear
        : base.payMonthsPerYear
  };
}

export default function ContractsListPage(): React.JSX.Element {
  const router = useRouter();
  const [contracts, setContracts] = useState<HrContractDoc[]>([]);
  const [presets, setPresets] = useState<HrContractPresetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const [template, setTemplate] = useState<HrContractTemplateKey>("indeterminato");
  const [party, setParty] = useState<ContractPartyInfo>(DEFAULT_PARTY);

  const formCfg = useMemo(() => CONTRACT_TEMPLATE_FORM[template], [template]);

  const presetCards = useMemo(() => {
    if (presets.length > 0) {
      return presets.map((p) => {
        const templateKey = normalizeContractPresetTemplateKey(p.templateKey);
        const fallback = HR_CONTRACT_TEMPLATE_OPTIONS.find((o) => o.key === templateKey);
        return {
          id: p.id,
          templateKey,
          label: p.label,
          description: p.description?.trim() || fallback?.description || ""
        };
      });
    }
    return HR_CONTRACT_TEMPLATE_OPTIONS.map((o) => ({
      id: o.key,
      templateKey: o.key,
      label: o.label,
      description: o.description
    }));
  }, [presets]);

  const onTemplateChange = (next: HrContractTemplateKey): void => {
    const nextCfg = CONTRACT_TEMPLATE_FORM[next];
    setTemplate(next);
    setParty((p) => ({
      ...p,
      endDateIso: nextCfg.showEndDate ? p.endDateIso : "",
      fixedTermReason: nextCfg.showFixedTermReason ? p.fixedTermReason : "",
      weeklyHours: nextCfg.showWeeklyHours ? p.weeklyHours : undefined,
      intermittentWorkDescription: nextCfg.showIntermittentDescription ? p.intermittentWorkDescription : "",
      projectScopeSummary: nextCfg.showProjectScope ? p.projectScopeSummary : ""
    }));
  };

  const openNewForm = useCallback((templateKey: HrContractTemplateKey, presetDefaults?: Record<string, unknown>): void => {
    const nextCfg = CONTRACT_TEMPLATE_FORM[templateKey];
    const merged = mergePartyDefaults(DEFAULT_PARTY, presetDefaults ?? {});
    setTemplate(templateKey);
    setParty({
      ...merged,
      endDateIso: nextCfg.showEndDate ? merged.endDateIso : "",
      fixedTermReason: nextCfg.showFixedTermReason ? merged.fixedTermReason : "",
      weeklyHours: nextCfg.showWeeklyHours ? merged.weeklyHours : undefined,
      intermittentWorkDescription: nextCfg.showIntermittentDescription ? merged.intermittentWorkDescription : "",
      projectScopeSummary: nextCfg.showProjectScope ? merged.projectScopeSummary : ""
    });
    setShowNewForm(true);
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rows, presetRows] = await Promise.all([
        fetchHrStandardContracts(token),
        fetchHrContractPresets(token).catch(() => [] as HrContractPresetDto[])
      ]);
      setPresets(presetRows);
      setContracts(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          party: r.party as unknown as ContractPartyInfo,
          blocks: r.blocks as unknown as HrContractDoc["blocks"],
          lastExportedDocumentId: r.lastExportedDocumentId,
          recruitCandidateId: r.recruitCandidateId,
          recruitPositionId: r.recruitPositionId
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento contratti");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Contratti standard</h1>
          <p className="max-w-2xl text-sm text-synapse-muted dark:text-[#b4c9dc]">
            Scegli un preset per iniziare in modo guidato, oppure apri un contratto già salvato. Il form di creazione si
            apre solo quando lo richiedi esplicitamente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NexaPageHelpButton pageKey="contracts" />
          <Button type="button" variant="secondary" size="sm" onClick={() => void reload()} disabled={loading}>
            Aggiorna
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {!showNewForm ? (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-synapse-muted dark:text-[#8fa8bc]">
                Scegli un preset
              </h2>
              <Button type="button" onClick={() => openNewForm("indeterminato")}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Nuovo contratto
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {presetCards.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    const dbPreset = presets.find((p) => p.id === preset.id);
                    openNewForm(preset.templateKey, dbPreset?.defaultParty);
                  }}
                  className="rounded-xl border border-[var(--card-border)] bg-[var(--prom-surface)] p-4 text-left transition hover:border-[color-mix(in_srgb,#002D72_35%,var(--card-border))] hover:bg-[color-mix(in_srgb,#002D72_6%,var(--prom-surface))] dark:hover:bg-[#052642]/90"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-[#002D72] dark:text-sky-200">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-synapse-text dark:text-white">{preset.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-synapse-muted dark:text-[#b4c9dc]">
                        {preset.description}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Contratti salvati</CardTitle>
              <CardDescription>Bozze e contratti già creati per la tua azienda.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento…</p>
              ) : contracts.length === 0 ? (
                <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
                  Nessun contratto ancora. Seleziona un preset sopra o usa «Nuovo contratto».
                </p>
              ) : (
                <ul className="space-y-2">
                  {contracts.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-col gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-synapse-text dark:text-white">{c.title}</p>
                        <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">
                          {c.status.toUpperCase()} • aggiornato {shortIso(c.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/contracts/${encodeURIComponent(c.id)}`}
                          className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
                        >
                          Apri editor
                        </Link>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            if (!window.confirm("Eliminare il contratto?")) return;
                            const token = getToken();
                            if (!token) {
                              router.replace("/login");
                              return;
                            }
                            void deleteHrStandardContract(token, c.id)
                              .then(() => void reload())
                              .catch((e) => setError(e instanceof Error ? e.message : "Errore eliminazione"));
                          }}
                        >
                          Elimina
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Nuovo contratto</CardTitle>
              <CardDescription>
                Compila i campi obbligatori; potrai modificare i blocchi testuali nell&apos;editor dopo la creazione.
              </CardDescription>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewForm(false)}>
              ← Torna ai preset
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Tipo di contratto / template</span>
                <select
                  value={template}
                  onChange={(e) => onTemplateChange(e.target.value as HrContractTemplateKey)}
                  className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                >
                  {HR_CONTRACT_TEMPLATE_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="block text-xs leading-relaxed text-synapse-muted dark:text-[#8fa8bc]">
                  {HR_CONTRACT_TEMPLATE_OPTIONS.find((o) => o.key === template)?.description}
                </span>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Ragione sociale</span>
                <Input
                  value={party.companyLegalName}
                  onChange={(e) => setParty((p) => ({ ...p, companyLegalName: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Indirizzo azienda</span>
                <Input
                  value={party.companyAddress ?? ""}
                  onChange={(e) => setParty((p) => ({ ...p, companyAddress: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Nome</span>
                <Input
                  value={party.employeeFirstName}
                  onChange={(e) => setParty((p) => ({ ...p, employeeFirstName: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Cognome</span>
                <Input
                  value={party.employeeLastName}
                  onChange={(e) => setParty((p) => ({ ...p, employeeLastName: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Indirizzo lavoratore</span>
                <Input
                  value={party.employeeAddress ?? ""}
                  onChange={(e) => setParty((p) => ({ ...p, employeeAddress: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Mansione</span>
                <Input value={party.roleTitle ?? ""} onChange={(e) => setParty((p) => ({ ...p, roleTitle: e.target.value }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Sede di lavoro</span>
                <Input
                  value={party.workLocation ?? ""}
                  onChange={(e) => setParty((p) => ({ ...p, workLocation: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Data inizio</span>
                <Input
                  type="date"
                  value={(party.startDateIso ?? "").slice(0, 10)}
                  onChange={(e) => setParty((p) => ({ ...p, startDateIso: e.target.value }))}
                />
              </label>
              {formCfg.showEndDate ? (
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">
                    Data fine rapporto / scadenza{formCfg.requireEndDate ? " *" : ""}
                  </span>
                  <Input
                    type="date"
                    value={(party.endDateIso ?? "").slice(0, 10)}
                    onChange={(e) => setParty((p) => ({ ...p, endDateIso: e.target.value }))}
                  />
                </label>
              ) : null}
              {formCfg.showFixedTermReason ? (
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">
                    Causalità del termine (es. sostituzione, incremento, stagionalità) *
                  </span>
                  <Textarea
                    rows={3}
                    value={party.fixedTermReason ?? ""}
                    onChange={(e) => setParty((p) => ({ ...p, fixedTermReason: e.target.value }))}
                    placeholder="Descrivi in modo sintetico l’esigenza temporanea che giustifica il contratto a termine."
                    className="resize-y"
                  />
                </label>
              ) : null}
              {formCfg.showWeeklyHours ? (
                <label className="space-y-1 text-sm">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Ore settimanali contrattuali *</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={40}
                    step={1}
                    value={party.weeklyHours ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setParty((p) => ({
                        ...p,
                        weeklyHours: e.target.value === "" || Number.isNaN(n) ? undefined : n
                      }));
                    }}
                  />
                </label>
              ) : null}
              {formCfg.showIntermittentDescription ? (
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">
                    Modalità intermittente (disponibilità, chiamata, fasce) *
                  </span>
                  <Textarea
                    rows={4}
                    value={party.intermittentWorkDescription ?? ""}
                    onChange={(e) => setParty((p) => ({ ...p, intermittentWorkDescription: e.target.value }))}
                    placeholder="Es. disponibilità nei giorni fissi, preavviso di chiamata, tetto ore annue, ecc."
                    className="resize-y"
                  />
                </label>
              ) : null}
              {formCfg.showProjectScope ? (
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="text-synapse-muted dark:text-[#b4c9dc]">Ambito / oggetto della prestazione *</span>
                  <Textarea
                    rows={3}
                    value={party.projectScopeSummary ?? ""}
                    onChange={(e) => setParty((p) => ({ ...p, projectScopeSummary: e.target.value }))}
                    placeholder="Descrivi cosa deve essere realizzato o quale supporto è atteso."
                    className="resize-y"
                  />
                </label>
              ) : null}
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">RAL</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  value={party.ralEuros ?? 0}
                  onChange={(e) => setParty((p) => ({ ...p, ralEuros: Number(e.target.value) }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Mensilità</span>
                <select
                  value={party.payMonthsPerYear ?? 13}
                  onChange={(e) => setParty((p) => ({ ...p, payMonthsPerYear: Number(e.target.value) as 12 | 13 | 14 }))}
                  className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                >
                  <option value={12}>12</option>
                  <option value={13}>13</option>
                  <option value={14}>14</option>
                </select>
              </label>
            </div>

            {party.employeeFirstName.trim() &&
            party.employeeLastName.trim() &&
            party.companyLegalName.trim() &&
            !contractPartyPassesTemplateValidation(party, template) ? (
              <p className="mt-3 text-xs text-amber-800 dark:text-amber-200/90">
                Compila i campi contrassegnati con * (o richiesti dalla descrizione del template) per questo tipo di
                contratto.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  creating ||
                  !party.employeeFirstName.trim() ||
                  !party.employeeLastName.trim() ||
                  !party.companyLegalName.trim() ||
                  !contractPartyPassesTemplateValidation(party, template)
                }
                onClick={() => {
                  const token = getToken();
                  if (!token) {
                    router.replace("/login");
                    return;
                  }
                  setCreating(true);
                  setError(null);
                  const draft = createNewContractFromTemplate(party, template);
                  void createHrStandardContract(token, {
                    title: draft.title,
                    party: { ...draft.party },
                    blocks: draft.blocks as unknown[]
                  })
                    .then((created) => {
                      router.push(`/contracts/${encodeURIComponent(created.id)}`);
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : "Errore creazione contratto"))
                    .finally(() => setCreating(false));
                }}
              >
                {creating ? "Creazione…" : "Crea contratto"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowNewForm(false)}>
                Annulla
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
