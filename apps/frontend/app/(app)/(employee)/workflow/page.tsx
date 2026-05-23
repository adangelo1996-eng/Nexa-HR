"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WorkflowApprovalFlowDiagram } from "@/components/workflow-flow-diagram";
import { WorkflowExpenseRow } from "@/components/workflow-expense-row";
import { WorkflowPendingCategorySection } from "@/components/workflow-pending-category-section";
import {
  approveApproval,
  approveApprovalsBulk,
  approveExpenseClaim,
  approveExpenseClaimsBulk,
  cancelPendingLeavePlan,
  cancelPendingSicknessEvent,
  cancelSmartworkingRequest,
  cancelTravelRequest,
  fetchApprovals,
  fetchCurrentUser,
  fetchExpenseWorkflow,
  rejectApproval,
  rejectExpenseClaim,
  type ApprovalItem,
  type ExpenseWorkflowRowDto
} from "@/lib/api";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import {
  clearSession,
  getToken,
  sessionCanNexaAdmin,
  type SessionUser
} from "@/lib/auth-session";
import {
  groupHistoryByRequestDayAndType,
  groupPendingApprovalsByCategory,
  isHighPriorityPending,
  partitionForWorkflow,
  pendingApprovalCategoryLabel,
  sortMine,
  sortToApprove
} from "@/lib/workflow-approval-groups";

function requestTypeLabel(item: ApprovalItem): string {
  if (item.type === "leave") {
    return item.leaveKind === "rol" ? "Richiesta ROL" : "Richiesta ferie";
  }
  if (item.type === "sickness") {
    return "Comunicazione malattia";
  }
  if (item.type === "travel") {
    return "Trasferta";
  }
  return "Remote working";
}

export default function WorkflowPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [expenseWf, setExpenseWf] = useState<{
    toApproveManager: ExpenseWorkflowRowDto[];
    toApproveHr: ExpenseWorkflowRowDto[];
    mine: ExpenseWorkflowRowDto[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusyCategory, setBulkBusyCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { toApprove, mine, historyGrouped } = useMemo(() => {
    if (!user?.id) {
      return { toApprove: [] as ApprovalItem[], mine: [] as ApprovalItem[], historyGrouped: [] };
    }
    const { toApprove: rawA, mine: rawM, history } = partitionForWorkflow(approvals, user.id);
    return {
      toApprove: sortToApprove(rawA),
      mine: sortMine(rawM),
      historyGrouped: groupHistoryByRequestDayAndType(history)
    };
  }, [approvals, user?.id]);

  const expenseMineOpen = useMemo(() => {
    if (!expenseWf) {
      return [] as ExpenseWorkflowRowDto[];
    }
    return expenseWf.mine.filter((r) => r.claim.status === "submitted" || r.claim.status === "pending_hr");
  }, [expenseWf]);

  const expenseHistory = useMemo(() => {
    if (!expenseWf) {
      return [] as ExpenseWorkflowRowDto[];
    }
    return expenseWf.mine
      .filter((r) => ["approved", "rejected", "paid"].includes(r.claim.status))
      .sort((a, b) => (b.claim.createdAt ?? "").localeCompare(a.claim.createdAt ?? ""));
  }, [expenseWf]);

  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const me = await fetchCurrentUser(tokenValue);
        const [list, ew] = await Promise.all([
          fetchApprovals(tokenValue),
          fetchExpenseWorkflow(tokenValue).catch(() => null)
        ]);
        setUser(me);
        setApprovals(list);
        setExpenseWf(
          ew ?? {
            toApproveManager: [],
            toApproveHr: [],
            mine: []
          }
        );
      } catch (loadError) {
        clearSession();
        router.replace("/login");
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento workflow");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  async function refresh(): Promise<void> {
    if (!token) {
      return;
    }
    const [list, ew] = await Promise.all([
      fetchApprovals(token),
      fetchExpenseWorkflow(token).catch(() => null)
    ]);
    setApprovals(list);
    if (ew) {
      setExpenseWf(ew);
    }
  }

  async function onAction(approvalId: string, action: "approve" | "reject"): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(approvalId);
    setError(null);
    try {
      if (action === "approve") {
        await approveApproval(token, approvalId);
      } else {
        await rejectApproval(token, approvalId);
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento autorizzazione");
    } finally {
      setBusyId(null);
    }
  }

  async function onCancelMine(item: ApprovalItem): Promise<void> {
    if (!token || item.status !== "pending") {
      return;
    }
    if (!window.confirm("Annullare questa richiesta? L'operazione non è reversibile.")) {
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      if (item.type === "leave") {
        await cancelPendingLeavePlan(token, item.entityId);
      } else if (item.type === "sickness") {
        await cancelPendingSicknessEvent(token, item.entityId);
      } else if (item.type === "smartworking") {
        await cancelSmartworkingRequest(token, item.entityId);
      } else if (item.type === "travel") {
        await cancelTravelRequest(token, item.entityId);
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Annullamento non riuscito");
    } finally {
      setBusyId(null);
    }
  }

  async function onExpenseAction(claimId: string, action: "approve" | "reject"): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(`exp:${claimId}`);
    setError(null);
    try {
      if (action === "approve") {
        await approveExpenseClaim(token, claimId);
      } else {
        await rejectExpenseClaim(token, claimId);
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore nota spesa");
    } finally {
      setBusyId(null);
    }
  }

  function renderCard(
    item: ApprovalItem,
    opts: {
      showActions: boolean;
      showPriority: boolean;
      compact?: boolean;
      showRequester?: boolean;
      showCancel?: boolean;
    }
  ): React.JSX.Element {
    const urgent = opts.showPriority && isHighPriorityPending(item);
    return (
      <article
        className={`rounded-lg border p-3 dark:border-slate-700 ${
          urgent
            ? "border-amber-400 bg-amber-50/80 dark:border-amber-600/60 dark:bg-amber-950/25"
            : "border-slate-200 dark:border-slate-700"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-slate-900 dark:text-slate-100">{requestTypeLabel(item)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {urgent ? (
              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-800/80 dark:text-amber-100">
                Priorità alta
              </span>
            ) : null}
            <span
              className={`rounded px-2 py-1 text-xs ${
                item.status === "approved"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200"
                  : item.status === "rejected"
                    ? "bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200"
                    : "bg-slate-200 text-slate-800 dark:bg-[color-mix(in_srgb,var(--prom-surface-soft)_95%,var(--prom-gold))] dark:text-[var(--prom-text)]"
              }`}
            >
              {item.status}
            </span>
          </div>
        </div>
        {!opts.compact || opts.showRequester ? (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Dipendente / richiedente: {item.requesterName ?? item.requestedBy}
          </p>
        ) : null}
        {item.startDate ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Periodo: {item.startDate}
            {item.endDate && item.endDate !== item.startDate ? ` → ${item.endDate}` : ""}
          </p>
        ) : null}
        <WorkflowApprovalFlowDiagram
          item={item}
          requesterLabel={item.requesterName ?? item.requestedBy}
          approverLabel={item.approverName}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(item.at).toLocaleString("it-CH")}</p>
        {opts.showActions ? (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => void onAction(item.id, "approve")}
              disabled={busyId === item.id}
              className="bg-emerald-400 text-slate-900 hover:bg-emerald-300"
            >
              Approva
            </Button>
            <Button
              size="sm"
              onClick={() => void onAction(item.id, "reject")}
              disabled={busyId === item.id}
              className="bg-rose-300 text-slate-900 hover:bg-rose-200"
            >
              Nega
            </Button>
          </div>
        ) : null}
        {opts.showCancel && item.status === "pending" ? (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === item.id}
              onClick={() => void onCancelMine(item)}
            >
              Annulla richiesta
            </Button>
          </div>
        ) : null}
      </article>
    );
  }

  const mgr = expenseWf?.toApproveManager ?? [];
  const hrQ = expenseWf?.toApproveHr ?? [];
  const pendingTotal = toApprove.length + mgr.length + hrQ.length;

  const absencePendingGroups = useMemo(
    () => groupPendingApprovalsByCategory(toApprove),
    [toApprove]
  );

  async function onBulkApproveCategory(categoryKey: string, approvalIds: string[]): Promise<void> {
    if (!token || approvalIds.length === 0) {
      return;
    }
    setBulkBusyCategory(categoryKey);
    setError(null);
    try {
      const result = await approveApprovalsBulk(token, approvalIds);
      if (result.failed.length > 0) {
        setError(
          `${result.succeeded.length} approvate, ${result.failed.length} non riuscite. ${result.failed[0]?.message ?? ""}`
        );
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore approvazione multipla");
    } finally {
      setBulkBusyCategory(null);
    }
  }

  async function onBulkApproveExpenses(categoryKey: string, claimIds: string[]): Promise<void> {
    if (!token || claimIds.length === 0) {
      return;
    }
    setBulkBusyCategory(categoryKey);
    setError(null);
    try {
      const result = await approveExpenseClaimsBulk(token, claimIds);
      if (result.failed.length > 0) {
        setError(
          `${result.succeeded.length} approvate, ${result.failed.length} non riuscite. ${result.failed[0]?.message ?? ""}`
        );
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore approvazione spese");
    } finally {
      setBulkBusyCategory(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-slate-700 dark:text-slate-300">Caricamento…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Workflow</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {user?.fullName} · {user?.role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NexaPageHelpButton pageKey="workflow" />
          <Link href="/mappa-portale" className="synapse-nav-link">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="space-y-10">
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--prom-text)]">In sospeso</h2>
            <p className="mt-1 text-sm text-[var(--prom-muted)]">
              Raggruppate per categoria. Priorità alta se la data è entro 2 giorni o passata.
            </p>
          </div>
          {pendingTotal === 0 ? (
            <p className="text-sm text-[var(--prom-muted)]">Nessuna richiesta in attesa.</p>
          ) : (
            <div className="space-y-4">
              {absencePendingGroups.map(({ typeKey, items }) => (
                <WorkflowPendingCategorySection
                  key={typeKey}
                  categoryKey={typeKey}
                  itemCount={items.length}
                  bulkBusy={bulkBusyCategory === typeKey}
                  onBulkApprove={() => onBulkApproveCategory(typeKey, items.map((i) => i.id))}
                >
                  <div className="space-y-3">
                    {items.map((item) => (
                      <Fragment key={item.id}>
                        {renderCard(item, { showActions: true, showPriority: true })}
                      </Fragment>
                    ))}
                  </div>
                </WorkflowPendingCategorySection>
              ))}
              <WorkflowPendingCategorySection
                categoryKey="expense:manager"
                itemCount={mgr.length}
                bulkBusy={bulkBusyCategory === "expense:manager"}
                onBulkApprove={() => onBulkApproveExpenses("expense:manager", mgr.map((r) => r.claim.id))}
              >
                <div className="space-y-3">
                  {mgr.map((row) => (
                    <WorkflowExpenseRow
                      key={`exp-mgr-${row.claim.id}`}
                      row={row}
                      variant="queue_manager"
                      showActions
                      busy={busyId === `exp:${row.claim.id}`}
                      onApprove={() => void onExpenseAction(row.claim.id, "approve")}
                      onReject={() => void onExpenseAction(row.claim.id, "reject")}
                    />
                  ))}
                </div>
              </WorkflowPendingCategorySection>
              <WorkflowPendingCategorySection
                categoryKey="expense:hr"
                itemCount={hrQ.length}
                bulkBusy={bulkBusyCategory === "expense:hr"}
                onBulkApprove={() => onBulkApproveExpenses("expense:hr", hrQ.map((r) => r.claim.id))}
              >
                <div className="space-y-3">
                  {hrQ.map((row) => (
                    <WorkflowExpenseRow
                      key={`exp-hr-${row.claim.id}`}
                      row={row}
                      variant="queue_hr"
                      showActions
                      busy={busyId === `exp:${row.claim.id}`}
                      onApprove={() => void onExpenseAction(row.claim.id, "approve")}
                      onReject={() => void onExpenseAction(row.claim.id, "reject")}
                    />
                  ))}
                </div>
              </WorkflowPendingCategorySection>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Le mie richieste</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Ancora da completare.</p>
          <div className="mt-4 space-y-3">
            {mine.length === 0 && expenseMineOpen.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Nessuna richiesta aperta da te.</p>
            ) : null}
            {mine.map((item) => (
              <Fragment key={item.id}>
                {renderCard(item, {
                  showActions: false,
                  showPriority: true,
                  compact: true,
                  showCancel: true
                })}
              </Fragment>
            ))}
            {expenseMineOpen.map((row) => (
              <WorkflowExpenseRow key={`exp-mine-${row.claim.id}`} row={row} variant="mine" showActions={false} />
            ))}
          </div>
        </section>

        <details className="card group rounded-xl border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Storico</h2>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  Approvate, rifiutate e note spese chiuse · espandi per consultare
                </p>
              </div>
              <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 transition group-open:rotate-180 dark:border-slate-600 dark:text-slate-300">
                ▼
              </span>
            </div>
          </summary>
          <div className="space-y-8 border-t border-slate-200 px-4 pb-4 pt-4 dark:border-slate-700">
            {historyGrouped.length === 0 && expenseHistory.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Nessuno storico disponibile.</p>
            ) : null}
            {historyGrouped.map(({ day, typeGroups }) => (
              <div key={day}>
                <h3 className="border-b border-slate-200 pb-1 text-base font-medium text-slate-800 dark:border-slate-600 dark:text-slate-200">
                  {day === "—" ? "Senza data" : day}
                </h3>
                <div className="mt-3 space-y-6">
                  {typeGroups.map(({ typeKey, items }) => (
                    <div key={`${day}-${typeKey}`}>
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {pendingApprovalCategoryLabel(typeKey)}
                      </h4>
                      <div className="mt-2 space-y-2">
                        {items.map((item) => (
                          <Fragment key={item.id}>
                            {renderCard(item, {
                              showActions: false,
                              showPriority: false,
                              compact: true,
                              showRequester:
                                Boolean(user && (sessionCanNexaAdmin(user) || user.role === "superuser"))
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {expenseHistory.length > 0 ? (
              <div>
                <h3 className="border-b border-slate-200 pb-1 text-base font-medium text-slate-800 dark:border-slate-600 dark:text-slate-200">
                  Note spese (concluse)
                </h3>
                <div className="mt-3 space-y-2">
                  {expenseHistory.map((row) => (
                    <WorkflowExpenseRow key={`exp-hist-${row.claim.id}`} row={row} variant="history" showActions={false} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      </div>
      {error ? <p className="mt-6 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
    </main>
  );
}
