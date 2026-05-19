"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteRoleCoverageGap,
  fetchRoleCoverageGaps,
  fetchSkillsGap,
  upsertRoleCoverageGap,
  type HrRoleCoverageGapDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

type SkillGapRow = Awaited<ReturnType<typeof fetchSkillsGap>>["items"][number];

type CoverageFormState = {
  id?: string;
  roleTitle: string;
  headcountGap: number;
  expectedRalAnnual: string;
  notes: string;
};

const EMPTY_COVERAGE_FORM: CoverageFormState = {
  roleTitle: "",
  headcountGap: 1,
  expectedRalAnnual: "",
  notes: ""
};

function fmtEur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) {
    return "—";
  }
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function gapSeverityClass(gap: number): string {
  if (gap >= 2) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100";
  }
  if (gap >= 1) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
}

function CompetenzeLegend(): React.JSX.Element {
  return (
    <section className="mb-8 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-5">
      <h2 className="text-sm font-semibold text-[var(--prom-text)]">Come leggere questa pagina</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <LegendRolesBlock />
        <LegendSkillsBlock />
      </div>
      <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-[var(--prom-muted)]">
        <li>I KPI in alto si aggiornano con l&apos;orchestrator analytics; le tabelle riflettono il caricamento locale.</li>
        <li>Modifica headcount e RAL solo tramite «Aggiungi gap» o «Modifica» — i form non restano sempre visibili.</li>
      </ul>
    </section>
  );
}

function LegendRolesBlock(): React.JSX.Element {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--prom-muted)]">Copertura ruoli</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">
        Persone mancanti per titolo ruolo e RAL attesa. I costi stimati alimentano forecast budget e workforce planning.
      </p>
    </div>
  );
}

function LegendSkillsBlock(): React.JSX.Element {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--prom-muted)]">Gap competenze</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">
        Confronto tra livello richiesto dal ruolo e media livelli mappati in anagrafica. Priorità hiring vs formazione.
      </p>
    </div>
  );
}

function SummaryCard(props: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--card-border)] p-4" style={{ background: "var(--card-bg)" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">{props.label}</p>
        <span className="text-[#002D72] dark:text-sky-300" aria-hidden>
          {props.icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--prom-text)]">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-[var(--prom-muted)]">{props.hint}</p> : null}
    </div>
  );
}

function CoverageGapForm(props: {
  draft: CoverageFormState;
  busy: boolean;
  isEdit: boolean;
  onChange: (next: CoverageFormState) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { draft, busy, isEdit, onChange, onSave, onCancel } = props;
  return (
    <div
      className="mb-4 rounded-xl border border-[#002D72]/25 bg-[color-mix(in_srgb,var(--prom-surface)_94%,#002D72_6%)] p-4 dark:border-sky-500/20"
      role="region"
      aria-label={isEdit ? "Modifica gap ruolo" : "Nuovo gap ruolo"}
    >
      <h3 className="mb-3 text-sm font-semibold text-[var(--prom-text)]">
        {isEdit ? "Modifica copertura ruolo" : "Aggiungi gap di copertura"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[var(--prom-muted)] sm:col-span-2">
          Titolo ruolo
          <Input
            className="mt-1"
            value={draft.roleTitle}
            onChange={(e) => onChange({ ...draft, roleTitle: e.target.value })}
            placeholder="es. Payroll specialist"
            disabled={busy}
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)]">
          Persone mancanti
          <Input
            type="number"
            min={0}
            max={999}
            className="mt-1"
            value={draft.headcountGap}
            onChange={(e) => onChange({ ...draft, headcountGap: Number(e.target.value) || 0 })}
            disabled={busy}
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)]">
          RAL attesa annua (EUR)
          <Input
            type="number"
            min={0}
            className="mt-1"
            value={draft.expectedRalAnnual}
            onChange={(e) => onChange({ ...draft, expectedRalAnnual: e.target.value })}
            disabled={busy}
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)] sm:col-span-2 lg:col-span-4">
          Note (opzionale)
          <Textarea
            className="mt-1"
            rows={2}
            value={draft.notes}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
            disabled={busy}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || !draft.roleTitle.trim()} onClick={onSave}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  );
}

export function CompetenzeAnalyticsWorkspace(): React.JSX.Element {
  const [coverageItems, setCoverageItems] = useState<HrRoleCoverageGapDto[]>([]);
  const [skillItems, setSkillItems] = useState<SkillGapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverageForm, setCoverageForm] = useState<CoverageFormState | null>(null);
  const [skillRoleFilter, setSkillRoleFilter] = useState<string>("all");
  const [showSkillMatrix, setShowSkillMatrix] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [coverage, skills] = await Promise.all([fetchRoleCoverageGaps(token), fetchSkillsGap(token)]);
      setCoverageItems(coverage.items);
      setSkillItems(skills.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento dati competenze");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const headcountMissing = coverageItems.reduce((s, g) => s + g.headcountGap, 0);
    const annualHiringCost = coverageItems.reduce((s, g) => {
      if (g.expectedRalAnnual == null || g.headcountGap <= 0) {
        return s;
      }
      return s + g.expectedRalAnnual * g.headcountGap;
    }, 0);
    const skillGaps = skillItems.filter((r) => r.gap > 0);
    const rolesWithSkillGaps = new Set(skillGaps.map((g) => g.roleId)).size;
    return { headcountMissing, annualHiringCost, skillGapsCount: skillGaps.length, rolesWithSkillGaps };
  }, [coverageItems, skillItems]);

  const skillGapsByRole = useMemo(() => {
    const map = new Map<string, { roleId: string; roleName: string; skills: SkillGapRow[] }>();
    for (const row of skillItems.filter((r) => r.gap > 0)) {
      const cur = map.get(row.roleId) ?? { roleId: row.roleId, roleName: row.roleName, skills: [] };
      cur.skills.push(row);
      map.set(row.roleId, cur);
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        skills: [...g.skills].sort((a, b) => b.gap - a.gap || a.skillName.localeCompare(b.skillName, "it"))
      }))
      .sort((a, b) => {
        const maxA = Math.max(...a.skills.map((s) => s.gap), 0);
        const maxB = Math.max(...b.skills.map((s) => s.gap), 0);
        return maxB - maxA || a.roleName.localeCompare(b.roleName, "it");
      });
  }, [skillItems]);

  const roleFilterOptions = useMemo(() => {
    const roles = new Map<string, string>();
    for (const row of skillItems) {
      roles.set(row.roleId, row.roleName);
    }
    return [...roles.entries()].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [skillItems]);

  const filteredSkillGaps = useMemo(() => {
    const gaps = skillItems.filter((r) => r.gap > 0);
    if (skillRoleFilter === "all") {
      return [...gaps].sort((a, b) => b.gap - a.gap || a.roleName.localeCompare(b.roleName, "it"));
    }
    return gaps
      .filter((r) => r.roleId === skillRoleFilter)
      .sort((a, b) => b.gap - a.gap || a.skillName.localeCompare(b.skillName, "it"));
  }, [skillItems, skillRoleFilter]);

  const matrixRoles = useMemo(() => {
    if (skillRoleFilter === "all") {
      return skillGapsByRole.slice(0, 12);
    }
    const hit = skillGapsByRole.find((r) => r.roleId === skillRoleFilter);
    return hit ? [hit] : [];
  }, [skillGapsByRole, skillRoleFilter]);

  function openCreateCoverage(): void {
    setCoverageForm({ ...EMPTY_COVERAGE_FORM });
  }

  function openEditCoverage(row: HrRoleCoverageGapDto): void {
    setCoverageForm({
      id: row.id,
      roleTitle: row.roleTitle,
      headcountGap: row.headcountGap,
      expectedRalAnnual: row.expectedRalAnnual != null ? String(row.expectedRalAnnual) : "",
      notes: row.notes ?? ""
    });
  }

  async function onSaveCoverage(): Promise<void> {
    const token = getToken();
    if (!token || !coverageForm?.roleTitle.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertRoleCoverageGap(token, {
        id: coverageForm.id,
        roleTitle: coverageForm.roleTitle.trim(),
        headcountGap: coverageForm.headcountGap,
        expectedRalAnnual: coverageForm.expectedRalAnnual ? Number(coverageForm.expectedRalAnnual) : null,
        notes: coverageForm.notes.trim() || null
      });
      setCoverageForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteCoverage(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    if (!window.confirm("Eliminare questo gap di copertura ruolo?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteRoleCoverageGap(token, id);
      if (coverageForm?.id === id) {
        setCoverageForm(null);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eliminazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CompetenzeLegend />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Sintesi operativa</h2>
          <Button type="button" size="sm" variant="secondary" disabled={loading || busy} onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Aggiorna dati
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento sintesi…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Persone mancanti"
              value={String(summary.headcountMissing)}
              hint={`${coverageItems.length} righe copertura ruoli`}
              icon={<Users className="h-4 w-4" />}
            />
            <SummaryCard
              label="Costo annuo stimato (hiring)"
              value={fmtEur(summary.annualHiringCost)}
              hint="Headcount × RAL attesa per riga"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <SummaryCard
              label="Gap competenze"
              value={String(summary.skillGapsCount)}
              hint="Requisiti sotto soglia"
              icon={<Layers className="h-4 w-4" />}
            />
            <SummaryCard
              label="Ruoli con gap skill"
              value={String(summary.rolesWithSkillGaps)}
              icon={<BarChart3 className="h-4 w-4" />}
            />
          </div>
        )}
      </section>

      <section className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-4 py-3">
        <span className="text-xs font-medium text-[var(--prom-muted)]">Collegamenti budget:</span>
        <Link
          href={"/personnel-budget/forecast" as Route}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--prom-line)] px-2.5 py-1 text-xs font-medium text-[#002D72] hover:bg-[#002D72]/5 dark:text-sky-200 dark:hover:bg-sky-500/10"
        >
          Forecast personale
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        <Link
          href={"/personnel-budget/analysis" as Route}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--prom-line)] px-2.5 py-1 text-xs font-medium text-[#002D72] hover:bg-[#002D72]/5 dark:text-sky-200 dark:hover:bg-sky-500/10"
        >
          Analisi budget
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        <Link
          href={"/analytics/economico" as Route}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--prom-line)] px-2.5 py-1 text-xs font-medium text-[#002D72] hover:bg-[#002D72]/5 dark:text-sky-200 dark:hover:bg-sky-500/10"
        >
          Controllo economico
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        <Link
          href={"/workforce-planning" as Route}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--prom-line)] px-2.5 py-1 text-xs font-medium text-[#002D72] hover:bg-[#002D72]/5 dark:text-sky-200 dark:hover:bg-sky-500/10"
        >
          Workforce planning
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
        {summary.annualHiringCost > 0 ? (
          <span className="ml-auto text-xs text-[var(--prom-muted)]">
            Impatto hiring configurato:{" "}
            <strong className="text-[var(--prom-text)]">{fmtEur(summary.annualHiringCost)}</strong> / anno
          </span>
        ) : null}
      </section>

      <section className="mb-10">
        <CoverageSectionHeader coverageForm={coverageForm} busy={busy} onOpenCreate={openCreateCoverage} />
        {coverageForm ? (
          <CoverageGapForm
            draft={coverageForm}
            busy={busy}
            isEdit={Boolean(coverageForm.id)}
            onChange={setCoverageForm}
            onSave={() => void onSaveCoverage()}
            onCancel={() => setCoverageForm(null)}
          />
        ) : null}
        <CoverageTable
          loading={loading}
          coverageItems={coverageItems}
          busy={busy}
          onOpenEdit={openEditCoverage}
          onDelete={(id) => void onDeleteCoverage(id)}
        />
      </section>

      <SkillsMatrixSection
        loading={loading}
        skillGapsByRole={skillGapsByRole}
        matrixRoles={matrixRoles}
        showSkillMatrix={showSkillMatrix}
        skillRoleFilter={skillRoleFilter}
        roleFilterOptions={roleFilterOptions}
        onToggle={() => setShowSkillMatrix((v) => !v)}
        onFilter={setSkillRoleFilter}
      />

      <section className="mb-4">
        <h2 className="mb-1 text-base font-semibold text-[var(--prom-text)]">Dettaglio gap competenze</h2>
        <p className="mb-3 text-sm text-[var(--prom-muted)]">
          Confronto livello minimo richiesto vs media nel ruolo. Ordinato per gap decrescente.
        </p>
        {loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento gap…</p>
        ) : filteredSkillGaps.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-6 text-center text-sm text-[var(--prom-muted)]">
            Nessun gap competenze rilevato sui requisiti configurati.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]" style={{ background: "var(--card-bg)" }}>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--prom-line)] text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
                <tr>
                  <th className="px-4 py-3">Ruolo</th>
                  <th className="px-4 py-3">Competenza</th>
                  <th className="px-4 py-3">Richiesto</th>
                  <th className="px-4 py-3">Media ruolo</th>
                  <th className="px-4 py-3">Gap</th>
                  <th className="px-4 py-3">Headcount</th>
                </tr>
              </thead>
              <tbody>
                {filteredSkillGaps.slice(0, 40).map((row) => (
                  <tr key={`${row.roleId}-${row.skillId}`} className="border-b border-[var(--prom-line)] last:border-0">
                    <td className="px-4 py-2.5 text-[var(--prom-text)]">{row.roleName}</td>
                    <td className="px-4 py-2.5 text-[var(--prom-muted)]">
                      {row.skillName}
                      <span className="ml-1 text-[10px]">({row.skillCode})</span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{row.minLevel}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.avgUserLevel}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex min-w-[2rem] justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${gapSeverityClass(row.gap)}`}
                      >
                        {row.gap}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{row.headcountInRole}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSkillGaps.length > 40 ? (
              <p className="border-t border-[var(--prom-line)] px-4 py-2 text-xs text-[var(--prom-muted)]">
                Mostrate le prime 40 righe su {filteredSkillGaps.length}. Affina il filtro ruolo nella matrice sopra.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

function CoverageSectionHeader(props: {
  coverageForm: CoverageFormState | null;
  busy: boolean;
  onOpenCreate: () => void;
}): React.JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-[var(--prom-text)]">Copertura ruoli</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--prom-muted)]">
          Headcount mancante e RAL attesa per titolo ruolo. Usa questi dati per stimare il fabbisogno di assunzioni nel
          budget.
        </p>
      </div>
      {!props.coverageForm ? (
        <Button type="button" size="sm" onClick={props.onOpenCreate} disabled={props.busy}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Aggiungi gap
        </Button>
      ) : null}
    </div>
  );
}

function CoverageTable(props: {
  loading: boolean;
  coverageItems: HrRoleCoverageGapDto[];
  busy: boolean;
  onOpenEdit: (row: HrRoleCoverageGapDto) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  if (props.loading) {
    return <p className="text-sm text-[var(--prom-muted)]">Caricamento copertura ruoli…</p>;
  }
  if (props.coverageItems.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-8 text-center text-sm text-[var(--prom-muted)]">
        Nessun gap ruolo configurato. Clicca «Aggiungi gap» per registrare persone mancanti e RAL attesa.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]" style={{ background: "var(--card-bg)" }}>
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--prom-line)] text-[10px] font-semibold uppercase tracking-wider text-[var(--prom-muted)]">
          <tr>
            <th className="px-4 py-3">Ruolo</th>
            <th className="px-4 py-3">Mancanti</th>
            <th className="px-4 py-3">RAL attesa</th>
            <th className="px-4 py-3">Costo annuo stimato</th>
            <th className="px-4 py-3">Note</th>
            <th className="px-4 py-3 text-right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {props.coverageItems.map((row) => {
            const est =
              row.expectedRalAnnual != null && row.headcountGap > 0
                ? row.expectedRalAnnual * row.headcountGap
                : null;
            return (
              <tr key={row.id} className="border-b border-[var(--prom-line)] last:border-0">
                <td className="px-4 py-2.5 font-medium text-[var(--prom-text)]">{row.roleTitle}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.headcountGap}</td>
                <td className="px-4 py-2.5 tabular-nums">{fmtEur(row.expectedRalAnnual)}</td>
                <td className="px-4 py-2.5 tabular-nums font-medium text-[var(--prom-text)]">{fmtEur(est)}</td>
                <td className="max-w-[200px] truncate px-4 py-2.5 text-[var(--prom-muted)]" title={row.notes ?? ""}>
                  {row.notes || "—"}
                </td>
                <td className="px-4 py-2.5">
                  <CoverageRowActions
                    busy={props.busy}
                    onEdit={() => props.onOpenEdit(row)}
                    onDelete={() => props.onDelete(row.id)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoverageRowActions(props: {
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  return (
    <div className="flex justify-end gap-1">
      <Button type="button" size="sm" variant="ghost" disabled={props.busy} onClick={props.onEdit} aria-label="Modifica">
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={props.busy} onClick={props.onDelete} aria-label="Elimina">
        <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-300" aria-hidden />
      </Button>
    </div>
  );
}

function SkillsMatrixSection(props: {
  loading: boolean;
  skillGapsByRole: Array<{ roleId: string; roleName: string; skills: SkillGapRow[] }>;
  matrixRoles: Array<{ roleId: string; roleName: string; skills: SkillGapRow[] }>;
  showSkillMatrix: boolean;
  skillRoleFilter: string;
  roleFilterOptions: Array<[string, string]>;
  onToggle: () => void;
  onFilter: (v: string) => void;
}): React.JSX.Element {
  if (!props.skillGapsByRole.length && !props.loading) {
    return (
      <section className="mb-10">
        <h2 className="text-base font-semibold text-[var(--prom-text)]">Matrice competenze per ruolo</h2>
        <p className="mt-2 text-sm text-[var(--prom-muted)]">
          Nessun fabbisogno competenze configurato o livelli allineati. Verifica ruoli e mappature skill in anagrafica.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--prom-text)]">Matrice competenze per ruolo</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--prom-muted)]">
            Cluster di gap per ruolo (solo competenze sotto soglia). Verde = gap contenuto, ambra/rosso = priorità maggiore.
          </p>
          <Button type="button" size="sm" variant="ghost" className="mt-2 px-0" onClick={props.onToggle}>
            {props.showSkillMatrix ? "Nascondi matrice" : "Mostra matrice"}
          </Button>
        </div>
        <label className="text-xs text-[var(--prom-muted)]">
          Filtra ruolo
          <select
            className="mt-1 block min-w-[180px] rounded-lg border border-[var(--prom-line)] bg-[var(--card-bg)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
            value={props.skillRoleFilter}
            onChange={(e) => props.onFilter(e.target.value)}
          >
            <option value="all">Tutti i ruoli</option>
            {props.roleFilterOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {props.showSkillMatrix ? (
        props.loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento matrice…</p>
        ) : props.matrixRoles.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessun gap per il filtro selezionato.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {props.matrixRoles.map((group) => (
              <article
                key={group.roleId}
                className="rounded-xl border border-[var(--card-border)] p-4"
                style={{ background: "var(--card-bg)" }}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-[var(--prom-text)]">{group.roleName}</h3>
                  <span className="text-xs text-[var(--prom-muted)]">
                    {group.skills[0]?.headcountInRole ?? 0} in ruolo · {group.skills.length} gap
                  </span>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {group.skills.map((sk) => (
                    <li
                      key={sk.skillId}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs ${gapSeverityClass(sk.gap)}`}
                      title={`Richiesto ${sk.minLevel} · Media ${sk.avgUserLevel}`}
                    >
                      <span className="font-medium">{sk.skillName}</span>
                      <span className="ml-1.5 tabular-nums opacity-80">Δ {sk.gap}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )
      ) : (
        <p className="text-xs text-[var(--prom-muted)]">Matrice nascosta — espandi per visualizzare i cluster per ruolo.</p>
      )}
    </section>
  );
}
