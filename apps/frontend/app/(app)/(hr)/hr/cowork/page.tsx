"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  History,
  Loader2,
  MessageCircleQuestion,
  ShieldCheck,
  UserRound
} from "lucide-react";
import {
  fetchCoworkHistory,
  fetchCoworkMeta,
  fetchUsers,
  isCoworkClarificationDto,
  postCoworkApply,
  postCoworkCancel,
  postCoworkPlan,
  postCoworkBulkUndo,
  postCoworkUndo,
  type CoworkHistoryCategoryDto,
  type CoworkHistoryEntryDto,
  type CoworkHistoryBatchDto,
  type CoworkHistoryMonthDto,
  type CoworkPlanDto,
  type CoworkPlanRowDto,
  type CoworkPlanSectionDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { GlassConfirmDialog } from "@/components/glass-confirm-dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel
} from "@/components/hebb-ai-experience-shell";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { HebbMateDocumentsPanel } from "@/components/hebb-mate-documents-panel";
import { HebbMateWorkspace } from "@/components/hebb-mate-workspace";

type ChatMessage = { role: "user" | "assistant"; content: string };

const AREA_LABELS: Record<string, string> = {
  calendar: "Calendario e sale",
  time_off: "Assenze e permessi",
  lifecycle: "Lifecycle HR",
  training: "Formazione",
  documents: "Documenti",
  org: "Organizzazione",
  compensation: "Payroll",
  onboarding: "Onboarding",
  analytics: "Analytics",
  generic: "Generico",
  smartworking_agreements: "Accordi SW",
  smartworking_requests: "Richieste SW",
  employment_contracts: "Contratti",
  unknown: "—"
};

const TOOL_LABELS: Record<string, string> = {
  renew_agreements: "Rinnovo accordi SW",
  extend_approved_requests: "Estensione richieste SW",
  update_contract_sw_clause: "Clausola SW su contratti",
  create_meeting_room_booking: "Prenotazione sala / evento calendario",
  cancel_meeting_room_booking: "Annulla prenotazione sala",
  create_leave_plan: "Richiesta ferie / ROL",
  create_smartworking_request: "Richiesta remote working",
  create_travel_request: "Richiesta trasferta",
  create_sickness_report: "Comunicazione malattia",
  approve_pending_leaves: "Approva ferie in attesa",
  approve_pending_smartworking: "Approva SW in attesa",
  create_shift_batch: "Assegna turni",
  start_offboarding: "Avvia offboarding",
  update_leave_allowance: "Monte ferie",
  publish_payslips_period: "Pubblica cedolini",
  create_expense_claim: "Nota spese",
  approve_pending_expenses: "Approva note spese",
  create_innovation_job: "Job Innovation",
  training_batch: "Formazione batch",
  upload_employee_document: "Registra documento vault",
  link_document_ack: "Promemoria lettura documento"
};

function toolLabel(toolId: string | undefined, domain: string): string {
  if (toolId && TOOL_LABELS[toolId]) {
    return TOOL_LABELS[toolId]!;
  }
  return AREA_LABELS[domain] ?? domain;
}

const CONVERSATION_HISTORY_MAX = 8;

function rowStatusLabel(status: CoworkPlanRowDto["status"]): string {
  if (status === "applied") return "Applicata";
  if (status === "error") return "Errore";
  if (status === "skipped") return "Saltata";
  return "Proposta";
}

function formatCoworkWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function historyBatchKey(batch: CoworkHistoryBatchDto): string {
  return `${batch.planId}:${batch.batchId}`;
}

function historyUndoStatusLabel(entry: CoworkHistoryEntryDto): string {
  if (entry.undoStatus === "undone") return "Annullata";
  if (entry.undoStatus === "available") return "Applicata";
  if (entry.undoStatus === "blocked") return "Non reversibile";
  if (entry.undoStatus === "failed") return "Undo fallito";
  return entry.undoStatus;
}

function historyUndoStatusClass(undoStatus: string): string {
  if (undoStatus === "available") {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  }
  if (undoStatus === "undone") {
    return "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-muted)]";
  }
  if (undoStatus === "blocked" || undoStatus === "failed") {
    return "border-red-500/35 bg-red-500/10 text-red-800 dark:text-red-200";
  }
  return "border-[color-mix(in_srgb,var(--prom-accent)_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-accent)_8%,transparent)] text-[var(--prom-text)]";
}

function rowStatusClass(status: CoworkPlanRowDto["status"]): string {
  if (status === "applied") {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  }
  if (status === "error") {
    return "border-red-500/35 bg-red-500/10 text-red-800 dark:text-red-200";
  }
  if (status === "skipped") {
    return "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-muted)]";
  }
  return "border-[color-mix(in_srgb,var(--prom-accent)_35%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-accent)_8%,transparent)] text-[var(--prom-text)]";
}

function PlanRowCard(props: {
  row: CoworkPlanRowDto;
  selected: boolean;
  applying: boolean;
  onToggle: (id: string) => void;
}): React.JSX.Element {
  const { row, selected, applying, onToggle } = props;
  const canSelect = row.status === "proposed";

  return (
    <article
      className={`rounded-xl border p-4 transition-[border-color,box-shadow] ${
        selected
          ? "border-[color-mix(in_srgb,var(--prom-accent)_45%,var(--prom-line))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--prom-accent)_25%,transparent)]"
          : "border-[var(--prom-line)]"
      } bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)]`}
    >
      <div className="flex gap-3">
        <div className="pt-0.5">
          <input
            type="checkbox"
            checked={selected}
            disabled={!canSelect || applying}
            onChange={() => onToggle(row.id)}
            aria-label={`Seleziona ${row.fullName}`}
            className="h-4 w-4 rounded border-[var(--prom-line)]"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold leading-snug text-[var(--prom-text)]">{row.fullName}</p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                {toolLabel(row.toolId, row.domain)} · {row.action}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rowStatusClass(row.status)}`}
            >
              {rowStatusLabel(row.status)}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--prom-muted)]">{row.detail}</p>
          {row.errorMessage ? (
            <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {row.errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SectionBlock(props: {
  section: CoworkPlanSectionDto;
  expanded: boolean;
  selected: Set<string>;
  applying: boolean;
  onToggleExpand: (sectionId: string) => void;
  onToggleRow: (id: string) => void;
  onApproveSection: (sectionId: string) => void;
  onSelectSection: (sectionId: string) => void;
}): React.JSX.Element {
  const { section, expanded, selected, applying, onToggleExpand, onToggleRow, onApproveSection, onSelectSection } =
    props;
  const proposedInSection = section.rows.filter((r) => r.status === "proposed");
  const allProposedSelected =
    proposedInSection.length > 0 && proposedInSection.every((r) => selected.has(r.id));

  return (
    <section className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--prom-line)] px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onToggleExpand(section.sectionId)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-[var(--prom-text)]">{section.title}</h3>
            <p className="text-xs text-[var(--prom-muted)]">
              {toolLabel(section.toolId, section.domain)} · {section.rows.length} righe
            </p>
          </div>
        </button>
        <div className="flex flex-wrap gap-2">
          {proposedInSection.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onSelectSection(section.sectionId)}>
              {allProposedSelected ? "Deseleziona sezione" : "Seleziona sezione"}
            </Button>
          ) : null}
          <LoadingButton
            size="sm"
            loading={applying}
            disabled={proposedInSection.filter((r) => selected.has(r.id)).length === 0}
            onClick={() => onApproveSection(section.sectionId)}
          >
            Approva sezione
          </LoadingButton>
        </div>
      </header>
      {expanded ? (
        <div className="space-y-2 p-3 md:hidden">
          {section.rows.map((row) => (
            <PlanRowCard
              key={row.id}
              row={row}
              selected={selected.has(row.id)}
              applying={applying}
              onToggle={onToggleRow}
            />
          ))}
        </div>
      ) : null}
      {expanded ? (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-[var(--prom-line)] bg-[var(--prom-surface-soft)] text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              <tr>
                <th className="w-10 p-3" scope="col">
                  <span className="sr-only">Seleziona</span>
                </th>
                <th className="p-3" scope="col">
                  Dipendente
                </th>
                <th className="p-3" scope="col">
                  Dettaglio
                </th>
                <th className="w-28 p-3" scope="col">
                  Stato
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--prom-line)]">
              {section.rows.map((row) => {
                const canSelect = row.status === "proposed";
                return (
                  <tr
                    key={row.id}
                    className={`text-[var(--prom-text)] ${selected.has(row.id) ? "bg-[color-mix(in_srgb,var(--prom-accent)_6%,transparent)]" : ""}`}
                  >
                    <td className="p-3 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        disabled={!canSelect || applying}
                        onChange={() => onToggleRow(row.id)}
                        aria-label={`Seleziona ${row.fullName}`}
                      />
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex items-start gap-2">
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
                        <div>
                          <div className="font-medium leading-snug">{row.fullName}</div>
                          <div className="mt-0.5 text-xs text-[var(--prom-muted)]">
                            {toolLabel(row.toolId, row.domain)} · {row.action}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 align-top text-[var(--prom-muted)]">
                      <p className="leading-relaxed">{row.detail}</p>
                    </td>
                    <td className="p-3 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rowStatusClass(row.status)}`}
                      >
                        {rowStatusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function HistoryMonthBlock(props: {
  month: CoworkHistoryMonthDto;
  expanded: boolean;
  expandedBatches: Set<string>;
  busy: boolean;
  onToggleMonth: (monthKey: string) => void;
  onToggleBatch: (batchKey: string) => void;
  onUndo: (entry: CoworkHistoryEntryDto) => void;
  onBulkUndo: (batch: CoworkHistoryBatchDto, category: CoworkHistoryCategoryDto) => void;
}): React.JSX.Element {
  const { month, expanded, expandedBatches, busy, onToggleMonth, onToggleBatch, onUndo, onBulkUndo } =
    props;
  const batchCount = month.batches.length;

  return (
    <section className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)]">
      <header className="border-b border-[var(--prom-line)] px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => onToggleMonth(month.month)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--prom-text)]">{month.label}</h3>
            <p className="mt-0.5 text-xs text-[var(--prom-muted)]">
              {batchCount} {batchCount === 1 ? "batch" : "batch"}
            </p>
          </div>
        </button>
      </header>
      {expanded ? (
        <div className="flex flex-col gap-3 p-3">
          {month.batches.map((batch) => (
            <HistoryBatchBlock
              key={historyBatchKey(batch)}
              batch={batch}
              expanded={expandedBatches.has(historyBatchKey(batch))}
              busy={busy}
              onToggleExpand={onToggleBatch}
              onUndo={onUndo}
              onBulkUndo={onBulkUndo}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function historyCategoriesForBatch(batch: CoworkHistoryBatchDto): CoworkHistoryCategoryDto[] {
  if (batch.categories?.length) {
    return batch.categories;
  }
  const map = new Map<string, CoworkHistoryCategoryDto>();
  for (const entry of batch.entries) {
    const key = entry.categoryKey || `${entry.domain ?? batch.domain}:${entry.toolId}`;
    const label = entry.categoryLabel || toolLabel(entry.toolId, entry.domain ?? batch.domain);
    const cur = map.get(key);
    if (cur) {
      cur.appliedCount += 1;
      if (entry.undoStatus === "available") {
        cur.undoAvailableCount += 1;
      }
    } else {
      map.set(key, {
        categoryKey: key,
        categoryLabel: label,
        domain: entry.domain ?? batch.domain,
        toolId: entry.toolId,
        appliedCount: 1,
        undoAvailableCount: entry.undoStatus === "available" ? 1 : 0
      });
    }
  }
  return [...map.values()];
}

function HistoryBatchBlock(props: {
  batch: CoworkHistoryBatchDto;
  expanded: boolean;
  busy: boolean;
  onToggleExpand: (key: string) => void;
  onUndo: (entry: CoworkHistoryEntryDto) => void;
  onBulkUndo: (batch: CoworkHistoryBatchDto, category: CoworkHistoryCategoryDto) => void;
}): React.JSX.Element {
  const { batch, expanded, busy, onToggleExpand, onUndo, onBulkUndo } = props;
  const batchKey = historyBatchKey(batch);
  const appliedCount = batch.entries.length;
  const categories = historyCategoriesForBatch(batch);
  const areaLabels = batch.sections
    .map((s) => toolLabel(s.toolId, s.domain))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3)
    .join(" · ");

  return (
    <section className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--prom-line)] px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onToggleExpand(batchKey)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-xs text-[var(--prom-muted)]">{formatCoworkWhen(batch.appliedAt)}</p>
            <h3 className="font-semibold leading-snug text-[var(--prom-text)]">{batch.summary}</h3>
            <p className="mt-0.5 text-xs text-[var(--prom-muted)]">
              {AREA_LABELS[batch.domain] ?? batch.domain}
              {areaLabels ? ` · ${areaLabels}` : ""} · {appliedCount} applicate
            </p>
          </div>
        </button>
      </header>
      {expanded ? (
        <div className="flex flex-col gap-4 p-3">
          {batch.entries.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--prom-muted)]">Nessuna operazione registrata.</p>
          ) : (
            categories.map((category) => {
              const categoryEntries = batch.entries.filter(
                (e) =>
                  (e.categoryKey || `${e.domain ?? batch.domain}:${e.toolId}`) === category.categoryKey
              );
              return (
                <div
                  key={category.categoryKey}
                  className="rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)]"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--prom-line)] px-3 py-2.5">
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--prom-text)]">{category.categoryLabel}</h4>
                      <p className="text-xs text-[var(--prom-muted)]">
                        {category.appliedCount} operazioni
                        {category.undoAvailableCount > 0
                          ? ` · ${category.undoAvailableCount} annullabili`
                          : ""}
                      </p>
                    </div>
                    {category.undoAvailableCount > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onBulkUndo(batch, category)}
                      >
                        Annulla tutti in {category.categoryLabel}
                      </Button>
                    ) : null}
                  </header>
                  <ul className="divide-y divide-[var(--prom-line)]">
                    {categoryEntries.map((entry) => (
                      <li
                        key={entry.logId}
                        className="flex flex-wrap items-start justify-between gap-2 px-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[var(--prom-text)]">{entry.subjectFullName}</p>
                          <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">{entry.detail}</p>
                          {entry.undoBlockedReason ? (
                            <p className="mt-1 text-xs text-[var(--prom-muted)]">{entry.undoBlockedReason}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${historyUndoStatusClass(entry.undoStatus)}`}
                          >
                            {historyUndoStatusLabel(entry)}
                          </span>
                          {entry.undoStatus === "available" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => onUndo(entry)}
                            >
                              Annulla
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function NexaCoworkPage(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [plan, setPlan] = useState<CoworkPlanDto | null>(null);
  const [clarification, setClarification] = useState<{ message: string; suggestions: string[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [costCenterId, setCostCenterId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [costCenterOptions, setCostCenterOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [teamOptions, setTeamOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyMonths, setHistoryMonths] = useState<CoworkHistoryMonthDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [expandedHistoryMonths, setExpandedHistoryMonths] = useState<Set<string>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [undoTarget, setUndoTarget] = useState<{
    logId: string;
    subjectFullName: string;
  } | null>(null);
  const [bulkUndoTarget, setBulkUndoTarget] = useState<{
    planId: string;
    batchId: string;
    category: CoworkHistoryCategoryDto;
  } | null>(null);
  const [cancelTargetPlanId, setCancelTargetPlanId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"mate" | "batch" | "vault">("mate");

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    void fetchCoworkMeta(t)
      .then((m) => setExamples(m.examplePrompts))
      .catch(() => {
        /* meta opzionale */
      });
    void fetchUsers(t)
      .then((users) => {
        const cc = new Map<string, string>();
        const teams = new Map<string, string>();
        for (const u of users) {
          if (u.costCenterId) {
            cc.set(u.costCenterId, u.costCenterId);
          }
          if (u.teamId) {
            teams.set(u.teamId, u.teamId);
          }
        }
        setCostCenterOptions([...cc.keys()].sort().map((id) => ({ id, label: id })));
        setTeamOptions([...teams.keys()].sort().map((id) => ({ id, label: id })));
      })
      .catch(() => {
        /* scope opzionale */
      });
  }, []);

  const loadHistory = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetchCoworkHistory(t);
      setHistoryMonths(res.months);
      if (res.months.length > 0) {
        setExpandedHistoryMonths((prev) => {
          if (prev.size > 0) return prev;
          return new Set([res.months[0]!.month]);
        });
        const firstBatch = res.months[0]?.batches[0];
        if (firstBatch) {
          setExpandedHistory((prev) => {
            if (prev.size > 0) return prev;
            return new Set([historyBatchKey(firstBatch)]);
          });
        }
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Errore caricamento storico");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const toggleHistoryMonthExpand = useCallback((monthKey: string) => {
    setExpandedHistoryMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }, []);

  const toggleHistoryExpand = useCallback((batchKey: string) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(batchKey)) next.delete(batchKey);
      else next.add(batchKey);
      return next;
    });
  }, []);

  const sections = plan?.sections ?? [];

  const proposedRows = useMemo(
    () => (plan?.rows ?? []).filter((r) => r.status === "proposed" || r.status === "error"),
    [plan]
  );

  const planStats = useMemo(() => {
    if (!plan) return null;
    const rows = plan.rows;
    return {
      total: rows.length,
      proposed: rows.filter((r) => r.status === "proposed").length,
      applied: rows.filter((r) => r.status === "applied").length,
      errors: rows.filter((r) => r.status === "error").length,
      sectionCount: sections.length
    };
  }, [plan, sections.length]);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const ids = proposedRows.filter((r) => r.status === "proposed").map((r) => r.id);
    setSelected((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  }, [proposedRows]);

  const toggleSectionExpand = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const selectSection = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.sectionId === sectionId);
      if (!section) return;
      const ids = section.rows.filter((r) => r.status === "proposed").map((r) => r.id);
      setSelected((prev) => {
        const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
        const next = new Set(prev);
        if (allSelected) {
          for (const id of ids) next.delete(id);
        } else {
          for (const id of ids) next.add(id);
        }
        return next;
      });
    },
    [sections]
  );

  const runPlan = useCallback(
    async (message: string) => {
      const t = getToken();
      if (!t || !message.trim()) return;
      setPlanning(true);
      setError(null);
      setClarification(null);
      const userMsg = message.trim();
      setMessages((m) => [...m, { role: "user", content: userMsg }]);
      setInput("");
      try {
        const history = [...messages, { role: "user" as const, content: userMsg }].slice(-CONVERSATION_HISTORY_MAX);
        const result = await postCoworkPlan(t, {
          message: userMsg,
          conversationHistory: history,
          costCenterId: costCenterId.trim() || undefined,
          teamId: teamId.trim() || undefined
        });

        if (isCoworkClarificationDto(result)) {
          setPlan(null);
          setSelected(new Set());
          setClarification({ message: result.message, suggestions: result.suggestions });
          setMessages((m) => [...m, { role: "assistant", content: result.message }]);
          return;
        }

        setPlan(result);
        setSelected(new Set(result.rows.filter((r) => r.status === "proposed").map((r) => r.id)));
        setExpandedSections(new Set(result.sections.map((s) => s.sectionId)));
        setMessages((m) => [...m, { role: "assistant", content: result.summary }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore generazione piano");
      } finally {
        setPlanning(false);
      }
    },
    [messages, costCenterId, teamId]
  );

  const runApply = useCallback(
    async (rowIds?: string[]) => {
      const t = getToken();
      const ids = rowIds ?? [...selected];
      if (!t || !plan || ids.length === 0) return;
      setApplying(true);
      setError(null);
      try {
        const result = await postCoworkApply(t, {
          planId: plan.planId,
          selectedRowIds: ids
        });
        setPlan((p) =>
          p
            ? {
                ...p,
                rows: result.rows,
                sections: result.sections,
                status: result.errorCount > 0 ? "partial" : "applied"
              }
            : p
        );
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        if (result.appliedCount > 0) {
          void loadHistory();
        }
        if (result.errorCount === 0 && result.appliedCount > 0) {
          setMessages([]);
          setPlan(null);
          setClarification(null);
          setSelected(new Set());
          setExpandedSections(new Set());
          setInput("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore applicazione");
      } finally {
        setApplying(false);
      }
    },
    [plan, selected, loadHistory]
  );

  const runBulkUndo = useCallback(async () => {
    const t = getToken();
    if (!t || !bulkUndoTarget) return;
    setHistoryBusy(true);
    setError(null);
    try {
      const result = await postCoworkBulkUndo(t, {
        planId: bulkUndoTarget.planId,
        batchId: bulkUndoTarget.batchId,
        category: bulkUndoTarget.category.categoryKey
      });
      setBulkUndoTarget(null);
      await loadHistory();
      if (result.failed > 0) {
        setError(
          `Annullamento parziale: ${result.succeeded} riuscite, ${result.failed} non annullate. Controlla lo storico.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annullamento massivo non riuscito");
    } finally {
      setHistoryBusy(false);
    }
  }, [bulkUndoTarget, loadHistory]);

  const runUndo = useCallback(async () => {
    const t = getToken();
    if (!t || !undoTarget) return;
    setHistoryBusy(true);
    setError(null);
    try {
      await postCoworkUndo(t, { logId: undoTarget.logId });
      setUndoTarget(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annullamento non riuscito");
    } finally {
      setHistoryBusy(false);
    }
  }, [undoTarget, loadHistory]);

  const runCancel = useCallback(async () => {
    const t = getToken();
    if (!t || !cancelTargetPlanId) return;
    setHistoryBusy(true);
    setError(null);
    try {
      await postCoworkCancel(t, { planId: cancelTargetPlanId });
      if (plan?.planId === cancelTargetPlanId) {
        setPlan(null);
        setSelected(new Set());
        setExpandedSections(new Set());
      }
      setCancelTargetPlanId(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annullamento richiesta non riuscito");
    } finally {
      setHistoryBusy(false);
    }
  }, [cancelTargetPlanId, plan?.planId, loadHistory]);

  const currentPlanCanCancel =
    plan != null &&
    plan.status !== "applied" &&
    plan.status !== "cancelled" &&
    plan.status !== "expired" &&
    !plan.rows.some((r) => r.status === "applied");

  const approveSection = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.sectionId === sectionId);
      if (!section) return;
      const ids = section.rows.filter((r) => r.status === "proposed" && selected.has(r.id)).map((r) => r.id);
      if (ids.length === 0) {
        const auto = section.rows.filter((r) => r.status === "proposed").map((r) => r.id);
        void runApply(auto);
        return;
      }
      void runApply(ids);
    },
    [sections, selected, runApply]
  );

  return (
    <HebbAiExperienceShell
      contentMax="wide"
      title="Hebb AI Mate"
      subtitle={
        <>
          Workspace HR completo: agente Mate con 7 capability (contratti, documenti, CV, email, report, competenze,
          automazioni), batch Cowork HITL e vault documenti — perimetro definito via chat con preview HITL.
        </>
      }
      headerTrailing={<NexaPageHelpButton pageKey="hr-cowork" />}
    >
      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      <HebbAiGlassPanel className="flex flex-wrap gap-2 p-3">
        {(
          [
            ["mate", "Agente Mate"],
            ["batch", "Cowork batch"],
            ["vault", "Vault documenti"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === id
                ? "bg-teal-600 text-white shadow-sm dark:bg-teal-500"
                : "border border-[var(--prom-line)] text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </HebbAiGlassPanel>

      {activeTab === "mate" ? <HebbMateWorkspace onOpenCoworkTab={() => setActiveTab("batch")} /> : null}

      {activeTab === "vault" ? <HebbMateDocumentsPanel costCenterId={costCenterId} teamId={teamId} /> : null}

      {activeTab === "batch" ? (
        <>
      <HebbAiGlassPanel className="flex items-start gap-3 border-[color-mix(in_srgb,var(--prom-accent)_25%,var(--glass-border))] bg-[color-mix(in_srgb,var(--prom-accent)_6%,var(--card-bg))]">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prom-accent)]" aria-hidden />
        <p className="text-sm leading-relaxed text-[var(--prom-muted)]">
          Puoi citare i nominativi nella richiesta: verso il modello vengono tradotti in pseudonimi stabili. I nomi
          compaiono solo in questa preview HR autorizzata, insieme a conteggi e aggregati.
        </p>
      </HebbAiGlassPanel>

      <HebbAiGlassPanel className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <label htmlFor="cowork-cc" className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            Centro di costo
          </label>
          <select
            id="cowork-cc"
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)]"
          >
            <option value="">Tutti</option>
            {costCenterOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label htmlFor="cowork-team" className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            Team
          </label>
          <select
            id="cowork-team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)]"
          >
            <option value="">Tutti</option>
            {teamOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </HebbAiGlassPanel>

      <div className="flex w-full flex-col gap-6">
        <HebbAiGlassPanel className="flex min-h-[360px] w-full flex-col">
          <h2 className="text-lg font-semibold text-[var(--prom-text)]">Conversazione</h2>
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            Descrivi l&apos;operazione; la preview HITL compare sotto.
          </p>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-6 text-center text-sm text-[var(--prom-muted)]">
                Es. rinnovo accordi smart working, estensione periodi, clausole contratto…
              </p>
            ) : null}
            {messages.map((msg, i) => (
              <div
                key={`${msg.role}-${i}`}
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "ml-6 bg-[color-mix(in_srgb,var(--prom-accent)_12%,transparent)] text-[var(--prom-text)]"
                    : "mr-6 border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] text-[var(--prom-muted)]"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {planning ? (
              <div className="flex items-center gap-2 text-sm text-[var(--prom-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Elaborazione piano…
              </div>
            ) : null}
          </div>

          {examples.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Esempi rapidi</p>
              <div className="flex flex-wrap gap-2">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    disabled={planning}
                    onClick={() => void runPlan(ex)}
                    className="rounded-full border border-[var(--prom-line)] px-3 py-1.5 text-xs text-[var(--prom-muted)] transition hover:border-[var(--prom-accent)] hover:text-[var(--prom-text)]"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <form
            className="mt-4 flex gap-2 border-t border-[var(--prom-line)] pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void runPlan(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Es. Rinnova accordi smart working 2026 per Marketing…"
              className="flex-1 rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)] outline-none focus:border-[var(--prom-accent)]"
              disabled={planning}
            />
            <LoadingButton type="submit" loading={planning} disabled={!input.trim()}>
              Genera piano
            </LoadingButton>
          </form>
        </HebbAiGlassPanel>

        <HebbAiGlassPanel className="flex min-h-[360px] w-full flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">Preview operazioni (HITL)</h2>
              <p className="mt-1 text-xs text-[var(--prom-muted)]">
                Sezioni per area funzionale: approva un&apos;intera sezione o seleziona righe singole.
              </p>
            </div>
            {plan && proposedRows.some((r) => r.status === "proposed") ? (
              <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                Seleziona tutte
              </Button>
            ) : null}
          </div>

          {plan && planStats ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Sezioni</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.sectionCount}</p>
              </div>
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Righe</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.total}</p>
              </div>
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Proposte</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.proposed}</p>
              </div>
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Applicate</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.applied}</p>
              </div>
              <div className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Errori</p>
                <p className="mt-0.5 text-lg font-semibold text-[var(--prom-text)]">{planStats.errors}</p>
              </div>
            </div>
          ) : null}

          {plan ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--prom-muted)]">
              <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">
                Dominio principale: {AREA_LABELS[plan.domain] ?? plan.domain}
              </span>
              {plan.llmApplied ? (
                <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1">Planner AI</span>
              ) : null}
            </div>
          ) : null}

          {clarification && !plan ? (
            <div className="mt-6 flex flex-1 flex-col rounded-xl border border-[color-mix(in_srgb,var(--prom-accent)_30%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-accent)_5%,transparent)] p-5">
              <div className="flex items-start gap-3">
                <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prom-accent)]" aria-hidden />
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-[var(--prom-text)]">{clarification.message}</p>
                  {clarification.suggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {clarification.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={planning}
                          onClick={() => void runPlan(s)}
                          className="rounded-full border border-[var(--prom-line)] px-3 py-1.5 text-xs text-[var(--prom-muted)] transition hover:border-[var(--prom-accent)] hover:text-[var(--prom-text)]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!plan && !clarification ? (
            <div className="mt-8 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--prom-line)] px-6 py-10 text-center">
              <CircleDashed className="mb-3 h-10 w-10 text-[var(--prom-muted)] opacity-50" aria-hidden />
              <p className="text-sm text-[var(--prom-muted)]">Il piano comparirà qui dopo la generazione.</p>
            </div>
          ) : null}

          {plan && sections.length > 0 ? (
            <div className="mt-4 flex flex-1 flex-col gap-3 overflow-y-auto">
              {sections.map((section) => (
                <SectionBlock
                  key={section.sectionId}
                  section={section}
                  expanded={expandedSections.has(section.sectionId)}
                  selected={selected}
                  applying={applying}
                  onToggleExpand={toggleSectionExpand}
                  onToggleRow={toggleRow}
                  onApproveSection={approveSection}
                  onSelectSection={selectSection}
                />
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--prom-line)] pt-4">
            <p className="text-xs text-[var(--prom-muted)]">
              {plan ? (
                <>
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-text-bottom opacity-70" aria-hidden />
                  {selected.size} righe selezionate per l&apos;applicazione
                </>
              ) : (
                "Nessuna selezione"
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {currentPlanCanCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={applying || historyBusy}
                  onClick={() => setCancelTargetPlanId(plan.planId)}
                >
                  Cancella richiesta
                </Button>
              ) : null}
              <LoadingButton
                loading={applying}
                disabled={!plan || selected.size === 0}
                onClick={() => void runApply()}
              >
                Applica selezionati ({selected.size})
              </LoadingButton>
            </div>
          </div>
        </HebbAiGlassPanel>

        <HebbAiGlassPanel className="flex w-full flex-col">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
          >
            <div className="flex items-start gap-3">
              <History className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prom-accent)]" aria-hidden />
              <div>
                <h2 className="text-lg font-semibold text-[var(--prom-text)]">Storico</h2>
                <p className="mt-1 text-xs text-[var(--prom-muted)]">
                  Batch applicati e richieste in sospeso. Annulla singole operazioni o cancella piani non ancora eseguiti.
                </p>
              </div>
            </div>
            {historyOpen ? (
              <ChevronDown className="h-5 w-5 shrink-0 text-[var(--prom-muted)]" aria-hidden />
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--prom-muted)]" aria-hidden />
            )}
          </button>

          {historyOpen ? (
            <div className="mt-4 border-t border-[var(--prom-line)] pt-4">
              {historyError ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                  <span>{historyError}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory()}>
                    Riprova
                  </Button>
                </div>
              ) : null}

              {historyLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--prom-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Caricamento storico…
                </div>
              ) : historyMonths.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--prom-line)] px-6 py-10 text-center text-sm text-[var(--prom-muted)]">
                  Nessun batch ancora. Dopo la prima applicazione compariranno qui raggruppati per mese.
                </div>
              ) : (
                <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
                  {historyMonths.map((month) => (
                    <HistoryMonthBlock
                      key={month.month}
                      month={month}
                      expanded={expandedHistoryMonths.has(month.month)}
                      expandedBatches={expandedHistory}
                      busy={historyBusy}
                      onToggleMonth={toggleHistoryMonthExpand}
                      onToggleBatch={toggleHistoryExpand}
                      onUndo={(entry) =>
                        setUndoTarget({
                          logId: entry.logId,
                          subjectFullName: entry.subjectFullName
                        })
                      }
                      onBulkUndo={(batch, category) =>
                        setBulkUndoTarget({
                          planId: batch.planId,
                          batchId: batch.batchId,
                          category
                        })
                      }
                    />
                  ))}
                </div>
              )}

              {!historyLoading && historyMonths.length > 0 ? (
                <div className="mt-3 flex justify-end">
                  <Button type="button" variant="outline" size="sm" disabled={historyBusy} onClick={() => void loadHistory()}>
                    Aggiorna
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </HebbAiGlassPanel>
      </div>

        </>
      ) : null}

      <GlassConfirmDialog
        open={bulkUndoTarget !== null}
        title="Annullare tutte le operazioni nella categoria?"
        message={
          bulkUndoTarget
            ? `Verranno annullate fino a ${bulkUndoTarget.category.undoAvailableCount} operazioni in «${bulkUndoTarget.category.categoryLabel}». Le voci non reversibili resteranno invariate.`
            : ""
        }
        confirmLabel="Annulla tutti"
        cancelLabel="Chiudi"
        variant="danger"
        busy={historyBusy}
        onCancel={() => {
          if (!historyBusy) setBulkUndoTarget(null);
        }}
        onConfirm={() => void runBulkUndo()}
      />

      <GlassConfirmDialog
        open={undoTarget !== null}
        title="Annullare l'operazione?"
        message={
          undoTarget
            ? `L'operazione su ${undoTarget.subjectFullName} verrà annullata dove il tool lo consente. Per operazioni non reversibili compare già un messaggio in elenco.`
            : ""
        }
        confirmLabel="Annulla operazione"
        cancelLabel="Chiudi"
        variant="danger"
        busy={historyBusy}
        onCancel={() => {
          if (!historyBusy) setUndoTarget(null);
        }}
        onConfirm={() => void runUndo()}
      />

      <GlassConfirmDialog
        open={cancelTargetPlanId !== null}
        title="Cancellare la richiesta?"
        message="Il piano Cowork verrà chiuso senza applicare le righe ancora in stato proposta. L'operazione non è reversibile."
        confirmLabel="Cancella richiesta"
        cancelLabel="Indietro"
        variant="danger"
        busy={historyBusy}
        onCancel={() => {
          if (!historyBusy) setCancelTargetPlanId(null);
        }}
        onConfirm={() => void runCancel()}
      />
    </HebbAiExperienceShell>
  );
}
