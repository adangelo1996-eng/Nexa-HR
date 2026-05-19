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
import { NexaSimpleBarChart } from "@/components/nexa-charts";
import { NEXA_CHART } from "@/lib/nexa-chart-theme";
import { getToken } from "@/lib/auth-session";

type SkillGapRow = Awaited<ReturnType<typeof fetchSkillsGap>>["items"][number];
type WorkspaceTab = "coverage" | "matrix" | "details";

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

const TAB_LABELS: Record<WorkspaceTab, string> = {
  coverage: "Copertura ruoli",
  matrix: "Matrice competenze",
  details: "Dettaglio gap"
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

function WorkspaceTabBar(props: {
  activeTab: WorkspaceTab;
  counts: Record<WorkspaceTab, number>;
  onChange: (tab: WorkspaceTab) => void;
}): React.JSX.Element {
  const tabs: WorkspaceTab[] = ["coverage", "matrix", "details"];
  return (
    <div
      className="mb-6 flex flex-wrap gap-2 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-1.5"
      role="tablist"
      aria-label="Sezioni competenze"
    >
      {tabs.map((tab) => {
        const active = props.activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`competenze-panel-${tab}`}
            id={`competenze-tab-${tab}`}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-[#002D72] text-white shadow-sm dark:bg-sky-600"
                : "text-[var(--prom-muted)] hover:bg-[#002D72]/5 hover:text-[var(--prom-text)] dark:hover:bg-sky-500/10"
            }`}
            onClick={() => props.onChange(tab)}
          >
            {TAB_LABELS[tab]}
            <span
              className={`inline-flex min-w-[1.25rem] justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                active ? "bg-white/20 text-white" : "bg-[var(--prom-line)] text-[var(--prom-muted)]"
              }`}
            >
              {props.counts[tab]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SkillRoleFilter(props: {
  skillRoleFilter: string;
  roleFilterOptions: Array<[string, string]>;
  onFilter: (v: string) => void;
}): React.JSX.Element {
  return (
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
  );
}

function BudgetLinksFooter(props: { annualHiringCost: number }): React.JSX.Element {
  const links: Array<{ href: Route; label: string }> = [
    { href: "/personnel-budget/forecast" as Route, label: "Forecast personale" },
    { href: "/personnel-budget/analysis" as Route, label: "Analisi budget" },
    { href: "/analytics/economico" as Route, label: "Controllo economico" },
    { href: "/workforce-planning" as Route, label: "Workforce planning" }
  ];

  return (
    <section className="mt-8 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--prom-muted)]">Budget e pianificazione</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--prom-line)] px-2.5 py-1 text-xs font-medium text-[#002D72] hover:bg-[#002D72]/5 dark:text-sky-200 dark:hover:bg-sky-500/10"
          >
            {link.label}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        ))}
        {props.annualHiringCost > 0 ? (
          <span className="ml-auto text-xs text-[var(--prom-muted)]">
            Hiring stimato: <strong className="text-[var(--prom-text)]">{fmtEur(props.annualHiringCost)}</strong>/anno
          </span>
        ) : null}
      </div>
    </section>
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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("coverage");

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

  const coverageCostChart = useMemo(() => {
    return coverageItems
      .map((row) => {
        const est =
          row.expectedRalAnnual != null && row.headcountGap > 0 ? row.expectedRalAnnual * row.headcountGap : 0;
        const name = row.roleTitle.length > 20 ? `${row.roleTitle.slice(0, 18)}…` : row.roleTitle;
        return { name, value: est };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [coverageItems]);

  const skillGapChart = useMemo(() => {
    return filteredSkillGaps.slice(0, 12).map((row) => ({
      name: row.skillName.length > 16 ? `${row.skillName.slice(0, 14)}…` : row.skillName,
      value: row.gap,
      fill: row.gap >= 2 ? NEXA_CHART.negative : row.gap >= 1 ? NEXA_CHART.warning : NEXA_CHART.positive
    }));
  }, [filteredSkillGaps]);

  const matrixRoles = useMemo(() => {
    if (skillRoleFilter === "all") {
      return skillGapsByRole.slice(0, 12);
    }
    const hit = skillGapsByRole.find((r) => r.roleId === skillRoleFilter);
    return hit ? [hit] : [];
  }, [skillGapsByRole, skillRoleFilter]);

  const tabCounts = useMemo(
    (): Record<WorkspaceTab, number> => ({
      coverage: coverageItems.length,
      matrix: skillGapsByRole.length,
      details: filteredSkillGaps.length
    }),
    [coverageItems.length, skillGapsByRole.length, filteredSkillGaps.length]
  );

  function openCreateCoverage(): void {
    setCoverageForm({ ...EMPTY_COVERAGE_FORM });
    setActiveTab("coverage");
  }

  function openEditCoverage(row: HrRoleCoverageGapDto): void {
    setCoverageForm({
      id: row.id,
      roleTitle: row.roleTitle,
      headcountGap: row.headcountGap,
      expectedRalAnnual: row.expectedRalAnnual != null ? String(row.expectedRalAnnual) : "",
      notes: row.notes ?? ""
    });
    setActiveTab("coverage");
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
      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--prom-text)]">Sintesi</h2>
          <Button type="button" size="sm" variant="secondary" disabled={loading || busy} onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Aggiorna
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Persone mancanti"
              value={String(summary.headcountMissing)}
              hint={`${coverageItems.length} righe copertura`}
              icon={<Users className="h-4 w-4" />}
            />
            <SummaryCard
              label="Costo hiring stimato"
              value={fmtEur(summary.annualHiringCost)}
              hint="Headcount × RAL attesa"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <SummaryCard
              label="Gap competenze"
              value={String(summary.skillGapsCount)}
              hint="Sotto soglia richiesta"
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

      <WorkspaceTabBar activeTab={activeTab} counts={tabCounts} onChange={setActiveTab} />

      {activeTab === "coverage" ? (
        <section
          id="competenze-panel-coverage"
          role="tabpanel"
          aria-labelledby="competenze-tab-coverage"
          className="mb-2"
        >
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
          {!loading && coverageCostChart.length > 0 ? (
            <div className="mb-4">
              <NexaSimpleBarChart
                title="Costo hiring per ruolo"
                description="Top 10 per headcount × RAL attesa."
                data={coverageCostChart}
                valueFormatter={(n) =>
                  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
                }
              />
            </div>
          ) : null}
          <CoverageTable
            loading={loading}
            coverageItems={coverageItems}
            busy={busy}
            onOpenEdit={openEditCoverage}
            onDelete={(id) => void onDeleteCoverage(id)}
          />
        </section>
      ) : null}

      {activeTab === "matrix" ? (
        <section id="competenze-panel-matrix" role="tabpanel" aria-labelledby="competenze-tab-matrix" className="mb-2">
          <SkillsMatrixSection
            loading={loading}
            skillGapsByRole={skillGapsByRole}
            matrixRoles={matrixRoles}
            skillRoleFilter={skillRoleFilter}
            roleFilterOptions={roleFilterOptions}
            onFilter={setSkillRoleFilter}
            skillGapChart={skillGapChart}
          />
        </section>
      ) : null}

      {activeTab === "details" ? (
        <section id="competenze-panel-details" role="tabpanel" aria-labelledby="competenze-tab-details" className="mb-2">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--prom-text)]">Dettaglio gap competenze</h2>
              <p className="mt-1 text-sm text-[var(--prom-muted)]">Livello richiesto vs media nel ruolo.</p>
            </div>
            <SkillRoleFilter
              skillRoleFilter={skillRoleFilter}
              roleFilterOptions={roleFilterOptions}
              onFilter={setSkillRoleFilter}
            />
          </div>
          {loading ? (
            <p className="text-sm text-[var(--prom-muted)]">Caricamento gap…</p>
          ) : filteredSkillGaps.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-6 text-center text-sm text-[var(--prom-muted)]">
              Nessun gap competenze rilevato.
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
                  Prime 40 righe su {filteredSkillGaps.length}. Affina il filtro ruolo.
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      <BudgetLinksFooter annualHiringCost={summary.annualHiringCost} />
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
        <p className="mt-1 text-sm text-[var(--prom-muted)]">Headcount mancante e RAL attesa per titolo ruolo.</p>
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
        Nessun gap ruolo configurato. Usa «Aggiungi gap» per registrare persone mancanti e RAL attesa.
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
  skillRoleFilter: string;
  roleFilterOptions: Array<[string, string]>;
  onFilter: (v: string) => void;
  skillGapChart: Array<{ name: string; value: number; fill?: string }>;
}): React.JSX.Element {
  if (!props.skillGapsByRole.length && !props.loading) {
    return (
      <>
        <h2 className="text-base font-semibold text-[var(--prom-text)]">Matrice competenze per ruolo</h2>
        <p className="mt-2 text-sm text-[var(--prom-muted)]">
          Nessun gap skill rilevato. Verifica ruoli e mappature in anagrafica.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--prom-text)]">Matrice competenze per ruolo</h2>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">
            Gap per ruolo — verde contenuto, ambra/rosso priorità alta.
          </p>
        </div>
        <SkillRoleFilter
          skillRoleFilter={props.skillRoleFilter}
          roleFilterOptions={props.roleFilterOptions}
          onFilter={props.onFilter}
        />
      </div>

      {!props.loading && props.skillGapChart.length > 0 ? (
        <div className="mb-4">
          <NexaSimpleBarChart
            title="Gap competenze prioritari"
            description="Top 12 per delta livello."
            data={props.skillGapChart}
          />
        </div>
      ) : null}

      {props.loading ? (
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
      )}
    </>
  );
}
